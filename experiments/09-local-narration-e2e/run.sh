#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
cd "$ROOT"
test -f lib/cli/bin.js || { echo "Run yarn build first" >&2; exit 2; }

# Fail closed: no paid TTS, image/video generation, remote materials or external I2V.
export OPENAI_API_KEY='' LLM_OPENAI_API_KEY='' TTS_OPENAI_API_KEY='' IMAGE_OPENAI_API_KEY=''
export ANTHROPIC_API_KEY='' ANTHROPIC_API_TOKEN='' GEMINI_API_KEY=''
export GROQ_API_KEY='' LLM_GROQ_API_KEY='' REPLICATE_API_TOKEN='' ELEVENLABS_API_KEY=''
export KOTODAMA_API_KEY='' HF_TOKEN='' HUGGING_FACE_HUB_TOKEN='' GOOGLE_APPLICATION_CREDENTIALS=''
export SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT=0 MULMO_STRICT_NETWORK=1
mkdir -p "$HERE/generated/assets"

# One locally animated video and two locally generated images. No AI services.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i 'color=c=0x12273f:s=640x640' -frames:v 1 -update 1 "$HERE/generated/assets/hook.png"
ffmpeg -hide_banner -loglevel error -y -f lavfi -i 'testsrc2=size=640x640:rate=30:duration=2' -an -c:v libx264 -preset ultrafast -pix_fmt yuv420p -t 2 "$HERE/generated/assets/main.mov"
ffmpeg -hide_banner -loglevel error -y -f lavfi -i 'color=c=0xb52c3d:s=640x640' -frames:v 1 -update 1 "$HERE/generated/assets/closing.png"

# These are audible test tones, NOT synthesized Japanese speech. Replace them
# with consented human recordings or an approved free Japanese TTS later.
for item in "hook:440" "main:550" "closing:660"; do
  name="${item%%:*}"
  hz="${item#*:}"
  ffmpeg -hide_banner -loglevel error -y -f lavfi -i "sine=frequency=${hz}:duration=1.8:sample_rate=44100" -af 'apad=pad_dur=0.2' -t 2 -ac 1 -c:a pcm_s16le "$HERE/generated/assets/${name}.wav"
done

./node_modules/.bin/tsx "$HERE/build_script.ts"
node lib/cli/bin.js movie "$HERE/generated/local-narration.json" --sns-free-only

VIDEO="$ROOT/output/local-narration_ja.mp4"
test -s "$VIDEO"
dimensions="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$VIDEO")"
test "$dimensions" = "720x1280"
ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "$VIDEO" | grep -q '^aac$'
python3 - "$VIDEO" <<'PY'
import json, subprocess, sys
p = sys.argv[1]
meta = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", p]))
duration = float(meta["format"]["duration"])
assert 5.7 <= duration <= 6.5, duration
# Audio stream is present; prove it contains non-silence rather than only an AAC track.
raw = subprocess.check_output(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-i", p, "-map", "0:a:0", "-f", "s16le", "-ac", "1", "-ar", "8000", "-"])
from array import array
samples = array("h"); samples.frombytes(raw)
rms = (sum(v*v for v in samples) / len(samples)) ** 0.5
assert rms > 100, rms
# The INPUT frames are intentionally SQUARE (640x640). All output cuts
# must fill the portrait canvas rather than merely living inside a 9:16 MP4
# with black letterbox padding. Sample near top and bottom in all 3 cuts.
for when in (0.5, 2.5, 4.5):
    for y in (16, 1232):
        patch = subprocess.check_output([
            "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error",
            "-ss", str(when), "-i", p,
            "-vf", f"crop=32:32:344:{y},format=rgb24",
            "-frames:v", "1", "-f", "rawvideo", "-"
        ])
        assert len(patch) == 32 * 32 * 3, (when, y, len(patch))
        average = sum(patch) / len(patch)
        assert average > 15, f"Detected near-black portrait padding at t={when}s y={y}: mean={average:.1f}"
print(f"PASS: square 640x640 source fills 9:16 without letterbox; 3 local beats -> 6s 720x1280 movie, AAC non-silent audio RMS={rms:.0f}; no TTS/API calls")
PY

#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SOURCE="$HERE/output/wan22_probe.mp4"
if [[ ! -s "$SOURCE" ]]; then
  echo "Missing saved AI-generated MP4: $SOURCE" >&2
  exit 2
fi
if [[ ! -f "$ROOT/lib/cli/bin.js" ]]; then
  echo "Build the MulmoCast CLI before running this test" >&2
  exit 3
fi
mkdir -p "$HERE/assets"
cp "$SOURCE" "$HERE/assets/wan22_probe.mp4"
# A locally synthesized end card. No AI invocation occurs during this step.
ffmpeg -hide_banner -loglevel error -y -f lavfi \
  -i "color=c=0x0d243c:s=720x1280:r=16:d=2" \
  -vf "drawbox=x=120:y=420:w=480:h=360:color=0xe6a14f:t=fill" \
  -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p -an \
  "$HERE/assets/outro.mp4"
cd "$ROOT"
node lib/cli/bin.js movie "$HERE/mulmo_ai_render.json"
OUTPUT="$ROOT/output/mulmo_ai_render_ja.mp4"
if [[ ! -s "$OUTPUT" ]]; then
  echo "Expected output missing: $OUTPUT" >&2
  find "$ROOT/output" -maxdepth 2 -type f -name "*.mp4" -print
  exit 4
fi
python3 - "$OUTPUT" <<'PY'
import json
import subprocess
import sys

output = sys.argv[1]
data = json.loads(subprocess.check_output([
    "ffprobe", "-v", "error", "-show_entries",
    "stream=codec_type,width,height:format=duration", "-of", "json", output
], text=True))
streams = [s for s in data["streams"] if s.get("codec_type") == "video"]
assert len(streams) == 1, streams
assert streams[0]["width"] == 720 and streams[0]["height"] == 1280, streams[0]
duration = float(data["format"]["duration"])
assert 3.3 <= duration <= 5.0, duration
print("PASS: saved real Wan2.2-generated MP4 + local outro -> MulmoCast final output")
print(f"Final: {output}, duration={duration:.2f}s, 720x1280")
PY

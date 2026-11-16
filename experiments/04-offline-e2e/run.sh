#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
cd "$ROOT"
test -f lib/cli/bin.js || { echo "Run yarn install && yarn build first" >&2; exit 2; }

# Clear credentials even when this is invoked on a developer machine.
# MulmoCast loads dotenv; explicit blank environment values prevent .env
# from filling in any omitted API credentials in this demo.
export OPENAI_API_KEY='' ANTHROPIC_API_KEY='' ANTHROPIC_API_TOKEN=''
export GEMINI_API_KEY='' GROQ_API_KEY='' REPLICATE_API_TOKEN=''
export ELEVENLABS_API_KEY='' GOOGLE_APPLICATION_CREDENTIALS=''
export HF_TOKEN='' HUGGING_FACE_HUB_TOKEN=''
export SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT=0 MULMO_STRICT_NETWORK=1

mkdir -p "$HERE/generated/assets"
# Distinct frames, produced locally by FFmpeg. These are not AI-generated images.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i 'color=c=0x12273f:s=720x1280' -frames:v 1 -update 1 "$HERE/generated/assets/blue.png"
ffmpeg -hide_banner -loglevel error -y -f lavfi -i 'color=c=0xb52c3d:s=720x1280' -frames:v 1 -update 1 "$HERE/generated/assets/red.png"

# Input: natural-language brief -> existing GraphAI graph with a deterministic,
# injected mock LLM -> validated MulmoScript.
./node_modules/.bin/tsx "$HERE/generate_script.ts"

# Run the actual built MulmoCast CLI. The third beat uses the existing
# mediaMockAgent image-generation path. No new movie/FFmpeg implementation.
node lib/cli/bin.js movie "$HERE/generated/offline-sns.json" --sns-free-only

VIDEO="$ROOT/output/offline-sns_ja.mp4"
python3 "$ROOT/experiments/01-merge-smoke/verify_video.py" "$VIDEO"
test -s "$ROOT/output/images/offline-sns/mock_image_generation.png"
echo "PASS: GraphAI -> MulmoScript -> mock image Agent -> original MulmoCast -> 9:16 MP4"

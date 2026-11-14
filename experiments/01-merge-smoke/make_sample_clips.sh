#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$HERE/assets" "$HERE/output"
# Generated locally by FFmpeg; no AI keys or paid API calls.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i 'color=c=0x12273f:s=720x1280:r=24:d=3' \
  -vf 'drawbox=x=140:y=430:w=440:h=370:color=0x35b2dc:t=fill,drawbox=x=190:y=490:w=340:h=250:color=0x12273f:t=fill' \
  -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p -an "$HERE/assets/shot_01.mp4"
ffmpeg -hide_banner -loglevel error -y -f lavfi -i 'color=c=0x321f46:s=720x1280:r=24:d=3' \
  -vf 'drawbox=x=90:y=300:w=540:h=550:color=0xff8c65:t=fill,drawbox=x=145:y=355:w=430:h=440:color=0x321f46:t=fill' \
  -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p -an "$HERE/assets/shot_02.mp4"
echo "Created 2 local clips: $HERE/assets"

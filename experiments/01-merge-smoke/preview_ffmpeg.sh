#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$HERE/make_sample_clips.sh"
# This baseline does not exercise MulmoCast.
ffmpeg -hide_banner -loglevel error -y \
  -i "$HERE/assets/shot_01.mp4" -i "$HERE/assets/shot_02.mp4" \
  -filter_complex '[0:v]fps=30,trim=duration=3,setpts=PTS-STARTPTS[v0];[1:v]fps=30,trim=duration=3,setpts=PTS-STARTPTS[v1];[v0][v1]concat=n=2:v=1:a=0[outv]' \
  -map '[outv]' -c:v libx264 -preset fast -crf 25 -pix_fmt yuv420p \
  "$HERE/output/ffmpeg_baseline.mp4"
python3 "$HERE/verify_video.py" "$HERE/output/ffmpeg_baseline.mp4"

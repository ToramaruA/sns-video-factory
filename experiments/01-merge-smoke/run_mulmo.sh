#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
if [[ ! -f "$ROOT/package.json" ]] || ! grep -q '"name": "mulmocast"' "$ROOT/package.json"; then
  echo "Run inside a fork of receptron/mulmocast-cli" >&2
  exit 2
fi
if [[ ! -f "$ROOT/lib/cli/bin.js" ]]; then
  echo "Run yarn install and yarn build first" >&2
  exit 2
fi
bash "$HERE/make_sample_clips.sh"
# Script has only local MP4 sources, no prompts or AI services.
cd "$ROOT"
node lib/cli/bin.js movie "$HERE/mulmo_script.json"
mapfile -t videos < <(find "$ROOT/output" "$HERE/output" -maxdepth 3 -type f -name 'mulmo_script*.mp4' -print 2>/dev/null | sort -u)
if [[ "${#videos[@]}" -eq 0 ]]; then
  echo "MulmoCast completed but no mulmo_script*.mp4 was found" >&2
  exit 3
fi
python3 "$HERE/verify_video.py" "${videos[0]}"
echo "MulmoCast output: ${videos[0]}"

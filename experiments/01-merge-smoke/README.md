# Step 1 — offline MulmoCast MP4 merge test

The goal is to verify **the real MulmoCast engine**, not just FFmpeg, can join two provided MP4 files into one vertical video.

- Uses MulmoScript version 1.1 and two 3-second local MP4s
- No image or video generation AI; no API tokens
- User count is not artificially capped; quota management belongs to later stages
- Verifies output resolution, length, and visibly different scenes

## Run inside this fork

Prerequisites: Node version supported by the upstream package.json, Yarn v1, FFmpeg, FFprobe, Python 3.

```sh
npm install -g yarn@1.22.22
yarn install --frozen-lockfile
yarn build
bash experiments/01-merge-smoke/run_mulmo.sh
```

Or use GitHub Actions: **SNS Video Factory - offline MulmoCast smoke test**.

## Important distinction

`preview_ffmpeg.sh` uses FFmpeg directly and only verifies that the sample files are valid. Passing that script **does not** mean that MulmoCast passed.

The GitHub Actions workflow explicitly runs the original MulmoCast CLI and uses `ffprobe` to validate its output.

## Next stages

1. Prove the offline engine works.
2. Evaluate a continuously free, legally automatable image-to-video provider (not just a promotional trial).
3. Add a provider adapter, model selection, quota safety, and a fail-closed no-paid-API policy.
4. Add direction, still generation, per-shot review and redo, then an authenticated shared web interface.

Original upstream license: AGPL-3.0-only. Preserve applicable licensing and source availability requirements.

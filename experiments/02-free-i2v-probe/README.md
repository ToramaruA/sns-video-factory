# Phase 1 — one-shot image-to-video experiment (Wan 2.2 + ZeroGPU)

**Status: ONE anonymous inference succeeded (2026-11-15 JST), but NOT a production provider.** This does not guarantee persistent free API access or commercial third-party hosting rights.

This directory probes the public Gradio API for:
- Space: https://huggingface.co/spaces/zerogpu-aoti/wan2-2-fp8da-aoti-faster
- Model: https://huggingface.co/Wan-AI/Wan2.2-I2V-A14B-Diffusers
- Gradio API docs: https://huggingface.co/docs/hub/spaces-api-endpoints
- ZeroGPU limits: https://huggingface.co/docs/hub/spaces-zerogpu

## What it tests

1. Create an **original synthetic still image** of a stylized water rocket (no external image rights involved).
2. Call one published Gradio endpoint with an image and motion prompt.
3. Save actual returned MP4 and verify its video stream and dimensions with FFprobe.
4. Record success/failure in `output/probe_result.json`.

The script submits **exactly one** inference request. No API token, no paid plan, no retries, no fallback to a paid provider.

## How to run

The initial branch-push workflow executed exactly one anonymous request and received an MP4. It reported failure only because `ffprobe` was absent on that GitHub runner. The artifact was downloaded and verified independently. The workflow has now been switched to **manual-only** (`workflow_dispatch`), with FFmpeg installation and a pre-flight `ffprobe` check to avoid wasting a second GPU request.

Locally on a machine with network access (not necessarily GPU):
```sh
python -m pip install gradio_client==2.7.2 'Pillow>=11,<13'
python experiments/02-free-i2v-probe/make_test_image.py
python experiments/02-free-i2v-probe/run_probe.py
```
You also need `ffprobe` available in PATH. **Do not run repeatedly to get around usage limits.** The public Space may change or disappear without notice.

## Limitations and adoption gate

- Anonymous ZeroGPU access is officially limited to 2 minutes/day; free authenticated accounts to 5 minutes/day (subject to terms/change). A shared public app can run out quickly, and automated integrations should not rely on unlimited access.
- Model license **Apache-2.0**, but Space hosting/service permissions, external-call fair use, image storage rules, and reliability must be checked separately before production use.
- Third-party Gradio Spaces are *not* a capacity-guaranteed commercial API, even if their public endpoints technically respond.
- A successful generated MP4 would prove **only** that one image→video inference completed at that time. It would NOT prove production suitability, continued free availability, generation quality, or integration with MulmoCast's agent.
- Next step after successful probe: a paid-disabled adapter for MulmoCast, with explicit capability flags and quota-safe handling. Check shared-service terms before deploying.
- If it fails due to quota, endpoint change, or provider availability, **do not silently switch to a billed API**.

## Official evidence checked 2026-11-15

- Hugging Face's Spaces API docs show how Gradio endpoints can be called programmatically.
- ZeroGPU docs state daily quota and 24-hour reset.
- Wan2.2-I2V-A14B-Diffusers model card says Apache-2.0, no rights claimed over generated outputs.
- Space's own `app.py` exposes `/generate_video` through a Gradio UI and outputs MP4 at 16 fps; endpoint parameters can change.

This experiment uses GitHub-hosted Python only as the **API client**. The GPU inference runs at Hugging Face, not GitHub Actions.

## Confirmed result of first real inference (2026-11-15 JST)

- [GitHub Actions initial run](https://github.com/ToramaruA/sns-video-factory/actions/runs/43622599531): failed **after MP4 generation** because `ffprobe` was not installed, not because the AI rejected the request.
- [Original artifact](https://github.com/ToramaruA/sns-video-factory/actions/runs/43622599531): `wan22-zerogpu-single-probe` (expires per Actions retention policy).
- The actual generated file from the artifact was inspected with local `ffprobe` and fully decoded with FFmpeg: **H.264, 560×832, 16 fps, 33 frames, 2.0625 seconds, 166,335 bytes**.
- SHA-256: `7cfcd1c9358651e07d5e0c0fbb44ef9d03066ce072305e94d5a74a68d794837e`.
- Sampling at ~0.2s and ~1.8s found mean RGB absolute differences of approximately `[31.6,20.5,22.9]` (33.8% of pixels differed by luminance >15). The result visibly animated the rocket and plume.
- No access token, paid API, or retry was used.
- **Not yet completed:** running via MulmoCast's actual movie agent; provider adapter; sustained reliability/quotas; hosting terms for a multiuser commercial app.

This is positive evidence for **technical image→video feasibility only**.

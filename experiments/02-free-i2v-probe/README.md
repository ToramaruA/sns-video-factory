# Phase 1 — one-shot image-to-video experiment (Wan 2.2 + ZeroGPU)

**Status: a test, NOT a production provider.** This does not mean a persistent free API or commercial third-party hosting rights are guaranteed.

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

In GitHub Actions, this experiment only auto-runs once when the probe workflow file is first pushed to its experiment branch. There is no recurring trigger. It is deliberately separated from the existing MulmoCast CI.

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

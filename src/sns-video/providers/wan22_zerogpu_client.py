#!/usr/bin/env python3
"""Small optional bridge to a public Wan 2.2 Gradio Space.

One anonymous request only. A personal HF token is never used. The caller is
responsible for checking service permissions and manually opting in. This is
an experimental integration, NOT a general-purpose commercial provider.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import sys
import time

SPACE_ID = "zerogpu-aoti/wan2-2-fp8da-aoti-faster"
API_NAME = "/generate_video"


def failure_code(message: str) -> str:
    message = message.lower()
    if any(s in message for s in ("quota", "zerogpu", "gpu credits", "gpu limit", "429", "too many")):
        return "free_quota_or_capacity"
    if any(s in message for s in ("unauthorized", "403", "401", "access denied", "login")):
        return "access_denied"
    if any(s in message for s in ("404", "endpoint", "api not found", "does not exist")):
        return "api_changed"
    if any(s in message for s in ("timeout", "timed out", "connection", "unavailable")):
        return "network_or_timeout"
    return "provider_error"


def main() -> int:
    job = None
    try:
        config = json.loads(sys.stdin.read(40_000))
        if os.environ.get("SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT") != "1":
            raise ValueError("Free-only experiment is not enabled")
        if os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN"):
            raise ValueError("Authenticated HF token is forbidden in the anonymous probe")
        if config.get("model") != "wan2.2-i2v":
            raise ValueError("Only wan2.2-i2v is supported in this experiment")
        if config.get("duration_seconds") != 2:
            raise ValueError("Only the verified 2-second generation is enabled")
        image = Path(config["image_path"])
        output = Path(config["output_path"])
        prompt = config["prompt"]
        if not image.is_file() or image.suffix.lower() not in (".png", ".jpg", ".jpeg"):
            raise ValueError("Image must be an existing PNG/JPEG file")
        if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 5000:
            raise ValueError("Video prompt must be between 1 and 5000 characters")
        if image.stat().st_size > 15_000_000:
            raise ValueError("Input image is too large (>15MB)")
        if not output.parent.is_dir():
            raise ValueError("Output directory missing")
        # Gradio is an optional dependency; the regular MulmoCast build needs no Python packages.
        from gradio_client import Client, handle_file

        # The public Space must continue to allow anonymous API inference.
        client = Client(SPACE_ID, verbose=False)
        job = client.submit(
            input_image=handle_file(str(image.resolve())),
            prompt=prompt,
            steps=4,
            negative_prompt="",
            duration_seconds=2.0,
            guidance_scale=1,
            guidance_scale_2=1,
            seed=42,
            randomize_seed=False,
            api_name=API_NAME,
        )
        deadline = time.monotonic() + 480
        while not job.done():
            if time.monotonic() > deadline:
                job.cancel()
                raise TimeoutError("Free Gradio request exceeded 480 seconds")
            time.sleep(3)
        result = job.result()
        source = result[0] if isinstance(result, (list, tuple)) else result
        if isinstance(source, dict):
            source = source.get("video") or source.get("path")
        if not isinstance(source, str) or not Path(source).is_file():
            raise RuntimeError("Provider did not return a local MP4")
        if Path(source).stat().st_size > 100_000_000:
            raise RuntimeError("Provider MP4 exceeds 100MB safety limit")
        shutil.copyfile(source, output)
        if output.stat().st_size < 1024:
            raise RuntimeError("MP4 output was too small")
        print(json.dumps({"ok": True, "output_path": str(output), "size": output.stat().st_size}), flush=True)
        return 0
    except Exception as exc:
        # Only a short, sanitized message crosses the process boundary.
        message = str(exc).replace("\n", " ")[:350]
        print(json.dumps({"ok": False, "error_code": failure_code(message), "error": message}), flush=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())

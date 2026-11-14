#!/usr/bin/env python3
"""One-shot anonymous image-to-video probe against a published Hugging Face Gradio Space.

This is an EXPERIMENT. Do not run it as an always-on backend. Never supply an API key,
turn on a billing plan, or automatically retry failed requests.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone

SPACE = "zerogpu-aoti/wan2-2-fp8da-aoti-faster"
API_NAME = "/generate_video"
BASE = Path(__file__).resolve().parent
INPUT = BASE / "output" / "source_rocket.png"
OUTPUT = BASE / "output" / "wan22_probe.mp4"
REPORT = BASE / "output" / "probe_result.json"
PROMPT = (
    "The illustrated red and white water rocket lifts off vertically into the "
    "evening sky. Gentle water jet and mist appear below the rocket. Camera "
    "follows upward. Maintain the rocket's silhouette and colors."
)


def classify(message: str) -> str:
    s = message.lower()
    if any(w in s for w in ("quota", "gpu limit", "gpu credits", "zerogpu", "429", "too many requests")):
        return "free_quota_or_capacity"
    if any(w in s for w in ("401", "403", "unauthorized", "forbidden", "authentication", "login")):
        return "access_denied"
    if any(w in s for w in ("404", "api not found", "endpoint", "does not exist")):
        return "api_or_space_changed"
    if any(w in s for w in ("timeout", "timed out", "connection")):
        return "network_or_timeout"
    return "other_error"


def inspect_video(file: Path) -> dict:
    cmd = [
        "ffprobe", "-v", "error", "-show_entries",
        "stream=codec_type,width,height,nb_frames:format=duration",
        "-of", "json", str(file),
    ]
    info = json.loads(subprocess.check_output(cmd, text=True))
    video = [s for s in info["streams"] if s.get("codec_type") == "video"]
    if not video:
        raise RuntimeError("MP4 has no video stream")
    width, height = video[0]["width"], video[0]["height"]
    duration = float(info["format"]["duration"])
    if not 1.0 <= duration <= 15.0 or min(width, height) < 256:
        raise RuntimeError(f"MP4 invalid dimensions/duration: {width}x{height}, {duration}")
    return {"duration_seconds": round(duration, 3), "width": width, "height": height, "video_bytes": file.stat().st_size}


def main() -> int:
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "space": SPACE,
        "api": API_NAME,
        "authenticated": False,
        "number_of_calls": 0,
        "model": "Wan2.2 I2V via public ZeroGPU Space",
        "state": "started",
    }
    job = None
    try:
        # A safety guard: don't accidentally bill any account through an authenticated API.
        if os.getenv("HF_TOKEN") or os.getenv("HUGGING_FACE_HUB_TOKEN"):
            raise RuntimeError("HF token present: anonymous free-only probe refuses to run")
        if not INPUT.is_file():
            raise RuntimeError("Input image missing. Run make_test_image.py first.")
        if shutil.which("ffprobe") is None:
            raise RuntimeError("ffprobe missing; refusing inference before video validation is available")
        from gradio_client import Client, handle_file

        client = Client(SPACE, verbose=False)
        # EXACTLY ONE submission per run. No retry or second fallback.
        report["number_of_calls"] = 1
        job = client.submit(
            input_image=handle_file(str(INPUT)),
            prompt=PROMPT,
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
                try:
                    job.cancel()
                except Exception:
                    pass
                raise TimeoutError("Single request exceeded 480 seconds; cancelled")
            time.sleep(5)

        result = job.result()
        path = result[0] if isinstance(result, (tuple, list)) else result
        if isinstance(path, dict):
            path = path.get("video") or path.get("path")
        if not isinstance(path, str) or not Path(path).is_file():
            raise RuntimeError(f"Space did not return a local MP4 path: {type(path).__name__}")
        shutil.copyfile(path, OUTPUT)
        details = inspect_video(OUTPUT)
        report.update(details)
        report["state"] = "success"
        print("SUCCESS: original still image -> AI-generated MP4")
        print(f"Saved {OUTPUT}: {details}", flush=True)
        return 0
    except Exception as exc:
        message = f"{type(exc).__name__}: {str(exc)}"
        report.update({"state": "failed", "failure_class": classify(message), "error_excerpt": message[:700]})
        print(f"FAILED ({report['failure_class']}): {message[:700]}", file=sys.stderr, flush=True)
        return 1
    finally:
        REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())

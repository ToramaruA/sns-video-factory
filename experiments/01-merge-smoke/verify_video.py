#!/usr/bin/env python3
"""Offline smoke validation with ffprobe/ffmpeg and Python stdlib."""
import json
import subprocess
import sys
from pathlib import Path


def run(*cmd):
    return subprocess.check_output(cmd, stderr=subprocess.PIPE)


def pixel_at(video: Path, seconds: float) -> tuple[int, int, int]:
    data = run(
        "ffmpeg", "-v", "error", "-ss", str(seconds), "-i", str(video),
        "-frames:v", "1", "-vf", "crop=1:1:20:20,format=rgb24",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-"
    )
    return tuple(data[:3])


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: verify_video.py PATH_TO_MP4")
    video = Path(sys.argv[1]).resolve()
    if not video.is_file():
        raise SystemExit(f"Missing video: {video}")
    data = json.loads(run(
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration:stream=codec_type,width,height", "-of", "json", str(video)
    ))
    streams = [s for s in data["streams"] if s["codec_type"] == "video"]
    assert len(streams) == 1, f"Expected 1 video stream: {streams}"
    assert (streams[0]["width"], streams[0]["height"]) == (720, 1280), streams[0]
    seconds = float(data["format"]["duration"])
    assert 5.7 <= seconds <= 6.5, f"Expected roughly 6 sec, got {seconds}"
    first, second = pixel_at(video, 1.0), pixel_at(video, 4.5)
    assert sum(abs(a - b) for a, b in zip(first, second)) > 35, (
        f"Clips look identical: {first} vs {second}"
    )
    print(f"PASS {video}: {seconds:.2f}s, 720x1280, scene1={first}, scene2={second}")


if __name__ == "__main__":
    main()

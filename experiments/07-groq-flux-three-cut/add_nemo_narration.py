#!/usr/bin/env python3
"""Optional offline voice-over, via a locally running VOICEVOX Nemo engine.

MulmoCast already accepts beat.audio, so there is no new TTS Agent, editor,
provider chooser, external TTS API or audio-mixing implementation here.
"""
import json
from pathlib import Path
import subprocess
import sys
import urllib.parse
import urllib.request
import wave

ROOT = Path(__file__).resolve().parents[2]
PLAN = ROOT / "experiments/06-groq-planning/generated/sns-video-plan.json"
PREVIEW = ROOT / "experiments/07-groq-flux-three-cut/generated/three-cut-preview.json"
HOST = "http://127.0.0.1:50021"


def request(path, body=None):
    headers = {"Content-Type": "application/json"} if body is not None else {}
    req = urllib.request.Request(
        HOST + path,
        data=body,
        headers=headers,
        method="POST" if body is not None else "GET",
    )
    with urllib.request.urlopen(req, timeout=120) as response:
        return response.read()


def add_narration(plan, preview, synthesize, duration_of, pad_file, directory):
    """Add pre-generated local WAVs to a restricted MulmoScript; no network here."""
    if not 1 <= len(plan.get("beats", [])) <= 12:
        raise ValueError("expected 1–12 planned beats")
    if len(preview.get("beats", [])) != len(plan["beats"]):
        raise ValueError("plan and render beat counts differ")
    if preview.get("audioParams", {}).get("suppressSpeech") is not True:
        raise ValueError("the original MulmoCast TTS must stay disabled")
    if preview.get("movieParams", {}).get("provider") != "mock":
        raise ValueError("movie generator must remain disabled")
    for i, (source, beat) in enumerate(zip(plan["beats"], preview["beats"])):
        if source.get("id") != beat.get("id"):
            raise ValueError("plan and render beat IDs differ")
        if not isinstance(source.get("text", ""), str) or len(source.get("text", "")) > 90:
            raise ValueError(f"invalid narration text in beat {i + 1}")
        if beat.get("audio") or beat.get("moviePrompt"):
            raise ValueError("preview cannot already contain audio or AI movie request")

    if not any(beat.get("text", "").strip() for beat in plan["beats"]):
        raise ValueError("no narration text found; leave the voice option disabled")

    output = directory / "narration"
    output.mkdir(parents=True, exist_ok=True)
    total = 0.0
    for i, (source, beat) in enumerate(zip(plan["beats"], preview["beats"])):
        text = source.get("text", "").strip()
        intended = float(beat["duration"])
        if not 1 <= intended <= 15:
            raise ValueError("invalid beat duration")
        if text:
            raw = output / f"raw_{i + 1:02d}.wav"
            target = output / f"shot_{i + 1:02d}.wav"
            raw.write_bytes(synthesize(text))
            spoken = duration_of(raw)
            if not 0 < spoken < 30:
                raise ValueError(f"invalid voice length in beat {i + 1}")
            # Original MulmoCast times recorded voice by the audio file duration.
            # Pad only; never cut speech short or modify the voice artificially.
            intended = round(max(intended, spoken + 0.12), 2)
            if intended > 15:
                raise ValueError(f"narration over 15s in beat {i + 1}; shorten the text")
            pad_file(raw, target, intended)
            raw.unlink()
            beat["text"] = text
            beat["duration"] = intended
            beat["audio"] = {
                "type": "audio",
                "source": {"kind": "path", "path": f"./narration/shot_{i + 1:02d}.wav"},
            }
        total += intended
    if total > 60:
        raise ValueError("narrated video exceeds 60s Free preview limit")
    (directory / "VOICE_ATTRIBUTION.txt").write_text(
        "Required when publishing: VOICEVOX Nemo\n"
        "VOICEVOX Nemo synthesized voices require attribution in the video or post description.\n"
        "https://voicevox.hiroshiba.jp/nemo/term/\n",
        encoding="utf8",
    )
    return preview


def run():
    plan = json.loads(PLAN.read_text(encoding="utf8"))
    preview = json.loads(PREVIEW.read_text(encoding="utf8"))
    # Guard before calling the local engine (and before any paid API can run).
    if len(plan["beats"]) != len(preview["beats"]):
        raise ValueError("plan/preview count mismatch")
    speakers = json.loads(request("/speakers"))
    styles = [style["id"] for speaker in speakers for style in speaker.get("styles", []) if isinstance(style.get("id"), int)]
    if not styles:
        raise ValueError("VOICEVOX Nemo has no usable speaker styles")
    speaker_id = styles[0]

    def synth(text):
        suffix = urllib.parse.urlencode({"speaker": speaker_id, "text": text})
        q = request("/audio_query?" + suffix, body=b"")
        return request("/synthesis?" + urllib.parse.urlencode({"speaker": speaker_id}), body=q)

    def wav_duration(path):
        with wave.open(str(path), "rb") as audio:
            return audio.getnframes() / audio.getframerate()

    def pad(raw, destination, duration):
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw),
             "-af", "apad", "-t", str(duration), "-ac", "1", "-c:a", "pcm_s16le", str(destination)],
            check=True,
        )

    result = add_narration(plan, preview, synth, wav_duration, pad, PREVIEW.parent)
    PREVIEW.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(f"PASS: {len(result['beats'])} beats with optional local VOICEVOX Nemo audio; paid TTS disabled")


if __name__ == "__main__":
    try:
        run()
    except Exception as exc:
        print(f"Nemo narration failed (no paid fallback): {exc}", file=sys.stderr)
        raise SystemExit(1)

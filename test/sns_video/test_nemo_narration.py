"""Offline contract test: no VOICEVOX network call or real voice model needed."""
import importlib.util
import io
from pathlib import Path
import shutil
import tempfile
import unittest
import wave

script = Path(__file__).resolve().parents[2] / "experiments/07-groq-flux-three-cut/add_nemo_narration.py"
spec = importlib.util.spec_from_file_location("nemo_narration", script)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def wav_bytes(seconds=0.75):
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(24000)
        audio.writeframes(b"\x01\x00" * int(24000 * seconds))
    return output.getvalue()


def fixture():
    plan = {
        "beats": [
            {"id": "shot_01", "duration": 2, "text": "皆様、ようこそ。"},
            {"id": "shot_02", "duration": 3, "text": ""},
            {"id": "shot_03", "duration": 4, "text": "音楽をお楽しみください。"},
        ]
    }
    preview = {
        "audioParams": {"suppressSpeech": True},
        "movieParams": {"provider": "mock", "model": "mock-model"},
        "beats": [
            {"id": b["id"], "duration": b["duration"], "text": "", "imagePrompt": "Scene"}
            for b in plan["beats"]
        ],
    }
    return plan, preview


class LocalNemoTests(unittest.TestCase):
    def test_variable_cuts_voice_into_existing_mulmocast_audio_fields(self):
        plan, preview = fixture()
        synthesized = []
        with tempfile.TemporaryDirectory() as temp:
            def synthesize(text):
                synthesized.append(text)
                return wav_bytes()
            def duration_of(path):
                with wave.open(str(path), "rb") as audio:
                    return audio.getnframes() / audio.getframerate()
            def pad_file(raw, target, duration):
                shutil.copyfile(raw, target)
                self.assertGreaterEqual(duration, 0.75)
            result = module.add_narration(plan, preview, synthesize, duration_of, pad_file, Path(temp))
            self.assertEqual(len(synthesized), 2)
            self.assertEqual(len(result["beats"]), 3)
            self.assertTrue(result["audioParams"]["suppressSpeech"])
            self.assertNotIn("audio", result["beats"][1])
            self.assertEqual(result["beats"][0]["text"], plan["beats"][0]["text"])
            self.assertEqual(result["beats"][0]["audio"]["source"]["path"], "./narration/shot_01.wav")
            self.assertTrue((Path(temp) / "narration/shot_01.wav").exists())
            self.assertEqual([b["duration"] for b in result["beats"]], [2, 3, 4])
            self.assertIn("VOICEVOX Nemo", (Path(temp) / "VOICE_ATTRIBUTION.txt").read_text())

    def test_rejects_invalid_plan_before_synthesizing(self):
        plan, preview = fixture()
        preview["movieParams"]["provider"] = "replicate"
        with tempfile.TemporaryDirectory() as temp:
            def fail(_):
                self.fail("must not synthesize when preview is unsafe")
            with self.assertRaisesRegex(ValueError, "movie generator"):
                module.add_narration(plan, preview, fail, fail, fail, Path(temp))

    def test_rejects_oversized_voice_and_missing_text(self):
        plan, preview = fixture()
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(ValueError, "over 15s"):
                module.add_narration(plan, preview, lambda t: wav_bytes(), lambda p: 18.0, lambda *args: None, Path(temp))
        plan, preview = fixture()
        for beat in plan["beats"]:
            beat["text"] = ""
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(ValueError, "no narration text"):
                module.add_narration(plan, preview, lambda t: wav_bytes(), lambda p: 0.75, lambda *args: None, Path(temp))


if __name__ == "__main__":
    unittest.main()

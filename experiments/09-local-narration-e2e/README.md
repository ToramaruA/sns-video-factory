# Local voice track + one animated local video: 6-second MP4 (PR #17)

This is a **fully offline, no-API** proof of the original MulmoCast audio → images → movie path with local narration files and a moving center cut. It follows the successful one-cut Wan demonstration ([run 44102870424](https://github.com/ToramaruA/sns-video-factory/actions/runs/44102870424)), but does **not** call Wan, Groq, FLUX or any other AI service.

## What the experiment does

- An existing MulmoScript is re-used. Three cuts (`hook`, `main`, `closing`) reference two local PNGs and a local two-second movie file.
- A narrow allowlist handoff adds one `beat.audio` per cut pointing at a local WAV or MP3, while keeping the beat's **Japanese script text**.
- `audioParams.suppressSpeech: true` is **required**. Because an existing local audio file is supplied, MulmoCast still loads it; no default OpenAI TTS gets called.
- Original MulmoCast's `combineAudioFilesAgent`, `addBGMAgent` (with BGM volume zero), FFmpeg video renderer and `--sns-free-only` guard create a 720×1280 MP4 with AAC audio.
- An offline test checks its audio signal is not silent, rather than checking only the existence of an audio stream.

## Test

```sh
yarn install --frozen-lockfile
yarn build
bash experiments/09-local-narration-e2e/run.sh
```

The test creates a 2-second moving visual from FFmpeg's local `testsrc2` and two local color images. **The audio is a trio of generated test tones, NOT Japanese narration.** Tone generation verifies audio transport, cut timing and mixing without an outside provider or an individual's voice. The text fields in the JSON are Japanese sample narration, but the audio does not say those words.

The final video is `output/local-narration_ja.mp4`. Existing, authorized human recordings can later replace the WAV files with matching filenames; the MP3 option is available through `makeSnsLocalNarrationPreview`. Clip length should be checked against recording length before releasing a final promotional video. This test does not prove arbitrary long audio can safely fit into a two-second generated I2V clip.

## Why a separate source adapter?

The adapter under `src/sns-video/audio/local_narration.ts` creates a restricted MulmoScript v1.1 **without spreading unknown fields from the source**. It retains local image/movie references and Japanese text, adds fixed local audio paths, and rejects additional beats, remote media, or missing lines. This is not a second storyboard schema or a replacement editing engine.

## Not yet complete

- No voice synthesis or commercial-quality Japanese narration. Next step: verify a permanently free, permitted TTS execution route, and integrate it with the existing audio agent without implicit paid fallback.
- No lip-sync or speaking photo; explicitly postponed.
- Only one cut has a moving video. All three I2V cuts require a free, permission-compatible runtime. This step does not change Wan's experimental-only status.
- No browser GUI, user upload permissions or permanent worker infrastructure.

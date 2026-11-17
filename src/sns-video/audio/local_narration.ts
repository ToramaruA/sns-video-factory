/**
 * Local narration handoff for the existing MulmoCast audio -> images -> movie
 * pipeline. No TTS, no custom audio mixer, no new script format.
 *
 * Keep speech disabled even with beat.text: only trusted local beat.audio
 * files supply the voice. A separate, explicit provider approval is required
 * before adding any TTS engine.
 */
import type { MulmoScript } from "../../types/index.js";
import { MulmoScriptMethods } from "../../methods/mulmo_script.js";
import { assertSnsNoPaidApiMovie } from "../safety/no_paid_api.js";
import { SNS_PREVIEW_BEAT_IDS } from "../planning/one_cut_i2v_preview.js";

export const makeSnsLocalNarrationPreview = (
  source: MulmoScript,
  narrationLines: readonly string[],
  audioFormat: "wav" | "mp3" = "wav",
): MulmoScript => {
  if (source.beats.length !== 3 || narrationLines.length !== 3) {
    throw new Error("Local narration preview requires exactly three cuts and three speech lines");
  }
  for (const [index, beat] of source.beats.entries()) {
    if (beat.id !== SNS_PREVIEW_BEAT_IDS[index]) {
      throw new Error("Local narration preview requires hook/main/closing in order");
    }
    const image = beat.image;
    const extension = index === 1 ? "mov" : "png";
    if (
      !image ||
      image.type !== (index === 1 ? "movie" : "image") ||
      image.source.kind !== "path" ||
      image.source.path !== `./assets/${beat.id}.${extension}`
    ) {
      throw new Error(`Beat ${index + 1} must contain the approved local image or video file`);
    }
    const line = narrationLines[index]?.trim();
    if (!line || line.length > 500) {
      throw new Error(`Beat ${index + 1} narration must be 1-500 characters`);
    }
  }

  // Do not spread the source or generated beat fields; unknown provider and
  // prompt settings could silently enable billed media generation.
  const script = MulmoScriptMethods.validate({
    $mulmocast: { version: "1.1" },
    title: source.title ?? "Local narration test",
    lang: "ja",
    canvasSize: { width: 720, height: 1280 },
    imageParams: { provider: "mock", model: "mock-model" },
    movieParams: { provider: "mock", model: "mock-model" },
    speechParams: { speakers: { Presenter: { provider: "mock", voiceId: "shimmer" } } },
    audioParams: {
      suppressSpeech: true,
      introPadding: 0,
      padding: 0,
      closingPadding: 0,
      outroPadding: 0,
      bgmVolume: 0,
      audioVolume: 1,
    },
    beats: source.beats.map((beat, index) => ({
      id: beat.id,
      text: narrationLines[index].trim(),
      duration: 2,
      image: {
        type: index === 1 ? "movie" : "image",
        source: { kind: "path", path: `./assets/${beat.id}.${index === 1 ? "mov" : "png"}` },
      },
      audio: { type: "audio", source: { kind: "path", path: `./assets/${beat.id}.${audioFormat}` } },
    })),
  });
  assertSnsNoPaidApiMovie(script);
  return script;
};

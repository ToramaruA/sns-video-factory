/**
 * Minimal experimental handoff: use an existing FLUX still and Groq motion
 * prompt with the existing Wan free_i2v Agent (one cut only).
 *
 * Only constructs MulmoScript. Never enables Wan/ZeroGPU or makes API calls.
 * The plan and the final still-preview script both remain independent.
 */
import { MulmoScriptMethods } from "../../methods/mulmo_script.js";
import type { MulmoScript } from "../../types/index.js";
import { assertSnsNoPaidApiMovie } from "../safety/no_paid_api.js";
import { validateSnsShortPlan } from "./validate_sns_short.js";

export const SNS_PREVIEW_BEAT_IDS = ["hook", "main", "closing"] as const;
export type SnsPreviewBeatId = (typeof SNS_PREVIEW_BEAT_IDS)[number];

const checkPlan = (plan: MulmoScript): void => {
  validateSnsShortPlan(plan);
  for (const [index, beat] of plan.beats.entries()) {
    if (beat.id !== SNS_PREVIEW_BEAT_IDS[index]) {
      throw new Error("SNS I2V handoff requires the original hook/main/closing beat order");
    }
    if (!beat.moviePrompt?.trim() || beat.moviePrompt.length > 5000) {
      throw new Error(`Beat ${index + 1}: Wan motion prompt must be 1-5000 characters`);
    }
  }
};

/**
 * The image is already on disk: nothing in this script requests a new image,
 * TTS, effect, translation, or paid video API.
 *
 * This script is NOT accepted by --sns-free-only: a separate manual test
 * must explicitly enable the existing Wan experiment and local ledger.
 */
export const makeSnsOneCutWanProbe = (plan: MulmoScript, selected: SnsPreviewBeatId): MulmoScript => {
  checkPlan(plan);
  const chosen = plan.beats[SNS_PREVIEW_BEAT_IDS.indexOf(selected)];
  return MulmoScriptMethods.validate({
    $mulmocast: { version: "1.1" },
    title: "One-cut Wan experiment (NOT production)",
    lang: "ja",
    canvasSize: { width: 720, height: 1280 },
    imageParams: { provider: "mock", model: "mock-model" },
    movieParams: { provider: "free_i2v", model: "auto-free", concurrency: 1, generateAudio: false },
    audioParams: { suppressSpeech: true, introPadding: 0, padding: 0, closingPadding: 0, outroPadding: 0, bgmVolume: 0 },
    beats: [
      {
        id: selected,
        text: "",
        duration: 2,
        image: { type: "image", source: { kind: "path", path: `./assets/${selected}.png` } },
        moviePrompt: chosen.moviePrompt,
      },
    ],
  });
};

/**
 * Put the Wan-generated local movie into one selected cut of the original
 * 3-cut sequence, with the other two unchanged FLUX stills.
 * The ordinary --sns-free-only guard permits this entirely local render.
 */
export const makeSnsMixedI2vPreview = (plan: MulmoScript, selected: SnsPreviewBeatId): MulmoScript => {
  checkPlan(plan);
  const preview = MulmoScriptMethods.validate({
    $mulmocast: { version: "1.1" },
    title: plan.title,
    lang: "ja",
    canvasSize: { width: 720, height: 1280 },
    imageParams: { provider: "mock", model: "mock-model" },
    movieParams: { provider: "mock", model: "mock-model" },
    audioParams: { suppressSpeech: true, introPadding: 0, padding: 0, closingPadding: 0, outroPadding: 0, bgmVolume: 0 },
    beats: plan.beats.map((beat) => ({
      id: beat.id,
      text: "",
      duration: 2,
      image:
        beat.id === selected
          ? { type: "movie", source: { kind: "path", path: `./assets/${selected}.mov` } }
          : { type: "image", source: { kind: "path", path: `./assets/${beat.id}.png` } },
    })),
  });
  assertSnsNoPaidApiMovie(preview);
  return preview;
};

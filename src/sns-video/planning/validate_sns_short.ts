/**
 * Check the LLM's flexible-cut free SNS storyboard before any API is considered.
 * This is a planning shape check, NOT authorization to render moviePrompt.
 */
import type { MulmoScript } from "../../types/index.js";

export const validateSnsShortPlan = (script: MulmoScript): MulmoScript => {
  if (script.lang !== "ja" || script.canvasSize.width !== 720 || script.canvasSize.height !== 1280) {
    throw new Error("SNS plan must be Japanese with a 720x1280 portrait canvas");
  }
  if (script.imageParams.provider !== "cloudflare_free" || script.imageParams.model !== "@cf/black-forest-labs/flux-1-schnell") {
    throw new Error("SNS plan must retain the Cloudflare Free image provider");
  }
  if (script.movieParams.provider !== "mock" || script.movieParams.model !== "mock-model" || script.movieParams.generateAudio) {
    throw new Error("SNS planning must not select a real or paid movie generator");
  }
  if (script.audioParams.suppressSpeech !== true || script.audioParams.bgm || script.htmlImageParams) {
    throw new Error("SNS planning must not enable audio, background music or HTML generation");
  }
  // This is a per-run limit on Free-tier image calls, not a fixed storyboard shape.
  if (script.beats.length < 1 || script.beats.length > 12) throw new Error("SNS Free preview requires 1-12 beats per run");
  const ids = new Set<string>();
  let totalSeconds = 0;
  for (const [index, beat] of script.beats.entries()) {
    const label = `Beat ${index + 1}`;
    if (!Number.isFinite(beat.duration) || (beat.duration ?? 0) < 1 || (beat.duration ?? 0) > 15) {
      throw new Error(`${label}: duration must be 1-15 seconds`);
    }
    totalSeconds += beat.duration ?? 0;
    if (beat.text !== "") throw new Error(`${label}: free image planning must not enable speech`);
    if (!beat.id?.trim() || ids.has(beat.id)) throw new Error(`${label}: unique nonempty id is required`);
    ids.add(beat.id);
    if (!beat.imagePrompt?.trim() || /^\[.*\]$/.test(beat.imagePrompt)) throw new Error(`${label}: a real image prompt is required`);
    if (!beat.moviePrompt?.trim() || /^\[.*\]$/.test(beat.moviePrompt)) throw new Error(`${label}: a real motion prompt is required`);
    if (beat.image || beat.audio || beat.movieParams || beat.imageParams || beat.htmlPrompt || beat.soundEffectPrompt || beat.enableLipSync) {
      throw new Error(`${label}: live media, media generation overrides and other extras are not allowed in the plan`);
    }
  }
  if (totalSeconds > 60) throw new Error("SNS Free preview total duration must not exceed 60 seconds");
  return script;
};

/**
 * Check the LLM's 3-cut SNS storyboard before any downstream API is considered.
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
  if (script.beats.length !== 3) throw new Error("SNS planning requires exactly three beats");
  for (const [index, beat] of script.beats.entries()) {
    const label = `Beat ${index + 1}`;
    if (beat.duration !== 2 || beat.text !== "") throw new Error(`${label}: expected silent two-second video planning`);
    if (!beat.imagePrompt?.trim() || /^\[.*\]$/.test(beat.imagePrompt)) throw new Error(`${label}: a real image prompt is required`);
    if (!beat.moviePrompt?.trim() || /^\[.*\]$/.test(beat.moviePrompt)) throw new Error(`${label}: a real motion prompt is required`);
    if (beat.image || beat.audio || beat.movieParams || beat.imageParams || beat.htmlPrompt || beat.soundEffectPrompt || beat.enableLipSync) {
      throw new Error(`${label}: live media, media generation overrides and other extras are not allowed in the plan`);
    }
  }
  return script;
};

/**
 * Turn a validated 3-cut MulmoScript plan into a still-image preview.
 * Keep the original plan (including moviePrompt) intact for future I2V.
 * This is a narrow, explicit handoff to the existing MulmoCast movie CLI,
 * not a second storyboard schema or a replacement render engine.
 */
import { MulmoScriptMethods } from "../../methods/mulmo_script.js";
import type { MulmoScript } from "../../types/index.js";
import { assertSnsNoPaidApiMovie } from "../safety/no_paid_api.js";
import { CLOUDFLARE_FLUX_MODEL } from "../safety/cloudflare_free_plan.js";
import { validateSnsShortPlan } from "./validate_sns_short.js";

export const makeSnsStillPreview = (plan: MulmoScript, env: Record<string, string | undefined>): MulmoScript => {
  validateSnsShortPlan(plan);
  for (const [index, beat] of plan.beats.entries()) {
    const prompt = beat.imagePrompt?.trim() ?? "";
    if (prompt.length < 1 || prompt.length > 2048) {
      throw new Error(`Beat ${index + 1}: FLUX image prompt must be 1–2048 characters; refuse before any image request`);
    }
  }

  // Do NOT spread the AI-produced plan: other fields can enable paid TTS,
  // effects, translations, remote media or video generation by accident.
  // MulmoScript remains the sole schema and the original plan is unchanged.
  const preview = MulmoScriptMethods.validate({
    $mulmocast: { version: "1.1" },
    title: plan.title,
    lang: "ja",
    canvasSize: { width: 720, height: 1280 },
    imageParams: { provider: "cloudflare_free", model: CLOUDFLARE_FLUX_MODEL },
    movieParams: { provider: "mock", model: "mock-model" },
    audioParams: { suppressSpeech: true, introPadding: 0, padding: 0, closingPadding: 0, outroPadding: 0, bgmVolume: 0 },
    beats: plan.beats.map((beat) => ({
      id: beat.id,
      text: "",
      duration: 2,
      imagePrompt: beat.imagePrompt?.trim(),
    })),
  });
  // All three beats are checked before starting the actual MulmoCast CLI.
  assertSnsNoPaidApiMovie(preview, { env });
  return preview;
};

import type { MulmoStudioContext } from "../../types/index.js";
import { MulmoPresentationStyleMethods } from "../../methods/mulmo_presentation_style.js";
import { MulmoStudioContextMethods } from "../../methods/mulmo_studio_context.js";

type FreeAction = "audio" | "images" | "movie";
const FREE_TTS_MODELS = new Set(["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"]);

/** Opt-in guard for the original CLI. No changes when SNS_VIDEO_FREE_ONLY is unset.
 * Block costs before running *any* potentially billed AI step, not after an earlier step ran.
 * This does not confirm the real account billing tier; the operator must do that separately.
 */
export const assertSnsFreeMode = (context: MulmoStudioContext, action: FreeAction): void => {
  if (process.env.SNS_VIDEO_FREE_ONLY !== "1") return;
  const script = context.studio.script;
  const style = context.presentationStyle;

  // Prototype-only: allow at most one 2-second Wan request by default, or three
  // when an explicit three-request manual mode is selected. No production approval.
  // All moviePrompt generation remains blocked without both opt-ins.
  const movieBeats = script.beats.filter((beat) => Boolean(beat.moviePrompt));
  const maxWanRequests = process.env.SNS_VIDEO_MAX_WAN_I2V_REQUESTS === "3" ? 3 : 1;
  const allowWanDemo =
    action === "movie" &&
    process.env.SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT === "1" &&
    process.env.SNS_VIDEO_THIRD_PARTY_DEMO_CONSENT === "1" &&
    movieBeats.length >= 1 &&
    movieBeats.length <= maxWanRequests &&
    style.audioParams.suppressSpeech === true &&
    movieBeats.every((beat) => {
      const params = { ...style.movieParams, ...beat.movieParams };
      return (
        beat.duration === 2 &&
        Boolean(beat.imagePrompt) &&
        params.provider === "wan22_trial" &&
        (params.model ?? "wan2.2-i2v") === "wan2.2-i2v" &&
        params.firstFrameImageName === "$beatImage" &&
        !params.lastFrameImageName &&
        !params.referenceImages?.length &&
        params.generateAudio !== true
      );
    });

  if (MulmoStudioContextMethods.needTranslate(context, action === "movie")) {
    throw new Error("Free-only mode: translation uses an unverified LLM; use matching script/output languages");
  }

  const imageGeneration = action !== "audio";
  const audioGeneration = action !== "images";
  if (imageGeneration) {
    const allRefs = [style.imageParams?.images, ...script.beats.map((beat) => beat.images)].filter((x) => x !== undefined);
    if (allRefs.some((refs) => Object.values(refs).some((ref) => ref.type === "moviePrompt"))) {
      throw new Error("Free-only mode: moviePrompt reference requires an unverified paid movie API");
    }
    const usesGeneratedRef = allRefs.some((refs) => Object.values(refs).some((ref) => ref.type === "imagePrompt"));
    if (usesGeneratedRef && style.imageParams?.provider !== "cloudflare_free") {
      throw new Error("Free-only mode: imagePrompt references must use the Cloudflare Free image provider");
    }
  }

  for (const [index, beat] of script.beats.entries()) {
    const label = `Free-only mode, beat ${index + 1}`;
    if (imageGeneration) {
      if ((beat.moviePrompt && !allowWanDemo) || beat.enableLipSync || beat.soundEffectPrompt || beat.htmlPrompt) {
        throw new Error(`${label}: movie, lip sync, sound effect or HTML AI generation is not approved for free use`);
      }
      if (beat.image?.type === "remotion" && "prompt" in beat.image) {
        throw new Error(`${label}: Remotion AI code generation is not approved for free use`);
      }
      const needsImageModel = Boolean(beat.imagePrompt) || (!beat.image && !beat.moviePrompt);
      if (needsImageModel && MulmoPresentationStyleMethods.getImageAgentInfo(style, beat).imageParams.provider !== "cloudflare_free") {
        throw new Error(`${label}: image generation would call an unapproved provider`);
      }
    }

    if (audioGeneration && !style.audioParams.suppressSpeech && beat.text?.trim() && !beat.audio) {
      const speech = MulmoStudioContextMethods.getAudioParam(context, beat, context.lang ?? script.lang);
      if (speech.provider !== "gemini" || !FREE_TTS_MODELS.has(speech.model ?? "gemini-3.8-flash-tts")) {
        throw new Error(`${label}: speech model is not in the verified Gemini Free TTS allowlist`);
      }
    }
  }
};

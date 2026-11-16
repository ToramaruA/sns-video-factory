/**
 * Fail-closed guard for the SNS Video Factory's initial local/mock movie path.
 *
 * This is intentionally more restrictive than MulmoCast. It does NOT claim
 * to approve a real free image / I2V provider: those require separate model,
 * account billing tier, license and quota verification before being added.
 */
import type { MulmoScript, MulmoPresentationStyle } from "../../types/index.js";

export class SnsFreePreflightError extends Error {
  constructor(public readonly reasons: string[]) {
    super("SNS free-only preflight blocked:\n" + reasons.map((reason) => "- " + reason).join("\n"));
    this.name = "SnsFreePreflightError";
  }
}

type Source = { kind: string };
type MediaRef = { type: string; source?: Source };
type ImageSettings = { provider?: string; model?: string };
type MovieSettings = { provider?: string; model?: string; generateAudio?: boolean };

const allowedMockImage = (settings: ImageSettings, path: string, problems: string[]) => {
  if (settings.provider !== "mock" || (settings.model !== undefined && settings.model !== "mock-model")) {
    problems.push(`${path}: only the bundled mock image Agent is approved; no external image API is allowed`);
  }
};

const allowedMovieSettings = (settings: MovieSettings | undefined, path: string, problems: string[]) => {
  if (settings?.provider !== "mock" || (settings.model !== undefined && settings.model !== "mock-model")) {
    problems.push(`${path}: an explicit mock movie provider is required (even if no movie is generated)`);
  }
  if (settings?.generateAudio) problems.push(`${path}: generated movie audio is not approved`);
};

const localSource = (source: Source | undefined, path: string, problems: string[]) => {
  if (source?.kind !== "path") problems.push(`${path}: only a local path source is approved`);
};

const localImageOrMovie = (media: MediaRef, path: string, problems: string[]) => {
  if (media.type !== "image" && media.type !== "movie") {
    problems.push(`${path}: image, movie, HTML and AI-powered media plugins are not approved unless they use a local image/movie`);
    return;
  }
  localSource(media.source, `${path}.source`, problems);
};

/**
 * Invoke on the *validated effective script* BEFORE the original movie
 * pipeline begins. The normal MulmoCast CLI remains untouched unless the
 * explicit --sns-free-only switch is provided.
 *
 * We deliberately require suppressSpeech even when narration seems absent:
 * MulmoCast's speaker defaults to the paid OpenAI TTS provider.
 */
export const assertSnsNoPaidApiMovie = (
  script: MulmoScript,
  options: { targetLang?: string; presentationStyle?: MulmoPresentationStyle } = {},
): void => {
  const problems: string[] = [];
  const presentationStyle = options.presentationStyle ?? script;
  const language = script.lang;

  if (options.targetLang && options.targetLang !== language) {
    problems.push("translation: output language differs from the script and may call paid OpenAI");
  }
  if (script.captionParams?.lang && script.captionParams.lang !== language) {
    problems.push("captionParams.lang: translation may call paid OpenAI");
  }
  if (script.audioParams.suppressSpeech !== true || presentationStyle.audioParams.suppressSpeech !== true) {
    problems.push("audioParams.suppressSpeech: narration must be explicitly disabled to avoid paid TTS");
  }

  for (const [path, style] of [
    ["script", script],
    ["presentationStyle", presentationStyle],
  ] as const) {
    allowedMockImage(style.imageParams ?? {}, `${path}.imageParams`, problems);
    allowedMovieSettings(style.movieParams, `${path}.movieParams`, problems);
    if (style.htmlImageParams) problems.push(`${path}.htmlImageParams: HTML generation can call a paid LLM`);
    if (style.avatarParams || style.lipSyncParams || style.remotionParams) {
      problems.push(`${path}: avatars, lip-sync and Remotion extras are not approved`);
    }
    if (Object.values(style.speechParams.speakers).some((speaker) => speaker.avatar !== undefined)) {
      problems.push(`${path}.speechParams: speaker avatar packages may download or render additional media`);
    }
    if (style.audioParams.bgm) localSource(style.audioParams.bgm, `${path}.audioParams.bgm`, problems);
    for (const [name, ref] of Object.entries(style.imageParams?.images ?? {})) {
      localImageOrMovie(ref, `${path}.imageParams.images[${name}]`, problems);
    }
    if (style.captionParams?.lang && style.captionParams.lang !== language) {
      problems.push(`${path}.captionParams.lang: translation is not approved`);
    }
  }

  for (const [index, beat] of script.beats.entries()) {
    const path = `beats[${index}]`;
    if (beat.htmlPrompt || beat.htmlImageParams) problems.push(`${path}: HTML generation is not approved`);
    if (beat.moviePrompt) problems.push(`${path}.moviePrompt: real I2V and the mock movie Agent are not approved (mock downloads a remote file)`);
    if (beat.soundEffectPrompt) problems.push(`${path}.soundEffectPrompt: remote sound-effect generation is not approved`);
    if (beat.enableLipSync || beat.lipSyncParams || beat.avatarParams) problems.push(`${path}: lip sync / avatar generation is not approved`);
    if (beat.movieParams) {
      // Reject per-beat provider changes; the default has been checked above.
      allowedMovieSettings(
        { ...presentationStyle.movieParams, ...beat.movieParams },
        `${path}.movieParams`,
        problems,
      );
    }
    if (beat.audio && beat.audio.type !== "audio") {
      problems.push(`${path}.audio: MIDI/JingleScript generation has not been approved`);
    } else if (beat.audio?.type === "audio") {
      localSource(beat.audio.source, `${path}.audio.source`, problems);
    }
    if (beat.captionParams?.lang && beat.captionParams.lang !== language) {
      problems.push(`${path}.captionParams.lang: translation is not approved`);
    }
    if (beat.soundEffects?.length) {
      for (const [j, effect] of beat.soundEffects.entries()) {
        localSource(effect.source, `${path}.soundEffects[${j}].source`, problems);
      }
    }
    for (const [name, ref] of Object.entries(beat.images ?? {})) {
      localImageOrMovie(ref, `${path}.images[${name}]`, problems);
    }
    if (beat.image) localImageOrMovie(beat.image, `${path}.image`, problems);
    if (beat.imagePrompt) {
      allowedMockImage({ ...presentationStyle.imageParams, ...beat.imageParams }, `${path}.imageParams`, problems);
    } else if (beat.imageParams?.provider && beat.imageParams.provider !== "mock") {
      problems.push(`${path}.imageParams: paid image provider override is not approved`);
    }
    if (!beat.image && !beat.imagePrompt) {
      problems.push(`${path}: a local image/movie or a mock imagePrompt is required in this first safe mode`);
    }
  }
  if (problems.length) throw new SnsFreePreflightError(problems);
};

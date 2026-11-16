import test from "node:test";
import assert from "node:assert/strict";
import { MulmoScriptMethods } from "../../src/methods/mulmo_script.js";
import { assertSnsNoPaidApiMovie, SnsFreePreflightError } from "../../src/sns-video/safety/no_paid_api.js";
import {
  assertGroqFreePlanConfigured,
  GROQ_FREE_PLANNING_MODEL,
} from "../../src/sns-video/safety/free_planning.js";
import type { MulmoScript } from "../../src/types/index.js";

// Always validate with the ORIGINAL MulmoCast schema, so hidden default paid
// providers are present in the same form as real CLI inputs.
const makeScript = (overrides: Record<string, unknown> = {}): MulmoScript =>
  MulmoScriptMethods.validate({
    $mulmocast: { version: "1.1" },
    lang: "ja",
    canvasSize: { width: 720, height: 1280 },
    imageParams: { provider: "mock", model: "mock-model" },
    movieParams: { provider: "mock", model: "mock-model" },
    audioParams: { suppressSpeech: true, introPadding: 0, padding: 0, closingPadding: 0, outroPadding: 0, bgmVolume: 0 },
    beats: [
      { id: "one", text: "", duration: 2, image: { type: "image", source: { kind: "path", path: "./one.png" } } },
      { id: "two", text: "", duration: 2, imagePrompt: "Mock image" },
    ],
    ...overrides,
  });

const blocked = (script: MulmoScript, reason: RegExp, options?: Parameters<typeof assertSnsNoPaidApiMovie>[1]) => {
  assert.throws(
    () => assertSnsNoPaidApiMovie(script, options),
    (err: unknown) => err instanceof SnsFreePreflightError && reason.test(err.message),
  );
};

test("local images and the bundled mock Agent are allowed by the strict SNS path", () => {
  const script = makeScript();
  assert.doesNotThrow(() => assertSnsNoPaidApiMovie(script, { targetLang: "ja", presentationStyle: script }));
});

test("a local movie clip and local audio can be edited without invoking any generator", () => {
  const s = makeScript({
    beats: [{
      id: "local_video",
      text: "",
      duration: 2,
      image: { type: "movie", source: { kind: "path", path: "./clip.mp4" } },
      audio: { type: "audio", source: { kind: "path", path: "./silent.wav" } },
    }],
  });
  assert.doesNotThrow(() => assertSnsNoPaidApiMovie(s));
});

test("MulmoCast's implicit paid image, movie and TTS defaults are rejected", () => {
  const s = MulmoScriptMethods.validate({
    $mulmocast: { version: "1.1" },
    beats: [{ text: "", duration: 2, image: { type: "image", source: { kind: "path", path: "./one.png" } } }],
  });
  blocked(s, /imageParams|movieParams|suppressSpeech/);
});

test("even mock moviePrompt is rejected because upstream mock movie Agent downloads a remote file", () => {
  const s = makeScript({ beats: [{ text: "", duration: 2, imagePrompt: "local mock", moviePrompt: "animate" }] });
  blocked(s, /moviePrompt/);
});

test("per-beat image provider switch cannot bypass the global mock allowlist", () => {
  const s = makeScript({
    beats: [{ text: "", duration: 2, imagePrompt: "cat", imageParams: { provider: "openai" } }],
  });
  blocked(s, /imageParams/);
});

test("per-beat movie provider switch cannot bypass the global mock allowlist", () => {
  const s = makeScript({
    beats: [{ text: "", duration: 2, image: { type: "image", source: { kind: "path", path: "./one.png" } }, movieParams: { provider: "replicate" } }],
  });
  blocked(s, /movieParams/);
});

test("the global image provider must not be paid, even when the beat uses local media", () => {
  blocked(makeScript({ imageParams: { provider: "openai" } }), /imageParams/);
});

test("local sources only; URL sources and arbitrary media plugins are not approved", () => {
  const url = makeScript({ beats: [{
    text: "", duration: 2,
    image: { type: "image", source: { kind: "url", url: "https://example.com/test.png" } },
  }] });
  blocked(url, /local path/);
  const web = makeScript({ beats: [{ text: "", duration: 2, image: { type: "web", url: "https://example.com" } }] });
  blocked(web, /not approved/);
});

test("nested image refs cannot trigger an image-generation plugin", () => {
  const script = makeScript({
    imageParams: {
      provider: "mock",
      images: {
        ref: { type: "imagePrompt", prompt: "Paid if configuration changes" },
      },
    },
  });
  blocked(script, /imageParams.images/);
});

test("narration is blocked unless suppressSpeech is true", () => {
  blocked(makeScript({ audioParams: { suppressSpeech: false } }), /suppressSpeech/);
});

test("implicit paid translation is blocked for target language or caption language overrides", () => {
  const s = makeScript();
  blocked(s, /translation/, { targetLang: "en" });
  blocked(makeScript({ captionParams: { lang: "en" } }), /translation/);
  blocked(makeScript({ beats: [{
    text: "", duration: 2, captionParams: { lang: "en" }, image: { type: "image", source: { kind: "path", path: "./one.png" } },
  }] }), /translation/);
});

test("background music and audio sources cannot download arbitrary URLs", () => {
  const s = makeScript({ audioParams: {
    suppressSpeech: true,
    bgm: { kind: "url", url: "https://example.com/song.mp3" },
  } });
  blocked(s, /audioParams.bgm/);
});

test("HTML LLM, sound effects and lip sync remain disabled in this first safe mode", () => {
  blocked(makeScript({ htmlImageParams: { provider: "openai" } }), /htmlImageParams/);
  blocked(makeScript({ beats: [{
    text: "", duration: 2,
    image: { type: "image", source: { kind: "path", path: "./one.png" } },
    soundEffectPrompt: "cheers",
  }] }), /soundEffectPrompt/);
  blocked(makeScript({ beats: [{
    text: "", duration: 2,
    image: { type: "image", source: { kind: "path", path: "./one.png" } },
    enableLipSync: true,
  }] }), /lip sync/);
});

test("a presentation style override cannot re-enable a billable provider", () => {
  const script = makeScript();
  const presentationStyle = { ...script, imageParams: { ...script.imageParams, provider: "openai" as const } };
  blocked(script, /presentationStyle.imageParams/, { presentationStyle });
});

test("speaker-level avatar packages are rejected even when no beat requests avatarParams", () => {
  const s = makeScript({ speechParams: { speakers: {
    Presenter: { voiceId: "shimmer", avatar: { source: "https://example.com/avatar/" } },
  } } });
  blocked(s, /speaker avatar packages/);
});

test("Groq free planning requires account Free Plan attestation AND its API key", () => {
  assert.equal(GROQ_FREE_PLANNING_MODEL, "openai/gpt-oss-20b");
  assert.throws(() => assertGroqFreePlanConfigured({}), /CONFIRMED/);
  assert.throws(() => assertGroqFreePlanConfigured({ SNS_VIDEO_GROQ_FREE_PLAN_CONFIRMED: "1" }), /API key/);
  assert.doesNotThrow(() => assertGroqFreePlanConfigured({
    SNS_VIDEO_GROQ_FREE_PLAN_CONFIRMED: "1",
    GROQ_API_KEY: "local-test-dummy-key",
  }));
});

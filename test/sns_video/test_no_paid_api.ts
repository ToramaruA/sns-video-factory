import test from "node:test";
import assert from "node:assert/strict";
import { MulmoScriptMethods } from "../../src/methods/mulmo_script.js";
import { assertSnsNoPaidApiMovie, SnsFreePreflightError } from "../../src/sns-video/safety/no_paid_api.js";
import { assertGroqFreePlanConfigured, GROQ_FREE_PLANNING_MODEL } from "../../src/sns-video/safety/free_planning.js";
import type { MulmoScript } from "../../src/types/index.js";

const localBeat = {
  text: "",
  duration: 2,
  image: { type: "image", source: { kind: "path", path: "./one.png" } },
};

const makeScript = (overrides: Record<string, unknown> = {}): MulmoScript =>
  MulmoScriptMethods.validate({
    $mulmocast: { version: "1.1" },
    lang: "ja",
    imageParams: { provider: "mock", model: "mock-model" },
    movieParams: { provider: "mock", model: "mock-model" },
    audioParams: { suppressSpeech: true, introPadding: 0, padding: 0, closingPadding: 0, outroPadding: 0 },
    beats: [localBeat, { text: "", duration: 2, imagePrompt: "mock visual" }],
    ...overrides,
  });

test("safe render permits local images, a local movie and the existing mock-image Agent", () => {
  const script = makeScript({
    beats: [
      localBeat,
      {
        text: "",
        duration: 2,
        image: { type: "movie", source: { kind: "path", path: "./clip.mp4" } },
        audio: { type: "audio", source: { kind: "path", path: "./silent.wav" } },
      },
      { text: "", duration: 2, imagePrompt: "offline mock" },
    ],
  });
  assert.doesNotThrow(() => assertSnsNoPaidApiMovie(script, { targetLang: "ja", presentationStyle: script }));
});

test("all paid and unknown generator paths fail closed before entering MulmoCast movie", () => {
  const defaults = MulmoScriptMethods.validate({
    $mulmocast: { version: "1.1" },
    beats: [localBeat],
  });
  const cases: { name: string; script: MulmoScript; match: RegExp }[] = [
    { name: "paid implicit defaults", script: defaults, match: /imageParams|movieParams/ },
    { name: "paid image provider", script: makeScript({ imageParams: { provider: "openai" } }), match: /imageParams/ },
    { name: "paid movie provider", script: makeScript({ movieParams: { provider: "replicate" } }), match: /movieParams/ },
    { name: "narration", script: makeScript({ audioParams: { suppressSpeech: false } }), match: /suppressSpeech/ },
    {
      name: "moviePrompt even with mock provider",
      script: makeScript({ beats: [{ ...localBeat, moviePrompt: "animate" }] }),
      match: /moviePrompt/,
    },
    {
      name: "per-beat paid image",
      script: makeScript({ beats: [{ text: "", duration: 2, imagePrompt: "cat", imageParams: { provider: "openai" } }] }),
      match: /imageParams/,
    },
    {
      name: "per-beat paid movie",
      script: makeScript({ beats: [{ ...localBeat, movieParams: { provider: "replicate" } }] }),
      match: /movieParams/,
    },
    {
      name: "image ref generation",
      script: makeScript({
        imageParams: { provider: "mock", images: { ref: { type: "imagePrompt", prompt: "generated image" } } },
      }),
      match: /imageParams.images/,
    },
    {
      name: "remote image",
      script: makeScript({
        beats: [{ text: "", duration: 2, image: { type: "image", source: { kind: "url", url: "https://example.com/x.png" } } }],
      }),
      match: /local path/,
    },
    {
      name: "HTML image plugin",
      script: makeScript({ beats: [{ ...localBeat, image: { type: "web", url: "https://example.com" } }] }),
      match: /not approved/,
    },
    {
      name: "HTML LLM",
      script: makeScript({ htmlImageParams: { provider: "openai" } }),
      match: /htmlImageParams/,
    },
    {
      name: "AI sound effect",
      script: makeScript({ beats: [{ ...localBeat, soundEffectPrompt: "music" }] }),
      match: /soundEffectPrompt/,
    },
    {
      name: "lip sync",
      script: makeScript({ beats: [{ ...localBeat, enableLipSync: true }] }),
      match: /lip sync/,
    },
    {
      name: "remote background music",
      script: makeScript({
        audioParams: { suppressSpeech: true, bgm: { kind: "url", url: "https://example.com/song.mp3" } },
      }),
      match: /audioParams.bgm/,
    },
    {
      name: "speaker avatar",
      script: makeScript({
        speechParams: { speakers: { Presenter: { voiceId: "shimmer", avatar: { source: "https://example.com/avatar/" } } } },
      }),
      match: /speaker avatar packages/,
    },
    {
      name: "caption translation",
      script: makeScript({ captionParams: { lang: "en" } }),
      match: /translation/,
    },
    {
      name: "per-beat caption translation",
      script: makeScript({ beats: [{ ...localBeat, captionParams: { lang: "en" } }] }),
      match: /translation/,
    },
  ];
  for (const item of cases) {
    assert.throws(
      () => assertSnsNoPaidApiMovie(item.script),
      (error: unknown) => error instanceof SnsFreePreflightError && item.match.test(error.message),
      item.name,
    );
  }
});

test("FLUX image generation is allowed only for an explicitly confirmed Workers Free account", () => {
  const script = makeScript({
    imageParams: { provider: "cloudflare_free", model: "@cf/black-forest-labs/flux-1-schnell" },
  });
  const env = {
    SNS_VIDEO_CLOUDFLARE_FREE_PLAN_CONFIRMED: "1",
    CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
    CLOUDFLARE_API_TOKEN: "fake-test-token",
  };
  assert.throws(() => assertSnsNoPaidApiMovie(script, { env: {} }), /Workers Free/);
  assert.doesNotThrow(() => assertSnsNoPaidApiMovie(script, { env }));
  assert.throws(
    () => assertSnsNoPaidApiMovie(script, { env, presentationStyle: { ...script, imageParams: { provider: "openai" } } }),
    /presentationStyle.imageParams/,
  );
  const references = makeScript({
    imageParams: {
      provider: "cloudflare_free",
      images: { logo: { type: "image", source: { kind: "path", path: "./logo.png" } } },
    },
  });
  assert.throws(() => assertSnsNoPaidApiMovie(references, { env }), /reference images/);
  const wrongModel = makeScript({ imageParams: { provider: "cloudflare_free", model: "@cf/black-forest-labs/flux-2-dev" } });
  assert.throws(() => assertSnsNoPaidApiMovie(wrongModel, { env }), /mock image or explicitly confirmed/);
});

test("a requested translation or paid presentation-style override cannot bypass the guard", () => {
  const script = makeScript();
  assert.throws(() => assertSnsNoPaidApiMovie(script, { targetLang: "en" }), /translation/);
  const style = { ...script, imageParams: { ...script.imageParams, provider: "openai" as const } };
  assert.throws(() => assertSnsNoPaidApiMovie(script, { presentationStyle: style }), /presentationStyle.imageParams/);
});

test("Groq planning requires Free Plan confirmation and API key; no live API call", () => {
  assert.equal(GROQ_FREE_PLANNING_MODEL, "openai/gpt-oss-20b");
  assert.throws(() => assertGroqFreePlanConfigured({}), /CONFIRMED/);
  assert.throws(() => assertGroqFreePlanConfigured({ SNS_VIDEO_GROQ_FREE_PLAN_CONFIRMED: "1" }), /API key/);
  assert.doesNotThrow(() =>
    assertGroqFreePlanConfigured({
      SNS_VIDEO_GROQ_FREE_PLAN_CONFIRMED: "1",
      GROQ_API_KEY: "dummy-test-key-not-used",
    }),
  );
});

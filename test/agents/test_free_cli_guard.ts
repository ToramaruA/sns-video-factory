import test from "node:test";
import assert from "node:assert/strict";
import { assertSnsFreeMode } from "../../src/sns-video/safety/free_cli_guard.js";
import { MulmoScriptMethods } from "../../src/methods/mulmo_script.js";
import { createMockContext } from "../actions/utils.js";

const makeContext = (beats: Record<string, unknown>[], overrides: Record<string, unknown> = {}) => {
  const base = createMockContext();
  const script = MulmoScriptMethods.validate({
    $mulmocast: { version: "1.1" },
    lang: "ja",
    imageParams: { provider: "cloudflare_free" },
    speechParams: {
      speakers: {
        Presenter: { provider: "gemini", model: "gemini-3.8-flash-tts", voiceId: "Kore" },
      },
    },
    beats,
    ...overrides,
  });
  return {
    ...base,
    lang: "ja",
    presentationStyle: script,
    studio: { ...base.studio, script },
  };
};

const withFreeMode = (work: () => void) => {
  const previous = process.env.SNS_VIDEO_FREE_ONLY;
  process.env.SNS_VIDEO_FREE_ONLY = "1";
  try {
    work();
  } finally {
    if (previous === undefined) delete process.env.SNS_VIDEO_FREE_ONLY;
    else process.env.SNS_VIDEO_FREE_ONLY = previous;
  }
};

test("free-only accepts native reference image names and Gemini speech without editing MulmoScript", () => {
  withFreeMode(() => {
    const ctx = makeContext([{ text: "こんにちは", imagePrompt: "Cinematic portrait", imageNames: ["person"] }], {
      imageParams: {
        provider: "cloudflare_free",
        images: { person: { type: "image", source: { kind: "path", path: "./person.png" } } },
      },
    });
    assert.doesNotThrow(() => assertSnsFreeMode(ctx, "movie"));
    assert.deepEqual(ctx.studio.script.beats[0].imageNames, ["person"]);
  });
});

test("free-only blocks unintended OpenAI TTS even if images use the free provider", () => {
  withFreeMode(() => {
    const ctx = makeContext([{ text: "こんにちは", imagePrompt: "A hall" }], {
      speechParams: { speakers: { Presenter: { provider: "openai", voiceId: "shimmer" } } },
    });
    assert.throws(() => assertSnsFreeMode(ctx, "movie"), /speech model/);
    assert.doesNotThrow(() => assertSnsFreeMode(ctx, "images"));
  });
});

test("free-only blocks unexpectedly paid image/HTML/movie/lip-sync generation", () => {
  withFreeMode(() => {
    for (const beat of [
      { text: "", duration: 4, moviePrompt: "Slow camera pan" },
      { text: "Hello", imagePrompt: "A cat", imageParams: { provider: "openai" } },
      { text: "Hello", htmlPrompt: { prompt: "Generate a page" } },
      { text: "Hello", enableLipSync: true, imagePrompt: "A face" },
      { text: "Hello", soundEffectPrompt: "Bell rings", imagePrompt: "A bell" },
    ]) {
      const ctx = makeContext([beat], { audioParams: { suppressSpeech: true } });
      assert.throws(() => assertSnsFreeMode(ctx, "movie"), /Free-only mode/);
    }
  });
});

test("free-only rejects generated movie references, but allows existing image file inputs", () => {
  withFreeMode(() => {
    const ctx = makeContext([{ text: "", duration: 3, image: { type: "image", source: { kind: "path", path: "./existing.jpg" } } }], {
      audioParams: { suppressSpeech: true },
      imageParams: { provider: "cloudflare_free", images: { movie: { type: "moviePrompt", prompt: "Pan" } } },
    });
    assert.throws(() => assertSnsFreeMode(ctx, "movie"), /moviePrompt reference/);
    const asset = makeContext([{ text: "", duration: 3, image: { type: "image", source: { kind: "path", path: "./existing.jpg" } } }], {
      audioParams: { suppressSpeech: true },
    });
    assert.doesNotThrow(() => assertSnsFreeMode(asset, "movie"));
  });
});

test("original MulmoCast remains unchanged without explicit free-only opt-in", () => {
  const previous = process.env.SNS_VIDEO_FREE_ONLY;
  delete process.env.SNS_VIDEO_FREE_ONLY;
  try {
    const ctx = makeContext([{ text: "Hello", moviePrompt: "Spin around", imagePrompt: "Dancer" }], {
      imageParams: { provider: "openai" },
      speechParams: { speakers: { Presenter: { provider: "openai", voiceId: "shimmer" } } },
    });
    assert.doesNotThrow(() => assertSnsFreeMode(ctx, "movie"));
  } finally {
    if (previous !== undefined) process.env.SNS_VIDEO_FREE_ONLY = previous;
  }
});

test("opt-in Wan one-moving-cut demo stays blocked without TWO consents and rejects all other video generation", () => {
  const before = {
    free: process.env.SNS_VIDEO_FREE_ONLY,
    experiment: process.env.SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT,
    consent: process.env.SNS_VIDEO_THIRD_PARTY_DEMO_CONSENT,
  };
  const makeDemo = (beats: Record<string, unknown>[] = [{
    text: "",
    duration: 2,
    imagePrompt: "A toy robot onstage",
    moviePrompt: "The robot waves slowly",
  }], movieParams: Record<string, unknown> = {
    provider: "wan22_trial",
    model: "wan2.2-i2v",
    firstFrameImageName: "$beatImage",
  }) =>
    makeContext(beats, { movieParams, audioParams: { suppressSpeech: true } });
  try {
    process.env.SNS_VIDEO_FREE_ONLY = "1";
    delete process.env.SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT;
    delete process.env.SNS_VIDEO_THIRD_PARTY_DEMO_CONSENT;
    assert.throws(() => assertSnsFreeMode(makeDemo(), "movie"), /movie/);

    process.env.SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT = "1";
    assert.throws(() => assertSnsFreeMode(makeDemo(), "movie"), /movie/);

    process.env.SNS_VIDEO_THIRD_PARTY_DEMO_CONSENT = "1";
    assert.doesNotThrow(() => assertSnsFreeMode(makeDemo(), "movie"));
    assert.throws(() => assertSnsFreeMode(makeDemo(), "images"), /movie/);
    assert.throws(() => assertSnsFreeMode(makeDemo(undefined, { provider: "google", model: "veo-3.1-generate-001", firstFrameImageName: "$beatImage" }), "movie"), /movie/);
    assert.throws(() => assertSnsFreeMode(makeDemo([{ text: "", duration: 3, imagePrompt: "Robot", moviePrompt: "Dance" }]), "movie"), /movie/);
    assert.throws(() => assertSnsFreeMode(makeDemo([
      { text: "", duration: 2, imagePrompt: "Robot", moviePrompt: "Dance" },
      { text: "", duration: 2, imagePrompt: "Stage", moviePrompt: "Pan" },
    ]), "movie"), /movie/);
  } finally {
    if (before.free === undefined) delete process.env.SNS_VIDEO_FREE_ONLY;
    else process.env.SNS_VIDEO_FREE_ONLY = before.free;
    if (before.experiment === undefined) delete process.env.SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT;
    else process.env.SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT = before.experiment;
    if (before.consent === undefined) delete process.env.SNS_VIDEO_THIRD_PARTY_DEMO_CONSENT;
    else process.env.SNS_VIDEO_THIRD_PARTY_DEMO_CONSENT = before.consent;
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  const previousGemini = process.env.SNS_VIDEO_GEMINI_TTS_FREE_CONFIRMED;
  process.env.SNS_VIDEO_FREE_ONLY = "1";
  process.env.SNS_VIDEO_GEMINI_TTS_FREE_CONFIRMED = "1";
  try {
    work();
  } finally {
    if (previous === undefined) delete process.env.SNS_VIDEO_FREE_ONLY;
    else process.env.SNS_VIDEO_FREE_ONLY = previous;
    if (previousGemini === undefined) delete process.env.SNS_VIDEO_GEMINI_TTS_FREE_CONFIRMED;
    else process.env.SNS_VIDEO_GEMINI_TTS_FREE_CONFIRMED = previousGemini;
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

test("Wan prototype only permits the single moving cut with both opt-ins", () => {
  const oldExperiment = process.env.SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT;
  const oldConsent = process.env.SNS_VIDEO_THIRD_PARTY_DEMO_CONSENT;
  const oldMaximum = process.env.SNS_VIDEO_MAX_WAN_I2V_REQUESTS;
  const movieParams = {
    provider: "wan22_trial",
    model: "wan2.2-i2v",
    firstFrameImageName: "$beatImage",
  };
  const beat = { text: "", duration: 2, imagePrompt: "A toy robot", moviePrompt: "Waves hello" };
  try {
    withFreeMode(() => {
      const ctx = makeContext([beat], { movieParams, audioParams: { suppressSpeech: true } });
      delete process.env.SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT;
      delete process.env.SNS_VIDEO_THIRD_PARTY_DEMO_CONSENT;
      assert.throws(() => assertSnsFreeMode(ctx, "movie"), /movie/);

      process.env.SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT = "1";
      assert.throws(() => assertSnsFreeMode(ctx, "movie"), /movie/);

      process.env.SNS_VIDEO_THIRD_PARTY_DEMO_CONSENT = "1";
      assert.doesNotThrow(() => assertSnsFreeMode(ctx, "movie"));
      assert.throws(() => assertSnsFreeMode(ctx, "images"), /movie/);

      // The standard MulmoCast beat sequence may include two still-only cuts.
      const still = { text: "", duration: 2, imagePrompt: "A festive concert stage" };
      const threeCuts = makeContext([still, beat, still], { movieParams, audioParams: { suppressSpeech: true } });
      assert.doesNotThrow(() => assertSnsFreeMode(threeCuts, "movie"));

      const tooMany = makeContext([beat, beat], { movieParams, audioParams: { suppressSpeech: true } });
      assert.throws(() => assertSnsFreeMode(tooMany, "movie"), /movie/);

      process.env.SNS_VIDEO_MAX_WAN_I2V_REQUESTS = "3";
      const allMoving = makeContext([beat, beat, beat], { movieParams, audioParams: { suppressSpeech: true } });
      assert.doesNotThrow(() => assertSnsFreeMode(allMoving, "movie"));

      const fourMoving = makeContext([beat, beat, beat, beat], { movieParams, audioParams: { suppressSpeech: true } });
      assert.throws(() => assertSnsFreeMode(fourMoving, "movie"), /movie/);

      const paidMovie = makeContext([beat], {
        movieParams: { provider: "google" },
        audioParams: { suppressSpeech: true },
      });
      assert.throws(() => assertSnsFreeMode(paidMovie, "movie"), /movie/);
    });
  } finally {
    if (oldExperiment === undefined) delete process.env.SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT;
    else process.env.SNS_VIDEO_ENABLE_FREE_I2V_EXPERIMENT = oldExperiment;
    if (oldConsent === undefined) delete process.env.SNS_VIDEO_THIRD_PARTY_DEMO_CONSENT;
    else process.env.SNS_VIDEO_THIRD_PARTY_DEMO_CONSENT = oldConsent;
    if (oldMaximum === undefined) delete process.env.SNS_VIDEO_MAX_WAN_I2V_REQUESTS;
    else process.env.SNS_VIDEO_MAX_WAN_I2V_REQUESTS = oldMaximum;
  }
});

test("three existing Wan clips with Gemini Free TTS pass the original MulmoCast movie preflight", () => {
  withFreeMode(() => {
    const source = JSON.parse(readFileSync("docs/sns-video/examples/experimental-three-cut-narrated.json", "utf8"));
    const ctx = makeContext(source.beats, source);
    assert.equal(ctx.studio.script.beats.length, 3);
    assert.ok(ctx.studio.script.beats.every((beat) => beat.image?.type === "movie" && !beat.moviePrompt));
    assert.doesNotThrow(() => assertSnsFreeMode(ctx, "movie"));
    delete process.env.SNS_VIDEO_GEMINI_TTS_FREE_CONFIRMED;
    assert.throws(() => assertSnsFreeMode(ctx, "movie"), /Gemini API project/);
  });
});

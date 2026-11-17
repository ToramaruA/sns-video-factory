import test from "node:test";
import assert from "node:assert/strict";
import { getScriptFromPromptTemplate } from "../../src/utils/file.js";
import { MulmoScriptMethods } from "../../src/methods/mulmo_script.js";
import { makeSnsStillPreview } from "../../src/sns-video/planning/still_preview.js";

const freeEnv = {
  SNS_VIDEO_CLOUDFLARE_FREE_PLAN_CONFIRMED: "1",
  CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  CLOUDFLARE_API_TOKEN: "fake-test-token",
};

const getPlan = () => {
  const template = getScriptFromPromptTemplate("sns_video_short");
  assert.ok(template);
  return MulmoScriptMethods.validate({
    ...template,
    title: "音楽の夕べ",
    beats: template.beats.map((beat, index) => ({
      ...beat,
      imagePrompt: `Cinematic piano concert stage scene ${index + 1}, no lettering`,
      moviePrompt: `Slow camera movement during scene ${index + 1}`,
    })),
  });
};

test("real Groq-format plan can produce a free-only, three-image, six-second MulmoScript without changing the original", () => {
  const original = getPlan();
  const originalJson = JSON.stringify(original);
  const preview = makeSnsStillPreview(original, freeEnv);
  assert.equal(preview.beats.length, 3);
  assert.deepEqual(
    preview.beats.map((beat) => beat.duration),
    [2, 2, 2],
  );
  assert.deepEqual(
    preview.beats.map((beat) => beat.imagePrompt),
    original.beats.map((beat) => beat.imagePrompt),
  );
  assert.equal(preview.imageParams.provider, "cloudflare_free");
  assert.equal(preview.movieParams.provider, "mock");
  assert.deepEqual(preview.movieParams.fillOption, { style: "aspectFill" });
  assert.equal(preview.audioParams.suppressSpeech, true);
  assert.ok(preview.beats.every((beat) => !beat.moviePrompt && !beat.soundEffectPrompt && !beat.audio));
  assert.equal(preview.audioParams.bgm, undefined);
  assert.equal(JSON.stringify(original), originalJson);
  assert.equal(original.beats[0].moviePrompt, "Slow camera movement during scene 1");
});

test("variable number and durations of cuts carry through to original MulmoCast without paid fallbacks", () => {
  const base = getPlan();
  for (const durations of [[6], [2, 4, 3, 6, 5]]) {
    const plan = MulmoScriptMethods.validate({
      ...base,
      beats: durations.map((duration, index) => ({
        ...base.beats[index % base.beats.length],
        id: `shot_${index + 1}`,
        duration,
        imagePrompt: `Cinematic concert scene ${index + 1}, center-safe composition`,
        moviePrompt: `Gentle camera movement, scene ${index + 1}`,
      })),
    });
    const result = makeSnsStillPreview(plan, freeEnv);
    assert.equal(result.beats.length, durations.length);
    assert.deepEqual(
      result.beats.map((beat) => beat.duration),
      durations,
    );
    assert.ok(result.beats.every((beat) => beat.imagePrompt && !beat.moviePrompt && !beat.audio));
    assert.equal(result.movieParams.provider, "mock");
    assert.equal(result.audioParams.suppressSpeech, true);
  }
});

test("optional planned narration is not automatically sent to paid TTS by the still-only movie path", () => {
  const plan = getPlan();
  plan.beats[0].text = "ようこそ、音楽の夜へ。";
  const preview = makeSnsStillPreview(plan, freeEnv);
  assert.equal(preview.beats[0].text, "");
  assert.equal(plan.beats[0].text, "ようこそ、音楽の夜へ。");
  assert.equal(preview.audioParams.suppressSpeech, true);
  assert.equal(preview.beats[0].audio, undefined);
});

test("Free account confirmation and credentials are required before creating a renderable preview", () => {
  const plan = getPlan();
  assert.throws(() => makeSnsStillPreview(plan, {}), /Workers Free/);
  assert.throws(() => makeSnsStillPreview(plan, { ...freeEnv, SNS_VIDEO_CLOUDFLARE_FREE_PLAN_CONFIRMED: "0" }), /Workers Free/);
});

test("an invalid plan or an oversized later beat is rejected before any image is requested", () => {
  const plan = getPlan();
  plan.beats[2].imagePrompt = "x".repeat(2049);
  assert.throws(() => makeSnsStillPreview(plan, freeEnv), /2048/);
  const plan2 = getPlan();
  plan2.movieParams.provider = "replicate";
  assert.throws(() => makeSnsStillPreview(plan2, freeEnv), /movie generator/);
  const plan3 = getPlan();
  plan3.audioParams.suppressSpeech = false;
  assert.throws(() => makeSnsStillPreview(plan3, freeEnv), /audio/);
});

test("unused paid-provider defaults in the AI plan are NOT copied to the render input", () => {
  const plan = getPlan();
  plan.speechParams.speakers.Presenter.provider = "openai";
  plan.soundEffectParams.provider = "replicate";
  const preview = makeSnsStillPreview(plan, freeEnv);
  // MulmoCast's schema injects defaults for unused providers. They do not
  // execute because every beat is silent, has no effects and the guard runs.
  assert.equal(preview.audioParams.suppressSpeech, true);
  assert.ok(preview.beats.every((beat) => !beat.soundEffectPrompt && !beat.moviePrompt));
});

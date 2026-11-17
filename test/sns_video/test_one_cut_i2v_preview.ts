import test from "node:test";
import assert from "node:assert/strict";
import { getScriptFromPromptTemplate } from "../../src/utils/file.js";
import { MulmoScriptMethods } from "../../src/methods/mulmo_script.js";
import { assertSnsNoPaidApiMovie } from "../../src/sns-video/safety/no_paid_api.js";
import { makeSnsMixedI2vPreview, makeSnsOneCutWanProbe } from "../../src/sns-video/planning/one_cut_i2v_preview.js";

const planFixture = () => {
  const template = getScriptFromPromptTemplate("sns_video_short");
  assert.ok(template);
  return MulmoScriptMethods.validate({
    ...template,
    title: "室内楽の夜",
    beats: template.beats.map((beat, index) => ({
      ...beat,
      imagePrompt: `Elegant chamber concert still ${index + 1}, no lettering`,
      moviePrompt: `Camera moves slowly across the chamber concert, shot ${index + 1}`,
    })),
  });
};

test("one selected shot reuses existing free_i2v MulmoScript; never regenerates an image or audio", () => {
  const plan = planFixture();
  const before = JSON.stringify(plan);
  const script = makeSnsOneCutWanProbe(plan, "main");
  assert.equal(script.beats.length, 1);
  assert.equal(script.beats[0].id, "main");
  assert.deepEqual(script.beats[0].image, { type: "image", source: { kind: "path", path: "./assets/main.png" } });
  assert.equal(script.beats[0].moviePrompt, plan.beats[1].moviePrompt);
  assert.equal(script.movieParams.provider, "free_i2v");
  assert.equal(script.movieParams.model, "auto-free");
  assert.deepEqual(script.movieParams.fillOption, { style: "aspectFill" });
  assert.equal(script.imageParams.provider, "mock");
  assert.equal(script.audioParams.suppressSpeech, true);
  assert.equal(script.beats[0].imagePrompt, undefined);
  assert.equal(script.beats[0].soundEffectPrompt, undefined);
  assert.equal(JSON.stringify(plan), before);
});

test("the two unselected stills plus one local Wan clip can pass the normal no-paid guard", () => {
  const plan = planFixture();
  const script = makeSnsMixedI2vPreview(plan, "main");
  assert.equal(script.beats.length, 3);
  assert.deepEqual(
    script.beats.map((beat) => beat.duration),
    [2, 2, 2],
  );
  assert.equal(script.movieParams.provider, "mock");
  assert.deepEqual(script.movieParams.fillOption, { style: "aspectFill" });
  assert.equal(script.imageParams.provider, "mock");
  assert.equal(script.audioParams.suppressSpeech, true);
  assert.deepEqual(script.beats[1].image, { type: "movie", source: { kind: "path", path: "./assets/main.mov" } });
  assert.equal(script.beats[0].image?.type, "image");
  assert.equal(script.beats[2].image?.type, "image");
  assert.ok(script.beats.every((beat) => !beat.moviePrompt && !beat.imagePrompt && !beat.soundEffectPrompt));
  assert.doesNotThrow(() => assertSnsNoPaidApiMovie(script));
});

test("unsafe provider changes and wrong beat order are rejected before any API call", () => {
  const paid = planFixture();
  paid.movieParams.provider = "replicate";
  assert.throws(() => makeSnsOneCutWanProbe(paid, "main"), /movie generator/);

  const extraAudio = planFixture();
  extraAudio.audioParams.suppressSpeech = false;
  assert.throws(() => makeSnsMixedI2vPreview(extraAudio, "main"), /audio/);

  const wrongIds = planFixture();
  wrongIds.beats[0].id = "unexpected";
  assert.throws(() => makeSnsOneCutWanProbe(wrongIds, "main"), /hook\/main\/closing/);

  const hugePrompt = planFixture();
  hugePrompt.beats[2].moviePrompt = "x".repeat(5001);
  assert.throws(() => makeSnsOneCutWanProbe(hugePrompt, "hook"), /5000/);
});

test("inert paid MulmoCast defaults in plan are not used in the manual Wan or local-movie scripts", () => {
  const plan = planFixture();
  plan.speechParams.speakers.Presenter.provider = "openai";
  plan.soundEffectParams.provider = "replicate";
  const probe = makeSnsOneCutWanProbe(plan, "main");
  const mixed = makeSnsMixedI2vPreview(plan, "main");
  assert.equal(probe.audioParams.suppressSpeech, true);
  assert.equal(probe.beats[0].soundEffectPrompt, undefined);
  assert.equal(mixed.audioParams.suppressSpeech, true);
  assert.doesNotThrow(() => assertSnsNoPaidApiMovie(mixed));
});

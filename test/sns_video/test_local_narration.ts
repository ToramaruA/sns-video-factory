import assert from "node:assert/strict";
import test from "node:test";
import { MulmoScriptMethods } from "../../src/methods/mulmo_script.js";
import { assertSnsNoPaidApiMovie } from "../../src/sns-video/safety/no_paid_api.js";
import { makeSnsLocalNarrationPreview } from "../../src/sns-video/audio/local_narration.js";

const source = () =>
  MulmoScriptMethods.validate({
    $mulmocast: { version: "1.1" },
    title: "Concert",
    lang: "ja",
    canvasSize: { width: 720, height: 1280 },
    imageParams: { provider: "mock", model: "mock-model" },
    movieParams: { provider: "mock", model: "mock-model" },
    audioParams: { suppressSpeech: true, introPadding: 0, padding: 0, closingPadding: 0, outroPadding: 0 },
    beats: [
      { id: "hook", text: "", duration: 2, image: { type: "image", source: { kind: "path", path: "./assets/hook.png" } } },
      { id: "main", text: "", duration: 2, image: { type: "movie", source: { kind: "path", path: "./assets/main.mov" } } },
      { id: "closing", text: "", duration: 2, image: { type: "image", source: { kind: "path", path: "./assets/closing.png" } } },
    ],
  });

const lines = ["コンサートのご案内です。", "素敵な音楽をお楽しみください。", "お待ちしております。"];

test("local narration uses existing beat.audio with no TTS or billing calls", () => {
  const original = source();
  const before = JSON.stringify(original);
  const script = makeSnsLocalNarrationPreview(original, lines);
  assert.equal(script.beats.length, 3);
  assert.equal(script.audioParams.suppressSpeech, true);
  assert.equal(script.audioParams.audioVolume, 1);
  assert.equal(script.audioParams.bgmVolume, 0);
  assert.equal(script.speechParams.speakers.Presenter.provider, "mock");
  assert.deepEqual(
    script.beats.map((beat) => beat.text),
    lines,
  );
  assert.deepEqual(
    script.beats.map((beat) => beat.audio),
    ["hook", "main", "closing"].map((id) => ({ type: "audio", source: { kind: "path", path: `./assets/${id}.wav` } })),
  );
  assert.deepEqual(
    script.beats.map((beat) => beat.image?.type),
    ["image", "movie", "image"],
  );
  assert.ok(script.beats.every((beat) => !beat.moviePrompt && !beat.imagePrompt && !beat.soundEffectPrompt));
  assert.doesNotThrow(() => assertSnsNoPaidApiMovie(script));
  assert.equal(JSON.stringify(original), before);
});

test("MP3 narration is also available, no provider or mode changes", () => {
  const script = makeSnsLocalNarrationPreview(source(), lines, "mp3");
  assert.equal(script.beats[0].audio?.type, "audio");
  assert.deepEqual(script.beats[1].audio, { type: "audio", source: { kind: "path", path: "./assets/main.mp3" } });
  assert.equal(script.audioParams.suppressSpeech, true);
});

test("no extra cuts, remote media, out-of-order beats or invalid speech lines", () => {
  assert.throws(() => makeSnsLocalNarrationPreview(source(), ["only one"]), /exactly three/);
  const wrongOrder = source();
  wrongOrder.beats[0].id = "other";
  assert.throws(() => makeSnsLocalNarrationPreview(wrongOrder, lines), /hook\/main\/closing/);
  const remote = source();
  remote.beats[1].image = { type: "movie", source: { kind: "url", url: "https://example.com/clip.mov" } };
  assert.throws(() => makeSnsLocalNarrationPreview(remote, lines), /approved local/);
  const paid = source();
  paid.beats[1].moviePrompt = "paid provider would be ignored";
  const script = makeSnsLocalNarrationPreview(paid, lines);
  assert.equal(script.beats[1].moviePrompt, undefined);
  assert.doesNotThrow(() => assertSnsNoPaidApiMovie(script));
  assert.throws(() => makeSnsLocalNarrationPreview(source(), [lines[0], " ", lines[2]]), /1-500 characters/);
});

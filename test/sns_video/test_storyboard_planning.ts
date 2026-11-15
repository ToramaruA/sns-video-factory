import test from "node:test";
import assert from "node:assert/strict";
import { mulmoScriptSchema } from "../../src/types/schema.js";
import {
  applyStoryboardAssistantReply,
  approveCurrentStoryboard,
  buildApprovedStoryboardDraft,
  createStoryboardPlanningState,
  getStoryboardChatContext,
  initializeApprovedShotReviews,
  submitStoryboardFeedback,
} from "../../src/sns-video/director/storyboard_planning.js";
import type { Storyboard, VideoBrief } from "../../src/sns-video/director/storyboard_planning.js";

const brief = (): VideoBrief => ({
  projectId: "concert",
  purpose: "Announce a chamber music event",
  audience: "Students and local music enthusiasts",
  platform: "instagram_reels",
  language: "ja",
  targetDurationSeconds: 10,
  references: [
    { assetId: "logo1", kind: "logo", intent: "branding" },
    { assetId: "photo1", kind: "photo", intent: "appearance" },
    { assetId: "movie1", kind: "video", intent: "motion_reference" },
  ],
});

const storyboard = (): Storyboard => ({
  revision: 1,
  title: "室内楽コンサートの予告",
  concept: "Introduce the evening through instrument details",
  visualStyle: "Cinematic warm lighting",
  shots: [
    {
      beatId: "shot_01",
      durationSeconds: 4,
      visualDescription: "Closeup of a violin",
      imagePrompt: "A wooden violin under stage lights",
      moviePrompt: "Slow camera movement around the instrument",
      referenceAssetIds: ["photo1"],
    },
    {
      beatId: "shot_02",
      durationSeconds: 6,
      visualDescription: "Stage and event logo",
      imagePrompt: "Concert stage in a beautiful hall",
      moviePrompt: "Slow zoom toward the stage",
      referenceAssetIds: ["logo1", "movie1"],
    },
  ],
});

const session = () => createStoryboardPlanningState(brief(), storyboard());
const approved = () => approveCurrentStoryboard(session(), { revision: 1, reviewerId: "director" });

test("starts with exactly one storyboard and revision one", () => {
  const created = session();
  assert.equal(created.current.revision, 1);
  assert.equal(created.history.length, 1);
  assert.deepEqual(created.turns, []);
  assert.equal(created.approved, undefined);
  assert.throws(() => createStoryboardPlanningState(brief(), { ...storyboard(), revision: 2 }));
});

test("rejects malformed brief, duplicate asset IDs, and invalid shot data", () => {
  assert.throws(() => createStoryboardPlanningState({ ...brief(), targetDurationSeconds: 0 }, storyboard()));
  assert.throws(() => createStoryboardPlanningState({ ...brief(), platform: "unknown" as VideoBrief["platform"] }, storyboard()));
  assert.throws(() => createStoryboardPlanningState({ ...brief(), references: [...brief().references, { ...brief().references[0] }] }, storyboard()));
  const duplicateBeat = storyboard();
  duplicateBeat.shots[1].beatId = "shot_01";
  assert.throws(() => createStoryboardPlanningState(brief(), duplicateBeat));
  const badDuration = storyboard();
  badDuration.shots[0].durationSeconds = Infinity;
  assert.throws(() => createStoryboardPlanningState(brief(), badDuration));
  const blankPrompt = storyboard();
  blankPrompt.shots[0].imagePrompt = " ";
  assert.throws(() => createStoryboardPlanningState(brief(), blankPrompt));
});

test("a shot's reference asset must belong to the brief and be unique", () => {
  const unknown = storyboard();
  unknown.shots[0].referenceAssetIds = ["other"];
  assert.throws(() => createStoryboardPlanningState(brief(), unknown));
  const duplicate = storyboard();
  duplicate.shots[0].referenceAssetIds = ["photo1", "photo1"];
  assert.throws(() => createStoryboardPlanningState(brief(), duplicate));
});

test("input data and chat context are copied rather than exposed for mutation", () => {
  const inputBrief = brief();
  const input = storyboard();
  const created = createStoryboardPlanningState(inputBrief, input);
  input.shots[0].referenceAssetIds.push("movie1");
  inputBrief.references[0].assetId = "other";
  const context = getStoryboardChatContext(created);
  context.storyboard.shots[0].imagePrompt = "changed";
  context.brief.references[0].assetId = "changed";
  assert.deepEqual(created.current.shots[0].referenceAssetIds, ["photo1"]);
  assert.equal(created.current.shots[0].imagePrompt, "A wooden violin under stage lights");
  assert.equal(created.brief.references[0].assetId, "logo1");
});

test("user can say 'make the second shot shorter' without inventing alternative proposals", () => {
  const pending = submitStoryboardFeedback(session(), { turnId: "turn_01", expectedRevision: 1, message: "2カット目を短くして" });
  assert.equal(pending.pending?.userMessage, "2カット目を短くして");
  assert.equal(pending.current.revision, 1);
  const next = storyboard();
  next.revision = 2;
  next.shots[1].durationSeconds = 3;
  const revised = applyStoryboardAssistantReply(pending, { turnId: "turn_01", message: "2カット目を3秒にしました", revisedStoryboard: next });
  assert.equal(revised.current.revision, 2);
  assert.equal(revised.current.shots[1].durationSeconds, 3);
  assert.equal(revised.history.length, 2);
  assert.equal(revised.turns[0].userMessage, "2カット目を短くして");
  assert.equal(revised.turns[0].assistantMessage, "2カット目を3秒にしました");
  assert.equal(revised.pending, undefined);
  assert.equal(revised.approved, undefined);
  const confirmed = approveCurrentStoryboard(revised, { revision: 2, reviewerId: "director" });
  assert.equal(buildApprovedStoryboardDraft(confirmed).actualDurationSeconds, 7);
});

test("assistant may ask a clarifying question or reply without changing the storyboard", () => {
  const state = submitStoryboardFeedback(session(), { turnId: "turn_01", expectedRevision: 1, message: "少し変えたい" });
  const replied = applyStoryboardAssistantReply(state, { turnId: "turn_01", message: "どの部分を変更しますか？" });
  assert.equal(replied.current.revision, 1);
  assert.equal(replied.history.length, 1);
  assert.equal(replied.turns[0].resultingRevision, 1);
  const next = submitStoryboardFeedback(replied, { turnId: "turn_02", expectedRevision: 1, message: "冒頭を派手に" });
  assert.equal(next.pending?.turnId, "turn_02");
});

test("stale, simultaneous and duplicated messages are rejected", () => {
  const state = session();
  assert.throws(() => submitStoryboardFeedback(state, { turnId: "turn_01", expectedRevision: 2, message: "change" }));
  assert.throws(() => submitStoryboardFeedback(state, { turnId: "bad/id", expectedRevision: 1, message: "change" }));
  assert.throws(() => submitStoryboardFeedback(state, { turnId: "turn_01", expectedRevision: 1, message: " " }));
  const pending = submitStoryboardFeedback(state, { turnId: "turn_01", expectedRevision: 1, message: "change" });
  assert.throws(() => submitStoryboardFeedback(pending, { turnId: "turn_02", expectedRevision: 1, message: "another" }));
  assert.throws(() => applyStoryboardAssistantReply(pending, { turnId: "turn_02", message: "bad reply" }));
  const replied = applyStoryboardAssistantReply(pending, { turnId: "turn_01", message: "ok" });
  assert.throws(() => submitStoryboardFeedback(replied, { turnId: "turn_01", expectedRevision: 1, message: "duplicate" }));
  assert.throws(() => applyStoryboardAssistantReply(replied, { turnId: "turn_01", message: "again" }));
});

test("LLM may only return exactly the next revision, with validated references", () => {
  const state = submitStoryboardFeedback(session(), { turnId: "turn_01", expectedRevision: 1, message: "change" });
  assert.throws(() => applyStoryboardAssistantReply(state, { turnId: "turn_01", message: "oops", revisedStoryboard: storyboard() }));
  assert.throws(() =>
    applyStoryboardAssistantReply(state, { turnId: "turn_01", message: "oops", revisedStoryboard: { ...storyboard(), revision: 3 } }),
  );
  const invalid = storyboard();
  invalid.revision = 2;
  invalid.shots[0].referenceAssetIds = ["unknown"];
  assert.throws(() => applyStoryboardAssistantReply(state, { turnId: "turn_01", message: "oops", revisedStoryboard: invalid }));
});

test("current approval is revision-locked and a new feedback request invalidates it", () => {
  const state = approved();
  assert.equal(state.approved?.revision, 1);
  assert.throws(() => approveCurrentStoryboard(state, { revision: 1, reviewerId: "director" }));
  const pending = submitStoryboardFeedback(state, { turnId: "turn_01", expectedRevision: 1, message: "冒頭変えて" });
  assert.equal(pending.approved, undefined);
  assert.throws(() => approveCurrentStoryboard(pending, { revision: 1, reviewerId: "director" }));
  assert.throws(() => buildApprovedStoryboardDraft(pending));
  assert.throws(() => initializeApprovedShotReviews(pending));
  assert.throws(() => approveCurrentStoryboard(session(), { revision: 2, reviewerId: "director" }));
});

test("approved storyboard becomes a validated MulmoScript design draft but cannot execute generation", () => {
  assert.throws(() => buildApprovedStoryboardDraft(session()));
  const result = buildApprovedStoryboardDraft(approved());
  assert.equal(result.executionAllowed, false);
  assert.deepEqual(result.script.canvasSize, { width: 720, height: 1280 });
  assert.equal(result.script.audioParams.suppressSpeech, true);
  assert.deepEqual(result.script.beats.map((beat) => beat.id), ["shot_01", "shot_02"]);
  assert.equal(result.actualDurationSeconds, 10);
  assert.deepEqual(result.referencesByBeat[1].assetIds, ["logo1", "movie1"]);
  assert.equal(mulmoScriptSchema.safeParse(result.script).success, true);
  assert.equal("movieParams" in result.script, false);
  assert.equal("imageParams" in result.script, false);
});

test("approved storyboard initializes the existing per-shot review state", () => {
  assert.throws(() => initializeApprovedShotReviews(session()));
  const reviews = initializeApprovedShotReviews(approved());
  assert.deepEqual(reviews.map((shot) => shot.beatId), ["shot_01", "shot_02"]);
  assert.deepEqual(reviews.map((shot) => shot.imageRevision), [1, 1]);
});

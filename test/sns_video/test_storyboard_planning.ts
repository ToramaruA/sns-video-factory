import test from "node:test";
import assert from "node:assert/strict";
import { mulmoScriptSchema } from "../../src/types/schema.js";
import {
  buildApprovedStoryboardDraft,
  createStoryboardPlanningState,
  initializeSelectedShotReviews,
  reviseStoryboardProposal,
  selectStoryboardProposal,
} from "../../src/sns-video/director/storyboard_planning.js";
import type { StoryboardProposal, VideoBrief } from "../../src/sns-video/director/storyboard_planning.js";

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

const proposal = (id: string): StoryboardProposal => ({
  proposalId: id,
  revision: 1,
  title: `演奏会の予告・${id}`,
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

const session = () => createStoryboardPlanningState(brief(), [proposal("a"), proposal("b")]);
const selected = () => selectStoryboardProposal(session(), { proposalId: "a", revision: 1, reviewerId: "director" });

test("requires alternative concepts with unique stable proposal IDs", () => {
  assert.throws(() => createStoryboardPlanningState(brief(), [proposal("a")]));
  assert.throws(() => createStoryboardPlanningState(brief(), [proposal("a"), proposal("a")]));
  assert.throws(() => createStoryboardPlanningState(brief(), [proposal("bad/path"), proposal("b")]));
  assert.equal(session().proposals.length, 2);
});

test("rejects malformed brief, duplicate asset IDs, and invalid durations", () => {
  assert.throws(() => createStoryboardPlanningState({ ...brief(), targetDurationSeconds: 0 }, [proposal("a"), proposal("b")]));
  assert.throws(() => createStoryboardPlanningState({ ...brief(), platform: "unknown" as VideoBrief["platform"] }, [proposal("a"), proposal("b")]));
  const duplicateReferences = [...brief().references, { ...brief().references[0] }];
  assert.throws(() => createStoryboardPlanningState({ ...brief(), references: duplicateReferences }, [proposal("a"), proposal("b")]));
  const altered = proposal("a");
  altered.shots[0].durationSeconds = Number.POSITIVE_INFINITY;
  assert.throws(() => createStoryboardPlanningState(brief(), [altered, proposal("b")]));
});

test("validates total length, unique shot IDs, and image/motion descriptions", () => {
  const badDuration = proposal("a");
  badDuration.shots[1].durationSeconds = 3;
  assert.throws(() => createStoryboardPlanningState(brief(), [badDuration, proposal("b")]));
  const duplicateBeat = proposal("a");
  duplicateBeat.shots[1].beatId = "shot_01";
  assert.throws(() => createStoryboardPlanningState(brief(), [duplicateBeat, proposal("b")]));
  const blankPrompt = proposal("a");
  blankPrompt.shots[0].moviePrompt = " ";
  assert.throws(() => createStoryboardPlanningState(brief(), [blankPrompt, proposal("b")]));
});

test("reference IDs must exist and cannot be repeated in the same shot", () => {
  const unknown = proposal("a");
  unknown.shots[0].referenceAssetIds = ["not-registered"];
  assert.throws(() => createStoryboardPlanningState(brief(), [unknown, proposal("b")]));
  const duplicate = proposal("a");
  duplicate.shots[0].referenceAssetIds = ["photo1", "photo1"];
  assert.throws(() => createStoryboardPlanningState(brief(), [duplicate, proposal("b")]));
});

test("session copies reference lists so upstream mutation does not rewrite a proposal", () => {
  const input = proposal("a");
  const inputBrief = brief();
  const created = createStoryboardPlanningState(inputBrief, [input, proposal("b")]);
  input.shots[0].referenceAssetIds.push("movie1");
  inputBrief.references[0].assetId = "other";
  assert.deepEqual(created.proposals[0].shots[0].referenceAssetIds, ["photo1"]);
  assert.equal(created.brief.references[0].assetId, "logo1");
});

test("selection requires explicit human actor and exact concept revision", () => {
  const state = session();
  assert.throws(() => selectStoryboardProposal(state, { proposalId: "a", revision: 2, reviewerId: "director" }));
  assert.throws(() => selectStoryboardProposal(state, { proposalId: "nope", revision: 1, reviewerId: "director" }));
  assert.throws(() => selectStoryboardProposal(state, { proposalId: "a", revision: 1, reviewerId: "" }));
  const accepted = selected();
  assert.equal(accepted.selected?.proposalId, "a");
  assert.equal(state.selected, undefined);
  assert.throws(() => selectStoryboardProposal(accepted, { proposalId: "b", revision: 1, reviewerId: "director" }));
});

test("revision increments once and invalidates only the modified selected concept", () => {
  const state = selected();
  const next = { ...proposal("a"), revision: 2, concept: "New proposal" };
  const revised = reviseStoryboardProposal(state, "a", 1, next);
  assert.equal(revised.selected, undefined);
  assert.equal(revised.proposals[0].revision, 2);
  assert.equal(revised.proposals[1], state.proposals[1]);
  assert.equal(state.selected?.revision, 1);
  assert.throws(() => reviseStoryboardProposal(revised, "a", 1, { ...next, revision: 3 }));
  assert.throws(() => reviseStoryboardProposal(state, "a", 1, { ...next, revision: 3 }));
  assert.throws(() => reviseStoryboardProposal(state, "a", 1, { ...next, proposalId: "other" }));
});

test("revising an unselected proposal does not discard another approved selection", () => {
  const state = selected();
  const revised = reviseStoryboardProposal(state, "b", 1, { ...proposal("b"), revision: 2 });
  assert.deepEqual(revised.selected, state.selected);
});

test("unapproved or revised storyboard cannot be converted or start shot review", () => {
  assert.throws(() => buildApprovedStoryboardDraft(session()));
  assert.throws(() => initializeSelectedShotReviews(session()));
  const changed = reviseStoryboardProposal(selected(), "a", 1, { ...proposal("a"), revision: 2 });
  assert.throws(() => buildApprovedStoryboardDraft(changed));
  assert.throws(() => initializeSelectedShotReviews(changed));
});

test("selected design creates validated 9:16 Japanese MulmoScript without executing generation", () => {
  const state = selected();
  const draft = buildApprovedStoryboardDraft(state);
  assert.equal(draft.executionAllowed, false);
  assert.equal(draft.script.$mulmocast.version, "1.1");
  assert.deepEqual(draft.script.canvasSize, { width: 720, height: 1280 });
  assert.equal(draft.script.audioParams.suppressSpeech, true);
  assert.deepEqual(draft.script.beats.map((beat) => beat.id), ["shot_01", "shot_02"]);
  assert.equal(draft.script.beats[0].duration, 4);
  assert.match(draft.script.beats[0].imagePrompt, /Cinematic warm lighting/);
  assert.deepEqual(draft.referencesByBeat[1], { beatId: "shot_02", assetIds: ["logo1", "movie1"] });
  assert.equal(mulmoScriptSchema.safeParse(draft.script).success, true);
  // The draft intentionally has no configured paid/unknown providers or runnable job.
  assert.equal("movieParams" in draft.script, false);
  assert.equal("imageParams" in draft.script, false);
  assert.equal("references" in draft.script.beats[0], false);
});

test("review-state bridge uses the selected proposal's stable beat IDs", () => {
  const reviews = initializeSelectedShotReviews(selected());
  assert.deepEqual(reviews.map((shot) => shot.beatId), ["shot_01", "shot_02"]);
  assert.deepEqual(reviews.map((shot) => shot.imageRevision), [1, 1]);
  const reordered = proposal("a");
  reordered.shots.reverse();
  const state = createStoryboardPlanningState(brief(), [reordered, proposal("b")]);
  const confirmed = selectStoryboardProposal(state, { proposalId: "a", revision: 1, reviewerId: "director" });
  assert.deepEqual(initializeSelectedShotReviews(confirmed).map((shot) => shot.beatId), ["shot_02", "shot_01"]);
});

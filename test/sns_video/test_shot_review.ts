import test from "node:test";
import assert from "node:assert/strict";
import {
  approveImageResult,
  approveVideoResult,
  areShotsApprovedForFinalEdit,
  createShotReviewStates,
  isShotApprovedForFinalEdit,
  receiveImageResult,
  receiveVideoResult,
  requestImageRevision,
  requestMotionRevision,
} from "../../src/sns-video/workflow/shot_review.js";
import type { ShotReviewState } from "../../src/sns-video/workflow/shot_review.js";

const newShot = (): ShotReviewState => createShotReviewStates(["shot_01"])[0];

const approvedImage = (): ShotReviewState => {
  const image = receiveImageResult(newShot(), { assetId: "img-a", revision: 1 });
  return approveImageResult(image, { assetId: "img-a", revision: 1, reviewerId: "director" });
};

const readyVideo = (): ShotReviewState =>
  receiveVideoResult(approvedImage(), {
    assetId: "mp4-a",
    revision: 1,
    sourceImageAssetId: "img-a",
    sourceImageRevision: 1,
    motionPromptRevision: 1,
  });

const completeShot = (): ShotReviewState =>
  approveVideoResult(readyVideo(), { assetId: "mp4-a", revision: 1, reviewerId: "director" });

test("a project needs nonempty, unique, stable beat IDs", () => {
  assert.deepEqual(createShotReviewStates(["shot_01", "shot_02"]).map((s) => s.beatId), ["shot_01", "shot_02"]);
  assert.throws(() => createShotReviewStates([]));
  assert.throws(() => createShotReviewStates(["same", "same"]));
  assert.throws(() => createShotReviewStates([" shot_01"]));
});

test("image approval requires the exact asset and revision", () => {
  const shot = receiveImageResult(newShot(), { assetId: "img-a", revision: 1 });
  assert.throws(() => approveImageResult(shot, { assetId: "img-wrong", revision: 1, reviewerId: "director" }));
  assert.throws(() => approveImageResult(shot, { assetId: "img-a", revision: 2, reviewerId: "director" }));
  assert.throws(() => approveImageResult(shot, { assetId: "img-a", revision: 1, reviewerId: "" }));
  const approved = approveImageResult(shot, { assetId: "img-a", revision: 1, reviewerId: "director" });
  assert.equal(approved.image?.status, "approved");
  assert.equal(shot.image?.status, "ready_for_review");
  assert.throws(() => approveImageResult(approved, { assetId: "img-a", revision: 1, reviewerId: "director" }));
});

test("video cannot be accepted before its input image is approved", () => {
  const pending = receiveImageResult(newShot(), { assetId: "img-a", revision: 1 });
  assert.throws(() =>
    receiveVideoResult(pending, {
      assetId: "mp4-a",
      revision: 1,
      sourceImageAssetId: "img-a",
      sourceImageRevision: 1,
      motionPromptRevision: 1,
    }),
  );
});

test("stale image results cannot replace a newer revision", () => {
  const shot = requestImageRevision(newShot(), 1);
  assert.equal(shot.imageRevision, 2);
  assert.equal(shot.videoRevision, 2);
  assert.throws(() => receiveImageResult(shot, { assetId: "late-old-image", revision: 1 }));
  assert.throws(() => requestImageRevision(shot, 1));
  const current = receiveImageResult(shot, { assetId: "img-new", revision: 2 });
  assert.throws(() => receiveImageResult(current, { assetId: "duplicate", revision: 2 }));
});

test("motion-only changes preserve approved image but invalidate video", () => {
  const original = completeShot();
  const edited = requestMotionRevision(original, 1);
  assert.equal(original.video?.status, "approved");
  assert.equal(edited.image?.assetId, "img-a");
  assert.equal(edited.image?.status, "approved");
  assert.equal(edited.motionPromptRevision, 2);
  assert.equal(edited.videoRevision, 2);
  assert.equal(edited.video, undefined);
  assert.equal(isShotApprovedForFinalEdit(edited), false);
  assert.throws(() => requestMotionRevision(edited, 1));
  assert.throws(() =>
    receiveVideoResult(edited, {
      assetId: "stale-video",
      revision: 1,
      sourceImageAssetId: "img-a",
      sourceImageRevision: 1,
      motionPromptRevision: 1,
    }),
  );
});

test("image regeneration invalidates its video, but not other shots", () => {
  const shotA = completeShot();
  const shotB = { ...completeShot(), beatId: "shot_02" };
  const revisedA = requestImageRevision(shotA, 1);
  assert.equal(revisedA.image, undefined);
  assert.equal(revisedA.video, undefined);
  assert.equal(revisedA.imageRevision, 2);
  assert.equal(revisedA.videoRevision, 2);
  assert.equal(isShotApprovedForFinalEdit(shotA), true);
  assert.equal(isShotApprovedForFinalEdit(shotB), true);
  assert.equal(areShotsApprovedForFinalEdit([revisedA, shotB]), false);
});

test("video receipt must match exact approved source image and motion", () => {
  const shot = approvedImage();
  const spec = {
    assetId: "mp4-a",
    revision: 1,
    sourceImageAssetId: "img-a",
    sourceImageRevision: 1,
    motionPromptRevision: 1,
  };
  assert.throws(() => receiveVideoResult(shot, { ...spec, sourceImageAssetId: "img-other" }));
  assert.throws(() => receiveVideoResult(shot, { ...spec, sourceImageRevision: 3 }));
  assert.throws(() => receiveVideoResult(shot, { ...spec, motionPromptRevision: 3 }));
  const received = receiveVideoResult(shot, spec);
  assert.throws(() => receiveVideoResult(received, { ...spec, assetId: "duplicate-mp4" }));
  assert.equal(received.video?.status, "ready_for_review");
});

test("video approval is tied to the exact MP4 and cannot be reused", () => {
  const shot = readyVideo();
  assert.throws(() => approveVideoResult(shot, { assetId: "other", revision: 1, reviewerId: "director" }));
  assert.throws(() => approveVideoResult(shot, { assetId: "mp4-a", revision: 2, reviewerId: "director" }));
  const accepted = approveVideoResult(shot, { assetId: "mp4-a", revision: 1, reviewerId: "director" });
  assert.equal(accepted.video?.approvedBy, "director");
  assert.throws(() => approveVideoResult(accepted, { assetId: "mp4-a", revision: 1, reviewerId: "director" }));
});

test("final MP4 editing is blocked until every shot has approved current video", () => {
  assert.equal(areShotsApprovedForFinalEdit([]), false);
  assert.equal(isShotApprovedForFinalEdit(approvedImage()), false);
  assert.equal(isShotApprovedForFinalEdit(readyVideo()), false);
  assert.equal(isShotApprovedForFinalEdit(completeShot()), true);
  assert.equal(areShotsApprovedForFinalEdit([completeShot(), completeShot()]), true);
  assert.equal(areShotsApprovedForFinalEdit([completeShot(), readyVideo()]), false);
});

test("stale completion/approval from before a revision cannot be applied afterwards", () => {
  const revised = requestMotionRevision(completeShot(), 1);
  assert.throws(() => approveVideoResult(revised, { assetId: "mp4-a", revision: 1, reviewerId: "director" }));
  const current = receiveVideoResult(revised, {
    assetId: "mp4-new",
    revision: 2,
    sourceImageAssetId: "img-a",
    sourceImageRevision: 1,
    motionPromptRevision: 2,
  });
  assert.throws(() => approveVideoResult(current, { assetId: "mp4-a", revision: 2, reviewerId: "director" }));
  const accepted = approveVideoResult(current, { assetId: "mp4-new", revision: 2, reviewerId: "director" });
  assert.equal(isShotApprovedForFinalEdit(accepted), true);
});

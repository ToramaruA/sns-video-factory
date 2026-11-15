/**
 * Phase 3/4 foundation: review state for individual SNS video shots.
 *
 * Pure functions only. Nothing in this module starts image/video generation,
 * makes paid API calls, writes assets, or trusts a stale asynchronous result.
 * Persist state and record audit events in the orchestration layer.
 */
export type ReviewStatus = "ready_for_review" | "approved";

export type ImageReviewAsset = {
  assetId: string;
  revision: number;
  status: ReviewStatus;
  approvedBy?: string;
};

export type VideoReviewAsset = ImageReviewAsset & {
  sourceImageAssetId: string;
  sourceImageRevision: number;
  motionPromptRevision: number;
};

export type ShotReviewState = {
  /** Permanent beat ID; never use an array index as the identity. */
  beatId: string;
  /** Revision expected on the next image result. */
  imageRevision: number;
  /** Revision expected on the next video result. */
  videoRevision: number;
  /** Separately versioned so motion edits need not invalidate the image. */
  motionPromptRevision: number;
  image?: ImageReviewAsset;
  video?: VideoReviewAsset;
};

const requireId = (value: string, label: string): void => {
  if (!value || value.trim() !== value) {
    throw new Error(`${label} must be a nonempty stable identifier without surrounding spaces`);
  }
};

const requireRevision = (actual: number, expected: number, label: string): void => {
  if (actual !== expected) throw new Error(`Stale ${label} revision: expected ${expected}, received ${actual}`);
};

export const createShotReviewStates = (beatIds: readonly string[]): ShotReviewState[] => {
  if (beatIds.length === 0) throw new Error("At least one shot is required");
  const seen = new Set<string>();
  return beatIds.map((beatId) => {
    requireId(beatId, "Beat ID");
    if (seen.has(beatId)) throw new Error(`Duplicate beat ID: ${beatId}`);
    seen.add(beatId);
    return { beatId, imageRevision: 1, videoRevision: 1, motionPromptRevision: 1 };
  });
};

/** Request a new image; only the target shot's image, video and final edit become invalid. */
export const requestImageRevision = (shot: ShotReviewState, expectedImageRevision: number): ShotReviewState => {
  requireRevision(expectedImageRevision, shot.imageRevision, "image");
  return {
    beatId: shot.beatId,
    imageRevision: shot.imageRevision + 1,
    videoRevision: shot.videoRevision + 1,
    motionPromptRevision: shot.motionPromptRevision,
  };
};

/** Motion-only edits must retain the current approved image. */
export const requestMotionRevision = (shot: ShotReviewState, expectedMotionRevision: number): ShotReviewState => {
  requireRevision(expectedMotionRevision, shot.motionPromptRevision, "motion");
  return {
    ...shot,
    motionPromptRevision: shot.motionPromptRevision + 1,
    videoRevision: shot.videoRevision + 1,
    video: undefined,
  };
};

export const receiveImageResult = (
  shot: ShotReviewState,
  result: { assetId: string; revision: number },
): ShotReviewState => {
  requireId(result.assetId, "Image asset ID");
  requireRevision(result.revision, shot.imageRevision, "image");
  if (shot.image) throw new Error("Image result already exists for this revision; refusing replacement");
  return { ...shot, image: { assetId: result.assetId, revision: result.revision, status: "ready_for_review" } };
};

export const approveImageResult = (
  shot: ShotReviewState,
  decision: { assetId: string; revision: number; reviewerId: string },
): ShotReviewState => {
  requireId(decision.reviewerId, "Reviewer ID");
  requireRevision(decision.revision, shot.imageRevision, "image");
  if (!shot.image || shot.image.assetId !== decision.assetId || shot.image.status !== "ready_for_review") {
    throw new Error("Image approval must match the current unapproved asset ID and revision");
  }
  return { ...shot, image: { ...shot.image, status: "approved", approvedBy: decision.reviewerId } };
};

/** Accept an MP4 only when generated from the *currently approved* exact image and motion. */
export const receiveVideoResult = (
  shot: ShotReviewState,
  result: {
    assetId: string;
    revision: number;
    sourceImageAssetId: string;
    sourceImageRevision: number;
    motionPromptRevision: number;
  },
): ShotReviewState => {
  requireId(result.assetId, "Video asset ID");
  requireRevision(result.revision, shot.videoRevision, "video");
  requireRevision(result.motionPromptRevision, shot.motionPromptRevision, "motion");
  if (
    !shot.image ||
    shot.image.status !== "approved" ||
    shot.image.assetId !== result.sourceImageAssetId ||
    shot.image.revision !== result.sourceImageRevision
  ) {
    throw new Error("Video result must reference the exact approved image revision");
  }
  if (shot.video) throw new Error("Video result already exists for this revision; refusing replacement");
  return { ...shot, video: { ...result, status: "ready_for_review" } };
};

export const approveVideoResult = (
  shot: ShotReviewState,
  decision: { assetId: string; revision: number; reviewerId: string },
): ShotReviewState => {
  requireId(decision.reviewerId, "Reviewer ID");
  requireRevision(decision.revision, shot.videoRevision, "video");
  if (
    !shot.video ||
    shot.video.status !== "ready_for_review" ||
    shot.video.assetId !== decision.assetId ||
    !shot.image ||
    shot.image.status !== "approved" ||
    shot.video.sourceImageAssetId !== shot.image.assetId ||
    shot.video.sourceImageRevision !== shot.image.revision ||
    shot.video.motionPromptRevision !== shot.motionPromptRevision
  ) {
    throw new Error("Video approval must match the current image, motion and unapproved MP4 revision");
  }
  return { ...shot, video: { ...shot.video, status: "approved", approvedBy: decision.reviewerId } };
};

export const isShotApprovedForFinalEdit = (shot: ShotReviewState): boolean =>
  shot.image?.status === "approved" &&
  shot.image.revision === shot.imageRevision &&
  shot.video?.status === "approved" &&
  shot.video.revision === shot.videoRevision &&
  shot.video.sourceImageAssetId === shot.image.assetId &&
  shot.video.sourceImageRevision === shot.image.revision &&
  shot.video.motionPromptRevision === shot.motionPromptRevision;

/** Final rendering must wait until every shot holds an approved, current MP4. */
export const areShotsApprovedForFinalEdit = (shots: readonly ShotReviewState[]): boolean =>
  shots.length > 0 && shots.every(isShotApprovedForFinalEdit);

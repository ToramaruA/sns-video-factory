import { mulmoScriptSchema } from "../../types/schema.js";
import { createShotReviewStates } from "../workflow/shot_review.js";
import type { ShotReviewState } from "../workflow/shot_review.js";

/**
 * Model-independent Phase 3 planning state. This code never contacts a model,
 * converts reference asset IDs into URLs, or authorizes paid generation.
 */
export type StoryboardReference = {
  assetId: string;
  kind: "photo" | "logo" | "video";
  intent: "appearance" | "branding" | "mood" | "motion_reference";
};

export type VideoBrief = {
  projectId: string;
  purpose: string;
  audience: string;
  platform: "instagram_reels" | "tiktok" | "youtube_shorts" | "other";
  language: "ja" | "en";
  targetDurationSeconds: number;
  references: StoryboardReference[];
};

export type StoryboardShot = {
  beatId: string;
  durationSeconds: number;
  visualDescription: string;
  imagePrompt: string;
  moviePrompt: string;
  referenceAssetIds: string[];
};

export type StoryboardProposal = {
  proposalId: string;
  revision: number;
  title: string;
  concept: string;
  visualStyle: string;
  shots: StoryboardShot[];
};

export type StoryboardSelection = {
  proposalId: string;
  revision: number;
  reviewerId: string;
};

export type StoryboardPlanningState = {
  brief: VideoBrief;
  proposals: StoryboardProposal[];
  selected?: StoryboardSelection;
};

const requireId = (value: string, label: string): void => {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value)) {
    throw new Error(`${label} must be a stable ASCII ID with no spaces or path characters`);
  }
};

const requireText = (value: string, label: string): void => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must contain text`);
};

const requirePositiveDuration = (value: number, label: string): void => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive finite number`);
};

const copyAndValidateBrief = (brief: VideoBrief): VideoBrief => {
  requireId(brief.projectId, "Project ID");
  requireText(brief.purpose, "Purpose");
  requireText(brief.audience, "Audience");
  if (!["instagram_reels", "tiktok", "youtube_shorts", "other"].includes(brief.platform)) throw new Error("Unknown SNS platform");
  if (!["ja", "en"].includes(brief.language)) throw new Error("Unsupported language");
  requirePositiveDuration(brief.targetDurationSeconds, "Target duration");
  const ids = new Set<string>();
  const references = brief.references.map((ref) => {
    requireId(ref.assetId, "Reference asset ID");
    if (ids.has(ref.assetId)) throw new Error(`Duplicate reference asset: ${ref.assetId}`);
    if (!["photo", "logo", "video"].includes(ref.kind) || !["appearance", "branding", "mood", "motion_reference"].includes(ref.intent)) {
      throw new Error("Invalid reference kind or intent");
    }
    ids.add(ref.assetId);
    return { ...ref };
  });
  return { ...brief, references };
};

const copyAndValidateProposal = (proposal: StoryboardProposal, brief: VideoBrief): StoryboardProposal => {
  requireId(proposal.proposalId, "Proposal ID");
  if (!Number.isInteger(proposal.revision) || proposal.revision < 1) throw new Error("Proposal revision must be a positive integer");
  requireText(proposal.title, "Proposal title");
  requireText(proposal.concept, "Proposal concept");
  requireText(proposal.visualStyle, "Visual style");
  if (!proposal.shots.length) throw new Error("Storyboard must contain at least one shot");
  const referenceIds = new Set(brief.references.map((ref) => ref.assetId));
  const beatIds = new Set<string>();
  const shots = proposal.shots.map((shot) => {
    requireId(shot.beatId, "Beat ID");
    if (beatIds.has(shot.beatId)) throw new Error(`Duplicate beat ID: ${shot.beatId}`);
    beatIds.add(shot.beatId);
    requirePositiveDuration(shot.durationSeconds, "Shot duration");
    requireText(shot.visualDescription, "Visual description");
    requireText(shot.imagePrompt, "Image prompt");
    requireText(shot.moviePrompt, "Motion prompt");
    const references = new Set<string>();
    for (const assetId of shot.referenceAssetIds) {
      if (!referenceIds.has(assetId)) throw new Error(`Unknown reference asset: ${assetId}`);
      if (references.has(assetId)) throw new Error(`Duplicate shot reference: ${assetId}`);
      references.add(assetId);
    }
    return { ...shot, referenceAssetIds: [...shot.referenceAssetIds] };
  });
  const duration = shots.reduce((sum, shot) => sum + shot.durationSeconds, 0);
  if (Math.abs(duration - brief.targetDurationSeconds) > 0.001) {
    throw new Error(`Storyboard duration ${duration} must match target ${brief.targetDurationSeconds}`);
  }
  return { ...proposal, shots };
};

/** One approved concept is sufficient; alternatives may be added when useful. */
export const createStoryboardPlanningState = (brief: VideoBrief, proposals: readonly StoryboardProposal[]): StoryboardPlanningState => {
  const snapshot = copyAndValidateBrief(brief);
  if (proposals.length < 1) throw new Error("Planning requires at least one proposed concept");
  const seen = new Set<string>();
  const candidates = proposals.map((proposal) => {
    const candidate = copyAndValidateProposal(proposal, snapshot);
    if (seen.has(candidate.proposalId)) throw new Error(`Duplicate proposal ID: ${candidate.proposalId}`);
    seen.add(candidate.proposalId);
    return candidate;
  });
  return { brief: snapshot, proposals: candidates };
};

/** Review decisions are specific to a candidate revision and a caller-supplied actor. */
export const selectStoryboardProposal = (state: StoryboardPlanningState, decision: StoryboardSelection): StoryboardPlanningState => {
  requireId(decision.reviewerId, "Reviewer ID");
  if (state.selected) throw new Error("A concept is already selected; revise it explicitly before re-approval");
  const candidate = state.proposals.find((proposal) => proposal.proposalId === decision.proposalId);
  if (!candidate || candidate.revision !== decision.revision) throw new Error("Stale or unknown proposal revision");
  return { ...state, selected: { ...decision } };
};

/** A revised candidate invalidates only its own approval; other proposals remain unchanged. */
export const reviseStoryboardProposal = (
  state: StoryboardPlanningState,
  proposalId: string,
  expectedRevision: number,
  replacement: StoryboardProposal,
): StoryboardPlanningState => {
  const old = state.proposals.find((proposal) => proposal.proposalId === proposalId);
  if (!old || old.revision !== expectedRevision) throw new Error("Stale or unknown proposal revision");
  if (replacement.proposalId !== proposalId || replacement.revision !== expectedRevision + 1) {
    throw new Error("Revision must keep the same proposal ID and increment exactly once");
  }
  const candidate = copyAndValidateProposal(replacement, state.brief);
  const proposals = state.proposals.map((proposal) => (proposal.proposalId === proposalId ? candidate : proposal));
  const selected = state.selected?.proposalId === proposalId ? undefined : state.selected;
  return { ...state, proposals, selected };
};

const requireSelected = (state: StoryboardPlanningState): StoryboardProposal => {
  const selection = state.selected;
  if (!selection) throw new Error("A human-approved concept is required");
  const candidate = state.proposals.find((proposal) => proposal.proposalId === selection.proposalId);
  if (!candidate || candidate.revision !== selection.revision) throw new Error("Selected proposal has become stale");
  return candidate;
};

export type MulmoStoryboardDraft = {
  /** Valid DSL syntax does not authorize executing paid/default providers. */
  executionAllowed: false;
  /** Keep reference IDs outside MulmoScript until a verified provider can use them. */
  referencesByBeat: Array<{ beatId: string; assetIds: string[] }>;
  script: {
    $mulmocast: { version: "1.1" };
    title: string;
    lang: "ja" | "en";
    canvasSize: { width: number; height: number };
    audioParams: { suppressSpeech: true; introPadding: number; padding: number; closingPadding: number; outroPadding: number; bgmVolume: number };
    beats: Array<{ id: string; text: ""; duration: number; imagePrompt: string; moviePrompt: string }>;
  };
};

/**
 * Produce a schema-validated DESIGN DRAFT, not an executable job. MulmoCast
 * defaults can select paid providers; the orchestrator must explicitly gate
 * every provider before handing a script to any generation command.
 */
export const buildApprovedStoryboardDraft = (state: StoryboardPlanningState): MulmoStoryboardDraft => {
  const chosen = requireSelected(state);
  const script: MulmoStoryboardDraft["script"] = {
    $mulmocast: { version: "1.1" },
    title: chosen.title,
    lang: state.brief.language,
    canvasSize: { width: 720, height: 1280 },
    audioParams: { suppressSpeech: true, introPadding: 0, padding: 0, closingPadding: 0, outroPadding: 0, bgmVolume: 0 },
    beats: chosen.shots.map((shot) => ({
      id: shot.beatId,
      text: "",
      duration: shot.durationSeconds,
      imagePrompt: `${chosen.visualStyle}\n${shot.imagePrompt}`,
      moviePrompt: shot.moviePrompt,
    })),
  };
  const checked = mulmoScriptSchema.safeParse(script);
  if (!checked.success) throw new Error(`MulmoScript draft failed schema validation: ${checked.error.message}`);
  return {
    executionAllowed: false,
    script,
    referencesByBeat: chosen.shots.map((shot) => ({ beatId: shot.beatId, assetIds: [...shot.referenceAssetIds] })),
  };
};

/** Bridge to PR #7: initialize shot review only from a selected current concept. */
export const initializeSelectedShotReviews = (state: StoryboardPlanningState): ShotReviewState[] =>
  createShotReviewStates(requireSelected(state).shots.map((shot) => shot.beatId));

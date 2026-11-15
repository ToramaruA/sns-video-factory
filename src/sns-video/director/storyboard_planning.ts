import { mulmoScriptSchema } from "../../types/schema.js";
import { createShotReviewStates } from "../workflow/shot_review.js";
import type { ShotReviewState } from "../workflow/shot_review.js";

/**
 * Phase 3: one storyboard refined in a normal LLM-style conversation.
 * This is only the model-independent state contract. It never invokes an LLM,
 * changes files, accesses private references, or starts paid/free generation.
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
  /** Guidance only: conversational edits may change the total shot length. */
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

export type Storyboard = {
  revision: number;
  title: string;
  concept: string;
  visualStyle: string;
  shots: StoryboardShot[];
};

export type StoryboardChatTurn = {
  turnId: string;
  userMessage: string;
  assistantMessage: string;
  basedOnRevision: number;
  resultingRevision: number;
};

export type StoryboardPlanningState = {
  brief: VideoBrief;
  current: Storyboard;
  /** Original and previous revisions remain available for chat context. */
  history: Storyboard[];
  turns: StoryboardChatTurn[];
  pending?: { turnId: string; userMessage: string; basedOnRevision: number };
  approved?: { revision: number; reviewerId: string };
};

const requireId = (value: string, label: string): void => {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value)) {
    throw new Error(`${label} must be a stable ASCII identifier without spaces or path characters`);
  }
};

const requireText = (value: string, label: string): void => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must contain text`);
};

const requirePositiveDuration = (value: number, label: string): void => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive finite number`);
};

const copyBrief = (brief: VideoBrief): VideoBrief => {
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

const copyStoryboard = (storyboard: Storyboard, brief: VideoBrief): Storyboard => {
  if (!Number.isInteger(storyboard.revision) || storyboard.revision < 1) throw new Error("Storyboard revision must be a positive integer");
  requireText(storyboard.title, "Storyboard title");
  requireText(storyboard.concept, "Storyboard concept");
  requireText(storyboard.visualStyle, "Visual style");
  if (!Array.isArray(storyboard.shots) || !storyboard.shots.length) throw new Error("Storyboard needs at least one shot");
  const knownAssets = new Set(brief.references.map((ref) => ref.assetId));
  const beatIds = new Set<string>();
  const shots = storyboard.shots.map((shot) => {
    requireId(shot.beatId, "Beat ID");
    if (beatIds.has(shot.beatId)) throw new Error(`Duplicate beat ID: ${shot.beatId}`);
    beatIds.add(shot.beatId);
    requirePositiveDuration(shot.durationSeconds, "Shot duration");
    requireText(shot.visualDescription, "Visual description");
    requireText(shot.imagePrompt, "Image prompt");
    requireText(shot.moviePrompt, "Motion prompt");
    if (!Array.isArray(shot.referenceAssetIds)) throw new Error("Shot references must be an array");
    const seenAssets = new Set<string>();
    for (const assetId of shot.referenceAssetIds) {
      if (!knownAssets.has(assetId)) throw new Error(`Unknown reference asset: ${assetId}`);
      if (seenAssets.has(assetId)) throw new Error(`Duplicate shot reference: ${assetId}`);
      seenAssets.add(assetId);
    }
    return { ...shot, referenceAssetIds: [...shot.referenceAssetIds] };
  });
  return { ...storyboard, shots };
};

/** Called after the existing MulmoCast/GraphAI LLM scripting capability produces an initial concept. */
export const createStoryboardPlanningState = (brief: VideoBrief, initialStoryboard: Storyboard): StoryboardPlanningState => {
  const safeBrief = copyBrief(brief);
  if (initialStoryboard.revision !== 1) throw new Error("An initial storyboard must have revision 1");
  const current = copyStoryboard(initialStoryboard, safeBrief);
  return { brief: safeBrief, current, history: [current], turns: [] };
};

/** Records an ordinary natural-language request such as "Make the second shot shorter". */
export const submitStoryboardFeedback = (
  state: StoryboardPlanningState,
  request: { turnId: string; expectedRevision: number; message: string },
): StoryboardPlanningState => {
  requireId(request.turnId, "Turn ID");
  requireText(request.message, "User message");
  if (state.pending) throw new Error("Complete the previous LLM turn before another reply");
  if (state.current.revision !== request.expectedRevision) throw new Error("Stale storyboard revision");
  if (state.turns.some((turn) => turn.turnId === request.turnId)) throw new Error("Duplicate turn ID");
  return {
    ...state,
    approved: undefined,
    pending: { turnId: request.turnId, basedOnRevision: request.expectedRevision, userMessage: request.message },
  };
};

/**
 * The LLM may explain/ask a question without changing the storyboard; or
 * return a complete revised storyboard. Never infer a revision from raw prose.
 */
export const applyStoryboardAssistantReply = (
  state: StoryboardPlanningState,
  reply: { turnId: string; message: string; revisedStoryboard?: Storyboard },
): StoryboardPlanningState => {
  requireId(reply.turnId, "Turn ID");
  requireText(reply.message, "Assistant message");
  if (!state.pending || state.pending.turnId !== reply.turnId || state.pending.basedOnRevision !== state.current.revision) {
    throw new Error("Stale or unknown assistant turn");
  }
  let current = state.current;
  let history = state.history;
  if (reply.revisedStoryboard) {
    if (reply.revisedStoryboard.revision !== state.current.revision + 1) throw new Error("A revised storyboard must increment revision by exactly one");
    current = copyStoryboard(reply.revisedStoryboard, state.brief);
    history = [...state.history, current];
  }
  const turn: StoryboardChatTurn = {
    turnId: reply.turnId,
    userMessage: state.pending.userMessage,
    assistantMessage: reply.message,
    basedOnRevision: state.pending.basedOnRevision,
    resultingRevision: current.revision,
  };
  return { ...state, current, history, turns: [...state.turns, turn], pending: undefined };
};

/** Approval only applies to the current revision and is blocked during a chat turn. */
export const approveCurrentStoryboard = (state: StoryboardPlanningState, decision: { revision: number; reviewerId: string }): StoryboardPlanningState => {
  requireId(decision.reviewerId, "Reviewer ID");
  if (state.pending || state.approved) throw new Error("Cannot approve a pending or already approved storyboard");
  if (decision.revision !== state.current.revision) throw new Error("Cannot approve an old storyboard revision");
  return { ...state, approved: { ...decision } };
};

/** A safe, provider-neutral conversation snapshot for an existing LLM adapter. */
export const getStoryboardChatContext = (state: StoryboardPlanningState) => ({
  brief: copyBrief(state.brief),
  storyboard: copyStoryboard(state.current, state.brief),
  turns: state.turns.map((turn) => ({ ...turn })),
  pending: state.pending ? { ...state.pending } : undefined,
});

export type MulmoStoryboardDraft = {
  /** Valid MulmoScript does not imply free/approved execution! */
  executionAllowed: false;
  referencesByBeat: Array<{ beatId: string; assetIds: string[] }>;
  actualDurationSeconds: number;
  script: {
    $mulmocast: { version: "1.1" };
    title: string;
    lang: "ja" | "en";
    canvasSize: { width: number; height: number };
    audioParams: { suppressSpeech: true; introPadding: number; padding: number; closingPadding: number; outroPadding: number; bgmVolume: number };
    beats: Array<{ id: string; text: ""; duration: number; imagePrompt: string; moviePrompt: string }>;
  };
};

/** Reuse MulmoCast's own schema. Return a DESIGN DRAFT, never an executable generation job. */
export const buildApprovedStoryboardDraft = (state: StoryboardPlanningState): MulmoStoryboardDraft => {
  if (state.pending || !state.approved || state.approved.revision !== state.current.revision) {
    throw new Error("A current, human-approved storyboard is required");
  }
  const script: MulmoStoryboardDraft["script"] = {
    $mulmocast: { version: "1.1" },
    title: state.current.title,
    lang: state.brief.language,
    canvasSize: { width: 720, height: 1280 },
    audioParams: { suppressSpeech: true, introPadding: 0, padding: 0, closingPadding: 0, outroPadding: 0, bgmVolume: 0 },
    beats: state.current.shots.map((shot) => ({
      id: shot.beatId,
      text: "",
      duration: shot.durationSeconds,
      imagePrompt: `${state.current.visualStyle}\n${shot.imagePrompt}`,
      moviePrompt: shot.moviePrompt,
    })),
  };
  const checked = mulmoScriptSchema.safeParse(script);
  if (!checked.success) throw new Error(`MulmoScript draft failed schema validation: ${checked.error.message}`);
  return {
    executionAllowed: false,
    script,
    actualDurationSeconds: state.current.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0),
    referencesByBeat: state.current.shots.map((shot) => ({ beatId: shot.beatId, assetIds: [...shot.referenceAssetIds] })),
  };
};

/** Reuse PR #7's approval state for the current confirmed beat IDs. */
export const initializeApprovedShotReviews = (state: StoryboardPlanningState): ShotReviewState[] => {
  if (state.pending || !state.approved || state.approved.revision !== state.current.revision) {
    throw new Error("A current, human-approved storyboard is required");
  }
  return createShotReviewStates(state.current.shots.map((shot) => shot.beatId));
};

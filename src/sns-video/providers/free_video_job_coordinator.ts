import { selectFreeVideoProvider, FreeVideoProviderError } from "./free_movie_router.js";
import type { FreeVideoProvider, FreeVideoRequest } from "./free_movie_router.js";

/**
 * Pure state machine. IMPORTANT: a decision is not a network call.
 * Persist a "run" decision before invoking any external image-to-video API.
 */
export type FreeVideoJobSpec = FreeVideoRequest & {
  /** IDs include the exact project/beat and content revision. */
  sourceAssetId: string;
  sourceAssetRevision: number;
  /** SHA-256 of the motion prompt; no prompt or private image is stored here. */
  promptSha256: string;
};

export type FreeVideoJobStatus = "pending" | "running" | "waiting_for_quota" | "needs_review" | "succeeded" | "failed";

export type FreeVideoJobRecord = {
  id: string;
  spec: FreeVideoJobSpec;
  status: FreeVideoJobStatus;
  attemptedProviderIds: string[];
  attempts: number;
  currentProviderId?: string;
  outputAssetId?: string;
  lastReason?: string;
};

export type FreeVideoRuntimeState = {
  /** All Spaces using the same anonymous ZeroGPU allowance share a pool ID. */
  exhaustedPoolIds: string[];
  unavailableProviderIds: string[];
};

export type FreeVideoDecision =
  | { action: "run"; provider: FreeVideoProvider; job: FreeVideoJobRecord }
  | { action: "wait"; reason: string; job: FreeVideoJobRecord }
  | { action: "stop"; reason: string; job: FreeVideoJobRecord };

export type FreeVideoAttemptOutcome =
  | { kind: "success"; outputAssetId: string }
  | { kind: "rejected_quota"; reason?: string }
  | { kind: "rejected_unavailable"; reason?: string }
  | { kind: "rejected_access_or_policy"; reason?: string }
  | { kind: "invalid_input"; reason?: string }
  | { kind: "ambiguous_after_submission"; reason?: string };

const MAX_PROVIDER_ATTEMPTS = 2;

export const getFreeVideoPoolId = (provider: FreeVideoProvider): string => provider.quotaPoolId ?? provider.id;

export const createFreeVideoJob = (id: string, spec: FreeVideoJobSpec): FreeVideoJobRecord => {
  if (!id.trim() || !spec.sourceAssetId.trim() || !Number.isInteger(spec.sourceAssetRevision) || spec.sourceAssetRevision < 1) {
    throw new Error("A job must identify a specific existing source asset revision");
  }
  if (!/^[a-f0-9]{64}$/i.test(spec.promptSha256)) {
    throw new Error("A job must carry a SHA-256 motion prompt fingerprint");
  }
  return { id, spec, status: "pending", attemptedProviderIds: [], attempts: 0 };
};

export const emptyFreeVideoRuntime = (): FreeVideoRuntimeState => ({
  exhaustedPoolIds: [],
  unavailableProviderIds: [],
});

/**
 * Select once; NEVER automatically retry an ambiguous/started request.
 * A known quota rejection can safely exclude its *shared* pool and wait for an
 * independent approved provider, but this function never invokes that provider.
 */
export const planFreeVideoAttempt = (
  job: FreeVideoJobRecord,
  candidates: readonly FreeVideoProvider[],
  runtime: FreeVideoRuntimeState,
): FreeVideoDecision => {
  if (job.status === "running" || job.status === "needs_review" || job.status === "succeeded" || job.status === "failed") {
    return { action: "stop", reason: "Job is already started, completed, failed or requires human review", job };
  }
  if (job.attempts >= MAX_PROVIDER_ATTEMPTS) {
    return { action: "stop", reason: "Maximum distinct-provider attempts reached", job: { ...job, status: "failed" } };
  }

  // Each provider can be attempted at most once. An exhausted ZeroGPU pool
  // invalidates *all* other Spaces consuming that same anonymous allowance.
  const allowed = candidates.filter(
    (p) =>
      !job.attemptedProviderIds.includes(p.id) &&
      !runtime.unavailableProviderIds.includes(p.id) &&
      !runtime.exhaustedPoolIds.includes(getFreeVideoPoolId(p)),
  );
  if (allowed.length === 0 && runtime.exhaustedPoolIds.length > 0) {
    return {
      action: "wait",
      reason: "All compatible routes are blocked by shared quota or prior attempts",
      job: { ...job, status: "waiting_for_quota", lastReason: "free_quota_exhausted" },
    };
  }
  try {
    const provider = selectFreeVideoProvider(allowed, job.spec);
    return {
      action: "run",
      provider,
      job: {
        ...job,
        status: "running",
        currentProviderId: provider.id,
        attemptedProviderIds: [...job.attemptedProviderIds, provider.id],
        attempts: job.attempts + 1,
        lastReason: undefined,
      },
    };
  } catch (error) {
    if (!(error instanceof FreeVideoProviderError)) throw error;
    return { action: "stop", reason: error.code, job: { ...job, status: "failed", lastReason: error.code } };
  }
};

export const settleFreeVideoAttempt = (
  job: FreeVideoJobRecord,
  provider: FreeVideoProvider,
  runtime: FreeVideoRuntimeState,
  outcome: FreeVideoAttemptOutcome,
): { job: FreeVideoJobRecord; runtime: FreeVideoRuntimeState } => {
  if (job.status !== "running" || job.currentProviderId !== provider.id) {
    throw new Error("Attempt outcome does not match a currently running provider; refusing stale result");
  }
  if (outcome.kind === "success") {
    if (!outcome.outputAssetId.trim()) throw new Error("Successful generation must supply a real asset ID");
    return { job: { ...job, status: "succeeded", outputAssetId: outcome.outputAssetId, currentProviderId: undefined }, runtime };
  }
  if (outcome.kind === "rejected_quota") {
    const pool = getFreeVideoPoolId(provider);
    return {
      job: { ...job, status: "waiting_for_quota", currentProviderId: undefined, lastReason: "free_quota_exhausted" },
      runtime: { ...runtime, exhaustedPoolIds: [...new Set([...runtime.exhaustedPoolIds, pool])] },
    };
  }
  if (outcome.kind === "rejected_unavailable") {
    return {
      job: { ...job, status: "pending", currentProviderId: undefined, lastReason: "provider_rejected_before_inference" },
      runtime: { ...runtime, unavailableProviderIds: [...new Set([...runtime.unavailableProviderIds, provider.id])] },
    };
  }
  if (outcome.kind === "ambiguous_after_submission") {
    // A timeout/connection drop may already have consumed quota and created a
    // clip. Never submit the same video again without explicit reconciliation.
    return {
      job: { ...job, status: "needs_review", lastReason: "inference_outcome_unknown", currentProviderId: undefined },
      runtime,
    };
  }
  return {
    job: { ...job, status: "failed", currentProviderId: undefined, lastReason: outcome.kind },
    runtime,
  };
};

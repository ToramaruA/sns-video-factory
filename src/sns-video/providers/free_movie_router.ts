/**
 * Free-only provider selection for image-to-video.
 *
 * This is a pure, side-effect-free selector: it never calls an API, performs a
 * retry, or silently falls back to an unknown/paid provider. Future adapters
 * can be registered by adding another FreeVideoProvider entry.
 */
export type FreeVideoErrorCode = "missing_image" | "unknown_provider" | "free_route_not_approved" | "unsupported_capability" | "no_compatible_free_provider";

export class FreeVideoProviderError extends Error {
  constructor(
    public readonly code: FreeVideoErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FreeVideoProviderError";
  }
}

export type FreeVideoCapabilities = {
  imageToVideo: true;
  lastFrame: boolean;
  referenceImages: boolean;
  referenceVideo: boolean;
  generatedAudio: boolean;
  /** Supported generator durations (not the length of the final edited beat). */
  durationsSeconds: readonly number[];
};

export type FreeVideoProvider = {
  id: string;
  model: string;
  /** Only an explicitly verified free execution route is eligible. */
  billing: "free" | "paid" | "unknown";
  /** Operator approval, NOT a claim of live remaining quota. */
  routeStatus: "ready" | "blocked" | "unknown";
  experimental: boolean;
  capabilities: FreeVideoCapabilities;
};

export type FreeVideoRequest = {
  providerId?: string;
  model?: string;
  hasFirstFrame: boolean;
  durationSeconds: number;
  hasLastFrame?: boolean;
  hasReferenceImages?: boolean;
  hasReferenceVideo?: boolean;
  generateAudio?: boolean;
};

/**
 * Choose a compatible *free* route. Order of candidates = preference order.
 * Rejects unsupported inputs instead of dropping them from an API request.
 * Does not retry other providers after a generation error.
 */
export const selectFreeVideoProvider = (candidates: readonly FreeVideoProvider[], request: FreeVideoRequest): FreeVideoProvider => {
  if (!request.hasFirstFrame) {
    throw new FreeVideoProviderError("missing_image", "Free image-to-video generation requires an existing still image");
  }
  if (!Number.isFinite(request.durationSeconds) || request.durationSeconds <= 0) {
    throw new FreeVideoProviderError("unsupported_capability", "Video duration must be a positive number");
  }
  const selected = request.providerId ? candidates.filter((p) => p.id === request.providerId) : candidates;
  if (selected.length === 0 && request.providerId) {
    throw new FreeVideoProviderError("unknown_provider", "Requested free-video provider is not registered");
  }

  const free = selected.filter((p) => p.billing === "free");
  const enabled = free.filter((p) => p.routeStatus === "ready");
  if (enabled.length === 0) {
    throw new FreeVideoProviderError("free_route_not_approved", "No explicitly approved free image-to-video route is enabled");
  }

  const compatible = enabled.find((p) => {
    const c = p.capabilities;
    return (
      c.imageToVideo &&
      (!request.model || p.model === request.model) &&
      c.durationsSeconds.includes(request.durationSeconds) &&
      (!request.hasLastFrame || c.lastFrame) &&
      (!request.hasReferenceImages || c.referenceImages) &&
      (!request.hasReferenceVideo || c.referenceVideo) &&
      (!request.generateAudio || c.generatedAudio)
    );
  });
  if (!compatible) {
    throw new FreeVideoProviderError("no_compatible_free_provider", "No enabled free provider supports all requested image-to-video capabilities");
  }
  return compatible;
};

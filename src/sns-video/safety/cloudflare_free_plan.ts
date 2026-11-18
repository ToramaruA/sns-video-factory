/**
 * Workers AI Free Plan must be confirmed by the operator. A model name alone
 * never establishes the account's billing tier; the Cloudflare REST API does
 * not provide an account plan proof in this workflow.
 */
export const CLOUDFLARE_FLUX_MODEL = "@cf/black-forest-labs/flux-1-schnell";
export const CLOUDFLARE_FLUX_REFERENCE_MODEL = "@cf/black-forest-labs/flux-2-klein-4b";
export const CLOUDFLARE_IMAGE_PROVIDER = "cloudflare_free";
export const CLOUDFLARE_FREE_PLAN_CONFIRMATION = "SNS_VIDEO_CLOUDFLARE_FREE_PLAN_CONFIRMED";

export const assertCloudflareFreePlanConfigured = (env: Record<string, string | undefined>): { accountId: string; apiToken: string } => {
  if (env[CLOUDFLARE_FREE_PLAN_CONFIRMATION] !== "1") {
    throw new Error("Confirm the Cloudflare Workers account uses Workers Free before enabling the image API");
  }
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "";
  if (!/^[0-9a-fA-F]{32}$/.test(accountId)) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID must be a 32-digit hex account ID");
  }
  const apiToken = env.CLOUDFLARE_API_TOKEN?.trim() ?? "";
  if (!apiToken) throw new Error("CLOUDFLARE_API_TOKEN is required");
  return { accountId, apiToken };
};

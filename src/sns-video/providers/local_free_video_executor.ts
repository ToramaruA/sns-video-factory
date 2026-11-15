import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { isAbsolute, dirname, join } from "node:path";
import type { FreeVideoProvider, FreeVideoRequest } from "./free_movie_router.js";
import type { FreeVideoJobSpec } from "./free_video_job_coordinator.js";
import { completeLocalFreeVideoAttempt, readLocalFreeVideoLedger, registerLocalFreeVideoJob, reserveLocalFreeVideoAttempt } from "./local_free_video_ledger.js";

const sha256 = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");

const assertMp4 = (buffer: Buffer): void => {
  if (buffer.length < 1024 || buffer.length > 100_000_000 || buffer.toString("ascii", 4, 8) !== "ftyp") {
    throw new Error("Free image-to-video returned an invalid or oversized MP4; no automatic retry");
  }
};

export type LocalFreeVideoExecution = {
  ledgerPath: string;
  imagePath: string;
  prompt: string;
  request: FreeVideoRequest;
  providers: readonly FreeVideoProvider[];
  /** Executes only after an exclusive durable reservation. */
  generate: (provider: FreeVideoProvider) => Promise<Buffer>;
};

const getExistingVideo = async (ledgerPath: string, jobId: string, expectedAssetId: string | undefined): Promise<Buffer> => {
  if (!expectedAssetId || !/^sha256:[a-f0-9]{64}$/.test(expectedAssetId)) {
    throw new Error("Succeeded free-video job has no valid content fingerprint; manual recovery required");
  }
  const path = join(dirname(ledgerPath), "free-video-assets", jobId + ".mp4");
  let data: Buffer;
  try {
    data = await readFile(path);
  } catch {
    throw new Error("Previously generated MP4 is missing; refusing a second AI request");
  }
  assertMp4(data);
  if ("sha256:" + sha256(data) !== expectedAssetId) {
    throw new Error("Previously generated MP4 checksum mismatch; refusing a second AI request");
  }
  return data;
};

/**
 * Development-only, single-host bridge: MulmoCast Agent -> local ledger ->
 * exactly one approved free inference -> durable MP4 cache -> MulmoCast.
 *
 * Cache identity is derived from actual source-image bytes (not filename),
 * motion prompt, requested capabilities and model. A different image or
 * prompt creates a new job; the same request reuses its saved MP4.
 *
 * There is NO implicit paid route, automatic retry, or lock recovery.
 */
export const runLocalFreeVideoExecution = async (input: LocalFreeVideoExecution): Promise<Buffer> => {
  if (!input.ledgerPath || !isAbsolute(input.ledgerPath)) {
    throw new Error("SNS_VIDEO_FREE_VIDEO_LEDGER_PATH must be an absolute path to a persistent local ledger; no inference started");
  }
  if (!input.imagePath || !input.prompt?.trim()) {
    throw new Error("A real source image and motion prompt are required");
  }
  const file = await stat(input.imagePath);
  if (!file.isFile() || file.size > 15_000_000) {
    throw new Error("Input must be a regular still image smaller than 15 MB");
  }
  const sourceHash = sha256(await readFile(input.imagePath));
  const promptSha256 = sha256(input.prompt);
  const spec: FreeVideoJobSpec = {
    ...input.request,
    hasFirstFrame: true,
    sourceAssetId: "sha256:" + sourceHash,
    sourceAssetRevision: 1, // Content hash changes on each edited image; project revision metadata comes later.
    promptSha256,
  };
  const jobId = sha256(JSON.stringify({ sourceHash, promptSha256, request: input.request }));
  const existing = await registerLocalFreeVideoJob(input.ledgerPath, jobId, spec);
  if (existing.status === "succeeded") {
    return getExistingVideo(input.ledgerPath, jobId, existing.outputAssetId);
  }

  const decision = await reserveLocalFreeVideoAttempt(input.ledgerPath, jobId, input.providers);
  if (decision.action !== "run") {
    throw new Error("Free video generation " + decision.action + ": " + decision.reason + "; no provider was called");
  }

  const provider = decision.provider;
  try {
    // Only the explicitly selected compatible free provider reaches this callback.
    const buffer = await input.generate(provider);
    assertMp4(buffer);

    // Store output BEFORE marking the ledger as succeeded. If a crash happens
    // between these steps, the existing running reservation blocks resubmission.
    const directory = join(dirname(input.ledgerPath), "free-video-assets");
    await mkdir(directory, { recursive: true });
    const temporary = join(directory, jobId + "." + randomUUID() + ".tmp");
    await writeFile(temporary, buffer, { flag: "wx", mode: 0o600 });
    await rename(temporary, join(directory, jobId + ".mp4"));
    await completeLocalFreeVideoAttempt(input.ledgerPath, jobId, provider, {
      kind: "success",
      outputAssetId: "sha256:" + sha256(buffer),
    });
    return buffer;
  } catch (error) {
    // Even an apparently ordinary provider/network error may have occurred
    // after the external service started inference. Do NOT requeue automatically.
    // If the ledger itself is unavailable, its existing "running" reservation
    // remains in place, which is safer than creating a second charge/request.
    await completeLocalFreeVideoAttempt(input.ledgerPath, jobId, provider, { kind: "ambiguous_after_submission" }).catch(() => undefined);
    throw error;
  }
};

/** Read-only diagnostic helper for offline tests and future administrative UIs. */
export const inspectLocalFreeVideoJob = async (ledgerPath: string, jobId: string) => {
  const snapshot = await readLocalFreeVideoLedger(ledgerPath);
  return snapshot.jobs[jobId];
};

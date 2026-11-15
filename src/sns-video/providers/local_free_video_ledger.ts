import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { FreeVideoProvider } from "./free_movie_router.js";
import { createFreeVideoJob, emptyFreeVideoRuntime, planFreeVideoAttempt, settleFreeVideoAttempt } from "./free_video_job_coordinator.js";
import type { FreeVideoAttemptOutcome, FreeVideoDecision, FreeVideoJobRecord, FreeVideoJobSpec, FreeVideoRuntimeState } from "./free_video_job_coordinator.js";

export type LocalFreeVideoLedger = {
  jobs: Record<string, FreeVideoJobRecord>;
  runtime: FreeVideoRuntimeState;
};

const newLedger = (): LocalFreeVideoLedger => ({ jobs: {}, runtime: emptyFreeVideoRuntime() });

const readSnapshot = async (path: string): Promise<LocalFreeVideoLedger> => {
  try {
    const text = await readFile(path, "utf8");
    const data = JSON.parse(text) as LocalFreeVideoLedger;
    if (!data.jobs || !data.runtime || !Array.isArray(data.runtime.exhaustedPoolIds)) {
      throw new Error("Invalid ledger snapshot; do not discard existing jobs");
    }
    return data;
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return newLedger();
    throw error;
  }
};

/**
 * SINGLE-HOST developer adapter. An exclusive .lock is held for the entire
 * read-modify-write transaction. A stale lock deliberately blocks requests:
 * there is no unsafe timeout, lock stealing or duplicate inference.
 *
 * Production multi-host workers MUST use a transactional database instead.
 */
const transact = async <T>(path: string, mutation: (snapshot: LocalFreeVideoLedger) => T): Promise<T> => {
  await mkdir(dirname(path), { recursive: true });
  const lockPath = path + ".lock";
  const lock = await open(lockPath, "wx");
  let temporaryPath: string | undefined;
  try {
    const snapshot = await readSnapshot(path);
    const result = mutation(snapshot);
    temporaryPath = path + "." + randomUUID() + ".tmp";
    await writeFile(temporaryPath, JSON.stringify(snapshot, null, 2) + "\n", { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporaryPath, path);
    temporaryPath = undefined;
    return result;
  } finally {
    if (temporaryPath) await rm(temporaryPath, { force: true });
    await lock.close();
    await rm(lockPath, { force: true });
  }
};

export const readLocalFreeVideoLedger = (path: string): Promise<LocalFreeVideoLedger> => readSnapshot(path);

export const registerLocalFreeVideoJob = async (path: string, id: string, spec: FreeVideoJobSpec): Promise<FreeVideoJobRecord> =>
  transact(path, (snapshot) => {
    // A different source or prompt can NEVER silently reuse an existing ID.
    const existing = snapshot.jobs[id];
    if (existing) {
      if (JSON.stringify(existing.spec) !== JSON.stringify(spec)) {
        throw new Error("Job ID already exists with a different input/revision/prompt; refusing duplicate");
      }
      return existing;
    }
    const job = createFreeVideoJob(id, spec);
    snapshot.jobs[id] = job;
    return job;
  });

export const reserveLocalFreeVideoAttempt = async (path: string, id: string, candidates: readonly FreeVideoProvider[]): Promise<FreeVideoDecision> =>
  transact(path, (snapshot) => {
    const job = snapshot.jobs[id];
    if (!job) throw new Error("Unknown job ID");
    // For the single-host experiment, one active inference across the whole
    // local ledger is the conservative limit. If a worker crashes, the prior
    // reservation deliberately blocks new submissions until manual recovery.
    const otherRunning = Object.values(snapshot.jobs).some((item) => item.id !== id && item.status === "running");
    if (otherRunning) return { action: "wait", reason: "Another local free-video inference is already reserved", job };
    const decision = planFreeVideoAttempt(job, candidates, snapshot.runtime);
    // Atomic, durable "running" reservation BEFORE a provider can be invoked.
    snapshot.jobs[id] = decision.job;
    return decision;
  });

export const completeLocalFreeVideoAttempt = async (
  path: string,
  id: string,
  provider: FreeVideoProvider,
  outcome: FreeVideoAttemptOutcome,
): Promise<FreeVideoJobRecord> =>
  transact(path, (snapshot) => {
    const job = snapshot.jobs[id];
    if (!job) throw new Error("Unknown job ID");
    const result = settleFreeVideoAttempt(job, provider, snapshot.runtime, outcome);
    snapshot.jobs[id] = result.job;
    snapshot.runtime = result.runtime;
    return result.job;
  });

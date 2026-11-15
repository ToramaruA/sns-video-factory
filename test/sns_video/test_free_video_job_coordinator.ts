import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FreeVideoProvider } from "../../src/sns-video/providers/free_movie_router.js";
import {
  createFreeVideoJob,
  emptyFreeVideoRuntime,
  planFreeVideoAttempt,
  settleFreeVideoAttempt,
} from "../../src/sns-video/providers/free_video_job_coordinator.js";
import {
  completeLocalFreeVideoAttempt,
  readLocalFreeVideoLedger,
  registerLocalFreeVideoJob,
  reserveLocalFreeVideoAttempt,
} from "../../src/sns-video/providers/local_free_video_ledger.js";

const spec = {
  sourceAssetId: "image-A",
  sourceAssetRevision: 2,
  promptSha256: "a".repeat(64),
  hasFirstFrame: true,
  durationSeconds: 2,
};
const candidate = (id: string, pool: string): FreeVideoProvider => ({
  id,
  model: "wan2.2-i2v",
  quotaPoolId: pool,
  billing: "free",
  routeStatus: "ready",
  experimental: true,
  capabilities: {
    imageToVideo: true,
    lastFrame: false,
    referenceImages: false,
    referenceVideo: false,
    generatedAudio: false,
    durationsSeconds: [2],
  },
});

test("first job reserves one compatible approved free provider", () => {
  const decision = planFreeVideoAttempt(createFreeVideoJob("A:2", spec), [candidate("A", "pool1")], emptyFreeVideoRuntime());
  assert.equal(decision.action, "run");
  if (decision.action !== "run") return;
  assert.equal(decision.job.attempts, 1);
  assert.equal(decision.job.status, "running");
  assert.deepEqual(decision.job.attemptedProviderIds, ["A"]);
});

test("running or completed jobs can never be submitted again automatically", () => {
  const p = candidate("A", "pool1");
  const first = planFreeVideoAttempt(createFreeVideoJob("A:2", spec), [p], emptyFreeVideoRuntime());
  assert.equal(first.action, "run");
  if (first.action !== "run") return;
  assert.equal(planFreeVideoAttempt(first.job, [p], emptyFreeVideoRuntime()).action, "stop");
  const result = settleFreeVideoAttempt(first.job, p, emptyFreeVideoRuntime(), { kind: "success", outputAssetId: "mp4-1" });
  assert.equal(result.job.status, "succeeded");
  assert.equal(planFreeVideoAttempt(result.job, [p], result.runtime).action, "stop");
});

test("quota failure blocks all providers sharing that ZeroGPU pool", () => {
  const p = candidate("wan", "hf-anonymous");
  const otherSpace = candidate("another-space", "hf-anonymous");
  const independent = candidate("independent-route", "other-provider");
  const first = planFreeVideoAttempt(createFreeVideoJob("job1", spec), [p], emptyFreeVideoRuntime());
  assert.equal(first.action, "run");
  if (first.action !== "run") return;
  const failed = settleFreeVideoAttempt(first.job, p, emptyFreeVideoRuntime(), { kind: "rejected_quota" });
  assert.deepEqual(failed.runtime.exhaustedPoolIds, ["hf-anonymous"]);
  const next = planFreeVideoAttempt(failed.job, [p, otherSpace, independent], failed.runtime);
  assert.equal(next.action, "run");
  if (next.action !== "run") return;
  assert.equal(next.provider.id, "independent-route");
  assert.equal(next.job.attempts, 2);
});

test("quota failure without independent free route waits, and never tries another Space in same pool", () => {
  const a = candidate("a", "same-hf-quota");
  const b = candidate("b", "same-hf-quota");
  const first = planFreeVideoAttempt(createFreeVideoJob("job1", spec), [a], emptyFreeVideoRuntime());
  assert.equal(first.action, "run");
  if (first.action !== "run") return;
  const failed = settleFreeVideoAttempt(first.job, a, emptyFreeVideoRuntime(), { kind: "rejected_quota" });
  assert.equal(planFreeVideoAttempt(failed.job, [a, b], failed.runtime).action, "wait");
});

test("ambiguous inference result never automatically retries or switches providers", () => {
  const p = candidate("a", "pool-a");
  const first = planFreeVideoAttempt(createFreeVideoJob("job1", spec), [p], emptyFreeVideoRuntime());
  if (first.action !== "run") throw new Error("Expected first attempt");
  const uncertain = settleFreeVideoAttempt(first.job, p, emptyFreeVideoRuntime(), { kind: "ambiguous_after_submission" });
  assert.equal(uncertain.job.status, "needs_review");
  assert.equal(planFreeVideoAttempt(uncertain.job, [candidate("b", "pool-b")], uncertain.runtime).action, "stop");
});

test("charged, unknown-billing and disabled providers are never selected", () => {
  const paid = { ...candidate("paid", "pool-paid"), billing: "paid" as const };
  const unknown = { ...candidate("unknown", "pool-unknown"), billing: "unknown" as const };
  const blocked = { ...candidate("blocked", "pool-blocked"), routeStatus: "blocked" as const };
  const decision = planFreeVideoAttempt(createFreeVideoJob("job1", spec), [paid, unknown, blocked], emptyFreeVideoRuntime());
  assert.equal(decision.action, "stop");
});

test("requires stable asset revision and motion prompt hash", () => {
  assert.throws(() => createFreeVideoJob("job", { ...spec, sourceAssetRevision: 0 }));
  assert.throws(() => createFreeVideoJob("job", { ...spec, promptSha256: "wrong" }));
});

test("local ledger atomically reserves before submission and refuses a duplicate after reopening", async () => {
  const dir = await mkdtemp(join(tmpdir(), "free-i2v-ledger-test-"));
  const file = join(dir, "ledger.json");
  const p = candidate("wan", "hf-anonymous");
  try {
    await registerLocalFreeVideoJob(file, "job-A", spec);
    await registerLocalFreeVideoJob(file, "job-A", spec);
    await assert.rejects(() => registerLocalFreeVideoJob(file, "job-A", { ...spec, sourceAssetRevision: 3 }));
    const first = await reserveLocalFreeVideoAttempt(file, "job-A", [p]);
    assert.equal(first.action, "run");
    const restart = await reserveLocalFreeVideoAttempt(file, "job-A", [p]);
    assert.equal(restart.action, "stop");
    const saved = await readLocalFreeVideoLedger(file);
    assert.equal(saved.jobs["job-A"].status, "running");
    await completeLocalFreeVideoAttempt(file, "job-A", p, { kind: "rejected_quota" });
    assert.deepEqual((await readLocalFreeVideoLedger(file)).runtime.exhaustedPoolIds, ["hf-anonymous"]);
    assert.equal((await reserveLocalFreeVideoAttempt(file, "job-A", [p])).action, "wait");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("stale lock fails closed instead of risking double-submit", async () => {
  const dir = await mkdtemp(join(tmpdir(), "free-i2v-ledger-lock-"));
  const file = join(dir, "ledger.json");
  const lock = await open(file + ".lock", "wx");
  try {
    await assert.rejects(() => registerLocalFreeVideoJob(file, "job-A", spec), { code: "EEXIST" });
  } finally {
    await lock.close();
    await rm(dir, { recursive: true, force: true });
  }
});

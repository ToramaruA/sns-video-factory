import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FreeVideoProvider } from "../../src/sns-video/providers/free_movie_router.js";
import { readLocalFreeVideoLedger } from "../../src/sns-video/providers/local_free_video_ledger.js";
import { runLocalFreeVideoExecution } from "../../src/sns-video/providers/local_free_video_executor.js";
import { provider2MovieAgent } from "../../src/types/provider2agent.js";

const mp4 = (): Buffer => {
  const buffer = Buffer.alloc(2048);
  buffer.write("ftyp", 4, "ascii");
  return buffer;
};

const provider = (): FreeVideoProvider => ({
  id: "free-test",
  model: "test-i2v",
  quotaPoolId: "test-free-pool",
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

const fixture = async () => {
  const directory = await mkdtemp(join(tmpdir(), "sns-free-agent-test-"));
  const imagePath = join(directory, "source.png");
  await writeFile(imagePath, Buffer.from("source image content"));
  return {
    directory,
    imagePath,
    ledgerPath: join(directory, "ledger.json"),
    request: { model: "test-i2v", hasFirstFrame: true, durationSeconds: 2 },
    providers: [provider()],
    prompt: "A rocket lifts off",
  };
};

test("registered explicit Wan route is protected by the same shared free router", () => {
  assert.equal(provider2MovieAgent.free_i2v.agentName, "movieFreeRouterAgent");
  assert.equal(provider2MovieAgent.wan22_zerogpu_experimental.agentName, "movieFreeRouterAgent");
});

test("no absolute persistent ledger means no provider can be invoked", async () => {
  const f = await fixture();
  let count = 0;
  try {
    await assert.rejects(
      () =>
        runLocalFreeVideoExecution({
          ...f,
          ledgerPath: "",
          generate: async () => {
            count++;
            return mp4();
          },
        }),
      /SNS_VIDEO_FREE_VIDEO_LEDGER_PATH/,
    );
    assert.equal(count, 0);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("first execution generates one MP4, subsequent identical request uses the durable cache", async () => {
  const f = await fixture();
  let count = 0;
  const job = {
    ...f,
    generate: async () => {
      count++;
      return mp4();
    },
  };
  try {
    const first = await runLocalFreeVideoExecution(job);
    const cached = await runLocalFreeVideoExecution(job);
    assert.deepEqual(cached, first);
    assert.equal(count, 1);
    const ledger = await readLocalFreeVideoLedger(f.ledgerPath);
    const record = Object.values(ledger.jobs)[0];
    assert.equal(Object.keys(ledger.jobs).length, 1);
    assert.equal(record.status, "succeeded");
    const saved = await readFile(join(f.directory, "free-video-assets", record.id + ".mp4"));
    assert.deepEqual(saved, first);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("image or motion prompt changes produce distinct new jobs", async () => {
  const f = await fixture();
  let count = 0;
  const generate = async () => {
    count++;
    return mp4();
  };
  try {
    await runLocalFreeVideoExecution({ ...f, generate });
    await runLocalFreeVideoExecution({ ...f, prompt: "The rocket moves sideways", generate });
    await writeFile(f.imagePath, Buffer.from("a revised source image"));
    await runLocalFreeVideoExecution({ ...f, generate });
    assert.equal(count, 3);
    assert.equal(Object.keys((await readLocalFreeVideoLedger(f.ledgerPath)).jobs).length, 3);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("uncertain provider failure requires review and cannot resubmit the same job", async () => {
  const f = await fixture();
  let count = 0;
  const generate = async (): Promise<Buffer> => {
    count++;
    throw new Error("Network lost after submission");
  };
  try {
    await assert.rejects(() => runLocalFreeVideoExecution({ ...f, generate }), /Network lost/);
    const record = Object.values((await readLocalFreeVideoLedger(f.ledgerPath)).jobs)[0];
    assert.equal(record.status, "needs_review");
    await assert.rejects(() => runLocalFreeVideoExecution({ ...f, generate }), /stop/);
    assert.equal(count, 1);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("corrupt or missing cached MP4 does not trigger a second generation", async () => {
  const f = await fixture();
  let count = 0;
  const job = {
    ...f,
    generate: async () => {
      count++;
      return mp4();
    },
  };
  try {
    await runLocalFreeVideoExecution(job);
    const record = Object.values((await readLocalFreeVideoLedger(f.ledgerPath)).jobs)[0];
    await writeFile(join(f.directory, "free-video-assets", record.id + ".mp4"), Buffer.alloc(2048));
    await assert.rejects(() => runLocalFreeVideoExecution(job), /invalid|checksum/i);
    assert.equal(count, 1);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("simultaneous requests for the same ID never submit twice", async () => {
  const f = await fixture();
  let count = 0;
  let started!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const job = {
    ...f,
    generate: async () => {
      count++;
      started();
      await gate;
      return mp4();
    },
  };
  try {
    const first = runLocalFreeVideoExecution(job);
    await entered;
    await assert.rejects(() => runLocalFreeVideoExecution(job));
    release();
    await first;
    assert.equal(count, 1);
  } finally {
    release();
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("different job cannot run while another local inference has a reservation", async () => {
  const f = await fixture();
  let count = 0;
  let started!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const generate = async () => {
    count++;
    started();
    await gate;
    return mp4();
  };
  try {
    const first = runLocalFreeVideoExecution({ ...f, generate });
    await entered;
    await assert.rejects(() => runLocalFreeVideoExecution({ ...f, prompt: "different request", generate }), /wait/);
    release();
    await first;
    assert.equal(count, 1);
  } finally {
    release();
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("paid or unknown billing provider cannot be executed, even with a valid ledger", async () => {
  const f = await fixture();
  let count = 0;
  try {
    await assert.rejects(() =>
      runLocalFreeVideoExecution({
        ...f,
        providers: [{ ...provider(), billing: "paid" }],
        generate: async () => {
          count++;
          return mp4();
        },
      }),
    );
    assert.equal(count, 0);
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

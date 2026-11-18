import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBrowserServer } from './sns-video-browser.mjs';

const TEST_TOKEN = 'private-keep-this-safe-more-than-24-chars';
const auth = { Authorization: 'Bearer ' + TEST_TOKEN, 'Content-Type': 'application/json' };
const base = resolve(fileURLToPath(import.meta.url), '../..');

async function start(runner) {
  const htmlPath = join(base, 'scripts/sns-video-browser.html');
  const server = createBrowserServer({ token: TEST_TOKEN, runner, htmlPath });
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  return { server, url: 'http://127.0.0.1:' + server.address().port };
}

async function post(url, value, headers = auth) {
  return fetch(url + '/api/jobs', { method: 'POST', headers, body: JSON.stringify(value) });
}

async function waitForDone(url, id) {
  for (let i = 0; i < 200; i++) {
    const r = await fetch(url + '/api/jobs/' + id, { headers: auth });
    const data = await r.json();
    if (data.state === 'done' || data.state === 'failed') return data;
    await new Promise(res => setTimeout(res, 10));
  }
  throw new Error('job timeout');
}

test('browser entry protects free generation, prevents simultaneous runs and serves finished MP4 and plan', async () => {
  let release;
  const blocker = new Promise(res => release = res);
  const runner = async ({ brief, voice, outputDir, setStep }) => {
    assert.equal(brief, '音楽の短編動画');
    assert.equal(voice, false);
    setStep('test phase');
    await blocker;
    await mkdir(outputDir, { recursive: true });
    const video = join(outputDir, 'video.mp4'), plan = join(outputDir, 'mulmo-plan.json');
    await writeFile(video, Buffer.from('test-mp4-content'));
    await writeFile(plan, JSON.stringify({ beats: [{ text: 'hello' }] }));
    return { video, plan };
  };
  const { url, server } = await start(runner);
  try {
    const html = await fetch(url);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /無料MulmoCast/);
    assert.equal((await fetch(url + '/api/jobs/id')).status, 401);
    assert.equal((await post(url, { brief: '音楽の短編動画', voice: false }, {})).status, 401);
    assert.equal((await post(url, { brief: '', voice: false })).status, 400);
    assert.equal((await post(url, { brief: '音楽の短編動画', voice: true })).status, 400);
    const good = await post(url, { brief: '音楽の短編動画', voice: false });
    assert.equal(good.status, 202);
    const { id } = await good.json();
    assert.match(id, /^[a-f0-9]{24}$/);
    assert.equal((await post(url, { brief: '音楽の短編動画', voice: false })).status, 409);
    assert.equal((await fetch(url + '/api/jobs/' + id + '/video', { headers: auth })).status, 409);
    release();
    const finished = await waitForDone(url, id);
    assert.equal(finished.state, 'done');
    assert.equal(finished.step, '完了');
    const downloaded = await fetch(url + '/api/jobs/' + id + '/video', { headers: auth });
    assert.equal(downloaded.status, 200);
    assert.equal(await downloaded.text(), 'test-mp4-content');
    assert.match((await (await fetch(url + '/api/jobs/' + id + '/script', { headers: auth })).text()), /"beats"/);
    assert.equal((await fetch(url + '/api/jobs/' + id + '/script', { headers: { Authorization: 'Bearer wrong' } })).status, 401);
    assert.equal((await fetch(url + '/api/jobs/../../secrets', { headers: auth })).status, 404);
  } finally {
    release?.();
    await new Promise(res => server.close(res));
  }
});

test('failed pipeline never serves a stale output or leaks provider errors to users', async () => {
  const { url, server } = await start(async ({ setStep }) => {
    setStep('fake error phase');
    throw new Error('SECRET_API_KEY_SHOULD_NOT_LEAK');
  });
  try {
    const r = await post(url, { brief: '紹介動画', voice: false });
    assert.equal(r.status, 202);
    const { id } = await r.json();
    const finished = await waitForDone(url, id);
    assert.equal(finished.state, 'failed');
    assert.doesNotMatch(JSON.stringify(finished), /SECRET_API_KEY_SHOULD_NOT_LEAK/);
    assert.equal((await fetch(url + '/api/jobs/' + id + '/video', { headers: auth })).status, 409);
  } finally {
    await new Promise(res => server.close(res));
  }
});


test('full-length Japanese brief is accepted as UTF-8, while oversized and over-3500 inputs are rejected', async () => {
  let received = '';
  const { url, server } = await start(async ({ brief }) => {
    received = brief;
    throw new Error('Intentionally stop before external AI requests');
  });
  try {
    const japanese = 'あ'.repeat(3500);
    assert.ok(Buffer.byteLength(JSON.stringify({ brief: japanese, voice: false })) > 5000);
    const result = await post(url, { brief: japanese, voice: false });
    assert.equal(result.status, 202, '3,500 Japanese characters must not be blocked by a 5-KB byte limit');
    const { id } = await result.json();
    const finished = await waitForDone(url, id);
    assert.equal(finished.state, 'failed');
    assert.equal(received, japanese);
    const tooLong = await post(url, { brief: japanese + 'あ', voice: false });
    assert.equal(tooLong.status, 400);
    const hugeRequest = await post(url, { brief: 'short', voice: false, ignored: 'x'.repeat(20000) });
    assert.equal(hugeRequest.status, 413);
  } finally {
    await new Promise(res => server.close(res));
  }
});

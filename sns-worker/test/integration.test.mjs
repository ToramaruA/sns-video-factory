import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import worker from "../src/index.js";

const issuer = "https://unit.cloudflareaccess.com";
const branch = "restart/mulmocast-upstream-free-ai";
const wf = ".github/workflows/sns-video-groq-flux-three-cut-manual.yml";
const base = "https://api.github.com/repos/ToramaruA/sns-video-factory";
const auth = { GITHUB_ACTIONS_PAT: "test-gh-pat", CF_ACCESS_TEAM_DOMAIN: "unit.cloudflareaccess.com", CF_ACCESS_AUD: "test-audience" };
test("fully authenticated workflow dispatch, status, artifacts and zip; no network or paid AI", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const pub = { ...(await exportJWK(publicKey)), alg: "RS256", use: "sig", kid: "test-key" };
  const jwt = await new SignJWT({}).setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setSubject("user-one").setAudience(auth.CF_ACCESS_AUD).setIssuer(issuer)
    .setIssuedAt().setExpirationTime("1h").sign(privateKey);
  const originalFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (request, options) => {
    const url = typeof request === "string" ? request : request instanceof URL ? request.href : request.url;
    seen.push(url);
    if (url === issuer + "/cdn-cgi/access/certs") {
      return new Response(JSON.stringify({ keys: [pub] }), { headers: { "content-type": "application/json" } });
    }
    assert.equal(options.headers.get("authorization"), "Bearer test-gh-pat");
    assert.equal(options.headers.get("x-github-api-version"), "2026-03-10");
    if (url === base + "/actions/workflows/sns-video-groq-flux-three-cut-manual.yml/dispatches") {
      assert.equal(options.method, "POST");
      const request = JSON.parse(options.body);
      assert.equal(request.ref, branch);
      assert.equal(request.return_run_details, true);
      assert.equal(request.inputs.brief, "室内楽のコンサート");
      assert.equal(request.inputs.render_movie, "false");
      assert.equal(request.inputs.confirm_groq_free_plan, "true");
      return new Response(JSON.stringify({ workflow_run_id: 121212, html_url: "https://github.com/example/actions/runs/121212" }), { status: 200 });
    }
    if (url === base + "/actions/runs/121212") {
      return new Response(JSON.stringify({
        id: 121212, event: "workflow_dispatch", head_branch: branch, path: wf,
        status: "completed", conclusion: "success", html_url: "https://github.com/example/actions/runs/121212",
      }));
    }
    if (url === base + "/actions/runs/121212/artifacts?per_page=30") {
      return new Response(JSON.stringify({ artifacts: [
        { id: 5151, name: "free-groq-mulmoscript", size_in_bytes: 800, expired: false },
        { id: 5252, name: "private-unrelated-artifact", size_in_bytes: 10, expired: false },
      ] }));
    }
    if (url === base + "/actions/artifacts/5151/zip") {
      return new Response(new Uint8Array([80,75,3,4]), { status: 200 });
    }
    throw Error("Unexpected network fetch: " + url);
  };
  const call = (path, init = {}) => worker.fetch(new Request("https://app.workers.dev" + path, {
    headers: { "Cf-Access-Jwt-Assertion": jwt, ...init.headers }, ...init,
  }), auth);
  try {
    const noOrigin = await call("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: '{"mode":"plan"}' });
    assert.equal(noOrigin.status, 403);
    const trigger = await call("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://app.workers.dev" },
      body: JSON.stringify({mode:"plan",brief:"室内楽のコンサート",consent:{groq:true}}),
    });
    assert.equal(trigger.status, 201);
    assert.equal((await trigger.json()).run_id, 121212);
    const status = await call("/api/runs/121212");
    assert.deepEqual((await status.json()).conclusion, "success");
    const list = await call("/api/runs/121212/artifacts");
    assert.deepEqual((await list.json()).artifacts.map(a => a.id), [5151]);
    const forbidden = await call("/api/runs/121212/artifacts/5252/zip");
    assert.equal(forbidden.status, 404);
    const zip = await call("/api/runs/121212/artifacts/5151/zip");
    assert.equal(zip.status, 200);
    assert.equal(zip.headers.get("content-type"), "application/zip");
    assert.deepEqual([...new Uint8Array(await zip.arrayBuffer())], [80,75,3,4]);
    assert.equal(seen.filter(x=>x.includes("/dispatches")).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

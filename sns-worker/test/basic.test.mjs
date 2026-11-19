import {test} from "node:test";
import assert from "node:assert/strict";
import worker,{workflowInputs} from "../src/index.js";
test("Plan only calls native scripting and requires explicit Groq Free consent",()=>{
  const p=workflowInputs({mode:"plan",brief:"音楽会",consent:{groq:true}});
  assert.equal(p.render_movie,"false");assert.equal(p.confirm_groq_free_plan,"true");assert.equal(p.script_json,"");
  assert.throws(()=>workflowInputs({mode:"plan",brief:"音楽会"}),/Free Plan/);
});
test("Movie accepts only three two-second beats and explicit free/demo consent",()=>{
  const script={beats:[{duration:2},{duration:2},{duration:2}]};
  assert.throws(()=>workflowInputs({mode:"render",script,consent:{cloudflare:true,gemini:true,wan:true}}),/confirmations/);
  const r=workflowInputs({mode:"render",script,consent:{cloudflare:true,gemini:true,wan:true,upload:true}});
  assert.equal(r.render_movie,"true");assert.equal(r.confirm_groq_free_plan,"false");
  assert.equal(JSON.parse(r.script_json).beats.length,3);
  assert.throws(()=>workflowInputs({mode:"render",script:{beats:[{duration:10}]},consent:{cloudflare:true,gemini:true,wan:true,upload:true}}),/three/);
});
test("No credentials and missing Access JWT fail closed without network",async()=>{
  const req=new Request("https://test.workers.dev/api/health");
  assert.equal((await worker.fetch(req,{})).status,503);
  assert.equal((await worker.fetch(req,{GITHUB_ACTIONS_PAT:"fake",CF_ACCESS_TEAM_DOMAIN:"example.cloudflareaccess.com",CF_ACCESS_AUD:"aud"})).status,401);
});

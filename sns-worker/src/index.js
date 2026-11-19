import { createRemoteJWKSet, jwtVerify } from "jose";
const API="https://api.github.com/repos/ToramaruA/sns-video-factory";
const BRANCH="restart/mulmocast-upstream-free-ai";
const WORKFLOW="sns-video-groq-flux-three-cut-manual.yml";
const JWKS=new Map();
class HttpError extends Error { constructor(status,message){ super(message);this.status=status; } }
const fail=(status,message)=>{throw new HttpError(status,message)};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const numericId=s=>/^[0-9]{1,16}$/.test(s)&&Number.isSafeInteger(Number(s));
async function authorize(req,env){
  if(!env.GITHUB_ACTIONS_PAT||!env.CF_ACCESS_TEAM_DOMAIN||!env.CF_ACCESS_AUD)fail(503,"Cloudflare Access and GitHub secrets are not configured");
  const token=req.headers.get("Cf-Access-Jwt-Assertion");
  if(!token)fail(401,"Cloudflare Access login required");
  try {
    const value=env.CF_ACCESS_TEAM_DOMAIN;
    const domain=new URL(value.startsWith("https://")?value:"https://"+value);
    if(domain.protocol!=="https:"||domain.pathname!=="/"||domain.username||domain.password)throw Error("bad domain");
    let keys=JWKS.get(domain.origin);
    if(!keys){keys=createRemoteJWKSet(new URL(domain.origin+"/cdn-cgi/access/certs"));JWKS.set(domain.origin,keys)}
    const out=await jwtVerify(token,keys,{issuer:domain.origin,audience:env.CF_ACCESS_AUD});
    if(!out.payload.sub)throw Error("missing identity");
  }catch{fail(401,"Cloudflare Access token invalid")}
}
async function gh(env,path,options={}){
  const headers=new Headers(options.headers||{});
  headers.set("authorization","Bearer "+env.GITHUB_ACTIONS_PAT);
  headers.set("accept","application/vnd.github+json");
  headers.set("x-github-api-version","2026-03-10");
  headers.set("user-agent","sns-video-factory-relay");
  const res=await fetch(API+path,{...options,headers});
  if(!res.ok)fail(502,"GitHub Actions request failed (HTTP "+res.status+")");
  return res;
}
export function workflowInputs(body){
  if(!body||typeof body!=="object"||Array.isArray(body))fail(400,"Invalid request");
  if(body.mode==="plan"){
    const brief=typeof body.brief==="string"?body.brief.trim():"";
    if(!brief||brief.length>2000)fail(400,"Enter a brief of 1-2000 characters");
    if(body.consent?.groq!==true)fail(400,"Confirm Groq Free Plan before generation");
    return {brief,script_path:"",script_json:"",render_movie:"false",confirm_groq_free_plan:"true",confirm_cloudflare_free_plan:"false",confirm_gemini_free_tier:"false",confirm_zerogpu_trial:"false",confirm_third_party_demo_upload:"false"};
  }
  if(body.mode==="render"){
    const c=body.consent;
    if(c?.cloudflare!==true||c?.gemini!==true||c?.wan!==true||c?.upload!==true)fail(400,"Four free-account and third-party-demo confirmations are required");
    const s=body.script;
    if(!s||typeof s!=="object"||Array.isArray(s)||!Array.isArray(s.beats))fail(400,"A MulmoScript object with beats is required");
    if(s.beats.length!==3||s.beats.some(b=>!b||b.duration!==2))fail(400,"Trial I2V supports exactly three two-second cuts");
    const raw=JSON.stringify(s);
    if(raw.length>60000)fail(413,"MulmoScript exceeds workflow input limit");
    return {brief:"Edited MulmoScript input",script_path:"",script_json:raw,render_movie:"true",confirm_groq_free_plan:"false",confirm_cloudflare_free_plan:"true",confirm_gemini_free_tier:"true",confirm_zerogpu_trial:"true",confirm_third_party_demo_upload:"true"};
  }
  fail(400,"Invalid mode");
}
async function run(env,id){
  if(!numericId(id))fail(400,"Invalid run ID");
  const value=await (await gh(env,"/actions/runs/"+id)).json();
  if(value.event!=="workflow_dispatch"||value.head_branch!==BRANCH||value.path!==".github/workflows/"+WORKFLOW)fail(404,"Not an SNS workflow run");
  return value;
}
async function artifacts(env,id){
  await run(env,id);
  const raw=await (await gh(env,"/actions/runs/"+id+"/artifacts?per_page=30")).json();
  return (raw.artifacts||[]).filter(a=>!a.expired&&/^free-(groq|existing|pasted)/.test(a.name)).map(a=>({id:a.id,name:a.name,size:a.size_in_bytes}));
}
async function route(req,env){
  const url=new URL(req.url),parts=url.pathname.split("/").filter(Boolean);
  if(!url.pathname.startsWith("/api/"))return env.ASSETS.fetch(req);
  await authorize(req,env);
  if(req.method==="GET"&&url.pathname==="/api/health")return json({ready:true});
  if(req.method==="POST"&&url.pathname==="/api/runs"){
    if(req.headers.get("origin")!==url.origin)fail(403,"Same-origin requests only");
    if(!req.headers.get("content-type")?.startsWith("application/json"))fail(415,"JSON required");
    if(Number(req.headers.get("content-length")||0)>100000)fail(413,"Payload too large");
    const text=await req.text();
    if(new TextEncoder().encode(text).length>100000)fail(413,"Payload too large");
    let body;try{body=JSON.parse(text)}catch{fail(400,"Invalid JSON")}
    const inputs=workflowInputs(body);
    const res=await gh(env,"/actions/workflows/"+WORKFLOW+"/dispatches",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ref:BRANCH,inputs})});
    if(res.status!==200)fail(502,"GitHub accepted the trigger but returned no run ID. Check Actions before retrying");
    const data=await res.json();
    if(!numericId(String(data.workflow_run_id)))fail(502,"Missing workflow run ID; check Actions before retrying");
    return json({run_id:data.workflow_run_id,url:data.html_url},201);
  }
  if(req.method==="GET"&&parts[0]==="api"&&parts[1]==="runs"&&parts.length===3){
    const r=await run(env,parts[2]);
    return json({id:r.id,status:r.status,conclusion:r.conclusion,url:r.html_url});
  }
  if(req.method==="GET"&&parts[0]==="api"&&parts[1]==="runs"&&parts[3]==="artifacts"&&parts.length===4){
    return json({artifacts:await artifacts(env,parts[2])});
  }
  if(req.method==="GET"&&parts[0]==="api"&&parts[1]==="runs"&&parts[3]==="artifacts"&&parts[5]==="zip"&&parts.length===6){
    if(!numericId(parts[4]))fail(400,"Invalid artifact ID");
    const list=await artifacts(env,parts[2]);
    const entry=list.find(a=>String(a.id)===parts[4]);
    if(!entry)fail(404,"Artifact not found for this run");
    if(entry.size>100*1024*1024)fail(413,"Artifact too large");
    const response=await gh(env,"/actions/artifacts/"+entry.id+"/zip");
    return new Response(response.body,{headers:{"content-type":"application/zip","content-disposition":'attachment; filename="sns-video.zip"',"cache-control":"private, no-store","x-content-type-options":"nosniff"}});
  }
  return json({error:"Not found"},404);
}
export default {async fetch(req,env){
  try{return await route(req,env)}
  catch(e){return json({error:e instanceof HttpError?e.message:"Internal error"},e instanceof HttpError?e.status:500)}
}};

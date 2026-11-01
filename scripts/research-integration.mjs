import assert from "node:assert/strict";
import {createTestAccount,TestBrowser} from "./reportAuthFixture.mjs";
let account,other;
try{
  account=await createTestAccount();other=await createTestAccount();
  const a=new TestBrowser(),b=new TestBrowser();await a.signIn(account);await b.signIn(other);
  const initial=await(await a.request("/api/crm/library")).json();
  const lead={id:"research-check",name:"Research test",company:"Example Domain",jobTitle:"",email:"",phone:"",website:"https://example.com",location:"",industry:"Other",companySize:"Unknown",source:"Website",ownerId:account.id,status:"New",notes:"",tags:[],services:[],createdAt:new Date().toISOString()};
  const library={...initial.data,leads:[lead,{...lead,id:"blocked-source",website:"http://127.0.0.1:3012"}]};
  const saved=await a.request("/api/crm/library",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({revision:0,operationId:crypto.randomUUID(),data:library})});
  assert.equal(saved.status,200,JSON.stringify(await saved.clone().json()));
  const run=(browser,id,extra={})=>browser.request("/api/ai/research",{method:"POST",headers:{"content-type":"application/json",...extra},body:JSON.stringify({leadId:id})});
  assert.equal((await run(new TestBrowser(),lead.id)).status,401);
  assert.equal((await run(b,lead.id)).status,404);
  assert.equal((await run(a,lead.id,{origin:"https://untrusted.example"})).status,403);
  const blocked=await run(a,"blocked-source");assert.equal(blocked.status,200);const blockedResult=(await blocked.json()).research;
  assert.equal(blockedResult.mode,"crm_only");assert.ok(blockedResult.sources.every(source=>source.status==="unavailable"));assert.ok(!blockedResult.sections.flatMap(section=>section.findings).some(finding=>finding.kind==="verified"));
  // The public-source/model request has a larger bounded duration than routine API calls.
  const response=await fetch(a.base+"/api/ai/research",{method:"POST",headers:{"content-type":"application/json",origin:a.base,cookie:[...a.cookies].map(([key,value])=>`${key}=${value}`).join("; ")},body:JSON.stringify({leadId:lead.id}),signal:AbortSignal.timeout(115000)});
  const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));
  const research=body.research;assert.equal(research.sections.length,6);assert.equal(research.coverage.length,10);
  assert.ok(research.sources.some(source=>source.status==="ok"),"At least one public page must be read to validate the live path");
  assert.ok(["public_ai","public_evidence"].includes(research.mode));
  for(const finding of research.sections.flatMap(section=>section.findings).filter(finding=>finding.kind==="verified")){assert.ok(/^https?:\/\//.test(finding.source));}
  console.log(`PASS: owned-lead authorization, cross-account denial, CSRF, blocked private sources, public website reading, six requested outputs and ten analysis areas. Synthesis mode: ${research.mode}${research.model?` (${research.model})`:""}.`);
}finally{if(account)await account.remove();if(other)await other.remove();}

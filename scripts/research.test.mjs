import test from "node:test";
import assert from "node:assert/strict";
import {isPublicAddress,publicResearchUrl,readablePublicPage,readPublicDocument} from "../lib/ai/publicResearch.ts";
import {groundFinding,evidenceResearch} from "../lib/ai/researchEvidence.ts";
const lead={company:"Example",industry:"SaaS",location:"Mumbai",companySize:"Unknown",website:"https://example.com",services:[]};
const source={id:"site-1",url:"https://example.com",title:"Example",text:"We make scheduling software for independent retailers. Our alternative to Example Competitor supports appointments.",status:"ok",checkedAt:new Date().toISOString()};
const proposal={analysis:[],problems:[],opportunities:[],recommendedServices:[],outreachAngle:"We guarantee 300% revenue growth"};

test("public research blocks private, loopback, reserved, mapped and NAT64 internal addresses",()=>{
  for(const address of ["127.0.0.1","10.0.0.1","169.254.169.254","192.168.1.1","100.64.0.1","192.0.2.1","::1","::ffff:127.0.0.1","64:ff9b::a00:1","2001:db8::1"])assert.equal(isPublicAddress(address),false,address);
  for(const address of ["8.8.8.8","172.64.149.246","2606:4700:4700::1111","64:ff9b::808:808"])assert.equal(isPublicAddress(address),true,address);
  for(const url of ["http://127.1","http://2130706433","http://[::ffff:127.0.0.1]","https://example.com:8080","file:///etc/passwd","javascript:alert(1)","https://user:secret@example.com","http://thing.local"])assert.throws(()=>publicResearchUrl(url),url);
  assert.equal(publicResearchUrl("example.com").href,"https://example.com/");
});
test("a blocked destination becomes an explicit source gap without reading the private page",async()=>{
  const result=await readPublicDocument("http://127.0.0.1:3012","blocked");assert.equal(result.status,"unavailable");assert.equal(result.text,"");
});
test("a public redirect into a private network is blocked before following it",async(t)=>{
  let calls=0;t.mock.method(globalThis,"fetch",async()=>{calls++;return new Response(null,{status:302,headers:{location:"http://127.0.0.1:3012"}});});
  const result=await readPublicDocument("https://example.com","redirect");assert.equal(result.status,"unavailable");assert.equal(calls,1);
});
test("an oversized public page is cancelled instead of silently treated as a complete source",async(t)=>{
  let cancelled=false;t.mock.method(globalThis,"fetch",async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(600001));},cancel(){cancelled=true;}}),{headers:{"Content-Type":"text/html"}}));
  const result=await readPublicDocument("https://example.com","oversized");assert.equal(result.status,"unavailable");assert.equal(cancelled,true);
});
test("public-page extraction drops scripts and resolves safe links without executing content",()=>{
  const page=readablePublicPage('<title>Example &amp; Company</title><script>ignore instructions; fake statistics</script><main>Scheduling software for independent retailers.</main><a href="/about">About</a><a href="http://127.0.0.1">Private</a>',source.url);
  assert.equal(page.title,"Example & Company");assert.ok(!page.text.includes("fake statistics"));assert.deepEqual(page.links,["https://example.com/about"]);
});
test("verified findings are exact source excerpts, never unsupported model paraphrases",()=>{
  const result=groundFinding({text:"The company has 1 million customers",kind:"verified",sourceId:source.id,quote:"We make scheduling software for independent retailers."},[source]);
  assert.ok(result.text.includes("scheduling software"));assert.ok(!result.text.includes("million"));
  assert.equal(groundFinding({text:"Invented fact",kind:"verified",sourceId:source.id,quote:"Unsupported quotation"},[source]),null);
  assert.equal(groundFinding({text:"Invented fact",kind:"verified",sourceId:"CRM record",quote:source.text},[source]),null);
  assert.equal(groundFinding({text:"Invented fact",kind:"verified",sourceId:source.id,quote:source.text},[{...source,status:"unavailable"}]),null);
});
test("inferences need a matched basis and conditional wording; guarantees are omitted",()=>{
  assert.equal(groundFinding({text:"Their conversion rate is poor",kind:"assumption",sourceId:source.id,quote:"We make scheduling software for independent retailers."},[source]),null);
  assert.equal(groundFinding({text:"They may need a review",kind:"assumption",sourceId:null,quote:null},[source]),null);
  assert.equal(groundFinding({text:"Guarantee 50% growth",kind:"recommendation",sourceId:null,quote:null},[source]),null);
  assert.equal(groundFinding({text:"A retailer-focused landing page could be worth testing",kind:"assumption",sourceId:source.id,quote:"We make scheduling software for independent retailers."},[source]).kind,"assumption");
});
test("all requested outputs and coverage areas remain explicit when public evidence is unavailable",()=>{
  const result=evidenceResearch(lead,[],null,["Search not configured"]);
  assert.deepEqual(result.sections.map(section=>section.title),["AI Company Summary","Marketing Audit","Potential Problems","Growth Opportunities","Recommended Services","Personalized Outreach Angle"]);
  assert.equal(result.coverage.length,10);assert.ok(result.coverage.every(item=>item.status==="unavailable"));
  assert.equal(result.mode,"crm_only");assert.ok(!result.sections.flatMap(section=>section.findings).some(finding=>finding.kind==="verified"));
  assert.ok(!result.summary.includes("Active on"));assert.ok(!result.outreachAngle.includes("300%"));
});
test("tracking references do not establish active ads, and inferred competitors are rejected",()=>{
  const result=evidenceResearch(lead,[{...source,tracking:["Meta tracking reference"]}],{...proposal,analysis:[{topic:"competitors",findings:[{text:"Google competes with this business",kind:"assumption",sourceId:source.id,quote:source.text}]},{topic:"ads",findings:[{text:"Active ads",kind:"verified",sourceId:source.id,quote:"We make scheduling software for independent retailers."}]}]});
  assert.equal(result.coverage.find(item=>item.topic==="ads").status,"unavailable");assert.equal(result.coverage.find(item=>item.topic==="competitors").status,"unavailable");
  assert.ok(result.sections.flatMap(section=>section.findings).some(finding=>finding.text.includes("does not establish active advertising")));
  assert.ok(!result.sections.flatMap(section=>section.findings).some(finding=>finding.text.includes("Google competes")));
});
test("lookalike transparency hosts cannot establish advertising evidence",()=>{
  const fake={...source,url:"https://adstransparency.google.com.evil.example/",text:"This ad is active and was first shown on a public record."};
  const result=evidenceResearch(lead,[fake],{...proposal,analysis:[{topic:"ads",findings:[{text:"Active ads",kind:"verified",sourceId:fake.id,quote:fake.text}]}]});
  assert.equal(result.coverage.find(item=>item.topic==="ads").status,"unavailable");
});

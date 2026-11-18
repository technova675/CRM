import test from "node:test";
import assert from "node:assert/strict";
import {isPublicAddress,publicResearchUrl,readablePublicPage,readPublicDocument,collectPublicEvidence} from "../lib/ai/publicResearch.ts";
import {groundFinding,evidenceResearch} from "../lib/ai/researchEvidence.ts";
import {applyResearchReview,researchCandidates,researchSourcePacket,researchReviewSchemaFor} from "../lib/ai/researchReview.ts";
import {researchModelConfig,researchOpenRouterSettings} from "../lib/ai/researchConfig.ts";
import {researchCitation} from "../lib/ai/researchCitation.ts";
import {researchFindingSchemaFor} from "../lib/ai/researchSchema.ts";
const lead={company:"Example",industry:"SaaS",location:"Mumbai",companySize:"Unknown",website:"https://example.com",services:[]};
const source={id:"site-1",url:"https://example.com",title:"Example",text:"We make scheduling software for independent retailers. Our alternative to Example Competitor supports appointments.",status:"ok",checkedAt:new Date().toISOString()};
const proposal={identity:{status:"verified",reason:"The official site matches the company.",conflicts:[]},analysis:[],problems:[],opportunities:[],recommendedServices:[],outreachAngle:"We guarantee 300% revenue growth"};

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
test("target audience coverage includes the actual sourced finding",()=>{
  const quote="We make scheduling software for independent retailers.";
  const result=evidenceResearch(lead,[source],{...proposal,analysis:[{topic:"audience",findings:[{text:"Independent retailers",kind:"verified",sourceId:source.id,quote}]}]});
  const audience=result.coverage.find(item=>item.topic==="audience");
  assert.equal(audience.status,"evidence");
  assert.ok(audience.findings[0].text.includes("independent retailers"));
  assert.equal(audience.findings[0].source,source.url);
});

test("official-site descriptions cannot bypass the findings verification process",()=>{
  const official={...source,text:"Example is a performance marketing agency for independent retailers. Our services include paid acquisition and CRO."};
  const result=evidenceResearch(lead,[official],{...proposal,identity:{status:"verified",reason:"The official site identifies Example as the agency.",conflicts:[]}});
  assert.equal(result.coverage.find(item=>item.topic==="business_model").status,"unavailable");
  assert.equal(result.coverage.find(item=>item.topic==="website").status,"unavailable");
  assert.equal(result.coverage.find(item=>item.topic==="ads").status,"unavailable");
  assert.equal(result.coverage.find(item=>item.topic==="competitors").status,"unavailable");
});

test("readable pages alone cannot establish verified findings when AI verification fails",()=>{
  const result=evidenceResearch(lead,[{...source,tracking:["Meta tracking reference"]}],null);
  assert.ok(result.coverage.every(item=>item.status==="unavailable"));
  assert.ok(!result.sections.flatMap(section=>section.findings).some(finding=>finding.kind==="verified"));
});

test("a proposal without an explicit identity decision cannot produce verified findings",()=>{
  const result=evidenceResearch(lead,[source],{...proposal,identity:undefined,analysis:[{topic:"products",findings:[{text:"Software",kind:"verified",sourceId:source.id,quote:source.text}]}]});
  assert.equal(result.coverage.find(item=>item.topic==="products").status,"unavailable");
});

test("rejected category findings explain why they were omitted",()=>{
  const result=evidenceResearch(lead,[source],{...proposal,analysis:[{topic:"products",findings:[{text:"Products",kind:"verified",sourceId:source.id,quote:"This quote is invented and does not appear on the page."}]}]});
  const products=result.coverage.find(item=>item.topic==="products");
  assert.equal(products.status,"unavailable");
  assert.match(products.reason,/omitted.*verification/);
});
test("unverified company identity suppresses company-specific findings and explains the conflict",()=>{
  const result=evidenceResearch(lead,[{...source,tracking:["Meta tracking reference"]}],{...proposal,identity:{status:"not_verified",reason:"The page may belong to a similarly named company.",conflicts:["Website branding differs from the CRM company."]},analysis:[{topic:"audience",findings:[{text:"Independent retailers",kind:"verified",sourceId:source.id,quote:"We make scheduling software for independent retailers."}]}],recommendedServices:[{service:"SEO",reason:"SEO may help",sourceId:source.id,quote:"We make scheduling software for independent retailers."}]});
  assert.equal(result.identityAssessment.status,"not_verified");
  assert.equal(result.coverage.find(item=>item.topic==="audience").status,"unavailable");
  assert.equal(result.recommendedServices.length,0);
  assert.ok(result.summary.includes("Identity Not Verified"));
  assert.ok(result.limitations.some(item=>item.includes("Website branding differs")));
  assert.ok(!result.sections.flatMap(section=>section.findings).some(finding=>finding.kind==="verified"));
});
test("tracking references do not establish active ads, and inferred competitors are rejected",()=>{
  const result=evidenceResearch(lead,[{...source,tracking:["Meta tracking reference"]}],{...proposal,analysis:[{topic:"competitors",findings:[{text:"Google competes with this business",kind:"assumption",sourceId:source.id,quote:source.text}]},{topic:"ads",findings:[{text:"Active ads",kind:"verified",sourceId:source.id,quote:"We make scheduling software for independent retailers."}]}]});
  assert.equal(result.coverage.find(item=>item.topic==="ads").status,"unavailable");assert.equal(result.coverage.find(item=>item.topic==="competitors").status,"unavailable");
  assert.ok(result.sections.flatMap(section=>section.findings).some(finding=>finding.text.includes("not proof of advertising")));
  assert.ok(!result.sections.flatMap(section=>section.findings).some(finding=>finding.kind==="verified"&&finding.text.includes("tracking")));
  assert.ok(!result.sections.flatMap(section=>section.findings).some(finding=>finding.text.includes("Google competes")));
});
test("lookalike transparency hosts cannot establish advertising evidence",()=>{
  const fake={...source,url:"https://adstransparency.google.com.evil.example/",text:"This ad is active and was first shown on a public record."};
  const result=evidenceResearch(lead,[fake],{...proposal,analysis:[{topic:"ads",findings:[{text:"Active ads",kind:"verified",sourceId:fake.id,quote:fake.text}]}]});
  assert.equal(result.coverage.find(item=>item.topic==="ads").status,"unavailable");
});

const audienceProposal={...proposal,analysis:[{topic:"audience",findings:[{text:"Independent retailers",kind:"verified",sourceId:source.id,quote:"We make scheduling software for independent retailers."}]}]};
const acceptedReview={identity:proposal.identity,sources:[{sourceId:source.id,relevance:"matched",reason:"The official website describes the intended company."}],findings:[{id:"analysis-0-0",accept:true,reason:"The quote explicitly names the customers and supports the audience topic."}]};

test("separate review keeps correctly grounded findings and preserves source provenance",()=>{
  const reviewed=applyResearchReview(audienceProposal,[source],acceptedReview);
  assert.equal(reviewed.accepted,1);
  const result=evidenceResearch(lead,reviewed.documents,reviewed.proposal);
  const finding=result.coverage.find(item=>item.topic==="audience").findings[0];
  assert.equal(finding.sourceId,source.id);assert.equal(finding.source,source.url);
  assert.match(result.sources[0].reason,/Source relevance: matched/);
});

test("matching quotes on unrelated company pages are rejected even if the reviewer accepts the claim",()=>{
  for(const relevance of ["mismatched","uncertain"]){
    const reviewed=applyResearchReview(audienceProposal,[source],{...acceptedReview,sources:[{sourceId:source.id,relevance,reason:"This source cannot be linked confidently to this company."}]});
    assert.equal(reviewed.accepted,0);assert.equal(reviewed.proposal.analysis[0].findings.length,0);
  }
});

test("a reviewer rejection of the category cannot be bypassed by an exact quote",()=>{
  const reviewed=applyResearchReview(audienceProposal,[source],{...acceptedReview,findings:[{id:"analysis-0-0",accept:false,reason:"The quote does not support the assigned category."}]});
  assert.equal(reviewed.accepted,0);assert.equal(reviewed.rejected,1);
});

test("review response schema requires decisions for every supplied source and candidate",()=>{
  const schema=researchReviewSchemaFor([source],audienceProposal);
  assert.equal(schema.safeParse(acceptedReview).success,true);
  assert.equal(schema.safeParse({...acceptedReview,sources:[],findings:[]}).success,false);
  assert.equal(schema.safeParse({...acceptedReview,findings:[{id:"made-up-id",accept:true,reason:"Unsupported"}]}).success,false);
});

test("research output schema only accepts source IDs that were actually retrieved",()=>{
  const schema=researchFindingSchemaFor([source]);
  assert.equal(schema.safeParse(audienceProposal.analysis[0].findings[0]).success,true);
  assert.equal(schema.safeParse({...audienceProposal.analysis[0].findings[0],sourceId:"synhetics-1"}).success,false);
});

test("review omissions, duplicate decisions, fabricated quotes and missing citations fail closed",()=>{
  for(const review of [
    {...acceptedReview,findings:[]},
    {...acceptedReview,findings:[...acceptedReview.findings,...acceptedReview.findings]},
    {...acceptedReview,sources:[]},
    {...acceptedReview,sources:[...acceptedReview.sources,...acceptedReview.sources]},
  ])assert.equal(applyResearchReview(audienceProposal,[source],review).accepted,0);
  const invented={...audienceProposal,analysis:[{topic:"audience",findings:[{text:"Invented audience",kind:"verified",sourceId:source.id,quote:"A manufactured exact quote about unrelated customers."}]}]};
  assert.equal(applyResearchReview(invented,[source],acceptedReview).accepted,0);
  assert.equal(groundFinding({text:"Could automation help?",kind:"recommendation",sourceId:null,quote:null},[source]),null);
});

test("identity disagreement removes all company claims and recommendations",()=>{
  const withService={...audienceProposal,recommendedServices:[{service:"SEO",reason:"Could retailer-specific content be worth testing?",sourceId:source.id,quote:source.text}]};
  const reviewed=applyResearchReview(withService,[source],{...acceptedReview,identity:{status:"not_verified",reason:"Conflicting company identity",conflicts:["Different company"]}});
  assert.equal(reviewed.accepted,0);
  const result=evidenceResearch(lead,reviewed.documents,reviewed.proposal);
  assert.ok(result.coverage.every(item=>item.status==="unavailable"));assert.equal(result.recommendedServices.length,0);
});

test("source packet includes later search sources with exact separate excerpts within budget",()=>{
  const documents=Array.from({length:10},(_,i)=>({...source,id:`source-${i}`,text:`START-${i} `+"x".repeat(14000)+` END-${i}`}));
  const packet=researchSourcePacket(documents,24000);
  assert.equal(packet.length,10);assert.equal(packet[9].id,"source-9");
  assert.ok(packet.flatMap(item=>item.excerpts).reduce((sum,text)=>sum+text.length,0)<=24000);
  for(const item of packet){assert.ok(item.excerpts.every(excerpt=>documents.find(document=>document.id===item.id).text.includes(excerpt)));assert.ok(item.excerpts[1].includes("END-"));}
});

test("research model selection is isolated and a missing selected-provider key stays unconfigured",()=>{
  const inherited={provider:"groq",model:"openai/gpt-oss-120b"};
  const env={AI_RESEARCH_PROVIDER:"openrouter",AI_RESEARCH_MODEL:"openai/gpt-6.1-sol",GROQ_API_KEY:"synthetic-only"};
  assert.deepEqual(researchModelConfig(env,inherited),{provider:"openrouter",model:"openai/gpt-6.1-sol",configured:false,freeOnly:false});
  assert.deepEqual(researchModelConfig({...env,OPENROUTER_API_KEY:"synthetic-only"},inherited),{provider:"openrouter",model:"openai/gpt-6.1-sol",configured:true,freeOnly:false});
  assert.equal(researchModelConfig({GROQ_API_KEY:"synthetic-only"},inherited).model,inherited.model);
  assert.equal(env.GROQ_API_KEY,"synthetic-only");
  assert.throws(()=>researchModelConfig({AI_RESEARCH_PROVIDER:"invalid"},inherited));
  assert.equal(researchCandidates(audienceProposal)[0].id,"analysis-0-0");
});

test("free research accepts the existing key alias and rejects paid model configuration",()=>{
  const inherited={provider:"groq",model:"openai/gpt-oss-120b"};
  const env={AI_RESEARCH_PROVIDER:"openrouter",AI_RESEARCH_MODEL:"nvidia/nemotron-3.5-super-vl:free",AI_RESEARCH_FREE_ONLY:"true",OPENROUTER_API_KEY1:"synthetic-only"};
  assert.deepEqual(researchModelConfig(env,inherited),{provider:"openrouter",model:env.AI_RESEARCH_MODEL,configured:true,freeOnly:true});
  assert.throws(()=>researchModelConfig({...env,AI_RESEARCH_MODEL:"openai/gpt-6.1-sol"},inherited),/Free-only/);
  assert.deepEqual(researchOpenRouterSettings(true).provider.max_price,{prompt:0,completion:0,request:0});
});

test("verified citations must reference a successfully retrieved source with the same ID and URL",()=>{
  const result=evidenceResearch(lead,[source],audienceProposal);
  const finding=result.coverage.find(item=>item.topic==="audience").findings[0];
  assert.equal(researchCitation(result,finding).id,source.id);
  for(const incomplete of [{...finding,sourceId:undefined},{...finding,evidenceQuote:undefined},{...finding,source:"https://unrelated.example"}])assert.equal(researchCitation(result,incomplete),undefined);
  assert.equal(researchCitation({...result,sources:[{...result.sources[0],status:"unavailable"}]},finding),undefined);
});

test("Firecrawl-only collection never falls back to Tavily or Apify",async(t)=>{
  const oldFirecrawl=process.env.FIRECRAWL_API_KEY,oldTavily=process.env.TAVILY_API_KEY;
  delete process.env.FIRECRAWL_API_KEY;process.env.TAVILY_API_KEY="synthetic-only";
  t.after(()=>{if(oldFirecrawl===undefined)delete process.env.FIRECRAWL_API_KEY;else process.env.FIRECRAWL_API_KEY=oldFirecrawl;if(oldTavily===undefined)delete process.env.TAVILY_API_KEY;else process.env.TAVILY_API_KEY=oldTavily;});
  t.mock.method(globalThis,"fetch",async()=>{throw new Error("No external provider may be called");});
  const result=await collectPublicEvidence({company:"Synthetic",website:"",linkedin:"",instagram:""},undefined,{searchProvider:"firecrawl"});
  assert.equal(result.documents.length,0);assert.ok(result.limitations.some(item=>item.includes("Broader public search was skipped")));
});

test("Firecrawl credit exhaustion appears as a limitation without using another service",async(t)=>{
  const previous=process.env.FIRECRAWL_API_KEY;process.env.FIRECRAWL_API_KEY="synthetic-only";
  t.after(()=>{if(previous===undefined)delete process.env.FIRECRAWL_API_KEY;else process.env.FIRECRAWL_API_KEY=previous;});
  const page="<html><head><title>Synthetic</title></head><body><main><p>"+"Synthetic sells synthetic products to synthetic buyers. ".repeat(40)+"</p></main></body></html>";
  const calls=[];t.mock.method(globalThis,"fetch",async(url)=>{if(!String(url).startsWith("https://api.firecrawl.dev/"))return new Response(page,{headers:{"Content-Type":"text/html"}});calls.push(String(url));return Response.json({error:"No credits"},{status:402});});
  const result=await collectPublicEvidence({company:"Synthetic",website:"https://example.com",linkedin:"",instagram:""},undefined,{searchProvider:"firecrawl"});
  assert.equal(result.documents[0].status,"ok");assert.equal(calls.length,2);assert.ok(calls.every(url=>url.startsWith("https://api.firecrawl.dev/")));
  assert.ok(result.limitations.some(item=>item.includes("credits are exhausted")));
});

test("an unreadable lead website never triggers a search by company name alone",async(t)=>{
  const previous=process.env.FIRECRAWL_API_KEY;process.env.FIRECRAWL_API_KEY="synthetic-only";
  t.after(()=>{if(previous===undefined)delete process.env.FIRECRAWL_API_KEY;else process.env.FIRECRAWL_API_KEY=previous;});
  const calls=[];t.mock.method(globalThis,"fetch",async(url)=>{calls.push(String(url));return Response.json({success:true,data:[{url:"https://unrelated.example/synthetic"}]});});
  const result=await collectPublicEvidence({company:"Synthetic",website:"http://127.0.0.1:3012",linkedin:"",instagram:""},undefined,{searchProvider:"firecrawl"});
  assert.deepEqual(calls,[]);assert.ok(result.documents.every(document=>document.status==="unavailable"));
  assert.ok(result.limitations.some(item=>item.includes("Broader public search was skipped")));
});

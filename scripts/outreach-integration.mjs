import assert from "node:assert/strict";
import {createTestAccount,TestBrowser} from "./reportAuthFixture.mjs";
let account,other;
try{
 account=await createTestAccount();other=await createTestAccount();const a=new TestBrowser(),b=new TestBrowser();await a.signIn(account);await b.signIn(other);
 const initial=await(await a.request("/api/crm/library")).json();let revision=initial.revision;
 const lead={id:"outreach-check",name:"Ada Example",company:"Example Company",email:"ada@example.com",phone:"",jobTitle:"",industry:"Other",companySize:"Unknown",location:"",source:"Website",status:"Qualified",ownerId:account.id,services:[],tags:["test"],notes:"",createdAt:new Date().toISOString()};
 const campaign={id:"campaign-check",name:"Verification campaign",sequenceId:initial.data.sequences[0].id,channel:"Email",ownerId:account.id,createdAt:new Date().toISOString(),status:"Review",recipients:[{leadId:lead.id,state:"drafted",stepIndex:0,draft:"Hi Ada, is a discovery conversation useful for Example Company? Reply stop to opt out."}]};
 const library={...initial.data,leads:[lead],outreach:[campaign],outreachTemplates:[{id:"template",label:"Saved test",template:"Hi {{first_name}}, how can we help {{company}}? Reply stop to opt out."}],suppressions:[]};
 const save=async()=>{const response=await a.request("/api/crm/library",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({revision,operationId:crypto.randomUUID(),data:library})});assert.equal(response.status,200,JSON.stringify(await response.clone().json()));revision=(await response.json()).revision;};await save();
 const approve=(browser=a,origin)=>browser.request("/api/outreach/approve",{method:"POST",headers:{"content-type":"application/json",...(origin?{origin}:{})},body:JSON.stringify({campaignId:campaign.id,leadIds:[lead.id]})});
 assert.equal((await approve(new TestBrowser())).status,401);assert.equal((await approve(b)).status,404);assert.equal((await approve(a,"https://untrusted.example")).status,403);
 const response=await approve();assert.equal(response.status,200);const {approvals}=await response.json();assert.equal(approvals.length,1);assert.match(approvals[0].approvalToken,/^[a-f0-9]{64}$/);
 Object.assign(campaign.recipients[0],approvals[0],{state:"approved"});await save();
 const secondLaptop=new TestBrowser();await secondLaptop.signIn(account);const synced=(await(await secondLaptop.request("/api/crm/library")).json()).data;assert.equal(synced.outreach[0].recipients[0].state,"approved");assert.equal(synced.outreachTemplates[0].id,"template");
 const status=await(await a.request("/api/outreach/status")).json();assert.equal(status.deliveries.length,0);
 if(!status.integration.ready){const send=await a.request("/api/outreach/send",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({campaignId:campaign.id})});assert.equal(send.status,503);assert.equal((await(await a.request("/api/outreach/status")).json()).deliveries.length,0);}
 const foreignDraft=await b.request("/api/ai/draft",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({leadId:lead.id,channel:"Email",kind:"first"})});assert.equal(foreignDraft.status,404);
 const draft=await a.request("/api/ai/draft",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({leadId:lead.id,channel:"Email",kind:"first"})});assert.equal(draft.status,200);const generated=await draft.json();assert.ok(generated.text.normalize("NFKC").replace(/\s+/g," ").includes("Example Company"));assert.match(generated.text,/stop|unsubscribe|opt.out/i);assert.ok(generated.source);
 library.suppressions=[{value:"EXAMPLE.COM",reason:"Test suppression",addedAt:new Date().toISOString()}];campaign.recipients[0].state="drafted";await save();assert.equal((await(await approve()).json()).approvals.length,0);
 const blocked=await a.request("/api/ai/draft",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({leadId:lead.id,channel:"Email",kind:"first"})});assert.equal(blocked.status,409);
 assert.equal((await new TestBrowser().request("/api/outreach/webhook",{method:"POST",headers:{"content-type":"application/json"},body:"{}"})).status,401);
 console.log(`PASS: account isolation, human approval, same-account cross-laptop sync, templates, suppression, signed webhook boundary, AI personalization (${generated.source}) and no simulated delivery. No external messages sent.`);
}finally{if(account)await account.remove();if(other)await other.remove();}

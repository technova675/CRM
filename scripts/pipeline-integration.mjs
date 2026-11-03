import assert from "node:assert/strict";
import {createTestAccount,TestBrowser} from "./reportAuthFixture.mjs";
let account,other;
try{
 account=await createTestAccount();other=await createTestAccount();const a=new TestBrowser(),b=new TestBrowser();await a.signIn(account);await b.signIn(other);
 const initial=await(await a.request("/api/crm/library")).json(),at=new Date().toISOString();
 const lead={id:"pipeline-lead",name:"Ada",company:"Pipeline Example",email:"ada@example.com",phone:"",jobTitle:"",industry:"Other",location:"",companySize:"Unknown",ownerId:account.id,status:"Negotiation",source:"Website",services:["SEO"],tags:[],notes:"",createdAt:at};
 const deal={id:"pipeline-deal",title:"Pipeline Example opportunity",company:lead.company,leadId:lead.id,value:120000,services:["SEO"],probability:80,expectedClose:at,ownerId:account.id,stage:"Won",notes:"Won verification",paymentStatus:"Pending",createdAt:at};
 const operation=crypto.randomUUID(),payload={revision:initial.revision,operationId:operation,data:{...initial.data,leads:[lead],deals:[deal]}};
 const save=(data=payload)=>a.request("/api/crm/library",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(data)});
 const response=await save();assert.equal(response.status,200,JSON.stringify(await response.clone().json()));const saved=await response.json();assert.equal(saved.data.clients.length,1);assert.equal(saved.data.projects.length,1);assert.ok(saved.data.clients[0].onboarding.every(s=>s.done===false));assert.ok(saved.data.tasks.length);assert.equal(saved.data.approvals[0].status,"pending");const clientId=saved.data.clients[0].id;
 const retry=await save();assert.equal(retry.status,200);const retried=await retry.json();assert.equal(retried.revision,saved.revision);assert.equal(retried.data.clients[0].id,clientId);
 const laptop=new TestBrowser();await laptop.signIn(account);const shared=await(await laptop.request("/api/crm/library")).json();assert.equal(shared.data.clients[0].id,clientId);assert.ok(shared.data.tasks.every(t=>t.assigneeId===account.id));assert.equal((await(await b.request("/api/crm/library")).json()).data.clients.length,0);
 shared.data.clients[0].onboarding[0].done=true;shared.data.clients[0].onboarding[0].doneAt=at;
 const repeat=await save({revision:shared.revision,operationId:crypto.randomUUID(),data:shared.data});assert.equal(repeat.status,200);const final=await(await a.request("/api/crm/library")).json();assert.equal(final.data.clients.length,1);assert.equal(final.data.projects.length,1);assert.equal(final.data.clients[0].onboarding[0].done,true);
 const invalid=await save({revision:final.revision,operationId:crypto.randomUUID(),data:{...final.data,deals:[{...final.data.deals[0],value:-1}]}});assert.equal(invalid.status,400);
 const legacy=structuredClone(final.data);for(const key of ["clients","tasks","projects","knowledge","approvals","proposals","meetings","onboardingTemplates"])delete legacy[key];
 const legacySave=await save({revision:final.revision,operationId:crypto.randomUUID(),data:legacy});assert.equal(legacySave.status,200);const preserved=await(await a.request("/api/crm/library")).json();assert.equal(preserved.data.clients[0].id,clientId);assert.equal(preserved.data.clients[0].onboarding[0].done,true);
 console.log("PASS: server-side Won onboarding, persisted client/checklist/tasks/project/review, retry-safe conversion, cross-laptop sharing, account isolation, preserved checklist progress and deal validation. No messages sent.");
}finally{if(account)await account.remove();if(other)await other.remove();}

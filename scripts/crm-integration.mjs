import assert from "node:assert/strict";
import {createTestAccount,TestBrowser} from "./reportAuthFixture.mjs";
let owner,other;
try{
  owner=await createTestAccount();other=await createTestAccount();
  const a=new TestBrowser(),b=new TestBrowser(),c=new TestBrowser();await a.signIn(owner);await b.signIn(owner);await c.signIn(other);
  const endpoint="/api/crm/library";
  assert.equal((await new TestBrowser().request(endpoint)).status,401);
  const initial=await(await a.request(endpoint)).json();assert.equal(initial.revision,0);assert.deepEqual(initial.data.leads,[]);
  const lead={id:`l_${crypto.randomUUID()}`,name:"CRM verification",company:"Account test",website:"https://example.com",email:"crm-test@example.com",phone:"+919876543210",linkedin:"https://linkedin.com/company/example",instagram:"@example",industry:"SaaS",location:"Mumbai",companySize:"11-50",source:"Referral",services:["SEO"],ownerId:owner.id,status:"Replied",notes:"Persist across laptops",communicationHistory:"Introductory call completed",dealValue:0,tags:["priority"],jobTitle:"Founder",createdAt:new Date().toISOString(),score:{value:75,factors:[],scoredAt:new Date().toISOString()},research:{status:"done",summary:"Imported research context",sections:[],recommendedServices:[]},customFields:{budget:"10000"}};
  const data={...initial.data,leads:[lead],customFields:[{key:"budget",label:"Budget",type:"number"}],savedViews:[{id:"saved",name:"Replied leads",module:"leads",filters:{status:"Replied"},ownerId:owner.id,shared:true}]};
  const operationId=crypto.randomUUID();
  const save=(browser,revision,snapshot=data,operation=operationId,headers={})=>browser.request(endpoint,{method:"PUT",headers:{"content-type":"application/json",...headers},body:JSON.stringify({revision,operationId:operation,data:snapshot})});
  const first=await save(a,0);assert.equal(first.status,200,JSON.stringify(await first.clone().json()));assert.equal((await first.json()).revision,1);
  assert.equal((await save(a,0)).status,200,"retry is idempotent");
  const shared=await(await b.request(endpoint)).json();assert.deepEqual(shared.data.leads,[lead]);assert.equal(shared.data.savedViews[0].name,"Replied leads");assert.equal(shared.data.customFields[0].key,"budget");
  assert.deepEqual((await(await c.request(endpoint)).json()).data.leads,[],"another account cannot see these records");
  const changed={...shared.data,leads:[{...lead,status:"Negotiation"}]};assert.equal((await save(b,1,changed,crypto.randomUUID())).status,200);
  assert.equal((await save(a,1,data,crypto.randomUUID())).status,409,"a stale laptop cannot overwrite a newer save");
  assert.equal((await save(a,2,data,crypto.randomUUID(),{origin:"https://untrusted.example"})).status,403);
  assert.equal((await save(a,2,{...data,leads:[{...lead,status:"Invalid"}]},crypto.randomUUID())).status,400);
  assert.equal((await save(a,2,{...changed,leads:[]},crypto.randomUUID())).status,200);
  assert.deepEqual((await(await b.request(endpoint)).json()).data.leads,[]);
  console.log("PASS: complete lead profile, same-login sharing, account isolation, saved views, custom fields, idempotent save, conflict protection, validation and deletion.");
}finally{if(owner)await owner.remove();if(other)await other.remove();}

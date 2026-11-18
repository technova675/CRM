// Two devices on one login: AI usage on one must never look like a conflicting edit on the other.
import assert from "node:assert/strict";
import {createTestAccount,TestBrowser} from "./reportAuthFixture.mjs";
let account;
try{
  account=await createTestAccount();
  const laptop=new TestBrowser(),phone=new TestBrowser();await laptop.signIn(account);await phone.signIn(account);
  const read=async device=>(await device.request("/api/crm/library")).json();
  const put=(device,revision,data)=>device.request("/api/crm/library",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({revision,operationId:crypto.randomUUID(),data})});
  const lead=(id,name)=>({id,name,company:"Example Company",email:`${id}@example.com`,phone:"",jobTitle:"",industry:"Other",companySize:"Unknown",location:"",source:"Website",status:"Qualified",ownerId:account.id,services:[],tags:[],notes:"",createdAt:new Date().toISOString()});
  const initial=await read(laptop);
  const first=await put(laptop,initial.revision,{...initial.data,leads:[lead("device-a","Ada Example"),lead("device-b","Ben Example")]});
  assert.equal(first.status,200,await first.clone().text());
  const onPhone=await read(phone);assert.equal(onPhone.data.leads.length,2);

  // Laptop uses AI. The phone still holds the revision it loaded before that.
  const draft=await laptop.request("/api/ai/draft",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({leadId:"device-a",channel:"Email",kind:"first"})});
  assert.equal(draft.status,200,await draft.clone().text());
  assert.equal((await read(laptop)).revision,onPhone.revision,"An AI call must not change the CRM revision. Apply supabase/migrations/202611010010_tenant_usage.sql.");

  // Phone edits a different lead with its earlier revision: accepted, no false conflict.
  onPhone.data.leads.find(item=>item.id==="device-b").notes="Edited on the phone";
  const second=await put(phone,onPhone.revision,onPhone.data);
  assert.equal(second.status,200,await second.clone().text());

  // A genuinely stale save from the laptop is still refused, so real conflicts stay protected.
  const stale=structuredClone(onPhone.data);stale.leads.find(item=>item.id==="device-a").notes="Stale laptop edit";
  assert.equal((await put(laptop,onPhone.revision,stale)).status,409);
  const final=await read(laptop);
  assert.equal(final.data.leads.find(item=>item.id==="device-b").notes,"Edited on the phone");
  assert.equal(final.data.leads.find(item=>item.id==="device-a").notes,"");

  // The AI credit was still counted.
  const usage=await(await laptop.request("/api/tenant")).json();assert.ok(usage.usage.aiCredits>=1,JSON.stringify(usage.usage));
  console.log("PASS: AI usage on one device leaves the CRM revision unchanged, the other device saves without a false conflict, real stale saves are still refused, and credits are counted.");
}finally{await account?.remove();}

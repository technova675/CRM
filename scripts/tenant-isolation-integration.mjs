import assert from "node:assert/strict";
import { campaignBrowser } from "./campaignBrowser.mjs";
import { createTestAccount, TestBrowser } from "./reportAuthFixture.mjs";

const a=new TestBrowser(),b=new TestBrowser();
const tenant="/api/tenant",crm="/api/crm/library";
const read=async (client,path)=>(await client.request(path)).json();
const post=(client,path,data,method="POST",headers={})=>client.request(path,{method,headers:{"Content-Type":"application/json",...headers},body:JSON.stringify(data)});
const ok=async response=>{
  assert.equal(response.status,200,await response.clone().text());
  return response.json();
};
let owner,other,browser;
try{
  owner=await createTestAccount();
  other=await createTestAccount();
  await Promise.all([a.signIn(owner),b.signIn(other)]);
  assert.equal((await new TestBrowser().request(tenant)).status,401);
  const original=await read(a,tenant);
  assert.equal(original.plan,"Starter");
  assert.equal(original.usage.teamMembers,1);
  assert.notEqual(original.id,(await read(b,tenant)).id);
  await ok(await post(a,tenant,{action:"profile",name:"Synthetic Organization A",billingEmail:"billing-a@example.com",plan:"Enterprise",workspaceId:(await read(b,tenant)).id}));
  assert.equal((await read(a,tenant)).plan,"Starter");
  assert.equal((await read(a,tenant)).name,"Synthetic Organization A");
  assert.notEqual((await read(b,tenant)).name,"Synthetic Organization A");
  const initial=await read(a,crm);
  const client={company:"Synthetic tenant client",industry:"Design",location:"Pune",contacts:[],services:[],retainer:0,contractStart:"",contractEnd:"",accountManagerId:owner.id,health:"Healthy",onboarding:[],createdAt:new Date().toISOString(),documents:[]};
  initial.data.clients=Array.from({length:5},(_,index)=>({...client,id:"tenant-client-"+index}));
  await ok(await post(a,crm,{...initial,operationId:crypto.randomUUID()},"PUT"));
  const atLimit=await read(a,crm);
  atLimit.data.clients.push({...client,id:"tenant-client-over-limit"});
  atLimit.data.tenantProfile={basePlan:"Enterprise",name:"Forged",billingEmail:"x@example.com"};
  atLimit.data.tenantMeter={period:"2099-01",videoMinutes:-9999,aiCredits:-9999};
  const denied=await post(a,crm,{...atLimit,operationId:crypto.randomUUID()},"PUT");
  assert.equal(denied.status,429,await denied.clone().text());
  assert.equal((await denied.json()).resource,"clients");
  assert.equal((await post(a,crm,{...atLimit,operationId:crypto.randomUUID()},"PUT",{"x-workspace-account":other.id})).status,403);
  assert.equal((await read(b,crm)).data.clients.length,0);
  const attempts=await Promise.all([post(a,tenant,{action:"videoDraft",minutes:20}),post(a,tenant,{action:"videoDraft",minutes:20})]);
  assert.deepEqual(attempts.map(response=>response.status).sort(),[200,429]);
  assert.equal((await read(a,tenant)).usage.videoMinutes,20);
  assert.equal((await read(b,tenant)).usage.videoMinutes,0);
  assert.equal((await read(a,tenant)).usage.clients,5);

  browser=await campaignBrowser();
  await browser.command("Network.enable");
  const select=async api=>{
    await browser.command("Network.clearBrowserCookies");
    await browser.command("Network.setCookies",{cookies:[...api.cookies].map(([name,value])=>({name,value,url:api.base}))});
    await browser.command("Page.navigate",{url:api.base+"/settings?tab=plan"});
    await browser.wait('document.body.innerText.includes("Usage and limits")');
  };
  await select(a);
  assert.ok(await browser.evaluate('Array.from(document.querySelectorAll("input")).some(input=>input.value==="Synthetic Organization A")'),await browser.evaluate('document.body.innerText'));
  const keyA=JSON.stringify("adbibe-os-v3:"+owner.id),keyB=JSON.stringify("adbibe-os-v3:"+other.id);
  await browser.wait('localStorage.getItem('+keyA+')');
  await browser.evaluate('(()=>{const key='+keyA+',v=JSON.parse(localStorage.getItem(key));v.state.threads=[{id:"synthetic-tenant-thread",ownerId:'+JSON.stringify(owner.id)+',title:"Private synthetic draft",messages:[],createdAt:new Date().toISOString()}];localStorage.setItem(key,JSON.stringify(v));})()');
  await select(b);
  await browser.wait('localStorage.getItem('+keyB+')');
  assert.equal(await browser.evaluate('JSON.parse(localStorage.getItem('+keyB+')).state.threads.some(thread=>thread.id==="synthetic-tenant-thread")'),false);
  assert.equal(await browser.evaluate('JSON.parse(localStorage.getItem('+keyA+')).state.threads.some(thread=>thread.id==="synthetic-tenant-thread")'),true);
  console.log("PASS: distinct organizations, profile isolation, protected plan, quota enforcement, concurrent usage reservations and browser-cache separation.");
}finally{
  try{await browser?.close();}finally{await Promise.all([owner?.remove(),other?.remove()]);}
}

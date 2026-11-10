import assert from "node:assert/strict";
import { campaignBrowser } from "./campaignBrowser.mjs";
import { createTestAccount, TestBrowser } from "./reportAuthFixture.mjs";

const staff=new TestBrowser(),other=new TestBrowser();
const crm="/api/crm/library";
const audit="/api/audit";
const read=async(api,path)=>(await api.request(path)).json();
const send=(path,body,method="POST")=>staff.request(path,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
async function ok(response,status=200){assert.equal(response.status,status,await response.clone().text());return response.json();}
let owner,outsider,browser;
try{
  owner=await createTestAccount();
  outsider=await createTestAccount();
  await Promise.all([staff.signIn(owner),other.signIn(outsider)]);
  assert.equal((await new TestBrowser().request(audit)).status,401);
  let initial=await read(staff,crm);
  const at=new Date().toISOString(),clientId="audit-synthetic-client",secondId="audit-other-client";
  const client={industry:"Design",location:"Pune",contacts:[],services:[],retainer:0,contractStart:"",contractEnd:"",accountManagerId:owner.id,health:"Healthy",onboarding:[],createdAt:at,documents:[]};
  initial.data.clients=[{...client,id:clientId,company:"Synthetic Audit Studio"},{...client,id:secondId,company:"Other Audit Studio"}];
  const campaignId="audit-synthetic-campaign";
  initial.data.campaigns=[{id:campaignId,clientId,name:"Synthetic Audit Launch",service:"Meta Ads",platform:"Meta Ads",objective:"Awareness",budget:1000,startDate:at,endDate:new Date(Date.now()+86400000).toISOString(),teamIds:[owner.id],status:"Planning",kpis:[],metrics:[],influencerIds:[],createdAt:at}];
  await ok(await send(crm,{...initial,operationId:crypto.randomUUID()},"PUT"));
  initial=await read(staff,crm);
  initial.data.campaigns[0].budget=1700;
  initial.data.clients[0].health="At Risk";
  initial.data.auditEvents=[{id:"spoofed-audit-id",at,actor:"api",entity:"campaign",action:"Forged audit entry"}];
  await ok(await send(crm,{...initial,operationId:crypto.randomUUID()},"PUT"));

  await ok(await send("/api/ai/creative-strategy",{
    operationId:crypto.randomUUID(),clientId,inputs:{brand:"Synthetic Audit Studio",product:"Example bag",audience:"Test audience",offer:"",platform:"Instagram",objective:"Show the bag",existing:""},
    existingCreativeIds:[],kinds:["Static"],count:1,mode:"structured",
  }));
  const pending=(await read(staff,"/api/approvals")).concepts[0];
  await ok(await send("/api/approvals",{action:"approve",kind:"concept",id:pending.id,version:pending.version}));
  const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const filtered=await read(staff,audit+"?client="+clientId+"&from="+day+"&to="+day);
  assert.ok(filtered.rows.every(row=>row.clientId===clientId));
  assert.ok(filtered.rows.some(row=>row.action==="Updated campaign"&&row.before.includes("1000")&&row.after.includes("1700")&&row.person));
  assert.ok(filtered.rows.some(row=>row.action==="Updated client"&&row.before.includes("Healthy")&&row.after.includes("At Risk")));
  assert.ok(!filtered.rows.some(row=>row.action==="Forged audit entry"));
  assert.equal((await read(other,audit)).total,0);
  assert.equal((await read(staff,audit+"?from=2099-01-01")).total,0);
  const exported=await read(staff,audit+"?client="+clientId+"&entity=campaign&changes=1&export=1");
  assert.ok(exported.rows.length>0&&exported.rows.length===exported.total&&exported.rows.every(row=>row.entity==="campaign"&&(row.before!==undefined||row.after!==undefined)));
  const creative=await read(staff,audit+"?agent=creative&client="+clientId);
  assert.ok(creative.rows.some(row=>row.actor==="api"&&row.sources.includes("Submitted creative brief")));
  assert.ok(creative.rows.some(row=>row.action==="Approved creative concept"&&row.approvedBy===owner.id&&row.approver&&row.outcome==="Approved"));

  browser=await campaignBrowser();
  await browser.command("Network.enable");
  await browser.command("Network.setCookies",{cookies:[...staff.cookies].map(([name,value])=>({name,value,url:staff.base}))});
  await browser.command("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await browser.command("Page.navigate",{url:staff.base+"/audit"});
  await browser.wait('document.body.innerText.includes("Approved creative concept")');
  const labels=await browser.evaluate('Array.from(document.querySelectorAll("nav[aria-label=\'Primary navigation\'] section > ul a")).map(link=>link.innerText.trim())');
  assert.deepEqual(labels,["Command Center","Dashboard","CRM","Sales","Clients","Strategy","Campaigns","Creative","AI Video","Social","Influencers","SEO","Analytics","Reports","Tasks","Finance","Automations","Integrations","Settings"]);
  await browser.fill("Agent","creative");
  await browser.fill("Client",clientId);
  await browser.fill("From date",day);
  await browser.fill("To date",day);
  await browser.evaluate('Array.from(document.querySelectorAll("button")).find(button=>button.innerText==="Apply filters").click()');
  await browser.wait('document.body.innerText.includes("Approved creative concept") && !document.body.innerText.includes("Updated campaign")');
  await browser.evaluate('Array.from(document.querySelectorAll("button")).find(button=>button.innerText==="Approved creative concept").click()');
  await browser.wait('document.body.innerText.includes("Current saved creative concept") && document.body.innerText.includes("Approved by")');
  await browser.command("Emulation.setDeviceMetricsOverride",{width:375,height:812,deviceScaleFactor:1,mobile:true});
  assert.equal(await browser.evaluate("document.documentElement.scrollWidth<=innerWidth"),true);
  console.log("PASS: audit isolation, immutable server entries, client and campaign deltas, agent/client/date filters, sources, approval identity, primary navigation and mobile width.");
}finally{
  try{await browser?.close();}finally{await Promise.all([owner?.remove(),outsider?.remove()]);}
}

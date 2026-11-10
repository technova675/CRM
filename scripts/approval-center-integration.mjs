import assert from "node:assert/strict";
import { campaignBrowser } from "./campaignBrowser.mjs";
import { createTestAccount, TestBrowser } from "./reportAuthFixture.mjs";

const staff=new TestBrowser(), same=new TestBrowser();
const path="/api/approvals";
const get=async(api,endpoint=path)=>(await api.request(endpoint)).json();
const send=(endpoint,body,method="POST")=>staff.request(endpoint,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
const success=async(response,status=200)=>{
  assert.equal(response.status,status,await response.clone().text());
  return response.json();
};
let account,browser;
try{
  account=await createTestAccount();
  await Promise.all([staff.signIn(account),same.signIn(account)]);
  assert.equal((await new TestBrowser().request(path)).status,401);
  const initial=await get(staff,"/api/crm/library");
  const clientId="approval-synthetic-client";
  initial.data.clients=[{id:clientId,company:"Synthetic Approval Studio",industry:"Design",location:"Pune",contacts:[],services:[],retainer:0,contractStart:"",contractEnd:"",accountManagerId:account.id,health:"Healthy",onboarding:[],createdAt:new Date().toISOString(),documents:[]}];
  initial.data.invoices=[{id:"approval-invoice",number:"TEST-APPROVAL",clientId,amount:1000,paid:0,issuedAt:"2026-10-01",dueDate:"2026-10-15",status:"Overdue",description:"Synthetic fixture",remindersSent:0}];
  await success(await send("/api/crm/library",{...initial,operationId:crypto.randomUUID()},"PUT"));
  const policy=(await get(staff)).policy;
  assert.equal(policy.modes["Creative generation"],"Approval Required");
  assert.equal(policy.modes["Campaign changes"],"Approval Required");
  assert.equal(policy.modes["Task creation"],"Automatic");
  const draft=(count)=>send("/api/ai/creative-strategy",{
    operationId:crypto.randomUUID(),clientId,inputs:{brand:"Synthetic Approval Studio",product:"Example tote bag",audience:"Test audience",offer:"",platform:"Instagram",objective:"Demonstrate the bag",existing:""},
    existingCreativeIds:[],kinds:["Static"],count,mode:"structured",
  });
  const created=await success(await draft(2));
  const pending=(await get(same)).concepts;
  assert.equal(pending.length,2);
  const approve=pending.find(item=>item.id===created.conceptIds[0]);
  const reject=pending.find(item=>item.id===created.conceptIds[1]);
  assert.equal((await send(path,{action:"approve",kind:"concept",id:approve.id,version:"0".repeat(64)})).status,409);
  const direct=await get(staff,"/api/crm/library");
  direct.data.concepts.find(c=>c.id===approve.id).reviewedAt=new Date().toISOString();
  direct.data.concepts.find(c=>c.id===approve.id).reviewedBy=account.id;
  assert.equal((await send("/api/crm/library",{...direct,operationId:crypto.randomUUID()},"PUT")).status,409);
  await success(await send(path,{action:"approve",kind:"concept",id:approve.id,version:approve.version}));
  assert.equal((await send(path,{action:"reject",kind:"concept",id:approve.id,version:approve.version})).status,409);

  browser=await campaignBrowser();
  await browser.command("Network.enable");
  await browser.command("Network.setCookies",{cookies:[...staff.cookies].map(([name,value])=>({name,value,url:staff.base}))});
  await browser.command("Page.navigate",{url:staff.base+"/approvals"});
  await browser.wait('document.body.innerText.includes('+JSON.stringify(reject.title)+')');
  await browser.evaluate('Array.from(document.querySelectorAll("button")).find(button=>button.innerText.includes('+JSON.stringify(reject.title)+')).click()');
  await browser.wait('Array.from(document.querySelectorAll("button")).some(button=>button.innerText==="Reject")');
  await browser.evaluate('Array.from(document.querySelectorAll("button")).find(button=>button.innerText==="Reject").click()');
  await browser.wait('document.body.innerText.includes("Rejection saved.")');
  assert.equal((await get(same)).concepts.length,0);
  await browser.evaluate('Array.from(document.querySelectorAll("button")).find(button=>button.innerText==="Audit history").click()');
  await browser.wait('document.body.innerText.includes("Rejected creative concept") && document.body.innerText.includes("Approved creative concept")');

  await browser.command("Page.navigate",{url:staff.base+"/settings?tab=ai"});
  await browser.wait('Array.from(document.querySelectorAll("[role=radiogroup]")).some(group=>group.getAttribute("aria-label")==="Creative generation mode")');
  await browser.evaluate('Array.from(document.querySelectorAll("[role=radiogroup]")).find(group=>group.getAttribute("aria-label")==="Creative generation mode").querySelectorAll("button")[2].click()');
  await browser.wait('fetch("/api/approvals").then(r=>r.json()).then(data=>data.policy.modes["Creative generation"]==="Automatic")');
  assert.equal((await get(same)).policy.modes["Creative generation"],"Automatic");
  const automatic=await success(await draft(1));
  const after=await get(same,"/api/crm/library");
  assert.ok(after.data.concepts.find(c=>c.id===automatic.conceptIds[0])?.reviewedAt);
  assert.ok(after.data.activities.some(a=>a.action==="Changed AI approval policy"));
  assert.ok(after.data.activities.some(a=>a.action==="Automatically released creative concepts"));
  const flowId=crypto.randomUUID();
  const automation=(action,data,runId,operationId=crypto.randomUUID())=>send("/api/automations",{action,data,workflowId:action==="save"?undefined:flowId,runId,operationId});
  await success(await automation("save",{name:"Synthetic task policy check",description:"",entity:"invoice",clientId,nodes:[
    {id:"trigger",type:"Trigger",operation:"manual",label:"Manual trigger",config:{}},
    {id:"task",type:"Action",operation:"create_task",label:"Synthetic workflow task",config:{}},
  ]},undefined,flowId));
  await success(await automation("toggle",{enabled:true}));
  for(const mode of ["Manual","Approval Required","Automatic"]){
    const previous=(await get(same)).policy;
    await success(await send(path,{action:"policy",...previous,modes:{...previous.modes,"Task creation":mode},expected:previous}));
    const run=await success(await automation("enqueue",{entityId:"approval-invoice"}));
    await success(await automation("step",undefined,run.runId));
    await success(await automation("step",undefined,run.runId));
    const state=(await get(same,"/api/crm/library")).data;
    const id="wf-task-"+run.runId+"-task";
    const task=state.tasks.find(item=>item.id===id);
    if(mode==="Manual")assert.equal(task,undefined);
    else assert.equal(task?.status,mode==="Automatic"?"Todo":"Blocked");
    if(mode==="Approval Required")assert.ok(state.approvals.some(item=>item.ref?.id===id&&item.status==="pending"));
  }
  console.log("PASS: cross-session policy, stale and duplicate rejection, queue decisions, audit history, automatic creative release and all three workflow task modes.");
}finally{
  try{await browser?.close();}finally{await account?.remove();}
}

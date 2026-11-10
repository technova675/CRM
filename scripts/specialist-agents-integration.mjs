import assert from "node:assert/strict";
import { campaignBrowser } from "./campaignBrowser.mjs";
import { createTestAccount, TestBrowser } from "./reportAuthFixture.mjs";

const staff = new TestBrowser();
const post = (api,path,body,headers={})=>api.request(path,{method:"POST",headers:{"Content-Type":"application/json",...headers},body:JSON.stringify(body)});
const endpoint="/api/ai/agent";
let account,browser;
try {
  assert.equal((await post(new TestBrowser(),endpoint,{agent:"creative",task:"Review a headline"})).status,401);
  account=await createTestAccount();
  await staff.signIn(account);
  const initial=await(await staff.request("/api/crm/library")).json();
  const at=new Date().toISOString();
  const base={industry:"Design",location:"Pune",contacts:[],services:[],retainer:0,contractStart:"",contractEnd:"",accountManagerId:account.id,health:"Healthy",onboarding:[],createdAt:at,documents:[]};
  const alpha="synthetic-agent-alpha",beta="synthetic-agent-beta";
  initial.data.clients=[{...base,id:alpha,company:"Synthetic Alpha"},{...base,id:beta,company:"Synthetic Beta"}];
  const memory={brandVoice:"Plain language",toneWords:[],products:[],audience:"",competitors:[],rejectedConcepts:[],preferences:[],guidelines:"",history:[],updatedAt:at};
  initial.data.knowledge=[
    {...memory,id:alpha,clientId:alpha,approvedMessaging:["Copper Orchard"]},
    {...memory,id:beta,clientId:beta,approvedMessaging:["Silver Pine"]},
  ];
  const saved=await staff.request("/api/crm/library",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({...initial,operationId:crypto.randomUUID()})});
  assert.equal(saved.status,200,await saved.clone().text());
  const task="What is the exact approved messaging for the selected client? Include it in your summary and cite Approved messaging as a data insight.";
  assert.equal((await post(staff,endpoint,{agent:"creative",task,clientId:"foreign-client"})).status,404);
  assert.equal((await post(staff,endpoint,{agent:"creative",task,clientId:alpha},{origin:"https://unrelated.example"})).status,403);
  const result=await post(staff,endpoint,{agent:"creative",clientId:alpha,task,knowledge:initial.data.knowledge[1],context:{company:"Synthetic Beta",approved:"Silver Pine"}});
  assert.equal(result.status,200,await result.clone().text());
  const answer=await result.json();
  assert.equal(answer.agent,"creative");
  assert.equal(answer.workspace,"/creative");
  assert.match(JSON.stringify(answer),/Copper Orchard/i);
  assert.doesNotMatch(JSON.stringify(answer),/Silver Pine|Synthetic Beta/i);
  assert.ok(answer.insights.some(item=>item.kind==="data"&&item.source==="Approved messaging"));
  const audit=(await(await staff.request("/api/audit?agent=creative&client="+alpha+"&actor=ai")).json()).rows;
  assert.ok(audit.some(entry=>entry.origin==="server"&&entry.action==="Answered specialist request"&&entry.sources.includes("Approved messaging")&&entry.outcome==="Answer generated"));
  assert.ok(audit.every(entry=>entry.clientId===alpha&&entry.sources.every(source=>!source.includes("Silver Pine"))));
  const tenant=await(await staff.request("/api/tenant")).json();
  assert.equal(tenant.usage.aiCredits,1);

  browser=await campaignBrowser();
  await browser.command("Network.enable");
  await browser.command("Network.setCookies",{cookies:[...staff.cookies].map(([name,value])=>({name,value,url:staff.base}))});
  await browser.command("Page.navigate",{url:staff.base+"/command?tab=agents"});
  await browser.wait('Array.from(document.querySelectorAll("a")).filter(link=>link.textContent.trim()==="Open workspace").length===12');
  assert.equal(await browser.evaluate('Array.from(document.querySelectorAll("button")).filter(button=>button.textContent.trim()==="Ask this agent").length'),12);
  await browser.command("Page.navigate",{url:staff.base+"/command?agent=finance&client="+alpha});
  await browser.wait('document.querySelector("[aria-label=Agent]")?.value==="finance"');
  console.log("PASS: twelve specialist workspaces, pinned agent, authentication, origin checks, client isolation and cited saved memory.");
} finally {
  try{await browser?.close();}finally{await account?.remove();}
}

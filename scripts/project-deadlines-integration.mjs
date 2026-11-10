import assert from "node:assert/strict";
import {createTestAccount,TestBrowser} from "./reportAuthFixture.mjs";
import {campaignBrowser} from "./campaignBrowser.mjs";
import {deadlineDay,offsetDeadlineDay} from "../lib/domain/projectTasks.ts";

let account,browser;
try {
  account=await createTestAccount();
  const api=new TestBrowser();
  await api.signIn(account);
  const path="/api/crm/library";
  const read=async()=>(await(await api.request(path)).json());
  const library=await read(), today=deadlineDay(Date.now()), yesterday=offsetDeadlineDay(today,-1);
  const deadline=day=>new Date(day+"T18:00:00+05:30").toISOString();
  const at=new Date().toISOString();
  library.data.clients=[{id:"client",company:"Deadline verification",industry:"Technology",location:"Pune",contacts:[],services:["SEO"],retainer:0,contractStart:"",contractEnd:"",accountManagerId:account.id,health:"Healthy",onboarding:[],createdAt:at,documents:[]}];
  library.data.projects=[{id:"test-project",name:"Launch project",clientId:"client",ownerId:account.id,status:"Active",startDate:deadline(yesterday),dueDate:deadline(today),createdAt:at}];
  const task={id:"overdue-task",title:"Review dependency",description:"",projectId:"test-project",assigneeId:account.id,priority:"High",status:"Blocked",dueDate:deadline(yesterday),createdAt:at,createdBy:"human"};
  library.data.tasks=[task,{...task,id:"today-task",title:"Publish checklist",status:"Todo",dueDate:deadline(today)}];
  const result=await api.request(path,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({...library,operationId:crypto.randomUUID()})});
  assert.equal(result.status,200,await result.clone().text());

  browser=await campaignBrowser();
  await browser.command("Network.enable");
  await browser.command("Network.setCookies",{cookies:[...api.cookies].map(([name,value])=>({name,value,url:api.base}))});
  await browser.command("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await browser.command("Page.navigate",{url:api.base+"/tasks?tab=projects"});
  await browser.wait('document.body.innerText.includes("Launch project")',60000);
  await browser.click("Milestones (0/0)");
  await browser.wait('document.body.innerText.includes("Milestones · Launch project")');
  await browser.fill("Milestone title","Approve launch");
  await browser.fill("Milestone deadline",yesterday);
  await browser.click("Add milestone");
  await browser.wait('document.body.innerText.includes("Approve launch")');
  await browser.wait('document.body.innerText.includes("CRM saved to your account")');
  const saved=await read();
  assert.equal(saved.data.projects[0].milestones[0].title,"Approve launch");
  const tab=async name=>{
    await browser.evaluate('Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==='+JSON.stringify(name)+').click()');
  };
  await browser.evaluate(`document.querySelector('[aria-label="Notifications"]').click()`);
  await browser.wait('document.body.innerText.includes("2 overdue deadlines assigned to you")');
  await browser.click("2 overdue deadlines assigned to you");
  await browser.wait('document.body.innerText.includes("Past due") && document.body.innerText.includes("Approve launch") && document.body.innerText.includes("Review dependency")');
  assert.equal(await browser.evaluate('document.body.innerText.includes("Publish checklist")'),false);
  await browser.click("Open milestone");
  await browser.wait('document.body.innerText.includes("Milestones · Launch project")');
  await browser.click("Mark complete");
  await browser.wait('document.body.innerText.includes("1 of 1 complete")');
  await tab("Calendar");
  await browser.wait('document.body.innerText.includes("Month agenda") && document.body.innerText.includes("Publish checklist")');
  await browser.click("Today");
  await browser.wait('document.body.innerText.includes("Agenda · '+today+'")');
  await browser.command("Emulation.setDeviceMetricsOverride",{width:375,height:812,deviceScaleFactor:1,mobile:true});
  assert.equal(await browser.evaluate("document.documentElement.scrollWidth<=innerWidth"),true);
  await tab("Team workload");
  await browser.wait('document.body.innerText.includes("Estimated load") && document.body.innerText.includes("4h / 40h")');
  assert.equal(await browser.evaluate("document.documentElement.scrollWidth<=innerWidth"),true);
  const dueOnly=await browser.evaluate('Array.from(document.querySelector("tbody tr").cells).slice(-4,-1).map(cell=>cell.textContent.trim())');
  assert.deepEqual(dueOnly,["1","1","1"]);
  console.log("PASS: persisted milestones, calendar, overdue reminders, workload counts and mobile layout.");
} finally {
  await browser?.close();
  if(account)await account.remove();
}

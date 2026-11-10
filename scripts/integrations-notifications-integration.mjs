import assert from "node:assert/strict";
import { campaignBrowser } from "./campaignBrowser.mjs";
import { createTestAccount, TestBrowser } from "./reportAuthFixture.mjs";

const first = new TestBrowser();
const same = new TestBrowser();
const media = "/api/media/sync";
const crm = "/api/crm/library";
const request = (api,path,method,body)=>api.request(path,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
const read = async (api,path=crm)=> (await api.request(path)).json();
let account,browser;
try{
  account = await createTestAccount();
  await Promise.all([first.signIn(account),same.signIn(account)]);
  assert.equal((await read(first,"/api/media/platforms")).configured,false,"This test requires an unconfigured connector.");
  const initial = await read(first);
  const at = new Date().toISOString();
  initial.data.clients = [{id:"synthetic-client",company:"Synthetic Media Client",industry:"Other",location:"Pune",contacts:[],services:["Meta Ads"],retainer:0,contractStart:"",contractEnd:"",accountManagerId:account.id,health:"Healthy",onboarding:[],createdAt:at,documents:[]}];
  initial.data.campaigns = [{id:"synthetic-campaign",clientId:"synthetic-client",name:"Synthetic Launch",service:"Meta Ads",platform:"Meta Ads",adAccountId:"synthetic-platform-id",objective:"Awareness",budget:0,startDate:at,endDate:new Date(Date.now()+30*86400000).toISOString(),teamIds:[account.id],status:"Planning",kpis:[],metrics:[],influencerIds:[],createdAt:at}];
  initial.data.tasks = [{id:"synthetic-task",title:"Prepare synthetic launch",description:"Synthetic fixture",assigneeId:account.id,priority:"Medium",dueDate:at,status:"Todo",createdAt:at,createdBy:"human"}];
  const saved = await request(first,crm,"PUT",{...initial,operationId:crypto.randomUUID()});
  assert.equal(saved.status,200,await saved.clone().text());

  const operationId = crypto.randomUUID();
  const failure = await request(first,media,"POST",{campaignId:"synthetic-campaign",platform:"Meta Ads",days:7,operationId});
  assert.equal(failure.status,503,await failure.clone().text());
  const original = (await failure.json()).run;
  assert.equal(original.status,"Failed");
  assert.equal((await new TestBrowser().request(media)).status,401);
  assert.equal((await read(same,media)).runs.length,1);

  browser = await campaignBrowser();
  await browser.command("Network.enable");
  await browser.command("Network.setCookies",{cookies:[...first.cookies].map(([name,value])=>({name,value,url:first.base}))});
  await browser.command("Page.navigate",{url:first.base+"/integrations"});
  await browser.wait('document.body.innerText.includes("Setup required")');
  await browser.command("Page.navigate",{url:first.base+"/integrations?tab=history"});
  await browser.wait('document.body.innerText.includes("Retry sync")');
  await browser.click("Retry sync");
  await browser.wait('document.body.innerText.includes("· Retry")');
  const history = (await read(same,media)).runs;
  const retry = history.find(run=>run.retryOf===original.id);
  assert.equal(retry.status,"Failed");
  assert.equal(retry.start,original.start);
  assert.equal(retry.end,original.end);

  const feed = (await read(same)).notificationFeed;
  assert.ok(feed.some(item=>item.id==="sync:"+retry.id && item.category==="Campaign issues"));
  assert.ok(feed.some(item=>item.category==="Tasks"&&item.title.includes("Prepare synthetic launch")));
  await browser.evaluate('document.querySelector("[aria-label=Notifications]").click()');
  await browser.wait('document.body.innerText.includes("Meta Ads sync failed")');
  await browser.click("Mark all read");
  await browser.wait('fetch("/api/crm/library").then(r=>r.json()).then(v=>v.data.readNotificationIds?.includes('+JSON.stringify("sync:"+retry.id)+'))');

  await browser.command("Page.navigate",{url:first.base+"/settings?tab=notifications"});
  const toggle = JSON.stringify('[aria-label="Campaign issues in-app notifications"]');
  await browser.wait(`!!document.querySelector(${toggle})`);
  await browser.evaluate(`document.querySelector(${toggle}).click()`);
  await browser.wait('fetch("/api/crm/library").then(r=>r.json()).then(v=>v.data.notificationPrefs?.["Campaign issues"]?.inApp===false)');
  await browser.evaluate('document.querySelector("[aria-label=Notifications]").click()');
  await browser.wait('document.body.innerText.includes("Prepare synthetic launch") && !document.body.innerText.includes("Meta Ads sync failed")');
  const after = await read(same);
  assert.equal(after.data.notificationPrefs["Campaign issues"].inApp,false);
  assert.ok(after.notificationFeed.find(item=>item.id==="sync:"+retry.id)?.read);
  assert.equal((await read(same,media)).runs.length,2);
  console.log("PASS: honest setup status, failed sync and exact-window UI retry, shared history, notification feed, read state and preferences.");
}finally{
  try{await browser?.close();}finally{await account?.remove();}
}

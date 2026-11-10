import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { strFromU8, unzipSync } from "fflate";
import { createTestAccount, TestBrowser } from "./reportAuthFixture.mjs";
import { campaignBrowser } from "./campaignBrowser.mjs";
import { scheduledPeriod, reportWindow } from "../lib/domain/clientReporting.ts";

const endpoint="/api/reports/client";
const req=(api,path,data,method="POST")=>api.request(path,{method,headers:{"content-type":"application/json"},body:JSON.stringify(data)});
const post=(api,data)=>req(api,endpoint,data);
const state=async api=>(await api.request(endpoint)).json();
let account,other,browser;
try {
  account=await createTestAccount();other=await createTestAccount();
  const api=new TestBrowser(),outside=new TestBrowser();
  await Promise.all([api.signIn(account),outside.signIn(other)]);
  const path="/api/crm/library";
  const first=await(await api.request(path)).json();
  const empty=await(await outside.request(path)).json();
  assert.equal((await req(outside,path,{...empty,operationId:crypto.randomUUID()},"PUT")).status,200);
  first.data.clients=[{id:"report-client",company:"Example Reporting",industry:"Software",location:"Pune",contacts:[{name:"Example Contact",role:"Marketing",email:"reporting@example.com"}],services:["Meta Ads"],retainer:0,contractStart:"",contractEnd:"",accountManagerId:account.id,health:"Healthy",onboarding:[],createdAt:new Date().toISOString(),documents:[]}];
  assert.equal((await req(api,path,{...first,operationId:crypto.randomUUID()},"PUT")).status,200);
  const due=new Date(Date.now()+3600000).toISOString();
  const date=scheduledPeriod(due,"Weekly");
  const month=scheduledPeriod(due,"Monthly");
  const weekly=reportWindow(date,"Weekly");
  const dates=[...new Set([weekly.start,date,month])];
  const csv=["date,campaign,creative,spend,conversions,sessions,reach,revenue",...dates.map(d=>d+",Launch,Demo Video,1000,10,300,450,4500")].join("\n");
  const uploaded=await req(api,"/api/analytics",{action:"import",operationId:crypto.randomUUID(),currency:"INR",csv,feed:{clientId:"report-client",platform:"Meta Ads",account:"example",report:"Performance export"}});
  assert.equal(uploaded.status,200,await uploaded.clone().text());
  const source=(await uploaded.json()).id;
  const config={clientId:"report-client",source,frequency:"Weekly",recipients:["reporting@example.com"]};
  const id=crypto.randomUUID();
  const draft=await post(api,{action:"generate",id,selection:{...config,date},ai:false});
  assert.equal(draft.status,200,await draft.clone().text());
  assert.equal((await post(api,{action:"send",id})).status,409);
  assert.equal((await outside.request(endpoint+"?id="+id+"&format=pdf")).status,404);
  assert.equal((await post(api,{action:"generate",id:crypto.randomUUID(),selection:{...config,date,recipients:["another@example.com"]},ai:false})).status,400);
  const forged=await(await api.request(path)).json();
  forged.data.clientReporting={reports:[],schedules:[]};
  assert.equal((await req(api,path,{...forged,operationId:crypto.randomUUID()},"PUT")).status,200);
  let report=(await state(api)).reports[0];
  assert.equal(report.id,id);
  assert.equal(report.facts.stats.find(s=>s.key==="cpa").current,100);
  assert.equal(report.facts.stats.find(s=>s.key==="reach").current,null);
  assert.equal(report.facts.creatives[0].name,"Demo Video");

  browser=await campaignBrowser();
  await browser.command("Network.enable");
  await browser.command("Network.setCookies",{cookies:[...api.cookies].map(([name,value])=>({name,value,url:api.base}))});
  await browser.command("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await browser.command("Page.navigate",{url:api.base+"/reports?view=client"});
  await browser.wait('document.body.innerText.includes("Executive summary")');
  await browser.click("Review approval");
  await browser.wait('document.body.innerText.includes("reporting@example.com")');
  await browser.click("Confirm approve");
  await browser.wait('document.body.innerText.includes("Report approved.")',60000);
  await browser.command("Emulation.setDeviceMetricsOverride",{width:375,height:812,deviceScaleFactor:1,mobile:true});
  assert.equal(await browser.evaluate("document.documentElement.scrollWidth<=innerWidth"),true);
  report=(await state(api)).reports[0];
  assert.equal(report.status,"Approved");
  if (!(await state(api)).delivery) assert.equal((await post(api,{action:"send",id})).status,503);
  const output=process.env.CLIENT_REPORT_TEST_OUTPUT;
  for (const ext of ["pdf","xlsx","pptx"]) {
    const response=await api.request(endpoint+"?id="+id+"&format="+ext);
    assert.equal(response.status,200,await response.clone().text().then(t=>response.ok?"":t));
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(ext==="pdf") assert.ok((await PDFDocument.load(bytes)).getPageCount()>0);
    if(ext==="xlsx") {
      const parts=unzipSync(bytes);
      assert.match(strFromU8(parts["xl/worksheets/sheet4.xml"]),/<v>100<\/v>/);
      assert.match(strFromU8(parts["xl/workbook.xml"]),/Creative performance/);
    }
    if(ext==="pptx") {
      const parts=unzipSync(bytes);
      assert.ok(Object.keys(parts).filter(name=>/^ppt\/slides\/slide\d+\.xml$/.test(name)).length>=10);
      assert.match(strFromU8(parts["ppt/slides/slide1.xml"]),/Example Reporting/);
    }
    if(output)await writeFile(join(output,"client-report-test."+ext),bytes);
  }
  const monthlyId=crypto.randomUUID();
  const monthly=await post(api,{action:"generate",id:monthlyId,selection:{...config,frequency:"Monthly",date:month},ai:process.env.CLIENT_REPORT_TEST_AI==="1"});
  assert.equal(monthly.status,200,await monthly.clone().text());
  const monthlyReport=(await state(api)).reports.find(r=>r.id===monthlyId);
  assert.equal(monthlyReport.facts.window.end,month);
  if(process.env.CLIENT_REPORT_TEST_AI==="1") assert.ok(monthlyReport.model&&monthlyReport.copy.insights.length,"Live AI did not return a cited draft");
  const scheduleId=crypto.randomUUID();
  assert.equal((await post(api,{action:"schedule",id:scheduleId,config,due})).status,200);
  const run=await post(api,{action:"runDue"});
  assert.equal(run.status,200,await run.clone().text());
  const {id:scheduledId}=await run.json();
  const scheduled=(await state(api)).reports.find(r=>r.id===scheduledId);
  assert.equal(scheduled.status,"Draft");
  assert.equal(scheduled.due,due);
  assert.equal((await post(api,{action:"send",id:scheduledId})).status,409);
  assert.equal((await post(api,{action:"approve",id:scheduledId})).status,200);
  assert.equal((await post(api,{action:"send",id:scheduledId})).status,409);
  assert.equal((await post(api,{action:"revoke",id:scheduledId})).status,200);
  assert.equal((await post(api,{action:"toggle",id:scheduleId,enabled:false})).status,200);
  assert.equal((await state(api)).schedules[0].enabled,false);
  console.log("PASS: weekly and monthly snapshots, owner isolation, protected approval, PDF/PPTX/XLSX exports, scheduled draft and early-send guard, desktop and mobile.");
} finally {
  await browser?.close();
  await Promise.all([account?.remove(),other?.remove()]);
}

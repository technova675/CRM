import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createTestAccount, TestBrowser } from "./reportAuthFixture.mjs";
import { campaignBrowser } from "./campaignBrowser.mjs";
import { saveReportFile } from "../lib/reportsRepository.ts";
import { accountWorkspace } from "../lib/auth/identity.ts";
import { supabaseRequest } from "../lib/db.ts";

let account, browser, upload;
const created=[];
const admin=createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const request=(api,path,body,method="POST")=>api.request(path,{method,headers:{"content-type":"application/json"},body:JSON.stringify(body)});
const access="/api/client-portal";
const manage=(api,body)=>request(api,access,body);
const read=async(api,path)=>{const response=await api.request(path);assert.equal(response.status,200,await response.clone().text());return response.json();};
try {
  account=await createTestAccount();
  const agency=new TestBrowser(), first=new TestBrowser(), second=new TestBrowser();
  await agency.signIn(account);
  const library=await read(agency,"/api/crm/library"), at=new Date().toISOString();
  const id=crypto.randomUUID(), emails=["portal-first-"+id+"@example.com","portal-second-"+id+"@example.com"];
  upload="rf_"+crypto.randomUUID();
  const workspace=accountWorkspace(account.id);
  const companyId=await saveReportFile(workspace,upload,{companyName:"Synthetic Portal A",name:"Synthetic workbook.csv",kind:"csv",size:80,uploadedBy:"private-uploader",tables:[{name:"Measured data",columns:["Campaign","Clicks"],rows:[["Public launch",10]],rawRows:[["INTERNAL_RAW_MARKER"]]}]},account.id);
  const known=await read(agency,"/api/reports/uploads");
  const linked=known.files.find(f=>f.id===upload)?.clientId;
  assert.ok(linked||companyId);
  library.data.clients=["a","b"].map((id,i)=>({
    id,company:i?"Synthetic Portal B":"Synthetic Portal A",industry:"Software",location:"Pune",
    contacts:[{name:"Client Contact",role:"Marketing",email:emails[i]}],services:["Meta Ads"],retainer:999999,
    contractStart:"",contractEnd:"",accountManagerId:account.id,health:"Healthy",onboarding:[],createdAt:at,
    documents:[{name:"Client plan "+id,kind:"Brief",addedAt:at,url:"https://example.com/"+id}],
    upsellNotes:"INTERNAL_MARGIN",...(i?{}:{reportCompanyId:linked||companyId}),
  }));
  library.data.campaigns=["a","b"].map(id=>({
    id:"campaign-"+id,clientId:id,name:"Public launch "+id,service:"Meta Ads",platform:"Meta Ads",objective:"INTERNAL_OBJECTIVE",
    budget:999999,startDate:"2026-10-01",endDate:"2026-12-01",teamIds:[],status:"Active",kpis:[],metrics:[],influencerIds:[],
    performanceRows:[{id:"row-"+id,date:"2026-11-02",platform:"Meta Ads",source:"CSV import",importedAt:at,spend:100,impressions:1000,reach:null,clicks:100,leads:null,conversions:10,revenue:400}],
  }));
  library.data.creatives=["a","b"].map(id=>({id:"creative-"+id,clientId:id,title:"Launch copy "+id,platform:"Meta Ads",format:"Static",versions:[{v:1,note:"INTERNAL_CREATIVE_NOTE",createdAt:at,createdBy:account.id,headline:"Client headline"}],comments:[{id:"private-comment",internal:true,body:"INTERNAL_TEAM_DISCUSSION"}]}));
  library.data.tasks=[{id:"task-a",related:{type:"client",id:"a"},title:"Review content",description:"INTERNAL_TASK_NOTE",status:"Todo",dueDate:"2026-11-15"}];
  library.data.invoices=["a","b"].map(id=>({id:"invoice-"+id,clientId:id,number:"Invoice "+id,amount:1000,paid:0,issuedAt:"2026-11-01",dueDate:"2026-11-20",status:"Pending",description:"INTERNAL_COST"}));
  library.data.meetings=[{id:"meeting-a",clientId:"a",title:"Monthly review",startsAt:"2026-11-15T10:00:00Z",durationMin:30,notes:"INTERNAL_MEETING_NOTE",link:"https://example.com/meeting"}];
  const saved=await request(agency,"/api/crm/library",{...library,operationId:crypto.randomUUID()},"PUT");
  assert.equal(saved.status,200,await saved.clone().text());

  for(const [i,clientId] of ["a","b"].entries()) {
    const res=await manage(agency,{action:"create",clientId,email:emails[i]});
    assert.equal(res.status,201);
    const credentials=await res.json();
    const member=(await read(agency,access+"?client="+clientId)).accounts.find(a=>a.email===credentials.email);
    created.push({...credentials,userId:member.userId});
  }
  for(const [i,api] of [first,second].entries()) {
    const res=await request(api,"/api/portal/session",{action:"signin",...created[i]});
    assert.equal(res.status,200);
    assert.equal((await read(api,"/api/auth")).user.kind,"portal");
    assert.equal((await api.request("/api/crm/library")).status,403);
    assert.equal((await api.request("/api/reports/uploads")).status,403);
    assert.equal((await api.request(access+"?client=a")).status,403);
    assert.equal((await api.request("/dashboard")).status,307);
  }
  assert.equal((await agency.request("/api/portal")).status,403);
  assert.equal((await request(new TestBrowser(),"/api/auth",{action:"signin",...created[0]})).status,403);
  assert.equal((await request(new TestBrowser(),"/api/portal/session",{action:"signin",email:account.email,password:account.password})).status,403);
  assert.equal((await manage(agency,{action:"share",clientId:"a",kind:"invoice",id:"invoice-b",enabled:true})).status,404);
  assert.equal((await manage(agency,{action:"share",clientId:"b",kind:"upload",id:upload,enabled:true})).status,404);

  const staff=await read(agency,access+"?client=a");
  const reportId=crypto.randomUUID();
  const report=await request(agency,"/api/reports/client",{action:"generate",id:reportId,selection:{clientId:"a",source:"paid:Meta Ads",frequency:"Weekly",date:"2026-11-02",recipients:[]},ai:false});
  assert.equal(report.status,200,await report.clone().text());
  assert.equal((await manage(agency,{action:"share",clientId:"a",kind:"report",id:reportId,enabled:true})).status,404);
  assert.equal((await request(agency,"/api/reports/client",{action:"approve",id:reportId})).status,200);
  for(const item of [...staff.choices,{kind:"report",id:reportId}]) {
    const share=await manage(agency,{action:"share",clientId:"a",kind:item.kind,id:item.id,version:item.version,enabled:true});
    assert.equal(share.status,200,await share.clone().text());
  }
  const a=await read(first,"/api/portal?client=b"), b=await read(second,"/api/portal?client=a");
  assert.equal(a.company,"Synthetic Portal A");
  assert.equal(b.company,"Synthetic Portal B");
  assert.equal(a.performance[0].series[0].metrics.find(m=>m.key==="cpa").value,10);
  assert.equal(a.invoices[0].id,"invoice-a");
  assert.equal(a.meetings[0].id,"meeting-a");
  assert.equal(a.documents[0].name,"Client plan a");
  assert.equal(a.uploads[0].id,upload);
  assert.equal(a.reports[0].id,reportId);
  assert.equal(b.invoices.length+b.creatives.length+b.uploads.length+b.reports.length,0);
  assert.doesNotMatch(JSON.stringify(a),/INTERNAL_|private-uploader|999999|Synthetic Portal B|invoice-b/);
  const pdf=await first.request("/api/portal?report="+reportId);
  assert.equal(pdf.status,200);
  assert.equal(pdf.headers.get("content-type"),"application/pdf");
  assert.equal((await second.request("/api/portal?report="+reportId)).status,404);
  const preview=await read(first,"/api/portal?upload="+upload);
  assert.equal(preview.rows[0][0],"Public launch");
  assert.doesNotMatch(JSON.stringify(preview),/INTERNAL_RAW_MARKER|private-uploader/);
  assert.equal((await second.request("/api/portal?upload="+upload)).status,404);

  const decision={action:"decision",creativeId:"creative-a",fingerprint:a.creatives[0].hash,verdict:"Approved",feedback:"Looks good"};
  assert.equal((await request(second,"/api/portal",decision)).status,409);
  assert.equal((await request(first,"/api/portal",decision)).status,200);
  assert.equal((await request(first,"/api/portal",decision)).status,409);
  const sent=await request(first,"/api/portal",{action:"message",id:crypto.randomUUID(),text:"Client-only message",clientId:"b",from:"Agency"});
  assert.equal(sent.status,200);
  assert.equal((await read(agency,access+"?client=a")).messages[0].from,"Client");
  assert.equal((await read(agency,access+"?client=b")).messages.length,0);

  browser=await campaignBrowser();
  await browser.command("Emulation.setDeviceMetricsOverride",{width:375,height:812,deviceScaleFactor:1,mobile:true});
  await browser.command("Page.navigate",{url:agency.base+"/portal/login"});
  await browser.wait('document.body.innerText.includes("Client portal sign-in")');
  await browser.fill("Email address",created[0].email);await browser.fill("Password",created[0].password);
  await browser.click("Sign in to client portal");
  await browser.wait('document.body.innerText.includes("Synthetic Portal A")',60000);
  assert.equal(await browser.evaluate('document.body.innerText.includes("Command Center")'),false);
  const tab=async label=>browser.evaluate('Array.from(document.querySelectorAll("nav[aria-label=\'Client workspace views\'] button")).find(b=>b.textContent==='+JSON.stringify(label)+').click()');
  await tab("Reports");
  await browser.wait('document.body.innerText.includes("Download PDF")');
  await browser.click("Preview tables");
  await browser.wait('document.body.innerText.includes("Preview shows up to 25")');
  assert.equal(await browser.evaluate("document.documentElement.scrollWidth<=innerWidth"),true);
  await tab("Creative approvals");
  await browser.wait('document.body.innerText.includes("Looks good")');

  if(process.env.TASK_REVIEW_TEST==="1"){
    const reviewId=crypto.randomUUID(),teamId=crypto.randomUUID();
    const queue="/api/creative-reviews",clientQueue="/api/portal/reviews";
    const reviewContent={title:"Synthetic review asset",url:"https://example.com/creative",copy:"Version one"};
    assert.equal((await request(agency,queue,{action:"create",id:reviewId,clientId:"a",format:"Landing page",audience:"Client",content:reviewContent})).status,200);
    assert.equal((await request(agency,queue,{action:"create",id:teamId,clientId:"a",format:"Campaign",audience:"Team",content:{...reviewContent,title:"Internal test review"}})).status,200);
    assert.equal((await read(second,clientQueue)).reviews.length,0);
    assert.deepEqual((await read(first,clientQueue)).reviews.map(r=>r.id),[reviewId]);
    assert.equal((await request(second,clientQueue,{id:reviewId,version:1,text:"Unrelated response",decision:"Approved"})).status,404);
    assert.equal((await request(first,clientQueue,{id:reviewId,version:1,text:"Please change the title",decision:"Changes requested"})).status,200);
    assert.equal((await request(agency,queue,{action:"revise",id:reviewId,expected:1,content:{...reviewContent,copy:"Version two"}})).status,200);
    assert.equal((await request(first,clientQueue,{id:reviewId,version:1,text:"",decision:"Approved"})).status,409);
    await browser.command("Page.reload");
    await browser.wait('document.body.innerText.includes("Synthetic Portal A")');
    await tab("Creative approvals");
    await browser.wait('document.body.innerText.includes("Version two")');
    await browser.click("Approve version");
    await browser.wait('document.body.innerText.includes("Decision recorded.")');
    const updated=(await read(agency,queue)).reviews.find(r=>r.id===reviewId);
    assert.equal(updated.revisions[0].decision.status,"Changes requested");
    assert.equal(updated.revisions[1].decision.status,"Approved");
    assert.equal(await browser.evaluate("document.documentElement.scrollWidth<=innerWidth"),true);
    const taskLibrary=await read(agency,"/api/crm/library");
    taskLibrary.data.tasks.push({id:"dep-a",title:"Prerequisite",status:"Todo"});
    taskLibrary.data.tasks.push({id:"dep-b",title:"Dependent",status:"Done",dependsOn:["dep-a"]});
    const rejected=await request(agency,"/api/crm/library",{...taskLibrary,operationId:crypto.randomUUID()},"PUT");
    assert.equal(rejected.status,400);
    assert.match((await rejected.json()).error,/prerequisite/);
    console.log("PASS: review queue isolation, version history, client approval from mobile, and dependency enforcement.");
  }
  const membership=(await read(agency,access+"?client=a")).accounts[0];
  assert.equal((await manage(agency,{action:"access",clientId:"a",userId:membership.userId,active:false})).status,200);
  assert.equal((await first.request("/api/portal")).status,403);
  assert.equal((await first.request("/api/portal?report="+reportId)).status,403);
  assert.equal((await second.request("/api/portal")).status,200);
  console.log("PASS: distinct portal identities, client-only data, approved PDF and uploaded preview, creative decisions, messages, mobile sign-in and immediate access revocation.");
} finally {
  await browser?.close();
  if(upload&&account) {
    const workspace="eq."+accountWorkspace(account.id);
    await supabaseRequest("report_files",{method:"DELETE",query:{id:"eq."+upload,workspace_id:workspace}});
    await supabaseRequest("report_companies",{method:"DELETE",query:{name_key:workspace+":synthetic portal a"}});
  }
  for(const entry of created){
    await admin.auth.admin.deleteUser(entry.userId);
  }
  if(account)await account.remove();
}

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { resilientFetch } from "../lib/auth/resilientFetch.ts";
import { campaignBrowser } from "./campaignBrowser.mjs";
import { createTestAccount, TestBrowser } from "./reportAuthFixture.mjs";

const a=new TestBrowser(),b=new TestBrowser(),staff=new TestBrowser(),anonymous=new TestBrowser();
const crm="/api/crm/library",manage="/api/staff/manage",join="/api/staff/join",workspace="/api/staff/workspace";
const send=(client,path,body,method="POST")=>client.request(path,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
const ok=async(response,status=200)=>{assert.equal(response.status,status,await response.clone().text());return response.json();};
const read=async(client,path)=>ok(await client.request(path));
const email="staff-verification-"+crypto.randomUUID()+"@example.com";
const password=randomBytes(32).toString("base64url")+"Aa1!";
let owner,other,staffId,browser;
try{
  owner=await createTestAccount();other=await createTestAccount();
  await Promise.all([a.signIn(owner),b.signIn(other)]);
  async function seed(api,id,name,ownerId){
    const initial=await read(api,crm);
    initial.data.leads=[{id,name,company:name+" company",email:"lead@example.com",phone:"",status:"New",source:"Referral",jobTitle:"",location:"",industry:"",companySize:"Unknown",createdAt:new Date().toISOString(),ownerId,services:[],tags:[],notes:"Synthetic private lead note"}];
    await ok(await send(api,crm,{...initial,operationId:crypto.randomUUID()},"PUT"));
  }
  await seed(a,"org-a-lead","Synthetic A lead",owner.id);
  await seed(b,"org-b-lead","Synthetic B lead",other.id);
  assert.equal((await send(a,manage,{action:"invite",name:"Staff verification",email,role:"admin"})).status,400);
  const invitation=await ok(await send(a,manage,{action:"invite",name:"Staff verification",email,role:"sales"}),201);
  const link=new URL(invitation.path,a.base),params=Object.fromEntries(new URLSearchParams(link.hash.slice(1)));
  assert.equal((await send(anonymous,join,{...params,workspace:other.id,password})).status,404);
  assert.equal((await read(a,crm)).data.staffInvites,undefined);
  assert.equal((await read(b,manage)).members.length,0);

  browser=await campaignBrowser();
  await browser.command("Network.enable");
  await browser.command("Page.navigate",{url:link.href});
  await browser.wait('document.body.innerText.includes("Choose a password")');
  await browser.fill("Choose a password",password);
  await browser.fill("Confirm password",password);
  await browser.evaluate('Array.from(document.querySelectorAll("button")).find(button=>button.innerText==="Accept invitation").click()');
  await browser.wait('document.body.innerText.includes("Your staff login is ready")');
  staffId=(await read(a,crm)).data.team.find(item=>item.email===email)?.staffAuthId;
  assert.ok(staffId);
  await staff.signIn({email,password});
  const account=await read(staff,"/api/auth");
  staffId=account.user.id;
  assert.equal(account.user.kind,"staff");
  assert.equal((await send(anonymous,join,{...params,password})).status,404);
  const view=await read(staff,workspace);
  assert.deepEqual(view.leads.rows.map(lead=>lead.title),["Synthetic A lead"]);
  assert.equal(view.invoices,undefined);
  assert.doesNotMatch(JSON.stringify(view),/Synthetic B lead|Synthetic private lead note/);
  assert.equal((await staff.request(crm)).status,403);
  assert.equal((await staff.request(manage)).status,403);
  assert.equal((await staff.request("/api/portal")).status,403);
  assert.equal((await staff.request("/api/workspace/backup")).status,403);
  assert.equal((await send(staff,workspace,{action:"leadStatus",id:"org-b-lead",previous:"New",status:"Qualified"})).status,404);
  await ok(await send(staff,workspace,{action:"leadStatus",id:"org-a-lead",previous:"New",status:"Qualified"}));
  assert.equal((await read(a,crm)).data.leads[0].status,"Qualified");
  assert.equal((await read(b,crm)).data.leads[0].status,"New");
  const member=(await read(a,manage)).members[0];
  const forged=await read(a,crm);
  forged.data.team.find(item=>item.id===member.id).staffAuthId=other.id;
  assert.equal((await send(a,crm,{...forged,operationId:crypto.randomUUID()},"PUT")).status,409);
  await ok(await send(a,manage,{action:"role",id:member.id,role:"designer"}));
  assert.equal((await read(staff,workspace)).leads,undefined);
  assert.equal((await send(staff,workspace,{action:"leadStatus",id:"org-a-lead",previous:"Qualified",status:"Contacted"})).status,403);
  await ok(await send(a,manage,{action:"revoke",id:member.id}));
  assert.equal((await staff.request(workspace)).status,403);
  await ok(await send(a,manage,{action:"restore",id:member.id}));
  assert.equal((await read(staff,workspace)).member.role,"designer");

  await browser.command("Network.setCookies",{cookies:[...staff.cookies].map(([name,value])=>({name,value,url:staff.base}))});
  await browser.command("Page.navigate",{url:staff.base+"/dashboard"});
  await browser.wait('location.pathname==="/staff" && document.body.innerText.includes("Staff Workspace")');
  await browser.command("Emulation.setDeviceMetricsOverride",{width:375,height:812,deviceScaleFactor:1,mobile:true});
  await browser.wait("document.documentElement.scrollWidth<=innerWidth");

  const key=await ok(await send(a,"/api/workspace/keys",{action:"create",name:"Synthetic verification key"}),201);
  const summary=()=>anonymous.request("/api/workspace/summary",{headers:{authorization:"Bearer "+key.secret}});
  assert.equal((await ok(await summary())).workspace,(await read(a,"/api/tenant")).id);
  assert.doesNotMatch(JSON.stringify(await read(a,"/api/workspace/keys")),/\bhash\b|adb_[\da-f]{8}-/);
  const backup=await read(a,"/api/workspace/backup");
  assert.equal(backup.data.staffInvites,undefined);
  assert.equal(backup.data.workspaceApiKeys,undefined);
  assert.equal(backup.data.team.find(item=>item.id===member.id).staffAuthId,undefined);
  await ok(await send(a,"/api/workspace/keys",{action:"revoke",id:key.id}));
  assert.equal((await summary()).status,401);
  const audit=await read(a,"/api/audit");
  assert.ok(audit.rows.some(row=>row.action==="Updated lead status"&&row.person==="Staff verification"));
  assert.ok(audit.rows.some(row=>row.action==="Revoked staff access"));
  console.log("PASS: browser invitation, one-time redemption, staff role projection, write isolation, immediate revocation, audit identity, mobile layout, API key revocation and redacted backup.");
}finally{
  try{await browser?.close();}finally{
    if(staffId){
      const admin=createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY,{global:{fetch:resilientFetch},auth:{persistSession:false,autoRefreshToken:false}});
      const result=await admin.auth.admin.deleteUser(staffId);
      assert.equal(result.error,null);
    }
    await Promise.all([owner?.remove(),other?.remove()]);
  }
}

import assert from "node:assert/strict";
import {createDecipheriv,generateKeyPairSync,hkdfSync,randomBytes} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createTestAccount,TestBrowser} from "./reportAuthFixture.mjs";
import {resilientFetch} from "../lib/auth/resilientFetch.ts";
import {campaignBrowser} from "./campaignBrowser.mjs";

const a=new TestBrowser(),b=new TestBrowser(),anon=new TestBrowser();
const vault="/api/workspace/vault",backupPath="/api/workspace/backup",crm="/api/crm/library";
const send=(client,path,body,method="POST")=>client.request(path,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
async function status(response,expected=200){
  const json=await response.json();
  assert.equal(response.status,expected,json.error??"Unexpected status");
  return json;
}
const read=async(client,path)=>status(await client.request(path));
const token=randomBytes(24).toString("hex");
const rotated=randomBytes(24).toString("hex");
const admin=createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY,{
  global:{fetch:resilientFetch},auth:{persistSession:false,autoRefreshToken:false},
});
let owner,other,browser,temp;
try{
  owner=await createTestAccount();
  other=await createTestAccount();
  await Promise.all([a.signIn(owner),b.signIn(other)]);
  assert.equal((await anon.request(vault)).status,401);
  assert.equal((await read(a,vault)).configured,true);
  const lead=(id,name)=>({id,name,company:"Synthetic",email:"test@example.com",phone:"",status:"New",source:"Referral",jobTitle:"",location:"",industry:"",companySize:"Unknown",createdAt:"2026-11-01T00:00:00.000Z",ownerId:owner.id,services:[],tags:[],notes:""});
  async function saveLeads(leads){
    const state=await read(a,crm);
    state.data.leads=leads;
    await status(await send(a,crm,{...state,operationId:crypto.randomUUID()},"PUT"));
  }
  await saveLeads([lead("alpha","Original lead"),lead("beta","Removed lead")]);
  await status(await send(a,vault,{action:"save",slot:"media",secret:token}));
  await status(await send(a,vault,{action:"save",slot:"searchConsole",secret:'{"client_email":"fake@example.com","private_key":"bad"}'}),400);
  const {privateKey}=generateKeyPairSync("rsa",{modulusLength:2048,privateKeyEncoding:{type:"pkcs8",format:"pem"},publicKeyEncoding:{type:"spki",format:"pem"}});
  await status(await send(a,vault,{action:"save",slot:"searchConsole",secret:JSON.stringify({client_email:"fake@example.com",private_key:privateKey})}));
  assert.deepEqual((await read(a,vault)).entries.map(entry=>entry.slot),["media","searchConsole"]);
  assert.deepEqual((await read(b,vault)).entries,[]);

  const {data:stored,error}=await admin.from("crm_libraries").select("data").eq("owner_id",owner.id).single();
  assert.equal(error,null);
  const sealed=stored.data.credentialVault.media;
  assert.equal(JSON.stringify(stored.data.credentialVault).includes(token),false);
  function decrypt(ownerId,slot,entry){
    const key=Buffer.from(hkdfSync("sha256",Buffer.from(process.env.WORKSPACE_VAULT_KEY,"hex"),ownerId,"adbibe:vault:v1",32));
    const cipher=createDecipheriv("aes-256-gcm",key,Buffer.from(entry.nonce,"base64url"));
    cipher.setAAD(Buffer.from(JSON.stringify(["adbibe-vault-v1",ownerId,slot])));
    cipher.setAuthTag(Buffer.from(entry.tag,"base64url"));
    return Buffer.concat([cipher.update(Buffer.from(entry.ciphertext,"base64url")),cipher.final()]).toString("utf8");
  }
  assert.equal(decrypt(owner.id,"media",sealed)===token,true);
  assert.throws(()=>decrypt(other.id,"media",sealed));
  assert.throws(()=>decrypt(owner.id,"searchConsole",sealed));
  const response=await a.request(backupPath);
  assert.match(response.headers.get("content-disposition"),/attachment/);
  const backup=await status(response);
  assert.equal(backup.version,2);
  assert.equal(backup.data.credentialVault,undefined);
  assert.equal((await read(a,crm)).data.credentialVault,undefined);
  assert.equal(JSON.stringify(await read(a,vault)).includes(sealed.ciphertext),false);

  await status(await send(a,vault,{action:"save",slot:"media",secret:rotated}));
  await saveLeads([lead("alpha","Edited lead"),lead("gamma","New lead")]);
  await status(await send(b,"/api/workspace/keys",{action:"create",name:"Initialize second organization"}),201);
  await status(await send(b,backupPath,{action:"preview",backup}),400);
  const tampered=structuredClone(backup);
  tampered.data.leads[0].name="Tampered";
  await status(await send(a,backupPath,{action:"preview",backup:tampered}),400);

  const preview=await status(await send(a,backupPath,{action:"preview",backup}));
  assert.deepEqual(preview.counts,[{label:"Leads",added:1,updated:1,removed:1}]);
  await status(await send(a,backupPath,{action:"restore",backup,confirmation:"wrong",ticket:preview.ticket}),400);
  const key=await status(await send(a,"/api/workspace/keys",{action:"create",name:"Keep current key"}),201);
  await status(await send(a,backupPath,{action:"restore",backup,confirmation:"RESTORE",ticket:preview.ticket}),409);

  browser=await campaignBrowser();
  temp=await mkdtemp(join(tmpdir(),"adbibe-restore-"));
  const file=join(temp,"synthetic.json");
  await writeFile(file,JSON.stringify(backup));
  await browser.command("Network.enable");
  await browser.command("Network.setCookies",{cookies:[...a.cookies].map(([name,value])=>({name,value,url:a.base}))});
  await browser.command("Page.navigate",{url:a.base+"/settings?tab=security"});
  await browser.wait('document.body.innerText.includes("Credential vault") && document.body.innerText.includes("Stored")');
  await browser.command("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await browser.wait("document.documentElement.scrollWidth<=innerWidth");
  const {root}=await browser.command("DOM.getDocument");
  const {nodeId}=await browser.command("DOM.querySelector",{nodeId:root.nodeId,selector:'input[type="file"]'});
  assert.ok(nodeId);
  await browser.command("DOM.setFileInputFiles",{nodeId,files:[file]});
  await browser.click("Preview restore");
  await browser.wait('document.body.innerText.includes("1 added · 1 updated · 1 removed")');
  await browser.fill("Type RESTORE to confirm","RESTORE");
  await browser.click("Apply restore");
  await browser.wait('document.body.innerText.includes("Workspace records restored.")');
  assert.deepEqual((await read(a,crm)).data.leads.map(row=>row.name),["Original lead","Removed lead"]);
  assert.ok((await read(a,"/api/workspace/keys")).keys.some(row=>row.id===key.id&&!row.revokedAt));
  assert.ok((await read(a,"/api/audit")).rows.some(row=>row.action==="Restored workspace backup"));
  const after=await admin.from("crm_libraries").select("data").eq("owner_id",owner.id).single();
  assert.equal(after.error,null);
  assert.equal(decrypt(owner.id,"media",after.data.data.credentialVault.media)===rotated,true);
  await status(await send(a,vault,{action:"remove",slot:"media"}));
  assert.deepEqual((await read(a,vault)).entries.map(entry=>entry.slot),["searchConsole"]);
  console.log("PASS: encrypted vault, per-organization and per-slot authentication, metadata-only responses, tamper and cross-organization rejection, stale-preview rejection, mobile browser restore, key preservation and audit.");
}finally{
  try{await browser?.close();}finally{
    if(temp)await rm(temp,{recursive:true,force:true});
    await Promise.all([owner?.remove(),other?.remove()]);
  }
}

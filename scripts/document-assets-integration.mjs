import assert from "node:assert/strict";
import {createClient} from "@supabase/supabase-js";
import {mkdtemp,writeFile,rm,rmdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createTestAccount,TestBrowser} from "./reportAuthFixture.mjs";
import {campaignBrowser} from "./campaignBrowser.mjs";
import {removeLibraryAsset} from "../lib/reportR2.ts";

let account,outsider,browser,temp,portalId,agency;
const filename="Synthetic brand guidelines.txt",nextName="Synthetic brand guidelines revised.txt";
const endpoint="/api/documents/storage";
const read=async api=>(await(await api.request("/api/crm/library")).json());
const json=(api,path,data,method="POST")=>api.request(path,{method,headers:{"content-type":"application/json"},body:JSON.stringify(data)});
const contact="asset-test-"+crypto.randomUUID()+"@example.com";
try{
  account=await createTestAccount();outsider=await createTestAccount();
  agency=new TestBrowser();
  const other=new TestBrowser(),same=new TestBrowser(),portal=new TestBrowser();
  await Promise.all([agency.signIn(account),same.signIn(account),other.signIn(outsider)]);
  const initial=await read(agency);
  initial.data.clients=[{id:"asset-test-client",company:"Asset library test",industry:"Design",location:"Pune",contacts:[{name:"Asset test",role:"Client",email:contact}],services:[],retainer:0,contractStart:"",contractEnd:"",accountManagerId:account.id,health:"Healthy",onboarding:[],createdAt:new Date().toISOString(),documents:[]}];
  const saved=await json(agency,"/api/crm/library",{...initial,operationId:crypto.randomUUID()},"PUT");
  assert.equal(saved.status,200,await saved.clone().text());
  const invite=await json(agency,"/api/client-portal",{action:"create",clientId:"asset-test-client",email:contact});
  assert.equal(invite.status,201);
  const credentials=await invite.json();
  const roster=await(await agency.request("/api/client-portal?client=asset-test-client")).json();
  portalId=roster.accounts[0].userId;
  assert.equal((await json(portal,"/api/portal/session",{action:"signin",...credentials})).status,200);
  browser=await campaignBrowser();
  await browser.command("Network.enable");
  await browser.command("Network.setCookies",{cookies:[...agency.cookies].map(([name,value])=>({name,value,url:agency.base}))});
  await browser.command("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await browser.command("Page.navigate",{url:agency.base+"/documents?client=asset-test-client"});
  await browser.wait('document.body.innerText.includes("This library is empty")');
  temp=await mkdtemp(join(tmpdir(),"crm-asset-test-"));
  await writeFile(join(temp,filename),"Synthetic original bytes");
  await writeFile(join(temp,nextName),"Synthetic revised bytes");
  const chooseFile=async(selector,name)=>{
    const root=(await browser.command("DOM.getDocument")).root.nodeId;
    const input=(await browser.command("DOM.querySelector",{nodeId:root,selector})).nodeId;
    assert.ok(input);
    await browser.command("DOM.setFileInputFiles",{nodeId:input,files:[join(temp,name)]});
  };
  await chooseFile('input[type="file"][multiple]',filename);
  await browser.wait('document.body.innerText.includes("Synthetic brand guidelines.txt")',60000);
  const asset=(await read(same)).data.assets.find(item=>item.name===filename);
  assert.equal(asset.folder,"Brand guidelines");
  assert.equal(asset.versions.length,1);
  assert.equal((await other.request(endpoint+"?asset="+asset.id)).status,404);
  assert.equal((await portal.request("/api/portal?asset="+asset.id)).status,404);
  await browser.evaluate('Array.from(document.querySelectorAll("button")).find(button=>button.innerText.includes("Synthetic brand guidelines.txt")).click()');
  await browser.wait('document.body.innerText.includes("Download v1")');
  await browser.fill("Version note","Updated palette");
  await chooseFile('[role="dialog"] input[type="file"]',nextName);
  await browser.wait('document.body.innerText.includes("Download v2")',60000);
  for(const [version,text] of [[1,"Synthetic original bytes"],[2,"Synthetic revised bytes"]]){
    const response=await same.request(endpoint+"?asset="+asset.id+"&version="+version);
    assert.equal(response.status,200);
    assert.equal(await response.text(),text);
  }
  const current=await read(agency);
  const forged=structuredClone(current);
  forged.data.assets.find(item=>item.id===asset.id).versions[0].file.sha256="0".repeat(64);
  const denied=await json(agency,"/api/crm/library",{...forged,operationId:crypto.randomUUID()},"PUT");
  assert.equal(denied.status,409);
  const shared=structuredClone(current);
  shared.data.assets.find(item=>item.id===asset.id).clientVisible=true;
  assert.equal((await json(agency,"/api/crm/library",{...shared,operationId:crypto.randomUUID()},"PUT")).status,200);
  assert.equal(await(await portal.request("/api/portal?asset="+asset.id)).text(),"Synthetic revised bytes");
  const hidden=await read(agency);
  hidden.data.assets.find(item=>item.id===asset.id).archivedAt=new Date().toISOString();
  assert.equal((await json(agency,"/api/crm/library",{...hidden,operationId:crypto.randomUUID()},"PUT")).status,200);
  assert.equal((await portal.request("/api/portal?asset="+asset.id)).status,404);
  await browser.command("Emulation.setDeviceMetricsOverride",{width:375,height:812,deviceScaleFactor:1,mobile:true});
  assert.equal(await browser.evaluate("document.documentElement.scrollWidth<=innerWidth"),true);
  console.log("PASS: actual R2 bytes for two versions, client and account isolation, archive access and mobile layout.");
}finally{
  await browser?.close();
  if(temp){
    await rm(join(temp,filename),{force:true});
    await rm(join(temp,nextName),{force:true});
    await rmdir(temp);
  }
  if(agency&&account){
    const data=await read(agency).catch(()=>null);
    for(const asset of data?.data?.assets??[])if(asset.clientId==="asset-test-client")
      for(const version of asset.versions)if(version.file)await removeLibraryAsset(account.id,asset.id,version.file);
  }
  if(portalId){
    const admin=createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    const result=await admin.auth.admin.deleteUser(portalId);
    assert.equal(result.error,null);
  }
  await Promise.all([account?.remove(),outsider?.remove()]);
}

import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { createTestAccount, TestBrowser } from "./reportAuthFixture.mjs";
import { campaignBrowser } from "./campaignBrowser.mjs";
import { removeLibraryAsset } from "../lib/reportR2.ts";

const staff = new TestBrowser();
let account, browser, assetId;
const clientId = "knowledge-synthetic";
const otherId = "knowledge-synthetic-other";
const phrase = "Copper Orchard";
const read = async () => (await staff.request("/api/crm/library")).json();
const send = (path, body, method = "POST") => staff.request(path, {
  method, headers: {"content-type":"application/json"}, body: JSON.stringify(body),
});
const knowledge = async (action, fields = {}) => {
  const response = await send("/api/knowledge", {action, clientId, ...fields});
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
};
try {
  account = await createTestAccount();
  await staff.signIn(account);
  const initial = await read();
  const client = {industry:"Design",location:"Pune",contacts:[],services:[],retainer:0,contractStart:"",contractEnd:"",accountManagerId:account.id,health:"Healthy",onboarding:[],createdAt:new Date().toISOString(),documents:[]};
  initial.data.clients = [{...client,id:clientId,company:"Knowledge test company"},{...client,id:otherId,company:"Other synthetic company"}];
  initial.data.knowledge = [{id:clientId,clientId,brandVoice:"Warm",toneWords:["warm"],products:[],audience:"",competitors:[],approvedMessaging:[],rejectedConcepts:[],preferences:[],guidelines:"",history:[],updatedAt:new Date().toISOString()}];
  const saved = await send("/api/crm/library",{...initial,operationId:crypto.randomUUID()},"PUT");
  assert.equal(saved.status,200,await saved.clone().text());

  const pdf = await PDFDocument.create();
  pdf.addPage().drawText("The synthetic approval keyword is Copper Orchard.", {x:30,y:700});
  const bytes = await pdf.save();
  const upload = (body,name,assetId,expected) => staff.request("/api/documents/storage",{
    method:"POST", headers:{"x-asset-meta":encodeURIComponent(JSON.stringify({name,clientId,folder:"Brand guidelines",assetId,expected}))}, body,
  });
  const first = await upload(bytes,"Synthetic Approval SOP.pdf");
  assert.equal(first.status,201,await first.clone().text());
  assetId = (await first.json()).id;
  assert.equal((await knowledge("search",{query:phrase})).sources.length,0);
  await knowledge("index",{assetId});
  const found = await knowledge("search",{query:phrase});
  assert.ok(found.sources.some(item=>item.excerpt.includes(phrase) && item.href.includes("version=1")));
  assert.equal((await knowledge("search",{clientId:otherId,query:phrase})).sources.length,0);
  assert.equal((await send("/api/knowledge",{action:"index",clientId:otherId,assetId})).status,404);

  browser = await campaignBrowser();
  await browser.command("Network.enable");
  await browser.command("Network.setCookies",{cookies:[...staff.cookies].map(([name,value])=>({name,value,url:staff.base}))});
  await browser.command("Page.navigate",{url:staff.base+"/knowledge?client="+clientId});
  await browser.wait('document.body.innerText.includes("Synthetic Approval SOP.pdf")');
  await browser.fill("Search or ask a question",phrase);
  await browser.evaluate('Array.from(document.querySelectorAll("button")).find(button=>button.innerText==="Search").click()');
  await browser.wait('document.body.innerText.includes("The synthetic approval keyword is Copper Orchard.")');

  const answer = await knowledge("ask",{query:"What is the synthetic approval keyword Copper Orchard?"});
  assert.ok(answer.sources.some(item=>item.excerpt.includes(phrase)));
  assert.ok(answer.paragraphs.every(item=>item.references.every(ref=>ref>=1&&ref<=answer.sources.length)));
  console.log(answer.paragraphs.length ? "Cited AI answer returned." : "AI answer unavailable. Source fallback returned.");
  const second = await upload("Synthetic replacement text: Silver Pine.","Synthetic SOP.txt",assetId,1);
  assert.equal(second.status,201,await second.clone().text());
  assert.equal((await knowledge("search",{query:phrase})).sources.length,0);
  await knowledge("index",{assetId});
  assert.ok((await knowledge("search",{query:"Silver Pine"})).sources.some(item=>item.href.includes("version=2")));
  await knowledge("remove",{assetId});
  assert.equal((await knowledge("search",{query:"Silver Pine"})).sources.length,0);
  console.log("PASS: PDF and text indexing, client isolation, browser search, version refresh and removal.");
} finally {
  try {
    await browser?.close();
    if (assetId && account) {
      const library = await read();
      const asset = library.data?.assets?.find(item=>item.id===assetId && item.clientId===clientId);
      for (const version of asset?.versions ?? []) if (version.file) await removeLibraryAsset(account.id,asset.id,version.file);
    }
  } finally {
    await account?.remove();
  }
}

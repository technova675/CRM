// Real-browser walkthrough of Leads & CRM as a new user: add, validate, duplicates, merge, import, tags, views, search, custom fields, edit, mobile.
import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
import {createTestAccount,TestBrowser} from "./reportAuthFixture.mjs";
import {campaignBrowser} from "./campaignBrowser.mjs";
let account,browser;const findings=[];
const note=(text)=>{findings.push(text);console.log("FINDING: "+text);};
try{
  account=await createTestAccount();const api=new TestBrowser();await api.signIn(account);
  const saved=async()=>(await(await api.request("/api/crm/library")).json()).data;
  const until=async(check,label,timeout=30000)=>{const start=Date.now();let last;while(Date.now()-start<timeout){last=await saved();if(check(last))return last;await new Promise(r=>setTimeout(r,700));}throw new Error("Not saved to the account: "+label);};
  browser=await campaignBrowser();const b=browser;
  await b.command("Network.enable");await b.command("Page.enable");
  await b.command("Network.setCookies",{cookies:[...api.cookies].map(([name,value])=>({name,value,url:api.base}))});
  await b.command("Page.addScriptToEvaluateOnNewDocument",{source:"window.__errors=[];addEventListener('error',e=>__errors.push(String(e.message)));addEventListener('unhandledrejection',e=>__errors.push('rejection: '+String(e.reason)));const ce=console.error;console.error=(...a)=>{__errors.push(a.map(String).join(' ').slice(0,300));ce(...a);};window.confirm=()=>true;"});
  await b.command("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  // A new user sees a guided tour on each page; close it the way they would.
  const closeTour=async()=>{try{await b.wait("document.querySelector('.driver-popover-close-btn')",2500);}catch{return false;}await b.evaluate("document.querySelector('.driver-popover-close-btn').click()");await b.wait("!document.querySelector('.driver-popover')");return true;};
  const go=async(path,ready,tour=true)=>{await b.command("Page.navigate",{url:api.base+path});await b.wait(ready,60000);if(tour)await closeTour();};
  const has=text=>`document.body.innerText.includes(${JSON.stringify(text)})`;
  const dialog=title=>`document.querySelector('[role="dialog"] h2')?.textContent===${JSON.stringify(title)}`;
  const type=(selector,value)=>b.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const press=prefix=>b.evaluate(`(()=>{const e=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().startsWith(${JSON.stringify(prefix)}));if(!e)throw Error('Missing button '+${JSON.stringify(prefix)});e.click();})()`);
  const shot=async name=>{await mkdir("artifacts",{recursive:true});await b.screenshot(`artifacts/leads-${name}.png`);};
  const errors=async where=>{const list=await b.evaluate("(()=>{const e=window.__errors||[];window.__errors=[];return e;})()");for(const item of list)note(`Browser error on ${where}: ${item}`);};
  const check=(condition,message)=>{if(!condition)note(message);};

  // 1. Empty state
  await go("/leads",has("Leads & CRM"));await b.wait(has("0 leads"));await shot("1-empty");await errors("empty leads page");

  // 2. Validation, then a real lead
  await b.click("Add lead");await b.wait(dialog("Add lead"));
  await b.click("Save lead");await b.wait(has("Name and company are required"));
  await b.fill("Full name *","Asha Verma");await b.fill("Company / brand *","Verma Organics");await b.fill("Email","not-an-email");
  await b.click("Save lead");await b.wait(has("Enter a valid email"));
  for(const [label,value] of [["Email","asha@vermaorganics.example"],["Phone","+91 98765 43210"],["Job title","Founder"],["Website","https://vermaorganics.example"],["Location","Pune"],["Industry","Beauty"],["Company size","11-50"],["Lead source","Referral"],["Tags","warm, priority"],["Deal value (₹)","150000"],["Notes","Met at the Pune expo."]])await b.fill(label,value);
  await b.evaluate(`[...document.querySelectorAll('[role="dialog"] button')].find(x=>x.textContent.trim()==='SEO').click()`);await shot("2-add-form");await b.click("Save lead");
  await b.wait(has("Verma Organics")+"&&!document.querySelector('[role=\"dialog\"]')");
  let data=await until(d=>d.leads.length===1,"first lead");const first=data.leads[0];
  assert.equal(first.email,"asha@vermaorganics.example");assert.deepEqual(first.tags,["warm","priority"]);assert.equal(first.dealValue,150000);assert.deepEqual(first.services,["SEO"]);assert.equal(first.industry,"Beauty");
  check(data.deals.filter(d=>d.leadId===first.id).length===1,"A new lead did not get exactly one linked opportunity.");
  await errors("add lead");

  // 3. Duplicate warning, save anyway, merge
  await b.click("Add lead");await b.wait(dialog("Add lead"));
  await b.fill("Full name *","Asha V.");await b.fill("Company / brand *","Verma Organics Pvt Ltd");await b.fill("Email","ASHA@vermaorganics.example");
  await b.wait(has("Possible duplicate"));await b.fill("Notes","Second note from a web form.");await b.click("Save lead");
  data=await until(d=>d.leads.length===2,"duplicate lead");
  await b.wait(`[...document.querySelectorAll('button')].some(x=>x.textContent.trim().startsWith('Duplicates')&&x.textContent.includes('1'))`);
  await press("Duplicates");await b.wait(has("Merge into selected"));await shot("3-duplicates");await b.click("Merge into selected");await b.wait(has("Leads merged"));
  data=await until(d=>d.leads.length===1,"merge");
  check(data.leads[0].notes.includes("Pune expo")&&data.leads[0].notes.includes("web form"),"Merge lost a note. Kept: "+JSON.stringify(data.leads[0].notes));
  check(data.deals.filter(d=>d.leadId===data.leads[0].id).length===1,`After merging, the lead has ${data.deals.filter(d=>d.leadId===data.leads[0].id).length} opportunities instead of 1.`);
  check(data.deals.every(d=>!d.leadId||data.leads.some(l=>l.id===d.leadId)),"After merging, an opportunity still points at the deleted lead.");
  await errors("merge");

  // 4. Paste import: one good, one duplicate of an existing lead, one invalid email, one duplicate inside the file, one invalid status
  await go("/leads?import=1",has("Import leads"),false);await new Promise(r=>setTimeout(r,2000));
  check(!await b.evaluate("!!document.querySelector('.driver-popover')"),"The guided tour opened on top of the Import dialog.");
  check(await b.evaluate(dialog("Import leads")),"The Import dialog closed by itself.");
  await b.fill("Or paste a bulk CSV list","Name,Company,Email,Phone,Status,Tags\nRavi Shah,Shah Foods,ravi@shahfoods.example,,Qualified,food;warm\nAsha Again,Verma Organics,asha@vermaorganics.example,,New,\nBad Row,Bad Co,bad-email,,New,\nRavi Copy,Shah Foods,RAVI@shahfoods.example,,New,\nMeera Nair,Nair Studio,,+91 90000 11111,Made Up Status,");
  await b.click("Preview pasted leads");await b.wait(has("Column mapping"));await shot("4-import-map");
  await press("Import ");await b.wait(has("leads imported"));await shot("4-import-result");
  const summary=await b.evaluate(`document.querySelector('[role="dialog"]').innerText`);
  data=await until(d=>d.leads.length>=2,"import");
  check(data.leads.length===2,`Import should add exactly 1 lead; the account now has ${data.leads.length}.`);
  check(summary.includes("4 skipped"),"Import summary should report 4 skipped: "+summary.replace(/\n+/g," | "));
  check(/Row 4/.test(summary)&&/Row 6/.test(summary),"Invalid rows are not listed with their row numbers: "+summary.replace(/\n+/g," | "));
  const ravi=data.leads.find(l=>l.name==="Ravi Shah");check(ravi?.status==="Qualified"&&["food","warm"].every(tag=>ravi?.tags.includes(tag)),"Imported status or tags were not kept: "+JSON.stringify(ravi&&{status:ravi.status,tags:ravi.tags}));
  await b.click("Done");await errors("import");

  // 5. Bulk tag + filter by tag
  await go("/leads",has("Ravi Shah"));
  await b.evaluate(`document.querySelector('thead input[type=checkbox]').click()`);await b.wait(has("selected"));
  await b.click("Tags");await type('input[placeholder="Tag name"]',"q4-push");
  await press("Add to 2");await b.wait(has("#q4-push"));
  data=await until(d=>d.leads.every(l=>l.tags.includes("q4-push")),"bulk tag");
  await b.fill("Tag filter","food");await b.wait(has("1 results"));

  // 6. Save the view, reload, apply it
  await b.click("Save view");await type('input[placeholder="View name"]',"Food leads");
  await b.click("Save current filters");await b.wait(has("View saved"));
  data=await until(d=>d.savedViews.some(v=>v.name==="Food leads"),"saved view");
  await go("/leads",has("Ravi Shah"));await b.wait(has("Food leads"));
  await press("Food leads");await b.wait(has("1 results"));await shot("6-saved-view");
  await errors("tags and views");

  // 7. Search
  await go("/leads",has("Ravi Shah"));
  await type('input[placeholder^="Search name"]',"pune");await b.wait(has("1 results"));
  check(await b.evaluate(`document.querySelector('tbody').innerText.includes('Asha Verma')&&!document.querySelector('tbody').innerText.includes('Ravi Shah')`),"Searching by city did not narrow to the right lead.");

  // 8. Lead profile: status, details, notes, score override; all must survive a reload
  const ashaId=data.leads.find(l=>l.name==="Asha Verma").id;
  await go(`/leads/${ashaId}`,has("Asha Verma"));
  const textarea=(placeholder,value)=>b.evaluate(`(()=>{const e=document.querySelector('textarea[placeholder^=${JSON.stringify(placeholder)}]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));e.blur();})()`);
  const mainButton=text=>b.evaluate(`(()=>{const e=[...document.querySelectorAll('main button')].find(x=>x.textContent.trim()===${JSON.stringify(text)});if(!e)throw Error('Missing button '+${JSON.stringify(text)});e.click();})()`);
  await mainButton("Qualified");await b.wait(has("Status → Qualified"));
  await textarea("Add notes","Prefers calls after 4pm.");
  await textarea("Record earlier calls","Called on Monday, asked for pricing.");
  await b.evaluate(`[...document.querySelectorAll('main *')].find(x=>x.children.length===0&&x.textContent.trim()==='Details').closest('div').parentElement.querySelector('button').click()`);
  await b.wait(has("Deal value (₹)"));await b.fill("Location","Mumbai");await b.fill("Deal value (₹)","275000");await b.fill("Name","");
  await mainButton("Save");await b.wait(has("Name and company are required"));
  await b.fill("Name","Asha Verma");await mainButton("Save");await b.wait(has("Lead updated"));
  await b.click("Override score");await b.fill("Manual score (0–100)","91");await b.fill("Reason","Referred by an existing client");
  await b.evaluate(`[...document.querySelectorAll('main button')].filter(x=>x.textContent.trim()!=='Cancel'&&x.closest('div')?.parentElement?.innerText.includes('Reason')).at(-1).click()`);await b.wait(has("Score overridden"));
  data=await until(d=>{const l=d.leads.find(x=>x.id===ashaId);return l.status==="Qualified"&&l.notes==="Prefers calls after 4pm."&&l.location==="Mumbai"&&l.dealValue===275000&&l.score?.override===91&&!!l.communicationHistory?.includes("pricing");},"profile edits");
  const ashaDeal=data.deals.find(d=>d.leadId===ashaId);
  check(ashaDeal?.stage==="Qualified",`Changing the lead status did not move its opportunity (pipeline shows ${ashaDeal?.stage}).`);
  check(ashaDeal?.value===275000,`Changing the deal value on the lead did not update its opportunity (pipeline still shows ${ashaDeal?.value}).`);
  await go(`/leads/${ashaId}`,has("Asha Verma"));await b.wait(has("Mumbai"));await shot("8-profile");
  check(await b.evaluate(has("91")),"The overridden score is not shown after a reload.");
  await errors("lead profile");
  await go("/leads/does-not-exist",has("Lead not found"));

  // 9. Custom fields: create a text and a select field, fill them on a new lead, see them on the profile
  await go("/settings?tab=fields",has("Lead custom fields"));
  await type('input[placeholder^="New field label"]',"Monthly ad budget");await b.click("Add field");await b.wait(has("Custom field added"));
  await type('input[placeholder^="New field label"]',"Buying stage");
  await b.evaluate(`(()=>{const e=[...document.querySelectorAll('form select')].at(-1);Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'select');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await b.wait(`!!document.querySelector('input[placeholder^="Options"]')`);await type('input[placeholder^="Options"]',"Exploring, Comparing, Ready");
  await b.click("Add field");await b.wait(`document.querySelectorAll('main tbody tr').length===2`);
  await type('input[placeholder^="New field label"]',"Monthly ad budget");await b.click("Add field");await b.wait(has("Field already exists"));
  await until(d=>JSON.stringify(d).includes("Buying stage"),"custom field definitions");
  await go("/leads?new=1",dialog("Add lead"),false);
  await b.fill("Full name *","Kiran Rao");await b.fill("Company / brand *","Rao Travels");await b.fill("Email","kiran@raotravels.example");
  await b.fill("Monthly ad budget","80000");await b.fill("Buying stage","Comparing");await b.click("Save lead");
  data=await until(d=>d.leads.some(l=>l.name==="Kiran Rao"),"lead with custom fields");
  const kiran=data.leads.find(l=>l.name==="Kiran Rao");
  check(Object.values(kiran.customFields??{}).sort().join()==="80000,Comparing","Custom field values were not saved on the lead: "+JSON.stringify(kiran.customFields));
  await go(`/leads/${kiran.id}`,has("Kiran Rao"));await b.wait(has("Custom fields"));
  check(await b.evaluate(`[...document.querySelectorAll('input')].some(e=>e.value==='80000')&&[...document.querySelectorAll('select')].some(e=>e.value==='Comparing')`),"Custom field values are not shown on the lead profile.");
  await shot("9-custom-on-profile");await errors("custom fields");

  // 9b. Real Excel file import, including a column named after a custom field
  const {zipSync,strToU8}=await import("fflate");const {writeFile,mkdtemp,rm}=await import("node:fs/promises");const {tmpdir}=await import("node:os");const {join}=await import("node:path");
  const cell=(ref,v)=>`<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`;
  const sheetRows=[["Name","Company","Email","Lead Source","Monthly ad budget"],["Divya Menon","Menon Decor","divya@menondecor.example","Referral","45000"],["Omar Khan","Khan Motors","omar@khanmotors.example","LinkedIn","120000"]];
  const sheet=`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows.map((r,y)=>`<row r="${y+1}">${r.map((v,x)=>cell(String.fromCharCode(65+x)+(y+1),v)).join("")}</row>`).join("")}</sheetData></worksheet>`;
  const xml=`<?xml version="1.0" encoding="UTF-8"?>`,pkg="http://schemas.openxmlformats.org/package/2006",doc="http://schemas.openxmlformats.org/officeDocument/2006/relationships",main="http://schemas.openxmlformats.org/spreadsheetml/2006/main",ct="application/vnd.openxmlformats-officedocument.spreadsheetml";
  const xlsx=zipSync({
    "[Content_Types].xml":strToU8(`${xml}<Types xmlns="${pkg}/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${ct}.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="${ct}.worksheet+xml"/></Types>`),
    "_rels/.rels":strToU8(`${xml}<Relationships xmlns="${pkg}/relationships"><Relationship Id="rId1" Type="${doc}/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml":strToU8(`${xml}<workbook xmlns="${main}" xmlns:r="${doc}"><sheets><sheet name="Leads" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels":strToU8(`${xml}<Relationships xmlns="${pkg}/relationships"><Relationship Id="rId1" Type="${doc}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`),
    "xl/worksheets/sheet1.xml":strToU8(sheet),
  });
  const folder=await mkdtemp(join(tmpdir(),"crm-leads-ui-"));const file=join(folder,"leads.xlsx");await writeFile(file,xlsx);
  try{
    await go("/leads?import=1",dialog("Import leads"),false);
    const root=(await b.command("DOM.getDocument")).root.nodeId;const input=(await b.command("DOM.querySelector",{nodeId:root,selector:'[role="dialog"] input[type="file"]'})).nodeId;
    await b.command("DOM.setFileInputFiles",{nodeId:input,files:[file]});
    await b.wait(has("Column mapping"));await b.wait(has("leads.xlsx"));await shot("9b-excel-map");
    check(await b.evaluate(`[...document.querySelectorAll('[role="dialog"] select')].some(e=>e.value.startsWith('custom:'))`),"The Excel column named after a custom field was not matched to it automatically.");
    await press("Import 2");await b.wait(has("leads imported"));
    data=await until(d=>d.leads.some(l=>l.name==="Omar Khan")&&d.leads.some(l=>l.name==="Divya Menon"),"Excel import");
    const omar=data.leads.find(l=>l.name==="Omar Khan");
    check(omar.source==="LinkedIn","Excel lead source was not kept: "+omar.source);
    check(Object.values(omar.customFields??{}).includes("120000"),"Excel custom field value was not kept: "+JSON.stringify(omar.customFields));
    await b.click("Done");
  }finally{await rm(folder,{recursive:true,force:true});}
  await errors("excel import");

  // 10. Mobile layout
  await b.command("Emulation.setDeviceMetricsOverride",{width:375,height:812,deviceScaleFactor:1,mobile:true});
  await go("/leads",has("Ravi Shah"));await shot("10-mobile");
  check(await b.evaluate("document.documentElement.scrollWidth<=innerWidth"),"Leads page scrolls sideways on a 375px phone.");
  await b.click("Add lead");await b.wait(dialog("Add lead"));await shot("10-mobile-add");
  check(await b.evaluate("document.documentElement.scrollWidth<=innerWidth"),"Add lead form scrolls sideways on a 375px phone.");
  await errors("mobile");
  console.log(findings.length?`DONE with ${findings.length} finding(s).`:"PASS: leads walkthrough with no findings.");
}catch(error){if(browser){await mkdir("artifacts",{recursive:true});await browser.screenshot("artifacts/leads-failure.png").catch(()=>{});}throw error;}
finally{await browser?.close();if(account)await account.remove();}

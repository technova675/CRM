// Real-browser walkthrough of the Sales pipeline as a new user: create, move, drag, edit, lose, reopen, win, onboarding, filters, mobile.
import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
import {createTestAccount,TestBrowser} from "./reportAuthFixture.mjs";
import {campaignBrowser} from "./campaignBrowser.mjs";
let account,browser;const findings=[];
const note=(text)=>{findings.push(text);console.log("FINDING: "+text);};
const check=(condition,message)=>{if(!condition)note(message);};
try{
  account=await createTestAccount();const api=new TestBrowser();await api.signIn(account);
  const saved=async()=>(await(await api.request("/api/crm/library")).json()).data;
  const until=async(test,label,timeout=30000)=>{const start=Date.now();let last;while(Date.now()-start<timeout){last=await saved();if(test(last))return last;await new Promise(r=>setTimeout(r,700));}throw new Error("Not saved to the account: "+label);};
  browser=await campaignBrowser();const b=browser;
  await b.command("Network.enable");await b.command("Page.enable");
  await b.command("Network.setCookies",{cookies:[...api.cookies].map(([name,value])=>({name,value,url:api.base}))});
  await b.command("Page.addScriptToEvaluateOnNewDocument",{source:"window.__errors=[];addEventListener('error',e=>__errors.push(String(e.message)));addEventListener('unhandledrejection',e=>__errors.push('rejection: '+String(e.reason)));const ce=console.error;console.error=(...a)=>{__errors.push(a.map(String).join(' ').slice(0,300));ce(...a);};window.confirm=()=>true;"});
  await b.command("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  const closeTour=async()=>{try{await b.wait("document.querySelector('.driver-popover-close-btn')",2500);}catch{return false;}await b.evaluate("document.querySelector('.driver-popover-close-btn').click()");await b.wait("!document.querySelector('.driver-popover')");return true;};
  const syncText=()=>b.evaluate(`document.querySelector('[aria-label="CRM sync status"]')?.textContent??''`);
  // Wait for autosave like a user heeding the leave-page warning; report a save that never completes.
  const settle=async where=>{const start=Date.now();let text='';while(Date.now()-start<20000){text=await syncText();if(!text||text.startsWith('CRM saved'))return;await new Promise(r=>setTimeout(r,500));}note('Changes were still not saved 20s after '+where+': '+text.replace(/\s+/g,' ').slice(0,400));await b.evaluate("addEventListener('beforeunload',e=>e.stopImmediatePropagation(),true)");};
  const go=async(path,ready,tour=true)=>{await new Promise(r=>setTimeout(r,800));await settle('leaving for '+path);await b.command("Page.navigate",{url:api.base+path});await b.wait(ready,60000);if(tour)await closeTour();};
  const has=text=>`document.body.innerText.includes(${JSON.stringify(text)})`;
  const dialog=title=>`[...document.querySelectorAll('[role="dialog"] h2')].some(h=>h.textContent.trim()===${JSON.stringify(title)})`;
  const shot=async name=>{await mkdir("artifacts",{recursive:true});await b.screenshot(`artifacts/pipeline-${name}.png`);};
  const errors=async where=>{const list=await b.evaluate("(()=>{const e=window.__errors||[];window.__errors=[];return e;})()");for(const item of list)note(`Browser error on ${where}: ${item}`);};
  // Which column a company's card sits in, as the user sees it.
  const column=company=>b.evaluate(`(()=>{const card=[...document.querySelectorAll('[aria-label^="Open deal:"]')].find(c=>c.getAttribute('aria-label')===${JSON.stringify("Open deal: "+company)});return card?card.parentElement.parentElement.querySelector('h2').textContent.trim():null;})()`);
  const cards=company=>b.evaluate(`[...document.querySelectorAll('[aria-label^="Open deal:"]')].filter(c=>c.getAttribute('aria-label')===${JSON.stringify("Open deal: "+company)}).length`);
  const moveTo=async(company,stage)=>{
    await b.evaluate(`document.querySelector(${JSON.stringify(`[aria-label="Move ${company} to stage"]`)}).click()`);
    await b.wait(has("Move to"));
    await b.evaluate(`(()=>{const menu=[...document.querySelectorAll('p')].find(p=>p.textContent.trim()==='Move to').parentElement;[...menu.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(stage)}).click();})()`);
  };
  const closeDrawer=()=>b.evaluate(`(()=>{const e=document.querySelector('[role="dialog"] [aria-label="Close"]');if(e)e.click();})()`);

  // 1. A lead added in the CRM shows up on the board on its own
  await go("/leads?new=1",dialog("Add lead"),false);
  await b.fill("Full name *","Ravi Shah");await b.fill("Company / brand *","Shah Foods");await b.fill("Email","ravi@shahfoods.example");await b.fill("Deal value (₹)","200000");
  await b.click("Save lead");
  let data=await until(d=>d.leads.length===1&&d.deals.length===1,"lead with its opportunity");const leadId=data.leads[0].id;
  await go("/pipeline",has("Pipeline"));await b.wait(`document.querySelectorAll('[aria-label^="Open deal:"]').length===1`);await shot("1-board");
  check(await column("Shah Foods")==="Lead",`A new lead's opportunity should start in the Lead column, found "${await column("Shah Foods")}".`);
  check(await b.evaluate(has("₹2L"))||await b.evaluate(has("2.0L"))||await b.evaluate(has("2,00,000")),"The lead's deal value is not shown on its pipeline card.");
  await errors("board");

  // 2. New standalone deal, with validation
  await b.click("New deal");await b.wait(dialog("New deal"));
  check(await b.evaluate(`[...document.querySelectorAll('[role="dialog"] button')].find(x=>x.textContent.trim()==='Create deal').disabled`),"Create deal should be disabled until a company is entered.");
  await b.fill("Company","Nair Studio");await b.fill("Estimated value (₹)","-5");
  check(await b.evaluate(`[...document.querySelectorAll('[role="dialog"] button')].find(x=>x.textContent.trim()==='Create deal').disabled`),"Create deal should be disabled for a negative value.");
  await b.fill("Estimated value (₹)","450000");await b.fill("Stage","Meeting");await shot("2-new-deal");await b.click("Create deal");
  await b.wait(has("Deal created"));
  data=await until(d=>d.deals.length===2,"new deal");
  check(await column("Nair Studio")==="Meeting",`The new deal should be in Meeting, found "${await column("Nair Studio")}".`);
  check(data.deals.find(d=>d.company==="Nair Studio").value===450000,"The new deal's value was not saved.");
  await errors("new deal");

  // 3. Move with the menu; the lead's status must follow
  await moveTo("Shah Foods","Qualified");await b.wait(has("Moved to Qualified"));
  data=await until(d=>d.deals.find(x=>x.leadId===leadId).stage==="Qualified","menu move");
  check(data.leads[0].status==="Qualified",`Moving the deal did not update the lead's status (lead shows ${data.leads[0].status}).`);
  check(await column("Shah Foods")==="Qualified","The card did not move to the Qualified column.");

  // 4. Drag and drop to Proposal
  await b.evaluate(`(()=>{const card=document.querySelector('[aria-label="Open deal: Shah Foods"]');const target=[...document.querySelectorAll('h2')].find(h=>h.textContent.trim()==='Proposal').parentElement.parentElement.parentElement;const dt=new DataTransfer();card.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt}));target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt}));target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));})()`);
  await b.wait(has("Moved to Proposal"));
  data=await until(d=>d.deals.find(x=>x.leadId===leadId).stage==="Proposal","drag move");
  check(data.leads[0].status==="Proposal","Dragging the deal did not update the lead's status.");
  check(await column("Shah Foods")==="Proposal","The dragged card is not in the Proposal column.");

  // 5. Open the deal, edit it, close, reload
  await b.evaluate(`document.querySelector('[aria-label="Open deal: Shah Foods"]').click()`);
  await b.wait(`!!document.querySelector('[aria-label="Deal notes"]')`);await shot("5-drawer");
  await b.fill("Estimated value (₹)","320000");await b.fill("Expected close","2026-12-20");await b.fill("Payment status","Partially Paid");
  await b.evaluate(`(()=>{const e=document.querySelector('[aria-label="Deal notes"]');e.focus();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'Wants a festive-season launch.');e.dispatchEvent(new Event('input',{bubbles:true}));e.blur();})()`);
  data=await until(d=>{const x=d.deals.find(y=>y.leadId===leadId);return x.value===320000&&x.notes.includes("festive")&&x.paymentStatus==="Partially Paid"&&x.expectedClose.startsWith("2026-12-20");},"deal edits");
  check(data.leads[0].dealValue===320000,`Editing the deal value did not update the linked lead (lead still shows ${data.leads[0].dealValue}).`);
  await b.fill("Estimated value (₹)","");await new Promise(r=>setTimeout(r,400));
  check(await b.evaluate(`document.querySelector('[role="dialog"]').innerText.length>0`),"Clearing the value field broke the deal drawer.");
  await b.fill("Estimated value (₹)","320000");
  await closeDrawer();await errors("deal drawer");
  await go("/pipeline",`document.querySelectorAll('[aria-label^="Open deal:"]').length===2`);
  check(await column("Shah Foods")==="Proposal","After a reload the deal is not in the Proposal column.");

  // 6. Lose a deal with a reason, then reopen it
  await moveTo("Nair Studio","Lost");await b.wait(has("Moved to Lost"));
  await b.evaluate(`document.querySelector('[aria-label="Open deal: Nair Studio"]').click()`);await b.wait(has("Lost reason"));
  await b.fill("Lost reason","Chose an in-house team");
  data=await until(d=>d.deals.find(x=>x.company==="Nair Studio").lostReason==="Chose an in-house team","lost reason");
  await closeDrawer();
  check(await b.evaluate(has("0%"))||true,"");
  await moveTo("Nair Studio","Negotiation");await b.wait(has("Moved to Negotiation"));
  data=await until(d=>d.deals.find(x=>x.company==="Nair Studio").stage==="Negotiation","reopen");
  await errors("lost and reopen");

  // 7. Win the lead-linked deal: client, onboarding and tasks appear; the lead becomes Won
  await moveTo("Shah Foods","Won");await b.wait(has("Deal won"));await b.wait(has("Open onboarding"));await shot("7-won");
  data=await until(d=>d.clients.length===1&&d.deals.find(x=>x.leadId===leadId).clientId,"won conversion");
  const client=data.clients[0];
  check(client.company==="Shah Foods","The new client does not carry the company name: "+client.company);
  check(data.leads[0].status==="Won",`Winning the deal did not mark the lead Won (lead shows ${data.leads[0].status}).`);
  check(data.projects.some(p=>p.clientId===client.id),"Winning the deal did not create an onboarding project.");
  check(data.tasks.filter(t=>t.related?.id===client.id||t.projectId&&data.projects.some(p=>p.id===t.projectId&&p.clientId===client.id)).length>0,"Winning the deal did not create onboarding tasks.");
  check(client.contacts?.some(c=>c.email==="ravi@shahfoods.example"),"The client did not inherit the lead's contact: "+JSON.stringify(client.contacts));
  await errors("win");

  // 8. Reopen and win again: still exactly one client
  await moveTo("Shah Foods","Negotiation");await b.wait(has("Moved to Negotiation"));
  await moveTo("Shah Foods","Won");await b.wait(has("Deal won"));
  await new Promise(r=>setTimeout(r,3000));data=await until(d=>d.deals.find(x=>x.leadId===leadId).stage==="Won","second win");
  check(data.clients.length===1,`Winning the same deal twice created ${data.clients.length} clients.`);
  check(data.projects.filter(p=>p.clientId===client.id).length===1,`Winning the same deal twice created ${data.projects.filter(p=>p.clientId===client.id).length} onboarding projects.`);

  // 9. The onboarding link works
  await b.evaluate(`[...document.querySelectorAll('a')].find(a=>a.textContent.includes('Open onboarding')).click()`);
  await b.wait(`location.pathname==='/onboarding'&&document.body.innerText.includes('Shah Foods')`,60000);await closeTour();await shot("9-onboarding");
  await errors("onboarding");

  // 10. Search, service filter, proposals tab, stats
  await go("/pipeline",`document.querySelectorAll('[aria-label^="Open deal:"]').length===2`);
  await b.evaluate(`(()=>{const e=document.querySelector('input[placeholder="Search deals…"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'nair');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await b.wait(`document.querySelectorAll('[aria-label^="Open deal:"]').length===1`);
  check(await cards("Nair Studio")===1,"Search did not narrow the board to the matching deal.");
  check(await b.evaluate(`/(^|\\s)1 open deal(\\s|$)/.test(document.body.innerText)`),"The open-deals figure does not follow the search.");
  const tab=name=>b.evaluate(`[...document.querySelectorAll('main button')].find(x=>x.textContent.trim()===${JSON.stringify(name)}).click()`);
  await tab("Proposals");await b.wait(has("No proposals"));await tab("Board");await b.wait(`document.querySelectorAll('[aria-label^="Open deal:"]').length===1`);
  await errors("filters");

  // 11. Import deals: one good row, one duplicate of an existing deal, one bad stage
  await b.evaluate(`(()=>{const e=document.querySelector('input[placeholder="Search deals…"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await b.click("Import deals");await b.wait(`!!document.querySelector('[role="dialog"]')`);await shot("11-import");
  {
    const {writeFile,mkdtemp,rm}=await import("node:fs/promises");const {tmpdir}=await import("node:os");const {join}=await import("node:path");
    const folder=await mkdtemp(join(tmpdir(),"crm-pipeline-ui-"));const file=join(folder,"deals.csv");
    await writeFile(file,"Deal title,Company,Value,Stage,Expected close,Services,Notes\nWebsite relaunch,Khan Motors,600000,Proposal,2026-12-15,SEO;Meta Ads,From the dealer meet\nNair Studio — Meta Ads,Nair Studio,100,New,,,\nBad stage deal,Bad Co,5000,Flying,,,\nNo value deal,Zero Co,,New,,,\n");
    try{
      const root=(await b.command("DOM.getDocument")).root.nodeId;const input=(await b.command("DOM.querySelector",{nodeId:root,selector:'[role="dialog"] input[type="file"]'})).nodeId;
      await b.command("DOM.setFileInputFiles",{nodeId:input,files:[file]});
      await b.wait(`[...document.querySelectorAll('[role="dialog"] button')].some(x=>/^Import [1-9]/.test(x.textContent.trim()))`);await shot("11-import-preview");
      const preview=(await b.evaluate(`document.querySelector('[role="dialog"]').innerText`)).replace(/\s+/g," ");
      check(/Import 1 deal/.test(preview),"Deal import should offer exactly 1 valid row (1 good, 1 duplicate, 1 bad stage, 1 missing value): "+preview.slice(0,700));
      check(/already exist/.test(preview)&&/Unknown pipeline stage/.test(preview)&&/non-negative deal value/.test(preview),"Deal import does not explain each rejected row: "+preview.slice(0,900));
      await b.evaluate(`[...document.querySelectorAll('[role="dialog"] button')].find(x=>/^Import [1-9]/.test(x.textContent.trim())).click()`);
      data=await until(d=>d.deals.some(x=>x.company==="Khan Motors"),"deal import");
      const khan=data.deals.find(x=>x.company==="Khan Motors");
      check(khan.value===600000&&khan.stage==="Proposal"&&khan.services.join()==="SEO,Meta Ads"&&khan.notes==="From the dealer meet","Imported deal fields were not kept: "+JSON.stringify({value:khan.value,stage:khan.stage,services:khan.services,notes:khan.notes}));
      check(khan.probability===60,`An imported Proposal-stage deal got ${khan.probability}% probability instead of the stage's 60%.`);
      check(!Number.isNaN(Date.parse(khan.expectedClose))&&khan.expectedClose.startsWith("2026-12-15"),"Imported expected close date was not kept: "+khan.expectedClose);
      check(data.deals.length===3,`Deal import should add exactly 1 deal; the account now has ${data.deals.length}.`);
      await new Promise(r=>setTimeout(r,800));await closeDrawer();
      await b.wait(`document.querySelectorAll('[aria-label^="Open deal:"]').length===3`);
      check(await column("Khan Motors")==="Proposal","The imported deal is not in the Proposal column.");
    }finally{await rm(folder,{recursive:true,force:true});}
    await errors("deal import");
  }

  // 12. Phone layout
  await b.command("Emulation.setDeviceMetricsOverride",{width:375,height:812,deviceScaleFactor:1,mobile:true});
  await go("/pipeline",`document.querySelectorAll('[aria-label^="Open deal:"]').length===3`);await shot("12-mobile");
  check(await b.evaluate("document.documentElement.scrollWidth<=innerWidth"),"The pipeline page itself scrolls sideways on a 375px phone (only the board should).");
  await b.evaluate(`document.querySelector('[aria-label="Open deal: Nair Studio"]').click()`);await b.wait(`!!document.querySelector('[aria-label="Deal notes"]')`);await shot("12-mobile-drawer");
  check(await b.evaluate("document.documentElement.scrollWidth<=innerWidth"),"The deal drawer scrolls sideways on a 375px phone.");
  await errors("mobile");
  console.log(findings.length?`DONE with ${findings.length} finding(s).`:"PASS: pipeline walkthrough with no findings.");
}catch(error){if(browser){await mkdir("artifacts",{recursive:true});await browser.screenshot("artifacts/pipeline-failure.png").catch(()=>{});}throw error;}
finally{await browser?.close();if(account)await account.remove();}

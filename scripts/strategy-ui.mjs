import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createTestAccount,TestBrowser} from './reportAuthFixture.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
let account,browser;
try{
 account=await createTestAccount();const api=new TestBrowser();await api.signIn(account);
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await context.addCookies([...api.cookies].map(([name,value])=>({name,value,url:api.base})));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(api.base+'/strategy?new=1');await page.getByRole('heading',{name:'New marketing strategy',exact:true}).waitFor({timeout:60000});
 await page.getByRole('button',{name:'Structured planning draft',exact:true}).click();await page.getByRole('alert').filter({hasText:'Complete business'}).waitFor();
 for(const [label,value] of [['Business','Scheduling Studio'],['Product / offer','Booking software'],['Audience','Independent clinic owners'],['Goals','Qualified demo bookings'],['Geography','Pune'],['Monthly budget (₹)','50000'],['Current performance','No measured baseline'],['Competitors','Not supplied'],['Existing channels','Search, Content']])await page.getByLabel(label,{exact:true}).fill(value);
 await page.getByRole('button',{name:'Structured planning draft',exact:true}).click();await page.getByRole('heading',{name:'Customer personas',exact:true}).waitFor({timeout:60000});
 for(const title of ['Marketing strategy','Customer personas','Funnel','Channel strategy','Campaign strategy','Creative strategy','Content pillars','Budget allocation','Testing roadmap','KPI framework'])assert.equal(await page.getByRole('heading',{name:title,exact:true}).count(),1);
 await page.getByRole('button',{name:'Submit for approval',exact:true}).click();await page.getByRole('button',{name:'Approve',exact:true}).click();await page.getByText('Strategy approved',{exact:true}).waitFor({timeout:30000});
 const editable=page.locator('span[role="button"]').filter({hasText:'Proposed plan for Scheduling Studio'}).first();await editable.click();await page.getByLabel('Edit strategy text',{exact:true}).fill('Strategist edited summary for clinic demo growth.');await page.getByLabel('Edit strategy text',{exact:true}).press('Tab');await page.getByRole('button',{name:'Submit for approval',exact:true}).waitFor();
 await page.getByText("CRM saved to your account",{exact:true}).waitFor();await page.reload();await page.getByText('Strategist edited summary for clinic demo growth.',{exact:true}).waitFor({timeout:60000});assert.equal(await page.getByRole('button',{name:'Approve',exact:true}).count(),0);
 await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/strategy-desktop.png',fullPage:true});await page.setViewportSize({width:375,height:812});await page.screenshot({path:'artifacts/strategy-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile overflow');
 const data=(await(await api.request('/api/crm/library')).json()).data;assert.equal(data.strategies[0].status,'Draft');assert.equal(data.strategies[0].approvedAt,undefined);assert.equal(data.approvals.filter(a=>a.status==='pending'&&a.ref?.type==='strategy').length,0);assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: nine brief inputs, ten strategy outputs, strategist approval, edit resets approval, persisted reload and desktop/mobile layout.');
}finally{await browser?.close();if(account)await account.remove();}


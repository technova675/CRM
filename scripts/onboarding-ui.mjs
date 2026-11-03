import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
// Use a separately installed Playwright module via PLAYWRIGHT_MODULE_PATH (file URL).
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
import {createTestAccount,TestBrowser} from './reportAuthFixture.mjs';
let account,browser;
try{
 account=await createTestAccount();const api=new TestBrowser();await api.signIn(account);const library=await(await api.request('/api/crm/library')).json(),at=new Date().toISOString();
 const lead={id:'ui-lead',name:'Jordan Client',company:'Onboarding Studio',email:'jordan@example.com',phone:'',jobTitle:'Founder',industry:'Other',location:'',companySize:'Unknown',ownerId:account.id,status:'Negotiation',source:'Website',services:['SEO'],tags:[],notes:'',createdAt:at};
 const deal={id:'ui-deal',title:'Studio SEO',company:lead.company,leadId:lead.id,value:12000,services:['SEO'],probability:100,expectedClose:at,ownerId:account.id,stage:'Won',notes:'',paymentStatus:'Pending',createdAt:at};
 const response=await api.request('/api/crm/library',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({...library,operationId:crypto.randomUUID(),data:{...library.data,leads:[lead],deals:[deal]}})});assert.equal(response.status,200);const saved=await response.json(),id=saved.data.clients[0].id;
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await context.addCookies([...api.cookies].map(([name,value])=>({name,value,url:api.base})));
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(`${api.base}/onboarding?client=${id}`);await page.getByRole('heading',{name:'Welcome message',exact:true}).waitFor({timeout:60000});
 for(const title of ['Welcome message','Onboarding form','Brand assets','Account access','Onboarding checklist','Onboarding tasks','Team assignment'])assert.equal(await page.getByRole('heading',{name:title,exact:true}).count(),1);
 await page.getByRole('button',{name:'Approve welcome',exact:true}).click();await page.getByText('Saved to your account.',{exact:true}).waitFor();
 await page.getByLabel('Delivery record (channel and reference)').fill('Email delivered manually, verification fixture');await page.getByLabel('I delivered this approved message externally').check();await page.getByRole('button',{name:'Record welcome delivery'}).click();await page.getByText('Sent externally',{exact:true}).waitFor();
 await page.getByLabel('Business goals *',{exact:true}).fill('Grow qualified leads');await page.getByLabel('Target audience *',{exact:true}).fill('Independent businesses');await page.getByRole('button',{name:'Record form completed'}).click();await page.getByText('Completed with client',{exact:true}).waitFor();
 await page.getByLabel('Google Search Console: Account ID / workspace',{exact:true}).fill('sc-domain:example.com');await page.getByLabel('Google Search Console status',{exact:true}).selectOption('Verified');await page.getByText('Saved to your account.',{exact:true}).waitFor();
 await page.getByLabel('SEO delivery',{exact:true}).selectOption(account.id);await page.getByText('Saved to your account.',{exact:true}).waitFor();
 await page.getByLabel('Logo link',{exact:true}).fill('https://example.com/logo.png');await page.getByLabel('Logo link',{exact:true}).press('Tab');await page.locator('#onboarding-assets').getByRole('button',{name:'Approve asset',exact:true}).first().click();await page.locator('#onboarding-assets').getByText('Approved',{exact:true}).waitFor();
 await page.getByLabel('Website CMS status',{exact:true}).selectOption('Not required');await page.getByText('Record a waiver reason in access notes first.',{exact:true}).waitFor();await page.getByLabel('Website CMS: Access notes / waiver reason',{exact:true}).fill('Client will make approved website changes');await page.getByLabel('Website CMS status',{exact:true}).selectOption('Not required');await page.getByText('Saved to your account.',{exact:true}).waitFor();
 await page.getByRole('checkbox',{name:'Review won deal and commercial terms',exact:true}).click();await page.getByText('Saved to your account.',{exact:true}).waitFor();assert.equal(await page.getByRole('checkbox',{name:'Review won deal and commercial terms',exact:true}).getAttribute('aria-checked'),'true');
 await page.getByLabel('Review commercial terms and billing — Onboarding Studio status',{exact:true}).selectOption('In Progress');await page.getByText('Saved to your account.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Reload saved form',exact:true}).click();assert.equal(await page.getByLabel('Business goals *',{exact:true}).inputValue(),'Grow qualified leads');
 await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/onboarding-desktop.png',fullPage:true});await page.setViewportSize({width:375,height:812});await page.screenshot({path:'artifacts/onboarding-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile document overflow');
 await page.reload();await page.getByText('Completed with client',{exact:true}).waitFor({timeout:60000});assert.equal(await page.getByLabel('Google Search Console status',{exact:true}).inputValue(),'Verified');assert.equal(await page.getByLabel('SEO delivery',{exact:true}).inputValue(),account.id);assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: seven visible sections, welcome approval/delivery record, completed intake, verified access, team assignment, persisted reload and desktop/mobile layout without runtime errors. No message sent.');
}finally{await browser?.close();if(account)await account.remove();}


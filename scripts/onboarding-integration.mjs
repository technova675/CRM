import assert from 'node:assert/strict';
import {createTestAccount,TestBrowser} from './reportAuthFixture.mjs';
import {removeOnboardingAsset,contentHash} from '../lib/reportR2.ts';
let account,other,file,clientId,assetId;
try{
 account=await createTestAccount();other=await createTestAccount();const a=new TestBrowser(),b=new TestBrowser();await a.signIn(account);await b.signIn(other);
 let library=await(await a.request('/api/crm/library')).json();const at=new Date().toISOString();
 library.data.leads=[{id:'onboarding-lead',name:'Ada Client',company:'Onboarding Example',email:'ada@example.com',phone:'',jobTitle:'Founder',industry:'Other',location:'',companySize:'Unknown',ownerId:account.id,status:'Negotiation',source:'Website',services:['SEO'],tags:[],notes:'',createdAt:at}];
 library.data.deals=[{id:'onboarding-deal',title:'Onboarding example opportunity',company:'Onboarding Example',leadId:'onboarding-lead',value:12000,services:['SEO'],probability:100,expectedClose:at,ownerId:account.id,stage:'Won',notes:'',paymentStatus:'Pending',createdAt:at}];
 async function save(){const response=await a.request('/api/crm/library',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({...library,operationId:crypto.randomUUID()})});assert.equal(response.status,200,JSON.stringify(await response.clone().json()));library=await(await a.request('/api/crm/library')).json();}
 await save();const c=library.data.clients[0];clientId=c.id;assetId=c.onboardingWorkspace.assets[0].id;const path=`/api/onboarding/${clientId}/assets/${assetId}`;
 assert.equal(c.onboardingWorkspace.welcome.status,'Draft');assert.equal(c.onboardingWorkspace.form.status,'Draft');assert.equal(library.data.tasks.filter(t=>t.onboardingKey).length,6);
 assert.equal((await b.request(path)).status,404);assert.equal((await new TestBrowser().request(path)).status,401);
 assert.equal((await a.request(path,{method:'POST',headers:{origin:'https://unrelated.example'}})).status,403);
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
 const upload=await a.request(path,{method:'POST',headers:{'x-file-name':'verification.png','x-upload-id':crypto.randomUUID()},body:bytes});assert.equal(upload.status,200,JSON.stringify(await upload.clone().json()));file=(await upload.json()).file;assert.equal(file.sha256,contentHash(bytes));
 c.onboardingWorkspace.assets[0]={...c.onboardingWorkspace.assets[0],file,status:'Received'};c.onboarding.find(s=>s.key==='obw_assets').done=true;
 await save();assert.equal(library.data.clients[0].onboarding.find(s=>s.key==='obw_assets').done,false);
 const download=await a.request(path);assert.equal(download.status,200);assert.match(download.headers.get('content-disposition'),/attachment/);assert.equal(contentHash(new Uint8Array(await download.arrayBuffer())),file.sha256);
 const w=library.data.clients[0].onboardingWorkspace;w.form={...w.form,goals:'Qualified demand',audience:'Small businesses',status:'Submitted',submittedAt:at,submittedBy:account.id};w.assignments=w.assignments.map(x=>({...x,memberId:account.id}));await save();
 const laptop=new TestBrowser();await laptop.signIn(account);const shared=await(await laptop.request('/api/crm/library')).json();assert.equal(shared.data.clients[0].onboardingWorkspace.form.goals,'Qualified demand');assert.equal(shared.data.clients[0].onboarding.find(s=>s.key==='obw_form').done,true);assert.equal(shared.data.tasks.find(t=>t.onboardingKey==='form').status,'Done');
 const ids=library.data.tasks.map(t=>t.id);await save();assert.deepEqual(library.data.tasks.map(t=>t.id),ids);assert.equal(library.data.clients.length,1);assert.equal(library.data.projects.length,1);
 console.log('PASS: Won workspace, shared account form, derived checklist/tasks, retry-safe onboarding, private R2 upload/download integrity, cross-account isolation and origin checks.');
}finally{if(file&&account)await removeOnboardingAsset(account.id,clientId,assetId,file);if(account)await account.remove();if(other)await other.remove();}

import assert from 'node:assert/strict';
import {createTestAccount,TestBrowser} from './reportAuthFixture.mjs';
import {strategyDocSchema,strategyReviewIssues} from '../lib/domain/strategy.ts';
export const strategyBrief={business:'Example scheduling software',product:'Online appointment booking for independent clinics',audience:'Clinic owners and practice managers',geography:'Pune, India',goals:'Generate qualified product demos',monthlyBudget:50000,currentPerformance:'No measured campaign baseline yet',competitors:'Not supplied',channels:'Search, Organic content'};
let account,other;
try{
 account=await createTestAccount();other=await createTestAccount();const a=new TestBrowser(),b=new TestBrowser();await a.signIn(account);await b.signIn(other);
 const generate=(browser,extra={})=>browser.request('/api/ai/strategy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({inputs:strategyBrief,mode:'structured',...extra})});
 assert.equal((await generate(new TestBrowser())).status,401);assert.equal((await a.request('/api/ai/strategy',{method:'POST',headers:{origin:'https://unrelated.example'}})).status,403);
 assert.equal((await generate(a,{inputs:{...strategyBrief,monthlyBudget:-1}})).status,400);assert.equal((await generate(a,{clientId:crypto.randomUUID()})).status,404);
 const draftResponse=await generate(a);assert.equal(draftResponse.status,200,JSON.stringify(await draftResponse.clone().json()));const doc=(await draftResponse.json()).doc;assert.equal(strategyDocSchema.safeParse(doc).success,true);assert.deepEqual(strategyReviewIssues(doc),[]);assert.match(doc.generationSource,/Structured/);
 let library=await(await a.request('/api/crm/library')).json();library.data.strategies=[doc];
 async function put(data=library.data){return a.request('/api/crm/library',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({revision:library.revision,operationId:crypto.randomUUID(),data})});}
 async function save(){const response=await put();assert.equal(response.status,200,JSON.stringify(await response.clone().json()));library=await(await a.request('/api/crm/library')).json();}
 await save();const invalid=structuredClone(library.data);invalid.strategies[0]={...doc,status:'Approved',approvedAt:new Date().toISOString(),approvedBy:account.id};assert.equal((await put(invalid)).status,400);
 library.data.strategies[0].status='In Review';await save();library.data.strategies[0]={...library.data.strategies[0],status:'Approved',approvedAt:new Date().toISOString(),approvedBy:account.id};await save();
 const edit=structuredClone(library.data);edit.strategies[0].summary='Edited after approval';assert.equal((await put(edit)).status,400);
 library.data.strategies[0]={...library.data.strategies[0],summary:'Edited after approval',status:'Draft',approvedAt:undefined,approvedBy:undefined};await save();
 const secondLaptop=new TestBrowser();await secondLaptop.signIn(account);assert.equal((await(await secondLaptop.request('/api/crm/library')).json()).data.strategies[0].summary,'Edited after approval');assert.equal((await(await b.request('/api/crm/library')).json()).data.strategies.length,0);
 assert.equal((await generate(b,{existingId:doc.id})).status,404);const regen=await generate(a,{existingId:doc.id});assert.equal(regen.status,200);const next=(await regen.json()).doc;assert.equal(next.version,2);assert.equal(next.status,'Draft');assert.equal(next.approvedAt,undefined);assert.equal(next.createdAt,doc.createdAt);
 if(process.env.STRATEGY_TEST_LIVE==='1'){const live=await fetch(a.base+'/api/ai/strategy',{method:'POST',headers:{'content-type':'application/json',origin:a.base,cookie:[...a.cookies].map(([k,v])=>k+'='+v).join('; ')},body:JSON.stringify({inputs:strategyBrief,mode:'ai'}),signal:AbortSignal.timeout(115000)});assert.equal(live.status,200,JSON.stringify(await live.clone().json()));const generated=(await live.json()).doc;assert.equal(strategyDocSchema.safeParse(generated).success,true);assert.deepEqual(strategyReviewIssues(generated),[]);assert.doesNotMatch(generated.generationSource,/fallback/);console.log('PASS: live AI generated all ten strategy outputs with a balanced budget.');}
 console.log('PASS: strategy generation, validation, review-before-approval, approval invalidation, cross-laptop sharing, account isolation and versioned regeneration.');
}finally{if(account)await account.remove();if(other)await other.remove();}


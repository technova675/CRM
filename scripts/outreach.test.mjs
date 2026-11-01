import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {suppressed,destination,dueFollowUp,sendWindowOpen,withOptOut} from "../lib/domain/outreach.ts";
import {approvalSignature,matchesSecret} from "../lib/domain/outreachApproval.ts";
const lead={id:"lead",name:"Ada",company:"Company",email:" Ada@Example.com ",phone:"+91 (98765) 43210",linkedin:"https://linkedin.com/company/example",instagram:"@example"};
test("suppression normalizes email, domain, phone and always honors lead opt-out",()=>{
 for(const value of ["ada@example.com","EXAMPLE.COM","@example.com","+919876543210"]){assert.equal(suppressed(lead,[{value}]),true);}
 assert.equal(suppressed({...lead,optedOut:true},[]),true);assert.equal(suppressed(lead,[{value:"other.example"}]),false);assert.equal(suppressed(lead,[{value:""}]),false);
 assert.equal(destination(lead,"Email"),"ada@example.com");assert.equal(destination(lead,"WhatsApp"),"+919876543210");
});
test("content approval is bound to owner, campaign, lead, touch, channel, destination and draft",()=>{
 const recipient={leadId:lead.id,stepIndex:0,draft:"Hi Ada. Reply stop to opt out."};const sign=(owner="account",campaign="campaign",l=lead,r=recipient,channel="Email")=>approvalSignature("server-secret",owner,campaign,l,r,channel);
 const signature=sign();assert.equal(matchesSecret(signature,sign()),true);assert.equal(matchesSecret(signature,"bad"),false);
 for(const other of [sign("other"),sign("account","other"),sign("account","campaign",{...lead,id:"other"}),sign("account","campaign",{...lead,email:"else@example.com"}),sign("account","campaign",lead,{...recipient,draft:"Edited"}),sign("account","campaign",lead,{...recipient,stepIndex:1}),sign("account","campaign",lead,recipient,"LinkedIn")])assert.notEqual(signature,other);
});
test("follow-ups become due by their offset, not every time the runner is clicked",()=>{
 const sequence={steps:[{dayOffset:0},{dayOffset:3},{dayOffset:7}],sendWindow:{startHour:9,endHour:18,weekdaysOnly:true}};
 const recipient={state:"sent",stepIndex:1,lastSentAt:"2026-11-02T10:00:00Z"};
 assert.equal(dueFollowUp(recipient,sequence,new Date("2026-11-05T09:59:00Z")),false);assert.equal(dueFollowUp(recipient,sequence,new Date("2026-11-05T10:00:00Z")),true);assert.equal(dueFollowUp({...recipient,state:"replied"},sequence,new Date("2026-11-06")),false);
 assert.equal(sendWindowOpen(sequence,new Date("2026-11-02T10:00Z")),true);assert.equal(sendWindowOpen(sequence,new Date("2026-11-01T10:00Z")),false);assert.equal(sendWindowOpen(sequence,new Date("2026-11-02T18:00Z")),false);
});
test("every rendered draft can include an opt-out without duplicating it",()=>{const once=withOptOut("Hi Ada");assert.match(once,/Reply stop/);assert.equal(withOptOut(once),once);});
const pg=new PGlite();
before(async()=>{await pg.exec("create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to service_role;create schema auth;create table auth.users(id uuid primary key);");await pg.exec(await readFile(new URL("../supabase/migrations/202611010007_outreach_delivery.sql",import.meta.url),"utf8"));});
after(()=>pg.close());
test("delivery claims are account-scoped, idempotent and enforce a shared daily cap",async()=>{
 const owner=crypto.randomUUID(),other=crypto.randomUUID();await pg.query("insert into auth.users values($1),($2)",[owner,other]);
 const claim=async(o,leadId="lead",limit=1)=>(await pg.query("select public.claim_outreach_delivery($1,$2,'campaign',$3,0,'Email','hash',$4) as value",[crypto.randomUUID(),o,leadId,limit])).rows[0].value;
 await pg.exec("set role service_role");
 const first=await claim(owner),retry=await claim(owner),limit=await claim(owner,"second"),separate=await claim(other);
 assert.equal(first.claimed,true);assert.equal(retry.claimed,false);assert.equal(retry.delivery.id,first.delivery.id);assert.match(limit.error,/limit/);assert.equal(separate.claimed,true);
 await pg.query("select public.finish_outreach_delivery($1,$2,'unknown',null,'Connection interrupted')",[first.delivery.id,owner]);assert.equal((await claim(owner)).delivery.status,"unknown");
 await pg.exec("reset role");
});
test("tracking events are deduplicated and ledger access is denied to browser roles",async()=>{
 const owner=crypto.randomUUID(),delivery=crypto.randomUUID();await pg.query("insert into auth.users values($1)",[owner]);
 await pg.query("select public.claim_outreach_delivery($1,$2,'c','l',0,'Email','hash',10)",[delivery,owner]);
 const event=async()=>(await pg.query("select public.record_outreach_event('evt-test',$1,'unsubscribed',now()) as recorded",[delivery])).rows[0].recorded;
 assert.equal(await event(),true);assert.equal(await event(),false);
 for(const role of ["anon","authenticated"]){const row=(await pg.query("select has_table_privilege($1,'public.outreach_deliveries','SELECT') as read,has_function_privilege($1,'public.claim_outreach_delivery(uuid,uuid,text,text,integer,text,text,integer)','EXECUTE') as claim",[role])).rows[0];assert.equal(row.read,false);assert.equal(row.claim,false);}
 await pg.query("delete from auth.users where id=$1",[owner]);assert.equal((await pg.query("select * from public.outreach_events where delivery_id=$1",[delivery])).rows.length,0);
});

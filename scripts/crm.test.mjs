import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {importedLead,duplicateLead,normalizeHeader,LEAD_IMPORT_FIELDS} from "../lib/domain/leadImport.ts";
import {DEAL_STAGES} from "../lib/types.ts";

test("CRM pipeline exactly matches requested lead stages",()=>assert.deepEqual([...DEAL_STAGES],["New","Researching","Qualified","Contacted","Replied","Meeting","Proposal","Negotiation","Won","Lost"]));
test("bulk import maps every profile field and preserves zero scores and deal values",()=>{
  const lead=importedLead({name:"A",company:"Example",phone:"+91 9876543210",email:"a@example.com",status:"replied",companySize:"51-200",services:"SEO; Meta Ads",ownerId:"Seller",initialScore:"0",dealValue:"0",tags:"warm;priority",communicationHistory:"Called yesterday",researchSummary:"Provided by salesperson","custom:budget":"50000"},"fallback",[{id:"seller",name:"Seller",email:"seller@example.com"}]);
  assert.equal(lead.status,"Replied");assert.equal(lead.ownerId,"seller");assert.equal(lead.initialScore,0);assert.equal(lead.dealValue,0);
  assert.deepEqual(lead.services,["SEO","Meta Ads"]);assert.ok(lead.tags.includes("priority"));assert.equal(lead.communicationHistory,"Called yesterday");assert.equal(lead.research.status,"done");assert.equal(lead.customFields.budget,"50000");
  for(const header of ["Company_Size","Assigned Salesperson","AI Research","Communication History","Deal Value"]){assert.ok(LEAD_IMPORT_FIELDS.some(field=>field.aliases.includes(normalizeHeader(header))));}
});
test("invalid imported fields are reported rather than silently remapped or discarded",()=>{
  for(const patch of [{name:""},{company:""},{status:"Made up"},{initialScore:"101"},{dealValue:"-5"},{services:"Unsupported"},{ownerId:"Unknown"},{email:"bad"},{website:"javascript:alert(1)"}])assert.throws(()=>importedLead({name:"A",company:"Company",...patch},"owner",[]));
  assert.equal(importedLead({name:"A",company:"Company"},"owner",[]).companySize,"Unknown");
});
test("duplicate detection normalizes emails and phone punctuation without merging unrelated international numbers",()=>{
  const records=[{email:" A@Example.com ",phone:"+91 (98765) 43210"}];
  assert.equal(duplicateLead({email:"a@example.com",phone:""},records),true);
  assert.equal(duplicateLead({email:"",phone:"+919876543210"},records),true);
  assert.equal(duplicateLead({email:"",phone:"+19876543210"},records),false);
  assert.equal(duplicateLead({email:"",phone:""},records),false);
});
const conflictMigration=await readFile(new URL("../supabase/migrations/202611010006_crm_conflict_result.sql",import.meta.url),"utf8");
const pg=new PGlite();const migration=await readFile(new URL("../supabase/migrations/202611010005_crm_library.sql",import.meta.url),"utf8");
before(async()=>{await pg.exec("create role anon;create role authenticated;create role service_role bypassrls;grant usage on schema public to service_role;create schema auth;create table auth.users(id uuid primary key);");await pg.exec(migration);await pg.exec(conflictMigration);});
after(()=>pg.close());
test("account CRM saves are revision-safe, retry-safe, isolated and inaccessible to browser roles",async()=>{
  const a=crypto.randomUUID(),b=crypto.randomUUID(),operation=crypto.randomUUID();await pg.query("insert into auth.users values($1),($2)",[a,b]);
  const save=(owner,revision,op,data)=>pg.query("select public.save_crm_library($1,$2,$3,$4::jsonb) as revision",[owner,revision,op,JSON.stringify(data)]);
  const data={leads:[{id:"lead",name:"A",company:"Company",notes:"Original"}]};
  await pg.exec("set role service_role");
  try{
    assert.equal((await save(a,0,operation,data)).rows[0].revision,1);
    assert.equal((await save(a,0,operation,data)).rows[0].revision,1);
    assert.equal((await save(a,0,crypto.randomUUID(),{})).rows[0].revision,-1);
    assert.equal((await save(a,1,crypto.randomUUID(),{leads:[]})).rows[0].revision,2);
    assert.equal((await save(a,1,crypto.randomUUID(),data)).rows[0].revision,-1);
  }finally{await pg.exec("reset role");}
  assert.equal((await pg.query("select * from public.crm_libraries where owner_id=$1",[b])).rows.length,0);
  for(const role of ["anon","authenticated"]){const permissions=(await pg.query("select has_table_privilege($1,'public.crm_libraries','SELECT') as read,has_function_privilege($1,'public.save_crm_library(uuid,bigint,uuid,jsonb)','EXECUTE') as write",[role])).rows[0];assert.equal(permissions.read,false);assert.equal(permissions.write,false);}
  await pg.exec(migration);assert.equal((await pg.query("select revision from public.crm_libraries where owner_id=$1",[a])).rows[0].revision,2);
  await pg.query("delete from auth.users where id=$1",[a]);assert.equal((await pg.query("select * from public.crm_libraries where owner_id=$1",[a])).rows.length,0);
});

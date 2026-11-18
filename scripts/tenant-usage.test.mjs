import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";

const pg=new PGlite();
const migration=await readFile(new URL("../supabase/migrations/202611010010_tenant_usage.sql",import.meta.url),"utf8");
const owner="00000000-0000-4000-8000-000000000001",other="00000000-0000-4000-8000-000000000002";
const reserve=async(user,key,amount,limit,period="2026-11")=>Number((await pg.query("select public.reserve_tenant_usage($1,$2,$3,$4,$5) as total",[user,period,key,amount,limit])).rows[0].total);

before(async()=>{
  await pg.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);");
  await pg.query("insert into auth.users values ($1),($2)",[owner,other]);
  await pg.exec(migration);
});
after(()=>pg.close());

test("usage accumulates per workspace, month and counter",async()=>{
  assert.equal(await reserve(owner,"aiCredits",1,-1),1);
  assert.equal(await reserve(owner,"aiCredits",2,-1),3);
  assert.equal(await reserve(owner,"videoMinutes",30,-1),30);
  assert.equal(await reserve(other,"aiCredits",1,-1),1);
  assert.equal(await reserve(owner,"aiCredits",1,-1,"2026-12"),1);
});
test("a reservation over the plan limit is refused and changes nothing",async()=>{
  assert.equal(await reserve(owner,"aiCredits",1,3),-1);
  assert.equal(await reserve(owner,"aiCredits",1,4),4);
  assert.equal(await reserve(owner,"aiCredits",1,0),-1);
  assert.equal(Number((await pg.query("select ai_credits from public.tenant_usage where owner_id=$1 and period='2026-11'",[owner])).rows[0].ai_credits),4);
});
test("invalid counters and amounts are rejected",async()=>{
  await assert.rejects(reserve(owner,"leads",1,-1));
  await assert.rejects(reserve(owner,"aiCredits",0,-1));
  await assert.rejects(reserve(owner,"aiCredits",-5,-1));
});
test("browser roles cannot read or change usage",async()=>{
  for(const role of ["anon","authenticated"]){
    await pg.exec(`set role ${role}`);
    try{
      await assert.rejects(pg.query("select * from public.tenant_usage"));
      await assert.rejects(reserve(owner,"aiCredits",1,-1));
    }finally{await pg.exec("reset role");}
  }
});

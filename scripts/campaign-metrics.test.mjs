import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

// ---- The migration itself, on a real Postgres ----
test('campaign_metrics migration: applies twice, replaces a day on re-entry, rejects negative and unknown sources',async()=>{
  const pg=new PGlite(),sql=await readFile(new URL('../supabase/migrations/202611240001_campaign_metrics.sql',import.meta.url),'utf8');
  await pg.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('00000000-0000-0000-0000-000000000001');");
  await pg.exec(sql);await pg.exec(sql);
  const owner='00000000-0000-0000-0000-000000000001';
  const up=(spend,source='Manual entry')=>pg.query(`insert into public.campaign_metrics(owner_id,id,campaign_id,platform,metric_date,spend,clicks,source) values($1,'r1','c1','Meta Ads','2026-11-20',$2,null,$3)
    on conflict(owner_id,id) do update set spend=excluded.spend`,[owner,spend,source]);
  await up(100);await up(250);
  const {rows}=await pg.query('select spend,clicks from public.campaign_metrics');
  assert.equal(rows.length,1);assert.equal(Number(rows[0].spend),250);assert.equal(rows[0].clicks,null);
  await assert.rejects(up(-1));
  await assert.rejects(pg.query(`insert into public.campaign_metrics(owner_id,id,campaign_id,platform,metric_date,source) values($1,'r2','c1','Meta Ads','2026-11-20','Guess')`,[owner]));
  await pg.close();
});

// ---- Attach / persist against an in-memory PostgREST stand-in ----
process.env.SUPABASE_URL='http://localhost:54321';process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_test';
const table=new Map();let calls=[];
globalThis.fetch=async(input,init={})=>{
  const url=new URL(String(input)),method=init.method??'GET';calls.push(method);
  if(!url.pathname.endsWith('/campaign_metrics'))return new Response('{}',{status:404});
  const owner=url.searchParams.get('owner_id')?.slice(3);
  if(method==='GET'){const all=[...table.values()].filter(r=>!owner||r.owner_id===owner);const off=Number(url.searchParams.get('offset')??0),lim=Number(url.searchParams.get('limit')??1000);return Response.json(all.slice(off,off+lim));}
  if(method==='POST'){for(const r of JSON.parse(init.body))table.set(`${r.owner_id}|${r.id}`,r);return new Response(null,{status:201});}
  if(method==='DELETE'){const ids=url.searchParams.get('id').slice(4,-1).split(',').map(s=>JSON.parse(s));for(const id of ids)table.delete(`${owner}|${id}`);return new Response(null,{status:204});}
  return new Response(null,{status:405});
};
const {attachCampaignRows,persistCampaignRows}=await import('../lib/campaignMetrics.ts');
const row=(id,date,spend,extra={})=>({id,date,platform:'Meta Ads',source:'CSV import',importedAt:'2026-11-20T10:00:00.000Z',spend,impressions:1000,reach:null,clicks:10,leads:null,conversions:null,revenue:null,...extra});

test('rows left in the CRM document are moved into the table and come back attached',async()=>{
  const lib={campaigns:[{id:'c1',performanceRows:[row('a','2026-11-19',50),row('b','2026-11-18',40)]},{id:'c2'}]};
  const snap=await attachCampaignRows('o1',lib);
  assert.equal(snap.ready,true);assert.equal(table.size,2);
  assert.deepEqual(lib.campaigns[0].performanceRows.map(r=>r.id),['b','a']);
  assert.equal(lib.campaigns[1].performanceRows,undefined);
  const again={campaigns:[{id:'c1'},{id:'c2'}]};await attachCampaignRows('o1',again);
  assert.equal(again.campaigns[0].performanceRows.length,2,'loaded back from the table, not the document');
  assert.equal(again.campaigns[0].performanceRows[0].reach,null,'unknown stays unknown');
});

test('persist writes only changes, deletes removed rows, keeps rows of a deleted campaign, and strips the document',async()=>{
  const lib={campaigns:[{id:'c1'},{id:'c2'}]};const snap=await attachCampaignRows('o1',lib);calls=[];
  lib.campaigns[0].performanceRows=lib.campaigns[0].performanceRows.filter(r=>r.id!=='b').map(r=>r.id==='a'?{...r,spend:75}:r);
  lib.campaigns[1].performanceRows=[row('n','2026-11-20',5,{source:'Manual entry'})];
  await persistCampaignRows('o1',lib,snap,'o1');
  assert.deepEqual(calls,['POST','DELETE']);
  assert.equal(Number(table.get('o1|a').spend),75);assert.equal(table.has('o1|b'),false);assert.equal(table.get('o1|n').entered_by,'o1');
  assert.equal(lib.campaigns[0].performanceRows,undefined);assert.equal(lib.campaigns[1].performanceRows,undefined);
  // Campaign c2 deleted from the CRM: its history stays in the table.
  const later={campaigns:[{id:'c1'}]};const s2=await attachCampaignRows('o1',later);await persistCampaignRows('o1',later,s2);
  assert.equal(table.has('o1|n'),true);
  // Another account never sees these rows.
  const other={campaigns:[{id:'c1'}]};await attachCampaignRows('o2',other);assert.equal(other.campaigns[0].performanceRows,undefined);
});

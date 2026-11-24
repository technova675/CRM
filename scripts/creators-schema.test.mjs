import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('creators migration: re-runnable, per-account unique email, computed followers, constraints, updated_at',async()=>{
  const pg=new PGlite(),sql=await readFile(new URL('../supabase/migrations/202611240002_creators.sql',import.meta.url),'utf8');
  await pg.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');");
  await pg.exec(sql);await pg.exec(sql);
  const a='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002';
  const add=(owner,email,extra='')=>pg.query(`insert into public.creators(owner_id,full_name,email,primary_genre,instagram_followers,verified_youtube_subscribers${extra?','+extra.split('=')[0]:''}) values($1,'Asha Rao',$2,'Fashion',1200,5000${extra?','+extra.split('=')[1]:''}) returning id,effective_followers,status,talent_type`,[owner,email]);
  const {rows:[r]}=await add(a,'asha@example.in');
  assert.equal(r.effective_followers,5000);assert.equal(r.status,'pending');assert.equal(r.talent_type,'influencer');
  await assert.rejects(add(a,'ASHA@example.in'),'same email twice in one account');
  await add(b,'asha@example.in');
  await assert.rejects(add(a,'not-an-email'));
  await assert.rejects(add(a,'x@y.in','quality_score=9'));
  await add(a,'m@y.in',"talent_type='model'");
  const before=(await pg.query('select updated_at from public.creators where id=$1',[r.id])).rows[0].updated_at;
  await new Promise(res=>setTimeout(res,5));
  await pg.query("update public.creators set status='approved', talent_type='both' where id=$1",[r.id]);
  const after=(await pg.query('select updated_at,talent_type_changed_at,status from public.creators where id=$1',[r.id])).rows[0];
  assert.equal(after.status,'approved');assert.ok(after.updated_at>before);assert.ok(after.talent_type_changed_at>before);
  await pg.close();
});

const {creatorFromCsv,toCreator,rosterRecord,mediaUrl}=await import('../lib/domain/creators.ts');
const csvRow={id:'10416883-c31d-40e1-a29d-7b0847f399ed',created_at:'2026-09-08 23:42:38.099335+00',updated_at:'2026-09-08 23:42:38.099335+00',full_name:'  Asha Rao ',display_name:'',email:'asha@example.in',phone:'9876543210',whatsapp:'',profile_photo_path:'profile/a b.jpg',bio:'',city:'Bengaluru',state:'',country:'India',
  languages:'["Hindi","English"]',primary_genre:'Fashion',secondary_genres:'["Lifestyle","Fashion"]',content_formats:'[]',instagram_handle:'@asha.rao',youtube_handle:'',tiktok_handle:'',x_handle:'',linkedin_url:'',portfolio_url:'javascript:alert(1)',
  instagram_followers:'12000',youtube_subscribers:'',tiktok_followers:'',x_followers:'',avg_reel_views:'',engagement_rate:'4.20',verified_instagram_followers:'',verified_youtube_subscribers:'',verified_engagement_rate:'',verified_at:'',
  audience_female_pct:'',audience_age_band:'18-24',audience_top_cities:'[]',currency:'INR',rate_reel:'',rate_story:'',rate_static_post:'',rate_youtube_integration:'',rate_video:'7000',barter_open:'true',past_brands:'["Zepto","Bausch & lomb"]',notable_work_urls:'[]',
  status:'pending',internal_notes:'',quality_score:'',managed_exclusively:'false',submitted_ip:'1.2.3.4',submitted_user_agent:'UA',showcase_media_paths:'["showcase/v1.mp4","showcase/p.png"]',talent_type:'ugc_creator',turnaround_days:'7',talent_type_changed_at:'2026-09-08 23:42:36.895+00'};

test('CSV rows from the old site parse into table rows: arrays, blanks as null, old type names, trimmed names',()=>{
  const r=creatorFromCsv(csvRow,'owner-1');
  assert.equal(r.full_name,'Asha Rao');assert.equal(r.display_name,null);assert.deepEqual(r.languages,['Hindi','English']);
  assert.equal(r.instagram_followers,12000);assert.equal(r.youtube_subscribers,null);assert.equal(r.engagement_rate,4.2);
  assert.equal(r.barter_open,true);assert.equal(r.talent_type,'creator');assert.equal(r.created_at,'2026-09-08T23:42:38.099Z');assert.equal(r.owner_id,'owner-1');
});

test('the browser view: media links built from the public base, unsafe links dropped, roster profile labelled self-reported',()=>{
  const r=creatorFromCsv(csvRow,'o');
  const c=toCreator({...r,effective_followers:12000,effective_engagement_rate:'4.20',is_verified:false,roster_influencer_id:null},'https://media.example.dev/');
  assert.equal(c.photo,'https://media.example.dev/profile/a%20b.jpg');
  assert.deepEqual(c.showcase.map(m=>m.kind),['video','image']);
  assert.equal(c.handles.instagram,'asha.rao');assert.equal(c.handles.portfolio,undefined,'javascript: link is not kept');
  assert.deepEqual(c.otherGenres,['Lifestyle']);assert.equal('submitted_ip' in c,false);
  assert.equal(mediaUrl(undefined,'profile/x.jpg'),undefined);assert.equal(mediaUrl('http://insecure.dev','x.jpg'),undefined);
  const inf=rosterRecord(c,'id1','2026-11-24T00:00:00.000Z');
  assert.equal(inf.instagram,'@asha.rao');assert.equal(inf.pricePerPost,7000);assert.equal(inf.followers,12000);
  assert.match(inf.profileData.source,/self-reported/);assert.match(inf.pricingNotes,/UGC video: ₹7,000/);assert.match(inf.pricingNotes,/barter/i);
  assert.equal(inf.verification,'Unverified');assert.deepEqual(inf.previousProjects,['Zepto','Bausch & lomb']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCSV,parseDate,importMetrics,mergeMetrics,postResults,analyticsSummary,rateOf,accountFacts,bulkPosts,studioState,planOutputSchema,studioOutputSchema} from '../lib/domain/socialStudio.ts';

const META=`"Post ID","Permalink","Post type","Description","Publish time","Reach","Views","Likes","Comments","Shares","Saves","Follows"
"1","https://www.instagram.com/reel/A1/","IG reel","Vitamin C explained, simply","11/20/2026 19:00","4,200","6,100","310","24","18","52","9"
"2","https://www.instagram.com/p/B2/","IG carousel","5 monsoon skin tips","11/22/2026 09:30","2,000","2,600","80","4","2","30",""
"3","https://www.instagram.com/p/C3/","IG image","Free shipping above Rs 499","bad date","900","","20","1","0","2",""`;

test('CSV parser handles quotes, commas inside quotes, CRLF and BOM',()=>{
  const rows=parseCSV('﻿a,b\r\n"x, y","He said ""hi"""\r\n');
  assert.deepEqual(rows,[['a','b'],['x, y','He said "hi"']]);
});

test('dates: Meta month-first, day-first only when unambiguous, ISO, and invalid rejected',()=>{
  assert.equal(new Date(parseDate('11/20/2026 19:00')).getDate(),20);
  assert.equal(new Date(parseDate('25/11/2026')).getMonth(),10);
  assert.ok(parseDate('2026-11-20T10:00:00Z'));
  assert.equal(parseDate('bad date'),null);
  assert.equal(parseDate('02/30/2026'),null);
});

test('Meta export imports with thousands separators, keeps blanks unknown and skips unreadable dates',()=>{
  const r=importMetrics(META,'c1','Instagram','2026-11-23T00:00:00Z');
  assert.equal(r.error,null);assert.equal(r.rows.length,2);assert.equal(r.skipped,1);
  const reel=r.rows.find(x=>x.permalink.endsWith('A1/'));
  assert.equal(reel.reach,4200);assert.equal(reel.views,6100);assert.equal(reel.type,'Reel');assert.equal(reel.follows,9);
  assert.equal(r.rows.find(x=>x.type==='Carousel').follows,null);
});

test('import without a date or result column explains what is missing',()=>{
  assert.match(importMetrics('Caption,Reach\nhi,10','c','Instagram','t').error,/publish date/);
  assert.match(importMetrics('Date,Caption\n2026-11-01,hi','c','Instagram','t').error,/Reach, Views or Likes/);
});

test('re-import replaces the same post and keeps other clients untouched',()=>{
  const first=importMetrics(META,'c1','Instagram','t').rows,other={...first[0],clientId:'c2'};
  const updated=first.map(r=>({...r,likes:999}));
  const merged=mergeMetrics([...first,other],updated,'c1');
  assert.equal(merged.filter(r=>r.clientId==='c1').length,2);
  assert.ok(merged.filter(r=>r.clientId==='c1').every(r=>r.likes===999));
  assert.equal(merged.filter(r=>r.clientId==='c2').length,1);
});

test('engagement rate uses reach first and never divides by zero or unknown',()=>{
  assert.equal(rateOf(404,4200,6100,null).toFixed(2),'9.62');
  assert.equal(rateOf(10,null,200,null),5);
  assert.equal(rateOf(10,0,null,null),null);
  assert.equal(rateOf(null,100,null,null),null);
});

test('summary ranks best posts, groups formats and does not double count recorded posts',()=>{
  const rows=importMetrics(META,'c1','Instagram','t').rows;
  const recorded={id:'p1',clientId:'c1',stage:'Published',title:'Recorded',platform:'Instagram',format:'Reel',publishedAt:'2026-11-20T13:30:00Z',publication:{url:'https://www.instagram.com/reel/A1/'},analytics:{start:'2026-11-20',end:'2026-11-20',reach:1,impressions:1,likes:1,comments:1,shares:1,saves:1}};
  const results=postResults(rows,[recorded],'c1');
  assert.equal(results.length,2,'the recorded post with the same link is not counted twice');
  const s=analyticsSummary(results);
  assert.equal(s.best[0].type,'Reel');assert.equal(s.byFormat[0].name,'Reel');assert.equal(s.totalReach,6200);
});

test('account facts are computed, not guessed',()=>{
  const rows=importMetrics(META,'c1','Instagram','t').rows,results=postResults(rows,[],'c1');
  const f=accountFacts({platform:'Instagram',handle:'glowleaf',bio:'Natural serums. Shop: https://glowleaf.in',url:'',followers:5000,following:100,postsCount:40,snapshots:[{date:'2026-10-01',followers:4500},{date:'2026-11-01',followers:5000}]},results);
  assert.equal(f.hasLink,true);assert.equal(f.measuredPosts,2);assert.equal(f.followerGrowth.change,500);assert.equal(Math.round(f.followerGrowth.percent),11);
});

test('bulk upload validates rows and normalises hashtags',()=>{
  const r=bulkPosts('Title,Platform,Format,Caption,Hashtags\nPost A,Instagram,Reel,Hello,glow skincare\n,Instagram,Reel,x,\nPost C,TikTok,Reel,x,\nPost D,twitter,Text,Hi,#a');
  assert.equal(r.posts.length,2);assert.deepEqual(r.posts[0].hashtags,['#glow','#skincare']);assert.equal(r.posts[1].platform,'X');
  assert.equal(r.errors.length,2);
});

test('state defaults and AI schemas accept complete outputs',()=>{
  assert.deepEqual(studioState(undefined).accounts,[]);
  assert.ok(studioOutputSchema.safeParse({title:'',hook:'',caption:'',cta:'',hashtags:[],plan:'',items:[],versions:[],score:null,issues:[]}).success);
  assert.equal(planOutputSchema.safeParse({positioning:'',audience:'',objectives:[],personas:[],pillars:[],platforms:[],weeks:[],campaigns:[],growthTactics:[]}).success,false,'a plan needs objectives, personas and pillars');
});

test('claims not in the client facts are flagged; confirmed claims are not',async()=>{
  const {unsupportedClaims}=await import('../lib/domain/socialStudio.ts');
  const output={positioning:'A Kerala‑based, cruelty‑free brand with dermatologist‑tested serums'};
  assert.deepEqual(unsupportedClaims(output,'Natural vitamin C serum'),['cruelty-free','dermatologist']);
  assert.deepEqual(unsupportedClaims(output,'We are cruelty free and dermatologist tested'),[]);
});

test('export times are read as India time on any server, so Vercel (UTC) gives the same answer',()=>{
  assert.equal(parseDate('11/20/2026 19:00'),'2026-11-20T13:30:00.000Z');
  assert.equal(parseDate('2026-11-20 19:00'),'2026-11-20T13:30:00.000Z');
  assert.equal(parseDate('11/20/2026 7:00 pm'),'2026-11-20T13:30:00.000Z');
  assert.equal(parseDate('2026-11-20T19:00:00Z'),'2026-11-20T19:00:00.000Z','explicit zones are kept');
});

test('best and lowest performing lists never contain the same post',()=>{
  const rows=Array.from({length:7},(_,i)=>({id:'p'+i,title:'P'+i,platform:'Instagram',type:'Reel',postedAt:`2026-11-0${i+1}T10:00:00Z`,reach:100,views:null,impressions:null,engagements:i,rate:i,permalink:'',source:'x'}));
  const s=analyticsSummary(rows),best=new Set(s.best.map(r=>r.id));
  assert.equal(s.worst.length,2);assert.ok(s.worst.every(r=>!best.has(r.id)));
});

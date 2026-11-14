import test from "node:test";
import assert from "node:assert/strict";
import {mergeLibraries} from "../lib/domain/mergeLibraries.ts";

const lead=id=>({id,company:id,research:{status:"idle"}});
const base={leads:[lead("a"),lead("b"),lead("c")],clients:[],settings:"x"};

test("research on several leads in one session survives another session's unrelated edit",()=>{
  const local={...base,leads:base.leads.map(l=>({...l,research:{status:"done"}}))};
  const remote={...base,clients:[{id:"c1",company:"New"}]};
  const merged=mergeLibraries(base,local,remote);
  assert.ok(merged);
  assert.deepEqual(merged.leads.map(l=>l.research.status),["done","done","done"]);
  assert.equal(merged.clients.length,1);
});

test("the other session researching a different lead keeps both results",()=>{
  const local={...base,leads:[{...base.leads[0],research:{status:"done"}},base.leads[1],base.leads[2]]};
  const remote={...base,leads:[base.leads[0],{...base.leads[1],research:{status:"done"}},base.leads[2]]};
  const merged=mergeLibraries(base,local,remote);
  assert.deepEqual(merged.leads.map(l=>l.research.status),["done","done","idle"]);
});

test("a record created locally is kept and a remote edit is not lost",()=>{
  const local={...base,leads:[lead("d"),...base.leads]};
  const remote={...base,leads:[base.leads[0],{...base.leads[1],company:"Renamed"},base.leads[2]]};
  const merged=mergeLibraries(base,local,remote);
  assert.deepEqual(merged.leads.map(l=>l.id),["d","a","b","c"]);
  assert.equal(merged.leads[2].company,"Renamed");
});

test("the same lead edited differently in both sessions is a conflict",()=>{
  const local={...base,leads:[{...base.leads[0],company:"Mine"},base.leads[1],base.leads[2]]};
  const remote={...base,leads:[{...base.leads[0],company:"Theirs"},base.leads[1],base.leads[2]]};
  assert.equal(mergeLibraries(base,local,remote),null);
});

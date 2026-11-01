import assert from "node:assert/strict";
import { createTestAccount,TestBrowser } from "./reportAuthFixture.mjs";
import { supabaseRequest } from "../lib/db.ts";
import { readR2Part } from "../lib/reportR2.ts";
import { cleanR2Jobs } from "../lib/reportR2Transfers.ts";

let owner,other,id,sessionId,prefix;
const upload={companyName:`R2 verification ${crypto.randomUUID()}`,name:"verification.csv",kind:"csv",size:5,uploadedBy:"ignored",tables:[
  {name:"Data",columns:["Value"],headerRow:0,rowCount:2,rawRowCount:3,rowParts:1,rawParts:1},
]};
async function json(response,status=200) {
  const body=await response.json(); assert.equal(response.status,status,JSON.stringify(body)); return body;
}
try {
  owner=await createTestAccount(); other=await createTestAccount();
  const a=new TestBrowser(),b=new TestBrowser(),wrong=new TestBrowser();
  await a.signIn(owner); await b.signIn(owner); await wrong.signIn(other);
  const transfer=async(browser,data)=>browser.request("/api/reports/transfers",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data)});
  sessionId=(await json(await transfer(a,{action:"begin",upload}))).sessionId;
  const [session]=await supabaseRequest("report_transfer_sessions",{query:{select:"storage_backend",id:`eq.${sessionId}`}});
  assert.equal(session.storage_backend,"r2","Start the app with R2 configured before running this test.");
  prefix=`reports/${sessionId}/`;
  const original={kind:"original",tableIndex:-1,partIndex:0,payload:"aGVsbG8="};
  const denied=await transfer(wrong,{action:"part",sessionId,part:original}); assert.ok([400,403].includes(denied.status));
  assert.equal((await transfer(a,{action:"complete",sessionId})).status,400);
  for(const part of [original,{kind:"rows",tableIndex:0,partIndex:0,payload:[[0],[null]]},{kind:"raw",tableIndex:0,partIndex:0,payload:[["Value"],[0],[null]]}]) {
    await json(await transfer(a,{action:"part",sessionId,part}));
    await json(await transfer(a,{action:"part",sessionId,part}));
  }
  id=(await json(await transfer(a,{action:"complete",sessionId}))).id;
  assert.equal((await json(await transfer(a,{action:"complete",sessionId}))).id,id);
  const detail=await json(await b.request(`/api/reports/uploads/${id}`));
  const table=detail.file.tables[0];
  const url=`/api/reports/uploads/${id}/parts?table=${table.id}&kind=rows&index=0`;
  assert.deepEqual((await json(await b.request(url))).rows,[[0],[null]]);
  assert.equal((await wrong.request(url)).status,404);
  const objects=await supabaseRequest("report_r2_objects",{query:{select:"object_key,sha256,kind",file_id:`eq.${id}`}});
  assert.equal(objects.length,3);
  const source=objects.find(object=>object.kind==="original");
  assert.equal((await readR2Part(source.object_key,source.sha256)).toString(),"hello");
  const originalDb=await supabaseRequest("report_original_parts",{query:{select:"part_index",file_id:`eq.${id}`}});
  const rowsDb=await supabaseRequest("report_table_parts",{query:{select:"part_index",file_id:`eq.${id}`}});
  assert.equal(originalDb.length,0); assert.equal(rowsDb.length,0);
  await json(await a.request(`/api/reports/uploads/${id}`,{method:"DELETE"}));
  assert.equal((await b.request(`/api/reports/uploads/${id}`)).status,404);
  console.log("PASS: private R2 upload, byte verification, retry safety, same-account sharing, cross-account denial and metadata-only Supabase storage.");
} finally {
  if(id) await supabaseRequest("report_files",{method:"DELETE",query:{id:`eq.${id}`}}).catch(()=>{});
  if(sessionId) await supabaseRequest("report_transfer_sessions",{method:"DELETE",query:{id:`eq.${sessionId}`}}).catch(()=>{});
  if(prefix) await cleanR2Jobs(prefix);
  if(owner) await owner.remove(); if(other) await other.remove();
  await supabaseRequest("report_companies",{method:"DELETE",query:{name:`eq.${upload.companyName}`}}).catch(()=>{});
}

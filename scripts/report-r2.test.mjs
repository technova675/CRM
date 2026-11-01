import test from "node:test";
import assert from "node:assert/strict";
import { S3Client } from "@aws-sdk/client-s3";
import { writeR2Part,readR2Part,removeR2Prefix,r2UploadsEnabled,ReportStorageError } from "../lib/reportR2.ts";
import { putR2TransferPart } from "../lib/reportR2Transfers.ts";

test("private R2 writes verified bytes, rejects corruption, and deletes only the requested report prefix",async()=>{
  const oldEnv={...process.env}; const send=S3Client.prototype.send;
  const objects=new Map(); const calls=[];
  Object.assign(process.env,{R2_ACCOUNT_ID:"a".repeat(32),R2_ACCESS_KEY_ID:"test-key",R2_SECRET_ACCESS_KEY:"test-secret",R2_BUCKET_NAME:"private-reports"});
  delete process.env.REPORT_FILE_STORAGE;
  S3Client.prototype.send=async function(command) {
    calls.push(command.input); const input=command.input;
    switch(command.constructor.name) {
      case "PutObjectCommand": objects.set(input.Key,Buffer.from(input.Body)); return {};
      case "GetObjectCommand": return {ContentLength:objects.get(input.Key).length,Body:{transformToByteArray:async()=>objects.get(input.Key)}};
      case "ListObjectsV2Command": return {Contents:[...objects.keys()].filter(key=>key.startsWith(input.Prefix)).map(Key=>({Key}))};
      case "DeleteObjectsCommand": input.Delete.Objects.forEach(({Key})=>objects.delete(Key)); return {};
      default: throw Error("Unexpected storage command");
    }
  };
  try {
    assert.equal(r2UploadsEnabled(),true);
    const session=crypto.randomUUID(); const bytes=Buffer.from('[["₹",0,null]]');
    const part=await writeR2Part(session,"rows",0,0,bytes);
    assert.deepEqual(await readR2Part(part.key,part.sha256),bytes);
    objects.set(part.key,Buffer.from("corrupted"));
    await assert.rejects(readR2Part(part.key,part.sha256),ReportStorageError);
    const other=await writeR2Part(crypto.randomUUID(),"original",-1,0,Buffer.from("other report"));
    await assert.rejects(removeR2Prefix("reports/"),ReportStorageError);
    await removeR2Prefix(`reports/${session}/`);
    assert.equal(objects.has(part.key),false); assert.equal(objects.has(other.key),true);
    assert.ok(calls.every(call=>call.Bucket==="private-reports"));
    assert.ok(calls.every(call=>!JSON.stringify(call).includes("test-secret")));
    process.env.REPORT_FILE_STORAGE="supabase"; assert.equal(r2UploadsEnabled(),false);
    process.env.REPORT_FILE_STORAGE="invalid"; assert.throws(r2UploadsEnabled,ReportStorageError);
  } finally { S3Client.prototype.send=send; process.env=oldEnv; }
});

test("R2 transfer validates chunk sizes before writing and sends only receipts to Supabase",async()=>{
  const oldEnv={...process.env}; const send=S3Client.prototype.send; const fetch=globalThis.fetch;
  Object.assign(process.env,{R2_ACCOUNT_ID:"a".repeat(32),R2_ACCESS_KEY_ID:"key",R2_SECRET_ACCESS_KEY:"secret",R2_BUCKET_NAME:"private",SUPABASE_URL:"https://example.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"test"});
  let writes=0; const receipts=[];
  S3Client.prototype.send=async()=>{writes++;return {};};
  globalThis.fetch=async(url,options)=>{receipts.push(JSON.parse(options.body));return new Response("null",{status:200});};
  const session={id:crypto.randomUUID(),completed_file_id:null,upload:{size:5,tables:[{rowParts:1,rawParts:1}]}};
  const original={kind:"original",tableIndex:-1,partIndex:0,payload:"aGVsbG8="};
  try {
    await assert.rejects(putR2TransferPart("workspace","owner",session,{...original,payload:"eA=="}));
    await assert.rejects(putR2TransferPart("workspace","owner",session,{...original,partIndex:1}));
    assert.equal(writes,0);
    await putR2TransferPart("workspace","owner",session,original);
    await putR2TransferPart("workspace","owner",session,{kind:"rows",tableIndex:0,partIndex:0,payload:[[0],[null]]});
    assert.equal(writes,2);
    assert.equal(receipts[0].p_part.bytes,5); assert.equal(receipts[1].p_part.rowCount,2);
    assert.ok(receipts.every(body=>!('payload' in body.p_part)));
    assert.ok(receipts.every(body=>body.p_owner==="owner"));
  } finally { S3Client.prototype.send=send; globalThis.fetch=fetch; process.env=oldEnv; }
});

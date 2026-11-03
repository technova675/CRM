// Server-only storage. R2 credentials must never be sent to the browser.
import { createHash } from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand,DeleteObjectCommand } from "@aws-sdk/client-s3";

export class ReportStorageError extends Error {}

export function r2UploadsEnabled() {
  const mode = process.env.REPORT_FILE_STORAGE;
  if (mode && !["r2", "supabase"].includes(mode)) throw new ReportStorageError("REPORT_FILE_STORAGE must be r2 or supabase.");
  return mode === "r2" || (!mode && ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"].some((key) => !!process.env[key]));
}

export function checkR2Configuration() { const { client } = storage(); client.destroy(); }

function storage() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    throw new ReportStorageError("Configure R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME on the server.");
  }
  if (!/^[a-f0-9]{32}$/i.test(R2_ACCOUNT_ID)) throw new ReportStorageError("R2_ACCOUNT_ID must be your Cloudflare account ID.");
  return { bucket: R2_BUCKET_NAME, client: new S3Client({
    region: "auto", endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED", maxAttempts: 3,
  }) };
}

export function r2Prefix(sessionId: string) {
  if (!/^[a-f0-9-]{36}$/i.test(sessionId)) throw new ReportStorageError("Invalid report storage identifier.");
  return `reports/${sessionId}/`;
}

export const contentHash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function onboardingObjectKey(owner:string,clientId:string,assetId:string,file:{id:string;sha256:string}){
 if(!/^[a-f0-9-]{36}$/i.test(owner)||!/^.{1,150}$/.test(clientId)||![assetId,file.id].every(id=>/^[a-f0-9-]{36}$/i.test(id))||!(/^[a-f0-9]{64}$/i.test(file.sha256)))throw new ReportStorageError("Invalid onboarding storage identifier.");
 return `onboarding/${owner}/${createHash("sha256").update(clientId).digest("hex").slice(0,32)}/${assetId}/${file.id}-${file.sha256}`;
}
export async function writeOnboardingAsset(owner:string,clientId:string,assetId:string,fileId:string,bytes:Buffer){
 if(!bytes.length||bytes.length>10*1024*1024)throw new ReportStorageError("Brand assets must be between 1 byte and 10 MB.");
 const sha256=contentHash(bytes),key=onboardingObjectKey(owner,clientId,assetId,{id:fileId,sha256}),{client,bucket}=storage();
 try{await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:bytes,ContentType:"application/octet-stream",Metadata:{sha256}}),{abortSignal:AbortSignal.timeout(60000)});return {sha256,size:bytes.length};}catch{throw new ReportStorageError("Could not upload this brand asset to private R2 storage. Please retry or save an existing asset link.");}finally{client.destroy();}
}
export async function readOnboardingAsset(owner:string,clientId:string,assetId:string,file:{id:string;sha256:string;size:number}){
 const key=onboardingObjectKey(owner,clientId,assetId,file),{client,bucket}=storage();
 try{const result=await client.send(new GetObjectCommand({Bucket:bucket,Key:key}),{abortSignal:AbortSignal.timeout(60000)});if(!result.Body||result.ContentLength!==file.size||file.size>10*1024*1024)throw new Error();const bytes=Buffer.from(await result.Body.transformToByteArray());if(bytes.length!==file.size||contentHash(bytes)!==file.sha256)throw new Error();return bytes;}catch{throw new ReportStorageError("This brand asset could not be read or verified. Please retry; no blank file was substituted.");}finally{client.destroy();}
}
export async function removeOnboardingAsset(owner:string,clientId:string,assetId:string,file:{id:string;sha256:string}){
 const key=onboardingObjectKey(owner,clientId,assetId,file),{client,bucket}=storage();try{await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}),{abortSignal:AbortSignal.timeout(30000)});}finally{client.destroy();}
}

export async function writeR2Part(sessionId: string, kind: string, tableIndex: number, partIndex: number, bytes: Buffer) {
  const sha256 = contentHash(bytes);
  const key = `${r2Prefix(sessionId)}${kind}/${tableIndex}/${partIndex}-${sha256}`;
  const { bucket, client } = storage();
  try {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes,
      ContentType: kind === "original" ? "application/octet-stream" : "application/json", Metadata: { sha256 } }), { abortSignal: AbortSignal.timeout(90_000) });
    return { key, sha256, bytes: bytes.length };
  } catch { throw new ReportStorageError("Could not upload to Cloudflare R2. Check the bucket name, Object Read & Write token permissions and connection."); }
  finally { client.destroy(); }
}

export async function readR2Part(key: string, sha256: string): Promise<Buffer> {
  if (!/^reports\/[a-f0-9-]{36}\/(original|rows|raw)\/-?\d+\/\d+-[a-f0-9]{64}$/i.test(key)) throw new ReportStorageError("Invalid stored report object.");
  const { bucket, client } = storage();
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(60_000) });
    if (!result.Body || (result.ContentLength ?? 0) > 1_100_000) throw new Error();
    const bytes = Buffer.from(await result.Body.transformToByteArray());
    if (bytes.length > 1_100_000 || contentHash(bytes) !== sha256) throw new Error();
    return bytes;
  } catch { throw new ReportStorageError("Could not read or verify the report data in Cloudflare R2. Please retry; no blank data has been substituted."); }
  finally { client.destroy(); }
}

export async function removeR2Prefix(prefix: string) {
  if (!/^reports\/[a-f0-9-]{36}\/$/i.test(prefix)) throw new ReportStorageError("Invalid report cleanup prefix.");
  const { bucket, client } = storage();
  try {
    // Always start from the beginning after deleting each page.
    while (true) {
      const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 1000 }), { abortSignal: AbortSignal.timeout(30_000) });
      const objects = (page.Contents ?? []).flatMap((item) => item.Key ? [{ Key: item.Key }] : []);
      if (!objects.length) break;
      const result = await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }), { abortSignal: AbortSignal.timeout(30_000) });
      if (result.Errors?.length) throw new Error();
    }
  } catch { throw new ReportStorageError("R2 cleanup could not finish. The cleanup job is saved for retry."); }
  finally { client.destroy(); }
}

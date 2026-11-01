import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { accountWorkspace } from "../lib/auth/identity.ts";

const pg = new PGlite();
const workspace = "a".repeat(64);
const migration = await readFile(new URL("../supabase/migrations/202611010001_reports.sql", import.meta.url), "utf8");
const largeMigration = await readFile(new URL("../supabase/migrations/202611010002_large_uploads.sql", import.meta.url), "utf8");
const accountMigration = await readFile(new URL("../supabase/migrations/202611010003_report_accounts.sql", import.meta.url), "utf8");
const r2Migration = await readFile(new URL("../supabase/migrations/202611010004_report_r2.sql", import.meta.url), "utf8");
const pdfMigration = await readFile(new URL("../supabase/migrations/202611010005_report_pdf.sql", import.meta.url), "utf8");
const upload = {
  companyName: "Schema verification", name: "verification.xlsx", kind: "excel", size: 42, uploadedBy: "Test", originalBase64: "b3JpZ2luYWw=",
  tables: [
    { name: "Metrics", columns: ["Name", "Value"], rows: [["A", 0], ["B", null]], rawRows: [["Title"], ["Name", "Value"], ["A", 0], ["B", null]], headerRow: 1 },
    { name: "Second sheet", columns: ["Column 1"], rows: [[4]], rawRows: [[4]], headerRow: null },
  ],
};
const save = (id, data = upload, scope = workspace) => pg.query("select public.save_report_upload($1, $2, $3::jsonb) as id", [scope, id, JSON.stringify(data)]);

before(async () => {
  await pg.exec("create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;");
  await pg.exec(migration);
  await pg.exec(largeMigration);
  await pg.exec("create schema auth; create table auth.users(id uuid primary key);");
  await pg.exec(accountMigration);
  await pg.exec(r2Migration);
  await pg.exec(pdfMigration);
});
after(async () => pg.close());

test("Supabase reporting migration can be applied again without losing data", async () => {
  const id = `rf_${crypto.randomUUID()}`;
  await save(id);
  await pg.exec(migration);
  const { rows } = await pg.query("select id from public.report_files where id = $1", [id]);
  assert.equal(rows[0].id, id);
});

test("workbook save preserves original bytes, JSON types, blank cells, zeroes and sheet order", async () => {
  const id = `rf_${crypto.randomUUID()}`;
  // Execute as the exact role used by the server-side Data API.
  await pg.exec("set role service_role");
  try { assert.equal((await save(id)).rows[0].id, id); }
  finally { await pg.exec("reset role"); }
  const { rows: files } = await pg.query("select original_base64, workspace_id from public.report_files where id = $1", [id]);
  assert.equal(files[0].original_base64, upload.originalBase64);
  assert.equal(files[0].workspace_id, workspace);
  const { rows: tables } = await pg.query("select columns, rows, raw_rows, header_row from public.report_tables where file_id = $1 order by position", [id]);
  assert.equal(tables.length, 2);
  assert.deepEqual(tables[0].rows, upload.tables[0].rows);
  assert.deepEqual(tables[0].raw_rows, upload.tables[0].rawRows);
  assert.equal(tables[0].header_row, 1);
  assert.equal(tables[1].header_row, null);
});

test("failure in a later worksheet rolls back company, file and earlier worksheets", async () => {
  const id = `rf_${crypto.randomUUID()}`;
  const companyName = `Rollback ${crypto.randomUUID()}`;
  await assert.rejects(save(id, { ...upload, companyName, tables: [upload.tables[0], { name: "Bad", columns: [], rows: [] }] }), { code: "22023" });
  assert.equal((await pg.query("select id from public.report_files where id = $1", [id])).rows.length, 0);
  assert.equal((await pg.query("select id from public.report_tables where file_id = $1", [id])).rows.length, 0);
  assert.equal((await pg.query("select id from public.report_companies where name = $1", [companyName])).rows.length, 0);
});

test("company reuse is isolated per browser workspace and file deletion cascades", async () => {
  const first = `rf_${crypto.randomUUID()}`;
  const second = `rf_${crypto.randomUUID()}`;
  const third = `rf_${crypto.randomUUID()}`;
  await save(first); await save(second); await save(third, upload, "b".repeat(64));
  const { rows } = await pg.query("select id, client_id from public.report_files where id = any($1)", [[first, second, third]]);
  const company = (id) => rows.find((row) => row.id === id).client_id;
  assert.equal(company(first), company(second));
  assert.notEqual(company(first), company(third));
  await pg.query("delete from public.report_files where id = $1", [first]);
  assert.equal((await pg.query("select id from public.report_tables where file_id = $1", [first])).rows.length, 0);
  assert.equal((await pg.query("select id from public.report_tables where file_id = $1", [second])).rows.length, 2);
});

test("browser roles cannot read report tables or execute privileged upload function", async () => {
  for (const role of ["anon", "authenticated"]) {
    const { rows } = await pg.query("select has_table_privilege($1, 'public.report_files', 'SELECT') as can_read, has_function_privilege($1, 'public.save_report_upload(text,text,jsonb)', 'EXECUTE') as can_save", [role]);
    assert.equal(rows[0].can_read, false);
    assert.equal(rows[0].can_save, false);
  }
  const { rows } = await pg.query("select relname, relrowsecurity from pg_class where oid in ('public.report_companies'::regclass, 'public.report_files'::regclass, 'public.report_tables'::regclass)");
  assert.ok(rows.every((row) => row.relrowsecurity));
});

const transferUpload = { companyName: "Chunk verification", name: "large.csv", kind: "csv", size: 5, uploadedBy: "Test", tables: [
  { name: "Data", columns: ["Value"], headerRow: 0, rowCount: 2, rawRowCount: 3, rowParts: 1, rawParts: 1 },
] };
const rpc = (name, args) => pg.query(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as value`, args);
const beginTransfer = async (data = transferUpload) => (await rpc("begin_report_transfer", [workspace, JSON.stringify(data)])).rows[0].value;
const part = (id, data, scope = workspace) => rpc("put_report_transfer_part", [scope, id, JSON.stringify(data)]);

test("large upload migration supports the exact 200 MB boundary and rejects larger files", async () => {
  await pg.exec(largeMigration);
  const session = await beginTransfer({ ...transferUpload, size: 200_000_000 });
  await rpc("cancel_report_transfer", [workspace, session]);
  await assert.rejects(beginTransfer({ ...transferUpload, size: 200_000_001 }), { code: "22023" });
});

test("chunk transfer preserves bytes, worksheet cells and ordering, with idempotent retries", async () => {
  const session = await beginTransfer();
  await assert.rejects(rpc("complete_report_transfer", [workspace, session]), { code: "22023" });
  await assert.rejects(part(session, { kind: "original", tableIndex: -1, partIndex: 0, payload: "aGVsbG8=" }, "b".repeat(64)), { code: "22023" });
  await part(session, { kind: "original", tableIndex: -1, partIndex: 0, payload: "aGVsbG8=" });
  await part(session, { kind: "original", tableIndex: -1, partIndex: 0, payload: "aGVsbG8=" });
  await part(session, { kind: "rows", tableIndex: 0, partIndex: 0, payload: [[0], [null]] });
  await part(session, { kind: "raw", tableIndex: 0, partIndex: 0, payload: [["Value"], [0], [null]] });
  const id = (await rpc("complete_report_transfer", [workspace, session])).rows[0].value;
  assert.equal((await rpc("complete_report_transfer", [workspace, session])).rows[0].value, id);
  assert.equal((await pg.query("select data from public.report_original_parts where file_id=$1", [id])).rows[0].data, "aGVsbG8=");
  const tables = (await pg.query("select id,chunked,row_parts,raw_parts,row_count from public.report_tables where file_id=$1", [id])).rows;
  assert.equal(tables[0].chunked, true);
  assert.equal(tables[0].row_count, 2);
  const chunks = (await pg.query("select payload from public.report_table_parts where table_id=$1 and kind='rows'", [tables[0].id])).rows;
  assert.deepEqual(chunks[0].payload, [[0], [null]]);
  assert.equal((await pg.query("select count(*)::int as count from public.report_transfer_parts where session_id=$1", [session])).rows[0].count, 0);
  await pg.query("delete from public.report_files where id=$1", [id]);
  assert.equal((await pg.query("select count(*)::int as count from public.report_original_parts where file_id=$1", [id])).rows[0].count, 0);
  assert.equal((await pg.query("select count(*)::int as count from public.report_table_parts where file_id=$1", [id])).rows[0].count, 0);
});

test("incomplete row chunks stay invisible and cancelled uploads remove staging data", async () => {
  const session = await beginTransfer();
  await part(session, { kind: "original", tableIndex: -1, partIndex: 0, payload: "aGVsbG8=" });
  await part(session, { kind: "rows", tableIndex: 0, partIndex: 0, payload: [[0]] });
  await part(session, { kind: "raw", tableIndex: 0, partIndex: 0, payload: [["Value"], [0], [null]] });
  await assert.rejects(rpc("complete_report_transfer", [workspace, session]), { code: "22023" });
  await rpc("cancel_report_transfer", [workspace, session]);
  assert.equal((await pg.query("select count(*)::int as count from public.report_transfer_parts where session_id=$1", [session])).rows[0].count, 0);
  for (const role of ["anon", "authenticated"]) {
    const permissions = (await pg.query("select has_function_privilege($1,'public.complete_report_transfer(text,uuid)','EXECUTE') as execute, has_table_privilege($1,'public.report_original_parts','SELECT') as read", [role])).rows[0];
    assert.equal(permissions.execute, false);
    assert.equal(permissions.read, false);
  }
});

test("authenticated accounts have stable workspaces and legacy linking preserves reports and merges companies", async () => {
  const owner = crypto.randomUUID();
  const other = crypto.randomUUID();
  await pg.query("insert into auth.users(id) values ($1),($2)", [owner, other]);
  const scope = accountWorkspace(owner);
  assert.equal((await rpc("report_user_workspace", [owner])).rows[0].value, scope);
  const legacy = "d".repeat(64);
  const oldId = `rf_${crypto.randomUUID()}`;
  const newId = `rf_${crypto.randomUUID()}`;
  await save(oldId, upload, legacy);
  await rpc("save_report_upload", [scope,newId,JSON.stringify(upload),owner]);
  const oldTables = (await pg.query("select id,rows,raw_rows from public.report_tables where file_id=$1 order by position", [oldId])).rows;
  await pg.exec("set role service_role");
  try { assert.equal((await rpc("claim_browser_reports", [owner,legacy])).rows[0].value, 1); }
  finally { await pg.exec("reset role"); }
  const files = (await pg.query("select id,client_id,owner_id from public.report_files where workspace_id=$1", [scope])).rows;
  assert.equal(files.length,2);
  assert.ok(files.every((file) => file.owner_id === owner));
  assert.equal(files[0].client_id,files[1].client_id);
  assert.deepEqual((await pg.query("select id,rows,raw_rows from public.report_tables where file_id=$1 order by position", [oldId])).rows,oldTables);
  assert.equal((await rpc("claim_browser_reports", [owner,legacy])).rows[0].value,0);
  await assert.rejects(rpc("claim_browser_reports", [other,legacy]),{code:"42501"});
  assert.equal((await pg.query("select id from public.report_files where workspace_id=$1", [accountWorkspace(other)])).rows.length,0);
  assert.equal((await pg.query("select id from public.report_files where workspace_id=$1", [legacy])).rows.length,0);
});

test("account upload wrappers enforce ownership and account deletion removes owned reports", async () => {
  const owner = crypto.randomUUID();
  const other = crypto.randomUUID();
  await pg.query("insert into auth.users(id) values($1),($2)",[owner,other]);
  const scope=accountWorkspace(owner);
  await assert.rejects(rpc("begin_report_transfer",[accountWorkspace(other),JSON.stringify(transferUpload),owner]),{code:"42501"});
  const session=(await rpc("begin_report_transfer",[scope,JSON.stringify(transferUpload),owner])).rows[0].value;
  const original={kind:"original",tableIndex:-1,partIndex:0,payload:"aGVsbG8="};
  await assert.rejects(rpc("put_report_transfer_part",[accountWorkspace(other),session,JSON.stringify(original),other]),{code:"42501"});
  for(const chunk of [original,{kind:"rows",tableIndex:0,partIndex:0,payload:[[0],[null]]},{kind:"raw",tableIndex:0,partIndex:0,payload:[["Value"],[0],[null]]}]) await rpc("put_report_transfer_part",[scope,session,JSON.stringify(chunk),owner]);
  const id=(await rpc("complete_report_transfer",[scope,session,owner])).rows[0].value;
  assert.equal((await pg.query("select owner_id from public.report_files where id=$1",[id])).rows[0].owner_id,owner);
  await pg.query("delete from auth.users where id=$1",[owner]);
  assert.equal((await pg.query("select id from public.report_files where id=$1",[id])).rows.length,0);
  assert.equal((await pg.query("select file_id from public.report_original_parts where file_id=$1",[id])).rows.length,0);
  assert.equal((await pg.query("select file_id from public.report_table_parts where file_id=$1",[id])).rows.length,0);
});

test("R2 transfers store only receipts, enforce account ownership, and queue safe cleanup", async () => {
  await pg.exec(r2Migration); // repeatable without changing existing reports
  const owner = crypto.randomUUID(); const other = crypto.randomUUID();
  await pg.query("insert into auth.users(id) values($1),($2)", [owner,other]);
  const scope = accountWorkspace(owner);
  const begin = async () => (await rpc("begin_r2_report_transfer",[scope,JSON.stringify(transferUpload),owner])).rows[0].value;
  const sid = await begin();
  const receipt = (kind,position,rows,bytes=5) => ({kind,tableIndex:position,partIndex:0,rowCount:rows,bytes,sha256:"a".repeat(64),key:`reports/${sid}/${kind}/${position}/0-${"a".repeat(64)}`});
  const put = (data) => rpc("put_r2_report_part",[scope,sid,JSON.stringify(data),owner]);
  await assert.rejects(rpc("complete_r2_report_transfer",[scope,sid,owner]),{code:"22023"});
  await assert.rejects(rpc("put_r2_report_part",[accountWorkspace(other),sid,JSON.stringify(receipt("original",-1,0)),other]),{code:"22023"});
  await assert.rejects(put({...receipt("original",-1,0),key:"another/object"}),{code:"22023"});
  await assert.rejects(put(receipt("original",-1,0,4)),{code:"22023"});
  for(const value of [receipt("original",-1,0),receipt("rows",0,2),receipt("raw",0,3)]) { await put(value); await put(value); }
  await pg.exec("set role service_role");
  let id;
  try { id=(await rpc("complete_r2_report_transfer",[scope,sid,owner])).rows[0].value; }
  finally { await pg.exec("reset role"); }
  assert.equal((await rpc("complete_r2_report_transfer",[scope,sid,owner])).rows[0].value,id);
  const file=(await pg.query("select storage_backend,object_prefix,owner_id,original_base64 from public.report_files where id=$1",[id])).rows[0];
  assert.equal(file.storage_backend,"r2"); assert.equal(file.owner_id,owner); assert.equal(file.original_base64,null);
  assert.equal((await pg.query("select * from public.report_r2_objects where file_id=$1",[id])).rows.length,3);
  assert.equal((await pg.query("select * from public.report_original_parts where file_id=$1",[id])).rows.length,0);
  assert.equal((await pg.query("select * from public.report_table_parts where file_id=$1",[id])).rows.length,0);
  assert.deepEqual((await pg.query("select rows from public.report_tables where file_id=$1",[id])).rows[0].rows,[]);
  await rpc("cancel_report_transfer",[scope,sid,owner]); // completed report must survive cancellation
  assert.equal((await pg.query("select * from public.report_r2_cleanup where prefix=$1",[file.object_prefix])).rows.length,0);
  await pg.query("delete from public.report_transfer_sessions where id=$1",[sid]); // expiry of completed session also safe
  assert.equal((await pg.query("select * from public.report_r2_cleanup where prefix=$1",[file.object_prefix])).rows.length,0);
  await pg.query("delete from auth.users where id=$1",[owner]); // includes account-cascade cleanup
  assert.equal((await pg.query("select * from public.report_r2_cleanup where prefix=$1",[file.object_prefix])).rows.length,1);
  assert.equal((await pg.query("select * from public.report_r2_objects where file_id=$1",[id])).rows.length,0);
  for(const role of ["anon","authenticated"]) {
    const permissions=(await pg.query("select has_table_privilege($1,'public.report_r2_objects','SELECT') as read,has_function_privilege($1,'public.complete_r2_report_transfer(text,uuid,uuid)','EXECUTE') as execute",[role])).rows[0];
    assert.equal(permissions.read,false); assert.equal(permissions.execute,false);
  }
});

test("abandoned R2 sessions leave durable cleanup receipts",async()=>{
  const owner=crypto.randomUUID(); await pg.query("insert into auth.users(id) values($1)",[owner]);
  const scope=accountWorkspace(owner);
  const sid=(await rpc("begin_r2_report_transfer",[scope,JSON.stringify(transferUpload),owner])).rows[0].value;
  await rpc("cancel_report_transfer",[scope,sid,owner]);
  assert.equal((await pg.query("select * from public.report_r2_cleanup where prefix=$1",[`reports/${sid}/`])).rows.length,1);
});

test("PDF reports are accepted by the table constraint and the transfer function, and other kinds are still rejected", async () => {
  await pg.exec(pdfMigration); // repeatable
  const session = await beginTransfer({ ...transferUpload, name: "report.pdf", kind: "pdf" });
  assert.ok(session);
  await rpc("cancel_report_transfer", [workspace, session]);
  await assert.rejects(beginTransfer({ ...transferUpload, name: "report.docx", kind: "docx" }), { code: "22023" });
  const pdfId = `rf_${crypto.randomUUID()}`;
  await save(pdfId, { ...upload, name: "verification.pdf", kind: "pdf" });
  const { rows } = await pg.query("select kind from public.report_files where id = $1", [pdfId]);
  assert.equal(rows[0].kind, "pdf");
});

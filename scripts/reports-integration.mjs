import assert from "node:assert/strict";
import { gridToTable } from "../lib/domain/reportFiles.ts";
import { db } from "../lib/db.ts";

const base = process.env.REPORTS_TEST_URL ?? "http://localhost:3001";
const endpoint = `${base}/api/reports/uploads`;
let id;
let cookie;
let companyId;
try {
  const list = await fetch(endpoint);
  assert.equal(list.status, 200);
  cookie = list.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie, "A new browser receives a workspace cookie");
  assert.deepEqual((await list.json()).files, []);
  const original = Buffer.from("Company,Spend\nIntegration verification,42\n").toString("base64");
  const input = {
    companyName: `Report verification ${crypto.randomUUID()}`,
    name: "verification.csv", kind: "csv", size: 46, uploadedBy: "Automated verification", originalBase64: original,
    tables: [gridToTable("Custom report", [["Export preamble"], [], ["Company", "Spend", "ROAS"], ["Integration verification", 42, 3], ["Second row", 8, 2]]), gridToTable("Headerless", [[1, 2], [3, 4]])],
  };
  const headers = { cookie, "content-type": "application/json" };
  const post = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(input) });
  assert.equal(post.status, 201, JSON.stringify(await post.clone().json()));
  id = (await post.json()).id;
  const detail = await fetch(`${endpoint}/${id}`, { headers: { cookie } });
  assert.equal(detail.status, 200);
  const file = (await detail.json()).file;
  companyId = file.clientId;
  assert.equal(file.companyName, input.companyName);
  assert.equal(file.tables.length, 2);
  assert.deepEqual(file.tables[0].rawRows, input.tables[0].rawRows);
  assert.equal(file.tables[0].headerRow, 2);
  assert.deepEqual(file.tables[1].rows, [[1, 2], [3, 4]]);
  const reload = await fetch(endpoint, { headers: { cookie } });
  assert.equal((await reload.json()).files[0].id, id);
  const anonymous = await fetch(`${endpoint}/${id}`);
  assert.equal(anonymous.status, 404);
  const other = await fetch(endpoint);
  const otherCookie = other.headers.get("set-cookie").split(";")[0];
  assert.deepEqual((await other.json()).files, []);
  assert.equal((await fetch(`${endpoint}/${id}`, { headers: { cookie: otherCookie } })).status, 404);
  assert.equal((await fetch(`${endpoint}/${id}`, { method: "DELETE", headers: { cookie: otherCookie } })).status, 404);
  assert.equal((await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ ...input, companyName: " " }) })).status, 400);
  const sql = await db();
  const [saved] = await sql`SELECT original_base64 FROM report_files WHERE id = ${id}`;
  assert.equal(saved.original_base64, original);
  console.log("PASS: upload, multi-sheet persistence, original preservation, reload, validation and cross-workspace isolation.");
} finally {
  if (id && cookie) {
    assert.equal((await fetch(`${endpoint}/${id}`, { method: "DELETE", headers: { cookie } })).status, 200);
    assert.equal((await fetch(`${endpoint}/${id}`, { headers: { cookie } })).status, 404);
    const sql = await db();
    const remaining = await sql`SELECT id FROM report_tables WHERE file_id = ${id}`;
    assert.equal(remaining.length, 0);
    if (companyId) await sql`DELETE FROM report_companies WHERE id = ${companyId} AND NOT EXISTS (SELECT 1 FROM report_files WHERE client_id = ${companyId})`;
    console.log("PASS: deletion cascades to tables; verification data cleaned up.");
  }
}

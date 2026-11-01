import assert from "node:assert/strict";
import { createTestAccount, TestBrowser } from "./reportAuthFixture.mjs";
import { supabaseRequest } from "../lib/db.ts";
import { REPORT_CHUNK_BYTES, MAX_TRANSFER_REQUEST_BYTES } from "../lib/domain/reportTransfer.ts";

const base = process.env.REPORTS_TEST_URL ?? "http://localhost:3011";
const size = Number(process.env.REPORTS_TEST_FILE_BYTES ?? 5_000_123); // Above the former 4 MB ceiling, without consuming 200 MB of hotspot data.
let sessionId, fileId, companyId, cookie, account;
const browser = new TestBrowser(base);
async function send(body, expected = 200, scope = cookie) {
  const text = JSON.stringify(body);
  assert.ok(Buffer.byteLength(text) <= MAX_TRANSFER_REQUEST_BYTES);
  const response = await fetch(`${base}/api/reports/transfers`, { method: "POST", headers: { cookie: scope, "content-type": "application/json" }, body: text });
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  return result;
}
try {
  account = await createTestAccount();
  await browser.signIn(account);
  const list = await browser.request("/api/reports/uploads");
  assert.equal(list.status, 200);
  cookie = [...browser.cookies].map(([name,value])=>`${name}=${value}`).join("; ");
  assert.ok(cookie);
  const input = { companyName: `Large upload verification ${crypto.randomUUID()}`, name: "large-verification.csv", kind: "csv", size, uploadedBy: "Automated verification",
    tables: [{ name: "Metrics", columns: ["Value"], headerRow: 0, rowCount: 2, rawRowCount: 3, rowParts: 2, rawParts: 2 }],
  };
  await send({ action: "begin", upload: { ...input, size: 200_000_001 } }, 400);
  ({ sessionId } = await send({ action: "begin", upload: input }));
  await send({ action: "complete", sessionId }, 400);
  const originalParts = Math.ceil(size / REPORT_CHUNK_BYTES);
  let next = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (next < originalParts) {
      const index = next++;
      const payload = Buffer.alloc(Math.min(REPORT_CHUNK_BYTES, size - index * REPORT_CHUNK_BYTES), 0x61).toString("base64");
      const message = { action: "part", sessionId, part: { kind: "original", tableIndex: -1, partIndex: index, payload } };
      await send(message);
      if (index === 0) await send(message); // Retry must replace this part, never duplicate it.
    }
  }));
  for (const [kind, chunks] of [["rows", [[[0]], [[null]]]], ["raw", [[["Value"]], [[0], [null]]]]]) {
    for (const [partIndex, payload] of chunks.entries()) await send({ action: "part", sessionId, part: { kind, tableIndex: 0, partIndex, payload } });
  }
  ({ id: fileId } = await send({ action: "complete", sessionId }));
  assert.equal((await send({ action: "complete", sessionId })).id, fileId);
  const headers = { cookie };
  const detail = await fetch(`${base}/api/reports/uploads/${fileId}`, { headers });
  assert.equal(detail.status, 200);
  const file = (await detail.json()).file;
  companyId = file.clientId;
  assert.equal(file.size, size);
  assert.equal(file.tables[0].chunked, true);
  assert.equal(file.tables[0].rowParts, 2);
  const partUrl = `${base}/api/reports/uploads/${fileId}/parts?table=${file.tables[0].id}&kind=rows&index=0`;
  const first = await fetch(partUrl, { headers });
  assert.equal(first.status, 200);
  assert.deepEqual((await first.json()).rows, [[0]]);
  assert.equal((await fetch(partUrl)).status, 401);
  const original = await supabaseRequest("report_original_parts", { query: { select: "part_index,byte_count", file_id: `eq.${fileId}`, order: "part_index.asc" } });
  assert.equal(original.length, originalParts);
  assert.equal(original.reduce((n, part) => n + part.byte_count, 0), size);
  console.log(`PASS: ${size.toLocaleString()} byte upload in ${originalParts} original chunks; bounded requests, idempotent retries, chunk read-back, 200 MB upper boundary rejection and workspace isolation.`);
} finally {
  if (fileId && cookie) {
    const response = await fetch(`${base}/api/reports/uploads/${fileId}`, { method: "DELETE", headers: { cookie } });
    assert.equal(response.status, 200);
    for (const table of ["report_original_parts", "report_table_parts"]) {
      assert.equal((await supabaseRequest(table, { query: { select: "file_id", file_id: `eq.${fileId}` } })).length, 0);
    }
    if (companyId) await supabaseRequest("report_companies", { method: "DELETE", query: { id: `eq.${companyId}` } });
  }
  if (sessionId) await supabaseRequest("report_transfer_sessions", { method: "DELETE", query: { id: `eq.${sessionId}` } });
  if (account) await account.remove();
  console.log("Verification account, upload and chunk data cleaned up.");
}

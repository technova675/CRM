import test from "node:test";
import assert from "node:assert/strict";
import { supabaseRequest, dbError, SupabaseDbError, DbNotConfiguredError } from "../lib/db.ts";
import { listReportFiles, getReportFile, saveReportFile, deleteReportFile } from "../lib/reportsRepository.ts";

const workspace = "a".repeat(64);
const stored = { id: "rf_test", client_id: "rc_test", name: "report.csv", kind: "csv", size: 4, uploaded_by: "Test", created_at: "2026-11-01T00:00:00Z", company: { name: "Test company" }, tables: [{ id: "rt_test", name: "Metrics", row_count: 2, column_count: 2 }] };

function setup(t, respond) {
  const keys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"];
  const previous = keys.map((key) => process.env[key]);
  process.env.SUPABASE_URL = "https://test-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "eyJ.test.server-secret";
  delete process.env.SUPABASE_SECRET_KEY;
  t.after(() => keys.forEach((key, i) => previous[i] === undefined ? delete process.env[key] : process.env[key] = previous[i]));
  t.mock.method(globalThis, "fetch", respond);
}

test("report listing paginates, scopes every request and maps the Supabase relation shape", async (t) => {
  const requests = [];
  setup(t, async (url, init) => {
    requests.push(new URL(url));
    assert.equal(init.headers.apikey, "eyJ.test.server-secret");
    assert.equal(init.cache, "no-store");
    return Response.json(requests.length === 1 ? Array.from({ length: 500 }, () => stored) : [stored]);
  });
  const files = await listReportFiles(workspace, "client with spaces");
  assert.equal(files.length, 501);
  assert.equal(files[0].companyName, "Test company");
  assert.deepEqual(files[0].tables[0], { id: "rt_test", name: "Metrics", rowCount: 2, columnCount: 2 });
  assert.equal(requests[1].searchParams.get("offset"), "500");
  for (const url of requests) {
    assert.equal(url.searchParams.get("workspace_id"), `eq.${workspace}`);
    assert.equal(url.searchParams.get("client_id"), "eq.client with spaces");
    assert.equal(url.searchParams.get("tables.order"), "position.asc");
  }
});

test("report read and delete always filter by both file and workspace", async (t) => {
  setup(t, async (url) => {
    assert.equal(url.searchParams.get("workspace_id"), `eq.${workspace}`);
    assert.equal(url.searchParams.get("id"), "eq.rf_other");
    return Response.json([]);
  });
  assert.equal(await getReportFile(workspace, "rf_other"), null);
  assert.equal(await deleteReportFile(workspace, "rf_other"), false);
  await assert.rejects(listReportFiles("bad workspace"), /Invalid report workspace/);
});

test("workbook upload uses one atomic RPC without exposing service keys in the body", async (t) => {
  const upload = { name: "report.csv", tables: [{ name: "Sheet", columns: ["Value"], rows: [[0], [null]] }] };
  setup(t, async (url, init) => {
    assert.equal(url.pathname, "/rest/v1/rpc/save_report_upload");
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(init.body), { p_workspace: workspace, p_file_id: "rf_new", p_upload: upload });
    return Response.json("rf_new");
  });
  assert.equal(await saveReportFile(workspace, "rf_new", upload), "rf_new");
});

test("connection and missing-schema failures become useful 503 errors without leaking upstream details", async (t) => {
  setup(t, async () => Response.json({ code: "PGRST205", message: "private upstream details" }, { status: 404 }));
  t.mock.method(console, "error", () => {});
  await assert.rejects(supabaseRequest("report_files"), (error) => {
    assert.ok(error instanceof SupabaseDbError);
    assert.equal(error.code, "PGRST205");
    assert.ok(!error.message.includes("private"));
    return true;
  });
  const response = dbError(new SupabaseDbError("PGRST205", 404));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "schema_missing");
  assert.equal(dbError(new DbNotConfiguredError()).status, 503);
});

test("new Supabase secret keys are sent as apikey, never as a Bearer JWT", async (t) => {
  setup(t, async (_url, init) => {
    assert.equal(init.headers.apikey, "sb_secret_test");
    assert.equal(init.headers.Authorization, undefined);
    return Response.json([]);
  });
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  await supabaseRequest("report_files");
});

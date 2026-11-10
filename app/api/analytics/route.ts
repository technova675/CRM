import {recordAudit} from "@/lib/auditServer";
import { createHash } from "node:crypto";
import { z } from "zod";
import { reportIdentity, sameOrigin } from "@/lib/auth/server";
import { dbError } from "@/lib/db";
import { can } from "@/lib/permissions";
import type { CRMLibrary } from "@/lib/domain/crmLibrary";
import { boundedJSON, ownedLibrary } from "@/lib/outreachServer";
import { mutateMedia } from "@/lib/mediaServer";
import { analyticsRow, currencyCode, feedSpec, mergeAnalyticsFeed, parseAnalyticsCsv, validateAnalyticsRows } from "@/lib/domain/analyticsEngine";
import { seoDate } from "@/lib/domain/seoWorkspace";

const operation = z.object({ operationId: z.string().uuid() });
const request = z.discriminatedUnion("action", [
  operation.extend({ action: z.literal("import"), feed: feedSpec, currency: currencyCode, csv: z.string().max(600000) }),
  operation.extend({ action: z.literal("sync"), feed: feedSpec, start: seoDate, end: seoDate }),
  operation.extend({ action: z.literal("remove"), id: z.string().length(64), updatedAt: z.string().datetime() }),
]);
const connectorResult = z.object({ currency: currencyCode, rows: z.array(analyticsRow).min(1).max(3000) });

function connector(owner: string) {
  if (!process.env.ANALYTICS_CONNECTOR_TOKEN || !process.env.ANALYTICS_CONNECTOR_OWNER_IDS?.split(",").map(id => id.trim()).includes(owner)) return;
  try {
    const url = new URL(process.env.ANALYTICS_CONNECTOR_URL ?? "");
    if (url.protocol === "https:" && !url.username && !url.password) return url;
  } catch {}
}

class AnalyticsError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
function canWrite(data: CRMLibrary | undefined, owner: string) {
  const member = data?.team.find(person => person.id === owner);
  return !!member && member.status === "active" && can(member.role, "analytics", "write");
}
const fail = (error: string, status = 400) => Response.json({ error }, { status });

export async function GET(req: Request) {
  try {
    const user = await reportIdentity(req);
    return Response.json({ connectorReady: !!connector(user.userId) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return dbError(error); }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail("Request origin is not allowed.", 403);
  try {
    const user = await reportIdentity(req);
    let body: unknown;
    try { body = await boundedJSON(req, 700000); } catch { return fail("Invalid or oversized analytics request."); }
    const parsed = request.safeParse(body);
    if (!parsed.success) return fail("Check the source, client, report name, currency and dates.");
    const input = parsed.data;
    const library = await ownedLibrary(user.userId);
    if (!canWrite(library, user.userId)) return fail("You need write access to Analytics.", 403);
    if (input.action === "remove") {
      await mutateMedia(user.userId, input.operationId, data => {
        if (!canWrite(data, user.userId)) throw new AnalyticsError("You need write access to Analytics.", 403);
        const feed = data.analyticsFeeds?.find(item => item.id === input.id);
        if (!feed) return data;
        if (feed.updatedAt !== input.updatedAt) throw new AnalyticsError("This feed changed. Refresh before removing it.", 409);
        data.analyticsFeeds = data.analyticsFeeds.filter(item => item.id !== input.id);
        recordAudit(data,{actor:"human",actorId:user.userId,clientId:feed.clientId,entity:"analytics",entityId:feed.id,action:"Removed analytics feed",detail:feed.report,sources:[feed.platform],before:feed.rows.length+" rows",after:"Feed removed",outcome:"Deleted"});
        return data;
      });
      return Response.json({ removed: true });
    }
    if (!library?.clients.some(client => client.id === input.feed.clientId)) return fail("Choose a client from this CRM account.", 404);
    let rows, currency;
    if (input.action === "import") {
      currency = input.currency;
      try { rows = parseAnalyticsCsv(input.csv); } catch (error) { return fail((error as Error).message); }
    } else {
      const url = connector(user.userId);
      if (!url) return fail("The live analytics connector is not configured for this account.", 503);
      if (input.start > input.end || Date.parse(input.end) - Date.parse(input.start) > 92 * 86400000) return fail("Choose a sync range of up to 93 days.");
      try {
        const { platform, account, report } = input.feed;
        const response = await fetch(url, {
          method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(25000),
          headers: { Authorization: "Bearer " + process.env.ANALYTICS_CONNECTOR_TOKEN, "Content-Type": "application/json" },
          body: JSON.stringify({ ownerId: user.userId, platform, account, report, start: input.start, end: input.end }),
        });
        if (!response.ok) return fail("The connector rejected the report request. Check source authorization and report mapping.", 502);
        const result = connectorResult.safeParse(await boundedJSON(response, 1600000));
        if (!result.success || result.data.rows.some(row => row.date < input.start || row.date > input.end)) return fail("The connector returned invalid metrics or dates.", 502);
        ({ rows, currency } = result.data);
      } catch { return fail("The connector could not return a valid report. Check its configuration and retry.", 502); }
    }
    let grain: string;
    try { grain = validateAnalyticsRows(rows); } catch (error) { return fail((error as Error).message); }
    const id = createHash("sha256").update(JSON.stringify([input.feed.clientId, input.feed.platform, input.feed.account, input.feed.report])).digest("hex");
    const updatedAt = new Date().toISOString();
    await mutateMedia(user.userId, input.operationId, data => {
      if (!canWrite(data, user.userId)) throw new AnalyticsError("You need write access to Analytics.", 403);
      if (!data.clients.some(client => client.id === input.feed.clientId)) throw new AnalyticsError("The selected client is no longer in this CRM account.", 404);
      const feeds = data.analyticsFeeds ?? [];
      const previous = feeds.find(feed => feed.id === id);
      let feed;
      try {
        feed = mergeAnalyticsFeed(previous, { ...input.feed, id, currency, grain, updatedAt, method: input.action === "import" ? "CSV import" : "Live sync", rows });
      } catch (error) {
        throw new AnalyticsError((error as Error).message, 409);
      }
      const next = [...feeds.filter(item => item.id !== id), feed];
      if (next.length > 80 || next.reduce((total, item) => total + item.rows.length, 0) > 12000) throw new AnalyticsError("Analytics storage is full. Remove an unused feed before adding more rows.", 413);
      data.analyticsFeeds = next;
      recordAudit(data,{actor:"api",actorId:user.userId,clientId:feed.clientId,entity:"analytics",entityId:feed.id,action:input.action==="import"?"Imported analytics data":"Synced analytics data",detail:feed.report,sources:[feed.platform+" · "+feed.method],before:(previous?.rows.length??0)+" rows",after:feed.rows.length+" rows",outcome:"Saved"});
      return data;
    });
    return Response.json({ id, rows: rows.length });
  } catch (error) {
    return error instanceof AnalyticsError ? fail(error.message, error.status) : dbError(error);
  }
}

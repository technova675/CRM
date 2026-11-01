import { cookies } from "next/headers";
import { authClient, reportIdentity, sameOrigin } from "@/lib/auth/server";
import { reportWorkspace } from "@/lib/reportWorkspace";
import { dbError, supabaseRequest } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const user = await reportIdentity(req);
    const legacy = reportWorkspace(req);
    const reportIds = legacy && legacy !== user.workspace ? await supabaseRequest<{ id: string }[]>("report_files", { query: {
      select: "id", workspace_id: `eq.${legacy}`, owner_id: "is.null", limit: "1000",
    } }) : [];
    return Response.json({ email: user.email, legacyCount: reportIds.length }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return dbError(error); }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  try {
    const user = await reportIdentity(req);
    // Account linking is a sensitive ownership change; also check the live Auth user record.
    const client = await authClient(req);
    const { data, error } = await client.auth.getUser();
    if (error || data.user?.id !== user.userId) return Response.json({ error: "Sign in again before linking reports." }, { status: 401 });
    const legacy = reportWorkspace(req);
    if (!legacy || legacy === user.workspace) return Response.json({ linked: 0 });
    const linked = await supabaseRequest<number>("rpc/claim_browser_reports", { method: "POST", body: { p_owner: user.userId, p_legacy_workspace: legacy } });
    (await cookies()).set("adbibe-report-workspace", "", { path: "/api/reports", maxAge: 0, httpOnly: true, sameSite: "strict", secure: new URL(req.url).protocol === "https:" });
    return Response.json({ linked }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return dbError(error); }
}

import { dbError } from "@/lib/db";
import { reportIdentity, sameOrigin } from "@/lib/auth/server";
import { deleteReportFile, getReportFile } from "@/lib/reportsRepository";

// GET /api/reports/uploads/:id → one uploaded file with all of its tables.
export async function GET(_req: Request, ctx: RouteContext<"/api/reports/uploads/[id]">) {
  const { id } = await ctx.params;
  try {
    const { workspace } = await reportIdentity(_req);
    const file = await getReportFile(workspace, id);
    if (!file) return Response.json({ error: "Report not found" }, { status: 404 });
    return Response.json({ file });
  } catch (e) {
    return dbError(e);
  }
}

// DELETE /api/reports/uploads/:id → removes the file and (by cascade) its tables.
export async function DELETE(_req: Request, ctx: RouteContext<"/api/reports/uploads/[id]">) {
  if (!sameOrigin(_req)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  const { id } = await ctx.params;
  try {
    const { workspace } = await reportIdentity(_req);
    const gone = await deleteReportFile(workspace, id);
    if (!gone) return Response.json({ error: "Report not found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    return dbError(e);
  }
}

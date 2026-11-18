import { z } from "zod";
import { sameOrigin, sessionIdentity } from "@/lib/auth/server";
import { AuthenticationRequiredError } from "@/lib/auth/identity";
import { boundedJSON } from "@/lib/outreachServer";
import { touchPresence } from "@/lib/accessServer";

const body = z.object({ page: z.string().max(200).regex(/^\/[^\s?#]*$/).optional() });

// Heartbeat from any signed-in session. Never fails the page: presence is best-effort.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return new Response(null, { status: 204 });
  try {
    const user = await sessionIdentity(req);
    const parsed = body.safeParse(await boundedJSON(req, 512).catch(() => ({})));
    const owner = user.staffOwner ?? user.userId;
    const kind = user.staffOwner ? "staff" : "agency";
    await touchPresence(owner, user.userId, kind, parsed.success ? parsed.data.page ?? null : null);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return new Response(null, { status: 401 });
    return new Response(null, { status: 204 });
  }
}

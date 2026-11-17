import { z } from "zod";
import { reportIdentity, sameOrigin } from "@/lib/auth/server";
import { boundedJSON, ownedLibrary } from "@/lib/outreachServer";
import { ensureTenant } from "@/lib/tenantServer";
import { dbError } from "@/lib/db";
import { isStaffRole } from "@/lib/domain/staffRoles";
import { portalState } from "@/lib/domain/clientPortal";
import { PORTAL_PANELS, STAFF_PANELS } from "@/lib/domain/staffPanels";
import { accessTablesReady, allPanelOverrides, effectivePanels, listPresence, roleDefaultPanels, setPanelOverride } from "@/lib/accessServer";

const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const input = z.object({ userId: z.string().uuid(), panel: z.enum([...STAFF_PANELS, ...PORTAL_PANELS]), state: z.enum(["default", "show", "hide"]) });

async function requireOwner(req: Request) {
  const user = await reportIdentity(req);
  const data = await ensureTenant(user.userId, user.email);
  if (!data.team.some(member => member.id === user.userId && member.role === "admin" && (member.status ?? "active") === "active")) return null;
  return { owner: user.userId, data };
}

export async function GET(req: Request) {
  try {
    const ctx = await requireOwner(req);
    if (!ctx) return reply({ error: "Workspace owner access is required." }, 403);
    const { owner, data } = ctx;
    const [presence, overrides, ready] = await Promise.all([listPresence(owner), allPanelOverrides(owner), accessTablesReady()]);
    const seen = (userId: string) => {
      const row = presence.get(userId);
      return { lastSeenAt: row?.last_seen_at ?? null, currentPage: row?.current_page ?? null };
    };
    const staff = data.team.filter(member => isStaffRole(member.role) && (member.staffAuthId || data.staffInvites?.some(invite => invite.memberId === member.id))).map(member => {
      const defaults = roleDefaultPanels(data, member.id);
      const own = member.staffAuthId ? overrides.get(member.staffAuthId) ?? {} : {};
      return {
        id: member.id, userId: member.staffAuthId ?? null, name: member.name, email: member.email, role: member.role,
        status: member.staffAuthId ? member.status ?? "active" : "invited",
        ...(member.staffAuthId ? seen(member.staffAuthId) : { lastSeenAt: null, currentPage: null }),
        defaults, overrides: own, effective: effectivePanels(defaults, own),
      };
    });
    const clientName = new Map(data.clients.map(client => [client.id, client.company]));
    const portal = portalState(data).accounts.map(account => ({
      userId: account.userId, email: account.email, client: clientName.get(account.clientId) ?? "Client", active: account.active, ...seen(account.userId),
      hidden: Object.entries(overrides.get(account.userId) ?? {}).filter(([, allowed]) => allowed === false).map(([panel]) => panel),
    }));
    return reply({ now: new Date().toISOString(), ready, owner: seen(owner), staff, portal });
  } catch (error) { return dbError(error); }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return reply({ error: "Request origin is not allowed." }, 403);
  try {
    const ctx = await requireOwner(req);
    if (!ctx) return reply({ error: "Workspace owner access is required." }, 403);
    const parsed = input.safeParse(await boundedJSON(req, 1024).catch(() => null));
    if (!parsed.success) return reply({ error: "Choose a valid user, section and setting." }, 400);
    // Read the saved library so an override can only target this workspace's linked staff logins.
    const data = (await ownedLibrary(ctx.owner)) ?? ctx.data;
    const { userId, panel } = parsed.data;
    const isStaff = data.team.some(member => member.staffAuthId === userId && isStaffRole(member.role));
    const isPortal = portalState(data).accounts.some(account => account.userId === userId);
    // Each login kind may only be given the sections that exist for it.
    const valid = isStaff ? (STAFF_PANELS as readonly string[]).includes(panel) : isPortal && (PORTAL_PANELS as readonly string[]).includes(panel);
    if (!isStaff && !isPortal) return reply({ error: "User not found." }, 404);
    if (!valid) return reply({ error: "That section does not apply to this user." }, 400);
    await setPanelOverride(ctx.owner, parsed.data.userId, parsed.data.panel, parsed.data.state);
    return reply({ ok: true });
  } catch (error) { return dbError(error); }
}

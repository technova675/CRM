import { supabaseRequest, SupabaseDbError } from "./db";
import { knowledgeAccess } from "./domain/clientKnowledge";
import { STAFF_PANELS, STAFF_PANEL_MODULE, type PanelOverrides, type StaffPanel } from "./domain/staffPanels";
import type { CRMLibrary } from "./domain/crmLibrary";

export type PresenceKind = "agency" | "staff";
export type PresenceRow = { user_id: string; kind: PresenceKind; current_page: string | null; last_seen_at: string };

// The tables come from migration 202611010008. Until it is applied there is nothing to enforce or show.
const MISSING_TABLE = new Set(["PGRST205", "42P01", "http_404"]);
const tolerateMissing = <T>(fallback: T) => (error: unknown): T => {
  if (error instanceof SupabaseDbError && MISSING_TABLE.has(error.code)) return fallback;
  throw error;
};

const isPanel = (value: string): value is StaffPanel => (STAFF_PANELS as readonly string[]).includes(value);

function toOverrides(rows: { panel: string; allowed: boolean }[]): PanelOverrides {
  const result: PanelOverrides = {};
  for (const row of rows) if (isPanel(row.panel)) result[row.panel] = row.allowed;
  return result;
}

export async function panelOverridesFor(owner: string, userId: string): Promise<PanelOverrides> {
  const rows = await supabaseRequest<{ panel: string; allowed: boolean }[]>("user_panel_access", {
    query: { owner_id: `eq.${owner}`, user_id: `eq.${userId}`, select: "panel,allowed" },
  }).catch(tolerateMissing([]));
  return toOverrides(rows);
}

export async function allPanelOverrides(owner: string): Promise<Map<string, PanelOverrides>> {
  const rows = await supabaseRequest<{ user_id: string; panel: string; allowed: boolean }[]>("user_panel_access", {
    query: { owner_id: `eq.${owner}`, select: "user_id,panel,allowed", limit: "5000" },
  }).catch(tolerateMissing([]));
  const byUser = new Map<string, PanelOverrides>();
  for (const row of rows) {
    if (!isPanel(row.panel)) continue;
    byUser.set(row.user_id, { ...byUser.get(row.user_id), [row.panel]: row.allowed });
  }
  return byUser;
}

/** state: "default" removes the override so the role decides again. */
export async function setPanelOverride(owner: string, userId: string, panel: StaffPanel, state: "default" | "show" | "hide") {
  if (state === "default") {
    await supabaseRequest("user_panel_access", { method: "DELETE", query: { owner_id: `eq.${owner}`, user_id: `eq.${userId}`, panel: `eq.${panel}` } });
    return;
  }
  await supabaseRequest("user_panel_access", {
    method: "POST",
    query: { on_conflict: "owner_id,user_id,panel" },
    prefer: "resolution=merge-duplicates,return=minimal",
    body: { owner_id: owner, user_id: userId, panel, allowed: state === "show", updated_at: new Date().toISOString() },
  });
}

export function roleDefaultPanels(data: CRMLibrary, memberId: string): Record<StaffPanel, boolean> {
  return Object.fromEntries(STAFF_PANELS.map(panel => [panel, knowledgeAccess(data, memberId, STAFF_PANEL_MODULE[panel])])) as Record<StaffPanel, boolean>;
}

/** Override wins; otherwise the role decides. Granting a panel only exposes it read-only: edits still follow the role. */
export function effectivePanels(defaults: Record<StaffPanel, boolean>, overrides: PanelOverrides): Record<StaffPanel, boolean> {
  return Object.fromEntries(STAFF_PANELS.map(panel => [panel, overrides[panel] ?? defaults[panel]])) as Record<StaffPanel, boolean>;
}

export async function touchPresence(owner: string, userId: string, kind: PresenceKind, page: string | null) {
  await supabaseRequest("user_presence", {
    method: "POST",
    query: { on_conflict: "owner_id,user_id" },
    prefer: "resolution=merge-duplicates,return=minimal",
    body: { owner_id: owner, user_id: userId, kind, current_page: page, last_seen_at: new Date().toISOString() },
  }).catch(tolerateMissing(undefined));
}

export async function listPresence(owner: string): Promise<Map<string, PresenceRow>> {
  const rows = await supabaseRequest<PresenceRow[]>("user_presence", {
    query: { owner_id: `eq.${owner}`, select: "user_id,kind,current_page,last_seen_at", limit: "5000" },
  }).catch(tolerateMissing([] as PresenceRow[]));
  return new Map(rows.map(row => [row.user_id, row]));
}

export async function accessTablesReady() {
  try {
    await supabaseRequest("user_panel_access", { query: { select: "user_id", limit: "0" } });
    await supabaseRequest("user_presence", { query: { select: "user_id", limit: "0" } });
    return true;
  } catch (error) {
    if (error instanceof SupabaseDbError && MISSING_TABLE.has(error.code)) return false;
    throw error;
  }
}

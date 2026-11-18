"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Circle } from "lucide-react";
import { Avatar, Badge, Button, Card, CardHeader, Modal, Select, Table, Td, Th } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/permissions";
import { ONLINE_WINDOW_MS, STAFF_PANELS, STAFF_PANEL_LABEL, type PanelOverrides, type StaffPanel } from "@/lib/domain/staffPanels";
import { relTime } from "@/lib/utils";
import type { Role } from "@/lib/types";

type Presence = { lastSeenAt: string | null; currentPage: string | null };
type StaffUser = Presence & { id: string; userId: string | null; name: string; email: string; role: Role; status: string; defaults: Record<StaffPanel, boolean>; overrides: PanelOverrides; effective: Record<StaffPanel, boolean> };
type Payload = { now: string; ready: boolean; owner: Presence; staff: StaffUser[] };
type State = "default" | "show" | "hide";
type Row = { kind: "staff"; key: string; name: string; email: string; detail: string; presence: Presence; badge?: { tone: "warning" | "danger"; label: string }; user: StaffUser; summary: string };

const stateOf = (user: StaffUser, panel: StaffPanel): State => user.overrides[panel] === undefined ? "default" : user.overrides[panel] ? "show" : "hide";

function isOnline(presence: Presence, now: number) {
  const seen = presence.lastSeenAt ? Date.parse(presence.lastSeenAt) : NaN;
  return Number.isFinite(seen) && now - seen < ONLINE_WINDOW_MS;
}

function Status({ presence, now }: { presence: Presence; now: number }) {
  const online = isOnline(presence, now);
  return (
    <div className="min-w-0">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium">
        <Circle className={online ? "size-2.5 fill-success text-success" : "size-2.5 fill-fg-3 text-fg-3"} aria-hidden="true" />
        {online ? "Online now" : "Offline"}
      </span>
      <p className="truncate text-[11px] text-fg-3">
        {online ? (presence.currentPage ? `On ${presence.currentPage}` : "Active") : presence.lastSeenAt ? `Last seen ${relTime(presence.lastSeenAt)}` : "Never signed in"}
      </p>
    </div>
  );
}

export function UserAccess() {
  const [data, setData] = useState<Payload>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState<string>();
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Could not load users.");
    setData(body);
    setError("");
  }, []);
  useEffect(() => {
    const refresh = () => void load().catch(cause => setError(cause instanceof Error ? cause.message : "Could not load users."));
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [load]);

  async function change(userId: string, panel: string, state: State) {
    setBusy(`${userId}:${panel}`);
    setError("");
    try {
      const response = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, panel, state }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save the change.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the change.");
    } finally {
      setBusy("");
    }
  }

  const now = data ? Date.parse(data.now) : 0;
  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const staff: Row[] = data.staff.map(user => {
      const visible = STAFF_PANELS.filter(panel => user.effective[panel]).length;
      return {
        kind: "staff", key: `s:${user.id}`, name: user.name, email: user.email, detail: ROLE_LABEL[user.role], presence: user, user,
        badge: user.status === "active" ? undefined : user.status === "invited" ? { tone: "warning", label: "Invited" } : { tone: "danger", label: "Access revoked" },
        summary: user.userId ? `${visible} of ${STAFF_PANELS.length} sections` : "Waiting for invitation",
      };
    });
    return staff;
  }, [data]);
  const online = rows.filter(row => isOnline(row.presence, now)).length;
  const current = rows.find(row => row.key === editing);

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {data && !data.ready && (
        <Card className="border-warning p-4 text-sm">
          <p className="font-medium">One-time database setup needed</p>
          <p className="mt-1 text-fg-2">Run <code>supabase/migrations/202611010008_user_access.sql</code> in the Supabase SQL Editor. Until then, activity is not recorded and section settings cannot be saved.</p>
        </Card>
      )}
      {!data && !error && <p role="status" className="text-sm text-fg-2">Loading users…</p>}
      {data && (
        <Card>
          <CardHeader title="Staff access" subtitle={`${rows.length} login${rows.length === 1 ? "" : "s"} · ${online} online now. Open “Manage access” to choose which sections each person sees.`} />
          {!rows.length ? <p className="px-4 pb-4 text-sm text-fg-3">No staff logins yet. Invite a teammate in Staff sign-in.</p> : (
            <Table>
              <thead>
                <tr><Th>User</Th><Th>Type</Th><Th>Activity</Th><Th>Access</Th><Th className="text-right">Manage</Th></tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.key}>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={row.name} size={28} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{row.name}</p>
                          <p className="truncate text-xs text-fg-3">{row.email}</p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone="accent">{row.detail}</Badge>
                        {row.badge && <Badge tone={row.badge.tone}>{row.badge.label}</Badge>}
                      </div>
                    </Td>
                    <Td><Status presence={row.presence} now={now} /></Td>
                    <Td className="text-xs text-fg-2">{row.summary}</Td>
                    <Td className="text-right">
                      <Button size="sm" disabled={row.kind === "staff" && !row.user.userId} onClick={() => setEditing(row.key)}>Manage access</Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {current && (
        <Modal open onClose={() => setEditing(undefined)} title={current.name} subtitle={`${current.email} · ${current.detail}`} size="lg" footer={<Button onClick={() => setEditing(undefined)}>Done</Button>}>
          {current.kind === "staff" && current.user.userId && (
            <div className="space-y-3">
              <p className="text-xs text-fg-3">“Role default” follows the permissions of their role. “Always show” makes a section visible read-only; editing still follows the role.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {STAFF_PANELS.map(panel => (
                  <label key={panel} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs">
                    <span className="min-w-0">
                      <span className="block font-medium">{STAFF_PANEL_LABEL[panel]}</span>
                      <span className={current.user.effective[panel] ? "text-success" : "text-fg-3"}>{current.user.effective[panel] ? "Visible" : "Hidden"}</span>
                    </span>
                    <Select className="w-32" aria-label={`${STAFF_PANEL_LABEL[panel]} for ${current.name}`} value={stateOf(current.user, panel)} disabled={!!busy || !data?.ready} onChange={event => void change(current.user.userId!, panel, event.target.value as State)}>
                      <option value="default">Role default</option>
                      <option value="show">Always show</option>
                      <option value="hide">Always hide</option>
                    </Select>
                  </label>
                ))}
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

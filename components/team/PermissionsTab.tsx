"use client";

import { Lock, RotateCcw, ShieldCheck } from "lucide-react";
import { useCRM } from "@/lib/store";
import { DEFAULT_PERMISSIONS, MODULES, MODULE_LABEL, ROLE_LABEL, type Access, type Module } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge, Card, CardHeader, Table, Td, Th } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { ROLES } from "./MembersTab";

const ACCESS: Access[] = ["none", "read", "own", "full"];
const ACCESS_LABEL: Record<Access, string> = { none: "None", read: "Read", own: "Own", full: "Full" };
const ACCESS_TONE: Record<Access, string> = {
  full: "bg-success-soft text-success",
  read: "bg-info-soft text-info",
  own: "bg-accent-soft text-accent-text",
  none: "bg-surface-2 text-fg-3",
};
const ACCESS_HELP: Record<Access, string> = {
  none: "Module hidden",
  read: "View only",
  own: "Read & write only their own / their client's records",
  full: "Read & write everything",
};

export function PermissionsTab({ editable }: { editable: boolean }) {
  const overrides = useCRM((s) => s.settings.permissionOverrides);
  const setOverride = useCRM((s) => s.setPermissionOverride);
  const updateSettings = useCRM((s) => s.updateSettings);
  const log = useCRM((s) => s.log);
  const me = useCRM((s) => s.currentUserId);

  // Read straight from settings so the matrix reflects edits immediately.
  const accessOf = (r: Role, m: Module): Access => overrides[r]?.[m] ?? DEFAULT_PERMISSIONS[r][m];
  const isOverridden = (r: Role, m: Module) => overrides[r]?.[m] !== undefined && overrides[r]?.[m] !== DEFAULT_PERMISSIONS[r][m];
  const overrideCount = (r: Role) => MODULES.filter((m) => isOverridden(r, m)).length;

  const change = (r: Role, m: Module, a: Access) => {
    setOverride(r, m, a === DEFAULT_PERMISSIONS[r][m] ? undefined : a);
    toast(`${ROLE_LABEL[r]} · ${MODULE_LABEL[m]}`, `Access → ${ACCESS_LABEL[a]}`);
  };
  const reset = (r: Role) => {
    updateSettings({ permissionOverrides: { ...overrides, [r]: {} } });
    log({ actor: "human", actorId: me, entity: "settings", action: "Reset role permissions to defaults", detail: ROLE_LABEL[r], before: `${overrideCount(r)} override(s)`, after: "defaults" });
    toast(`${ROLE_LABEL[r]} reset to defaults`);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-wrap gap-3">
            {ACCESS.map((a) => (
              <span key={a} className="flex items-center gap-1.5 text-xs text-fg-2">
                <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-medium", ACCESS_TONE[a])}>{ACCESS_LABEL[a]}</span>
                {ACCESS_HELP[a]}
              </span>
            ))}
            <span className="flex items-center gap-1.5 text-xs text-fg-2">
              <span className="size-2 rounded-full bg-warning" /> Changed from default
            </span>
          </div>
          {!editable && <Badge tone="warning">Read-only — only admins can change permissions</Badge>}
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-xs text-fg-3">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
          Enforced in the UI (navigation, pages and actions). The same matrix must be enforced server-side — in API handlers and database row-level security scoped to the organization — before production.
        </p>
      </Card>

      <Card>
        <CardHeader title="Roles & permissions" subtitle={`${MODULES.length} modules × ${ROLES.length} roles. Admin is locked to full access so the workspace can't be locked out.`} />
        <Table className="max-h-[70vh]">
          <thead>
            <tr>
              <Th className="sticky left-0 z-[2] min-w-44">Module</Th>
              {ROLES.map((r) => (
                <Th key={r} className="min-w-24 text-center">
                  <span className="block whitespace-normal leading-tight">{ROLE_LABEL[r]}</span>
                  {r === "admin" ? (
                    <Lock className="mx-auto mt-0.5 size-3 text-fg-3" />
                  ) : (
                    editable &&
                    overrideCount(r) > 0 && (
                      <button onClick={() => reset(r)} className="mx-auto mt-0.5 flex items-center gap-0.5 text-[10px] text-accent-text hover:underline" title="Reset role to defaults">
                        <RotateCcw className="size-2.5" /> Reset ({overrideCount(r)})
                      </button>
                    )
                  )}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODULES.map((m) => (
              <tr key={m} className="hover:bg-surface-2/60">
                <Td className="sticky left-0 z-[1] bg-surface font-medium">{MODULE_LABEL[m]}</Td>
                {ROLES.map((r) => {
                  const a = r === "admin" ? "full" : accessOf(r, m);
                  const changed = r !== "admin" && isOverridden(r, m);
                  return (
                    <Td key={r} className="px-1.5 text-center">
                      <span className="relative inline-block">
                        {editable && r !== "admin" ? (
                          <select
                            value={a}
                            onChange={(e) => change(r, m, e.target.value as Access)}
                            aria-label={`${ROLE_LABEL[r]} access to ${MODULE_LABEL[m]}`}
                            className={cn("h-6 cursor-pointer appearance-none rounded-md border-0 px-1.5 text-center text-[11px] font-medium outline-none focus:ring-2 focus:ring-[var(--ring)]", ACCESS_TONE[a])}
                          >
                            {ACCESS.map((x) => (
                              <option key={x} value={x}>
                                {ACCESS_LABEL[x]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className={cn("inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium", ACCESS_TONE[a])}>{ACCESS_LABEL[a]}</span>
                        )}
                        {changed && <span className="absolute -right-1 -top-1 size-2 rounded-full bg-warning" title={`Default: ${ACCESS_LABEL[DEFAULT_PERMISSIONS[r][m]]}`} />}
                      </span>
                    </Td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="flex items-center gap-1.5 px-4 py-3 text-xs text-fg-3">
          <Lock className="size-3.5" /> Client-portal users only ever see their own client&apos;s records and never internal notes, costs, margins, AI prompts or other clients — regardless of these settings.
        </p>
      </Card>
    </div>
  );
}

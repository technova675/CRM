"use client";

import { KeyRound, Link2, RefreshCw, ShieldCheck, Webhook } from "lucide-react";
import type { Integration } from "@/lib/types";
import { cn, fmtDateTime, relTime } from "@/lib/utils";
import { Badge, Button, Card, StatusBadge } from "@/components/ui";

export const PHASE_LABEL: Record<1 | 2 | 3 | 4, string> = { 1: "Phase 1 · Core", 2: "Phase 2 · Performance", 3: "Phase 3 · Content & SEO", 4: "Phase 4 · Commerce & billing" };
export const AUTH_ICON = { "OAuth 2.0": ShieldCheck, "API Key": KeyRound, Webhook: Webhook } as const;

export function ConnectorCard({ it, writable, onConnect, onDisconnect, onSync }: { it: Integration; writable: boolean; onConnect: () => void; onDisconnect: () => void; onSync: () => void }) {
  const AuthIcon = AUTH_ICON[it.auth];
  return (
    <Card className={cn("flex flex-col p-4", it.status === "error" && "border-danger/40")}>
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-xs font-semibold text-fg-2">{it.name.replace(/[^A-Za-z0-9 ]/g, "").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{it.name}</p>
          <p className="flex items-center gap-1 text-[11px] text-fg-3">
            {it.category} · <AuthIcon className="size-3" /> {it.auth}
          </p>
        </div>
        <StatusBadge status={it.status} />
      </div>
      {it.description && <p className="mt-2.5 text-xs leading-relaxed text-fg-2">{it.description}</p>}
      <div className="mt-2.5 flex flex-wrap gap-1">
        {it.phase && <Badge tone="accent">{PHASE_LABEL[it.phase]}</Badge>}
        {(it.capabilities ?? []).map((c) => (
          <Badge key={c}>{c}</Badge>
        ))}
      </div>
      {it.scopes.length > 0 && (
        <p className="mt-2 truncate font-mono text-[10.5px] text-fg-3" title={it.scopes.join(", ")}>
          scopes: {it.scopes.join(", ")}
        </p>
      )}
      {it.status === "connected" && (
        <div className="mt-2 space-y-1 text-[11px] text-fg-3">
          {it.accounts?.length ? (
            <p className="flex items-start gap-1">
              <Link2 className="mt-0.5 size-3 shrink-0" />
              <span className="line-clamp-2">{it.accounts.join(" · ")}</span>
            </p>
          ) : null}
          <p title={fmtDateTime(it.lastSyncAt)}>Last sync: {it.lastSyncAt ? relTime(it.lastSyncAt) : "—"}</p>
        </div>
      )}
      {it.status === "error" && <p className="mt-2 text-[11px] text-danger">Authorization failed or token expired — reconnect to resume syncing.</p>}
      <div className="mt-auto flex flex-wrap justify-end gap-1.5 pt-3">
        {writable &&
          (it.status === "connected" ? (
            <>
              {(it.capabilities ?? []).some((c) => c === "sync" || c === "read") && (
                <Button size="xs" variant="ghost" icon={<RefreshCw className="size-3" />} onClick={onSync}>
                  Sync now
                </Button>
              )}
              <Button size="xs" onClick={onDisconnect}>
                Disconnect
              </Button>
            </>
          ) : (
            <Button size="xs" variant="primary" onClick={onConnect}>
              {it.status === "error" ? "Reconnect" : "Connect"}
            </Button>
          ))}
        {!writable && <span className="text-[11px] text-fg-3">Admins manage connections</span>}
      </div>
    </Card>
  );
}

"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Database, HardDriveDownload, KeyRound, Laptop, Lock, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { useCRM } from "@/lib/store";
import { ROLE_LABEL } from "@/lib/permissions";
import type { Organization, Role } from "@/lib/types";
import { fmtDateTime, relTime } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, Input, MemberAvatar, Select, Table, Td, Th, Toggle } from "@/components/ui";
import { toast } from "@/components/shell/toast";

type Sec = Organization["security"];
const TIMEOUTS = [30, 60, 240, 480, 720, 1440];
const RETENTION = [90, 180, 365, 730, 1825];
const IP_RE = /^(\d{1,3}\.){3}\d{1,3}(\/(3[0-2]|[12]?\d))?$|^[0-9a-f:]+(\/\d{1,3})?$/i;
const validIp = (v: string) => IP_RE.test(v) && (!v.includes(".") || v.split("/")[0]!.split(".").every((o) => Number(o) <= 255));
const fmtMin = (m: number) => (m < 60 ? `${m} min` : `${m / 60} h`);

function Row({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex-1">
        <p className="text-[13px] font-medium">{title}</p>
        <p className="text-xs text-fg-3">{desc}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Security() {
  const org = useCRM((s) => s.organization);
  const update = useCRM((s) => s.updateOrganization);
  const log = useCRM((s) => s.log);
  const me = useCRM((s) => s.currentUserId);
  const team = useCRM((s) => s.team);
  const [ip, setIp] = useState("");
  const sec = org.security;

  const setSec = (patch: Partial<Sec>, action: string, before: string, after: string) => {
    update({ security: { ...sec, ...patch } });
    log({ actor: "human", actorId: me, entity: "organization", action, before, after });
  };
  const roleCounts = useMemo(() => {
    const m = new Map<Role, number>();
    team.filter((t) => t.status !== "disabled").forEach((t) => m.set(t.role, (m.get(t.role) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [team]);

  const addIp = () => {
    const v = ip.trim();
    if (!validIp(v)) {
      toast("Invalid IP or CIDR", "Use e.g. 203.0.113.10 or 203.0.113.0/24", "warning");
      return;
    }
    if (sec.ipAllowlist.includes(v)) return;
    setSec({ ipAllowlist: [...sec.ipAllowlist, v] }, "Added IP to allowlist", "—", v);
    setIp("");
  };
  const revoke = (id: string) => {
    const s = org.sessions.find((x) => x.id === id);
    update({ sessions: org.sessions.filter((x) => x.id !== id) });
    log({ actor: "human", actorId: me, entity: "organization", entityId: id, action: "Revoked session", detail: `${team.find((t) => t.id === s?.userId)?.name ?? s?.userId} · ${s?.device}`, before: "active", after: "revoked" });
    toast("Session revoked", s?.device, "info");
  };
  const backup = () => {
    const at = new Date().toISOString();
    setSec({ lastBackupAt: at }, "Manual backup", sec.lastBackupAt ? fmtDateTime(sec.lastBackupAt) : "never", fmtDateTime(at));
    toast("Backup started", "Snapshot of this organization's data (simulated).");
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold">
            <Users className="size-4 text-accent" /> Role-based access
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {roleCounts.map(([r, n]) => (
              <Badge key={r}>
                {ROLE_LABEL[r]} · {n}
              </Badge>
            ))}
          </div>
          <p className="mt-2 text-xs text-fg-3">Every module is gated per role (none / read / own / full). Client-portal users only see their own client.</p>
          <Button href="/team?tab=permissions" size="xs" variant="ghost" className="mt-2" icon={<ArrowRight className="size-3" />}>
            Team → Roles & permissions
          </Button>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold">
            <Database className="size-4 text-accent" /> Data isolation & encryption
          </p>
          <ul className="mt-2 space-y-1.5 text-xs text-fg-2">
            <li className="flex gap-1.5">
              <ShieldCheck className="size-3.5 shrink-0 text-success" /> Organization-level isolation: every record, file, AI context and credential is scoped to <span className="font-mono">{org.id}</span>.
            </li>
            <li className="flex gap-1.5">
              <KeyRound className="size-3.5 shrink-0 text-success" /> Integration tokens & API keys: encrypted at rest (KMS envelope encryption), never sent to the browser.
            </li>
            <li className="flex gap-1.5">
              <Lock className="size-3.5 shrink-0 text-success" /> Data in transit: TLS 1.2+. Data at rest: AES-256 on the database and object storage.
            </li>
          </ul>
          <p className="mt-2 rounded-md bg-warning-soft px-2.5 py-1.5 text-[11px] text-warning">Honest status: this demo stores data in your browser. Encryption, isolation and row-level security are server-side requirements to implement with the production database.</p>
        </Card>
      </div>

      <Card>
        <CardHeader title="Authentication & sessions" />
        <div className="divide-y divide-border">
          <Row title="Single sign-on (SAML / OIDC)" desc="Let members sign in with Google Workspace, Okta or Azure AD. Requires an auth provider.">
            <Toggle checked={sec.sso} onChange={(v) => setSec({ sso: v }, "SSO", sec.sso ? "on" : "off", v ? "on" : "off")} label="SSO" />
          </Row>
          <Row title="Enforce two-factor authentication" desc="Members without 2FA are asked to set it up at next sign-in.">
            <Toggle checked={sec.enforce2fa} onChange={(v) => setSec({ enforce2fa: v }, "Enforce 2FA", sec.enforce2fa ? "on" : "off", v ? "on" : "off")} label="Enforce 2FA" />
          </Row>
          <Row title="Session timeout" desc="Idle sessions are signed out after this period.">
            <Select value={sec.sessionTimeoutMin} onChange={(e) => setSec({ sessionTimeoutMin: Number(e.target.value) }, "Session timeout", fmtMin(sec.sessionTimeoutMin), fmtMin(Number(e.target.value)))} className="w-32">
              {TIMEOUTS.map((t) => (
                <option key={t} value={t}>
                  {fmtMin(t)}
                </option>
              ))}
            </Select>
          </Row>
        </div>
        <div className="border-t border-border">
          <p className="px-4 pt-3 text-xs font-medium text-fg-2">Active sessions</p>
          <Table>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Device</Th>
                <Th>Location</Th>
                <Th>Last active</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {org.sessions.map((s) => (
                <tr key={s.id}>
                  <Td>
                    <span className="flex items-center gap-2">
                      <MemberAvatar id={s.userId} showName />
                    </span>
                  </Td>
                  <Td className="text-fg-2">
                    <span className="flex items-center gap-1.5">
                      <Laptop className="size-3.5 text-fg-3" /> {s.device}
                      {s.current && <Badge tone="success">This device</Badge>}
                    </span>
                  </Td>
                  <Td className="text-fg-2">{s.location}</Td>
                  <Td className="text-xs text-fg-3" >{relTime(s.lastActiveAt)}</Td>
                  <Td>
                    {!s.current && (
                      <Button size="xs" variant="ghost" onClick={() => revoke(s.id)}>
                        Revoke
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>

      <Card>
        <CardHeader title="IP allowlist" subtitle={sec.ipAllowlist.length ? "Only these addresses can sign in." : "Empty — sign-in is allowed from any IP."} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addIp();
          }}
          className="flex gap-2 px-4 pb-3"
        >
          <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="203.0.113.0/24" className="font-mono sm:w-64" />
          <Button type="submit" icon={<Plus className="size-3.5" />} disabled={!ip.trim()}>
            Add
          </Button>
        </form>
        {sec.ipAllowlist.length > 0 && (
          <ul className="divide-y divide-border border-t border-border">
            {sec.ipAllowlist.map((v) => (
              <li key={v} className="flex items-center justify-between px-4 py-2">
                <span className="font-mono text-xs">{v}</span>
                <button onClick={() => setSec({ ipAllowlist: sec.ipAllowlist.filter((x) => x !== v) }, "Removed IP from allowlist", v, "—")} className="text-fg-3 hover:text-danger" aria-label={`Remove ${v}`}>
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="px-4 py-3 text-[11px] text-fg-3">Make sure your current IP is included before enabling, or you may lock yourself out. Enforced at the edge / auth layer in production.</p>
      </Card>

      <Card>
        <CardHeader title="Data retention & backups" />
        <div className="divide-y divide-border">
          <Row title="Data retention" desc="Activity logs, messages and deleted records older than this are purged.">
            <Select value={sec.dataRetentionDays} onChange={(e) => setSec({ dataRetentionDays: Number(e.target.value) }, "Data retention", `${sec.dataRetentionDays} days`, `${e.target.value} days`)} className="w-32">
              {RETENTION.map((d) => (
                <option key={d} value={d}>
                  {d >= 365 ? `${d / 365} year${d > 365 ? "s" : ""}` : `${d} days`}
                </option>
              ))}
            </Select>
          </Row>
          <Row title="Automated daily backups" desc={`Point-in-time snapshots of this organization's data. Last backup: ${sec.lastBackupAt ? `${relTime(sec.lastBackupAt)} (${fmtDateTime(sec.lastBackupAt)})` : "never"}.`}>
            <div className="flex items-center gap-3">
              <Button size="xs" icon={<HardDriveDownload className="size-3" />} onClick={backup}>
                Back up now
              </Button>
              <Toggle checked={sec.backupsEnabled} onChange={(v) => setSec({ backupsEnabled: v }, "Automated backups", sec.backupsEnabled ? "on" : "off", v ? "on" : "off")} label="Automated backups" />
            </div>
          </Row>
        </div>
      </Card>
    </div>
  );
}

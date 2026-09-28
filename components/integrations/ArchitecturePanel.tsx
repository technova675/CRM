"use client";

import { Clock, Database, Gauge, KeyRound, Layers, Lock, RefreshCw, ShieldCheck, Webhook } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";

const CONNECTOR_INTERFACE = `interface Connector {
  key: string;                     // "meta", "google_ads", …
  category: IntegrationCategory;
  auth: "OAuth 2.0" | "API Key" | "Webhook";
  scopes: string[];                // least privilege, shown at consent
  capabilities: ("read" | "write" | "sync" | "publish" | "webhooks")[];
  syncSchedule?: string;           // e.g. "hourly", "0 6 * * *"
  rateLimit: { perMinute: number; burst: number };

  authorize(orgId, redirectUri): URL;          // OAuth start
  exchange(orgId, code): EncryptedToken;       // server-side only
  sync(orgId, since): AsyncIterable<Record>;   // normalised rows
  write?(orgId, action): Result;               // gated by approval modes
  verifyWebhook?(req, secret): Event;          // HMAC signature
}`;

const POINTS = [
  { icon: KeyRound, title: "Auth", body: "OAuth 2.0 authorization-code flow (PKCE where supported) or API keys. Token exchange happens server-side only." },
  { icon: ShieldCheck, title: "Scopes", body: "Least-privilege scopes requested per capability and shown at consent. Write scopes are optional." },
  { icon: Clock, title: "Sync schedule", body: "Background jobs pull incrementally (hourly for ads, daily for SEO); “Sync now” enqueues an on-demand job." },
  { icon: Layers, title: "Read / write", body: "Reads are normalised into the shared data model. Writes (budgets, pausing ads, publishing) always go through AI approval modes." },
  { icon: Lock, title: "Token encryption at rest", body: "Access/refresh tokens and API keys are envelope-encrypted with a KMS key; never sent to the browser or logged." },
  { icon: Database, title: "Per-org isolation", body: "Every credential, sync job and row is scoped to an organization ID and enforced with row-level security." },
  { icon: Gauge, title: "Rate limits", body: "Per-connector token buckets with exponential back-off and retry; quota errors surface as connector status “error”." },
  { icon: Webhook, title: "Webhooks", body: "Inbound events (orders, replies, payments) are HMAC-verified, de-duplicated by event ID and processed from a queue." },
  { icon: RefreshCw, title: "Health", body: "Expired or revoked tokens flip the connector to “error” and notify admins to reconnect." },
];

export function ArchitecturePanel() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Integration framework" subtitle="Every platform is a connector implementing one interface — adding a platform means adding a registry entry and an adapter, not changing the core." />
        <div className="grid gap-4 px-4 pb-4 lg:grid-cols-2">
          <pre className="overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-fg-2">{CONNECTOR_INTERFACE}</pre>
          <ol className="space-y-2 text-[13px]">
            {["Admin clicks Connect → server builds the provider authorize URL with requested scopes", "Provider redirects back with a code → server exchanges it for tokens", "Tokens are encrypted (KMS) and stored against the organization", "Scheduler runs sync jobs; rows are normalised into campaigns, ads, orders, keywords…", "Agents read normalised data; any write goes through approval modes and the audit log"].map((s, i) => (
              <li key={s} className="flex gap-2.5">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[10px] font-semibold text-accent-text">{i + 1}</span>
                <span className="text-fg-2">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {POINTS.map((p) => (
          <Card key={p.title} className="p-4">
            <p className="flex items-center gap-2 text-[13px] font-semibold">
              <p.icon className="size-4 text-accent" /> {p.title}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-fg-2">{p.body}</p>
          </Card>
        ))}
      </div>
      <p className="text-[11px] text-fg-3">This demo simulates connections in the browser. Encryption, token exchange, sync jobs and webhook verification are server-side requirements for production.</p>
    </div>
  );
}

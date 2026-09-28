"use client";

import { useState } from "react";
import { ExternalLink, Lock, ShieldCheck } from "lucide-react";
import type { Integration } from "@/lib/types";
import { connectIntegration } from "@/lib/domain/integrations";
import { Button, Field, Input, Modal } from "@/components/ui";
import { toast } from "@/components/shell/toast";

// Simulated connect flow. In production: OAuth → server-side authorization-code exchange;
// API key → POSTed once to the server, encrypted with KMS envelope encryption, never returned.
export function ConnectModal({ it, orgSlug, onClose }: { it: Integration; orgSlug: string; onClose: () => void }) {
  const [key, setKey] = useState("");
  const [step, setStep] = useState<"consent" | "redirecting">("consent");
  const reconnect = it.status === "error";

  const finish = () => {
    connectIntegration(it.key);
    setKey(""); // the raw key is discarded — nothing is persisted in the browser
    toast(`${it.name} ${reconnect ? "reconnected" : "connected"}`, "Demo mode — no real credentials were exchanged.");
    onClose();
  };

  const authorize = () => {
    setStep("redirecting");
    setTimeout(finish, 900);
  };

  const webhookUrl = `https://api.adbibe.app/v1/hooks/${orgSlug}/${it.key}`;

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`${reconnect ? "Reconnect" : "Connect"} ${it.name}`}
      subtitle={`${it.category} · ${it.auth}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {it.auth === "OAuth 2.0" && (
            <Button variant="primary" loading={step === "redirecting"} icon={<ExternalLink className="size-3.5" />} onClick={authorize}>
              Continue to {it.name.split(" (")[0]}
            </Button>
          )}
          {it.auth === "API Key" && (
            <Button variant="primary" disabled={key.trim().length < 8} icon={<Lock className="size-3.5" />} onClick={finish}>
              Save key securely
            </Button>
          )}
          {it.auth === "Webhook" && (
            <Button variant="primary" onClick={finish}>
              Enable webhook
            </Button>
          )}
        </>
      }
    >
      {it.auth === "OAuth 2.0" && (
        <div className="space-y-3 text-[13px]">
          <p className="text-fg-2">
            You&apos;ll be redirected to <b>{it.name.split(" (")[0]}</b> to authorize Adbibe. We&apos;ll request:
          </p>
          <ul className="space-y-1 rounded-lg border border-border bg-surface-2 p-3">
            {it.scopes.map((s) => (
              <li key={s} className="flex items-center gap-2 font-mono text-xs">
                <ShieldCheck className="size-3.5 text-success" /> {s}
              </li>
            ))}
          </ul>
          <p className="text-xs text-fg-3">
            Capabilities: {(it.capabilities ?? []).join(", ") || "read"}. The refresh token is stored encrypted on the server, scoped to this organization only. Write actions (e.g. budget changes) still follow your AI approval modes.
          </p>
          <p className="rounded-md bg-warning-soft px-2.5 py-1.5 text-[11px] text-warning">Demo: the redirect and token exchange are simulated.</p>
        </div>
      )}
      {it.auth === "API Key" && (
        <div className="space-y-3">
          <Field label="API key" hint="Sent once to the server over TLS, encrypted at rest and never shown again. It is not stored in this browser.">
            <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="••••••••••••••••" autoComplete="off" spellCheck={false} autoFocus />
          </Field>
          <p className="text-xs text-fg-3">Scopes granted to this key on the provider side: {it.scopes.join(", ") || "—"}.</p>
          <p className="rounded-md bg-warning-soft px-2.5 py-1.5 text-[11px] text-warning">Demo: the key is discarded after marking the connector as connected.</p>
        </div>
      )}
      {it.auth === "Webhook" && (
        <div className="space-y-3 text-[13px]">
          <Field label="Endpoint URL" hint="Paste this into the provider's webhook settings.">
            <Input readOnly value={webhookUrl} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
          </Field>
          <p className="text-xs text-fg-3">Every request is verified with an HMAC-SHA256 signature using a per-org signing secret (generated server-side), and replayed events are rejected.</p>
        </div>
      )}
    </Modal>
  );
}

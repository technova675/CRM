"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, Plus, Trash2, Webhook } from "lucide-react";
import { useCRM } from "@/lib/store";
import { createApiKey, revokeApiKey } from "@/lib/domain/integrations";
import { fmtDate, relTime } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, Checkbox, EmptyState, Field, Input, Modal, Table, Td, Th } from "@/components/ui";
import { toast } from "@/components/shell/toast";

const SCOPES = ["leads:read", "leads:write", "clients:read", "campaigns:read", "reports:read", "invoices:read", "tasks:write", "webhooks:manage"];

const WEBHOOK_EVENTS = [
  ["lead.created", "New lead added (form, import or API)"],
  ["lead.replied", "A lead replied on any channel"],
  ["deal.won", "Deal moved to Won"],
  ["invoice.paid", "Payment recorded or reconciled"],
  ["creative.approved", "Client approved a creative"],
  ["recommendation.created", "An AI agent raised a recommendation"],
];

export function ApiKeysCard({ writable }: { writable: boolean }) {
  const keys = useCRM((s) => s.organization.apiKeys);
  const slug = useCRM((s) => s.organization.slug);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["leads:read"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);

  const close = () => {
    setCreating(false);
    setSecret(null);
    setName("");
    setScopes(["leads:read"]);
    setCopied(false);
  };
  const create = () => {
    const { secret: s } = createApiKey(name, scopes);
    setSecret(s);
  };
  const copy = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      toast("Copy failed", "Select the key and copy it manually.", "warning");
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-3 min-w-0">
        <CardHeader
          title="API keys"
          subtitle="Programmatic access to this organization. Keys inherit only the scopes you grant."
          action={
            writable && (
              <Button size="xs" variant="primary" icon={<Plus className="size-3" />} onClick={() => setCreating(true)}>
                Create key
              </Button>
            )
          }
        />
        {keys.length === 0 ? (
          <EmptyState icon={<KeyRound className="size-5" />} title="No API keys" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Key</Th>
                <Th>Scopes</Th>
                <Th>Created</Th>
                <Th>Last used</Th>
                {writable && <Th />}
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <Td className="font-medium">{k.name}</Td>
                  <Td className="font-mono text-xs text-fg-2">{k.prefix}…</Td>
                  <Td>
                    <div className="flex max-w-56 flex-wrap gap-1">
                      {k.scopes.map((s) => (
                        <Badge key={s}>{s}</Badge>
                      ))}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-fg-3">{fmtDate(k.createdAt)}</Td>
                  <Td className="whitespace-nowrap text-xs text-fg-3">{k.lastUsedAt ? relTime(k.lastUsedAt) : "Never"}</Td>
                  {writable && (
                    <Td>
                      <Button size="xs" variant="ghost" icon={<Trash2 className="size-3" />} onClick={() => setConfirm(k.id)}>
                        Revoke
                      </Button>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <p className="px-4 py-3 text-[11px] text-fg-3">Only a key prefix is kept for identification; the server stores a hash of the full key. Revoking takes effect immediately.</p>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader title="Outbound webhooks" subtitle="Push events to Zapier, Make, Slack or your own endpoint" action={<Webhook className="size-4 text-accent" />} />
        <ul className="divide-y divide-border">
          {WEBHOOK_EVENTS.map(([e, d]) => (
            <li key={e} className="px-4 py-2">
              <p className="font-mono text-xs">{e}</p>
              <p className="text-[11px] text-fg-3">{d}</p>
            </li>
          ))}
        </ul>
        <p className="px-4 py-3 text-[11px] text-fg-3">
          Inbound endpoint: <span className="font-mono">https://api.adbibe.app/v1/hooks/{slug}/&lt;connector&gt;</span>. Payloads are signed with HMAC-SHA256 (<span className="font-mono">X-Adbibe-Signature</span>) and retried with back-off for 24h.
        </p>
      </Card>

      {creating && (
        <Modal
          open
          onClose={close}
          size="sm"
          title={secret ? "Copy your API key" : "Create API key"}
          subtitle={secret ? "This is the only time the full key is shown." : "Choose the minimum scopes the integration needs."}
          footer={
            secret ? (
              <Button variant="primary" onClick={close}>
                Done
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button variant="primary" disabled={!name.trim() || !scopes.length} onClick={create}>
                  Create key
                </Button>
              </>
            )
          }
        >
          {secret ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input readOnly value={secret} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                <Button icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} onClick={copy}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="text-xs text-warning">Store it in a secret manager. You won&apos;t be able to see it again — create a new key if it&apos;s lost.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="Name">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Website lead form" autoFocus />
              </Field>
              <div>
                <p className="mb-1.5 text-xs font-medium text-fg-2">Scopes</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {SCOPES.map((s) => (
                    <label key={s} className="flex items-center gap-2 font-mono text-xs">
                      <Checkbox checked={scopes.includes(s)} onChange={(v) => setScopes((x) => (v ? [...x, s] : x.filter((y) => y !== s)))} />
                      {s}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}
      {confirm && (
        <Modal
          open
          size="sm"
          onClose={() => setConfirm(null)}
          title="Revoke API key?"
          footer={
            <>
              <Button onClick={() => setConfirm(null)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => {
                  revokeApiKey(confirm);
                  setConfirm(null);
                  toast("API key revoked", undefined, "info");
                }}
              >
                Revoke
              </Button>
            </>
          }
        >
          <p className="text-[13px] text-fg-2">Anything using this key will stop working immediately.</p>
        </Modal>
      )}
    </div>
  );
}

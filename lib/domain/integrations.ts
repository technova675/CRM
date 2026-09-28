"use client";

// Integration-framework actions beyond the store's connect/disconnect toggle.
// Tokens / API keys are never stored in the browser: the connect flow only flips status here;
// in production the key is POSTed once to the server, encrypted (KMS envelope encryption) and scoped to the org.
import { useCRM } from "../store";
import type { Integration, Organization } from "../types";
import { uid } from "../utils";

const now = () => new Date().toISOString();

function patchIntegration(key: string, patch: Partial<Integration>) {
  useCRM.setState((s) => ({ integrations: s.integrations.map((i) => (i.key === key ? { ...i, ...patch } : i)) }));
}

export function connectIntegration(key: string, opts: { accounts?: string[] } = {}) {
  const s = useCRM.getState();
  const it = s.integrations.find((i) => i.key === key);
  if (!it) return;
  s.setIntegrationStatus(key, "connected"); // logs "Connected integration"
  patchIntegration(key, { lastSyncAt: now(), ...(opts.accounts?.length ? { accounts: opts.accounts } : {}) });
  s.log({ actor: "system", entity: "integration", entityId: key, action: "Initial sync completed", detail: it.name, before: it.status, after: "connected" });
}

export function disconnectIntegration(key: string) {
  const s = useCRM.getState();
  s.setIntegrationStatus(key, "available");
  patchIntegration(key, { lastSyncAt: undefined });
}

export function syncIntegration(key: string) {
  const s = useCRM.getState();
  const it = s.integrations.find((i) => i.key === key);
  if (!it || it.status !== "connected") return;
  patchIntegration(key, { lastSyncAt: now() });
  s.log({ actor: "system", entity: "integration", entityId: key, action: "Manual sync", detail: it.name, before: it.lastSyncAt ?? "never", after: now() });
}

// ---------- API keys (organization.apiKeys) ----------
const randomHex = (n: number) => {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
};

// Returns the full secret ONCE for display. Only the prefix is persisted; in production only a hash is stored server-side.
export function createApiKey(name: string, scopes: string[]): { key: Organization["apiKeys"][number]; secret: string } {
  const s = useCRM.getState();
  const secret = `adb_live_${randomHex(20)}`;
  const key = { id: uid("key"), name: name.trim() || "Untitled key", prefix: secret.slice(0, 13), createdAt: now(), scopes };
  s.updateOrganization({ apiKeys: [key, ...s.organization.apiKeys] });
  s.log({ actor: "human", actorId: s.currentUserId, entity: "organization", entityId: key.id, action: "Created API key", detail: `${key.name} · ${scopes.join(", ")}`, after: `${key.prefix}…` });
  return { key, secret };
}

export function revokeApiKey(id: string) {
  const s = useCRM.getState();
  const k = s.organization.apiKeys.find((x) => x.id === id);
  if (!k) return;
  s.updateOrganization({ apiKeys: s.organization.apiKeys.filter((x) => x.id !== id) });
  s.log({ actor: "human", actorId: s.currentUserId, entity: "organization", entityId: id, action: "Revoked API key", detail: k.name, before: `${k.prefix}…`, after: "revoked" });
}

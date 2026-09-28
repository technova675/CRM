"use client";

// Team-management actions. `team` is not a generic CollectionKey, so invites and member edits
// go through this helper — the one sanctioned direct `useCRM.setState` for the team slice.
// Every change is written to the audit log (Who → What → Before → After).
import { useCRM } from "../store";
import type { Role, TeamMember } from "../types";
import { ROLE_LABEL } from "../permissions";
import { money, uid } from "../utils";

const COLORS = ["#7c3aed", "#0ea5e9", "#f97316", "#10b981", "#ec4899", "#eab308", "#06b6d4", "#84cc16", "#f43f5e", "#a855f7"];

export function inviteMember(input: { name: string; email: string; role: Role; title?: string; capacityHours?: number; monthlyCost?: number; freelancer?: boolean; clientId?: string }): TeamMember | null {
  const s = useCRM.getState();
  const email = input.email.trim().toLowerCase();
  if (s.team.some((m) => m.email.toLowerCase() === email)) return null;
  const member: TeamMember = {
    id: uid("u"),
    name: input.name.trim(),
    email,
    role: input.role,
    avatarColor: COLORS[s.team.length % COLORS.length]!,
    title: input.title?.trim() || ROLE_LABEL[input.role],
    capacityHours: input.capacityHours ?? 40,
    monthlyCost: input.monthlyCost ?? 0,
    freelancer: input.freelancer,
    clientId: input.role === "client" ? input.clientId : undefined,
    status: "invited",
  };
  useCRM.setState((st) => ({ team: [...st.team, member] }));
  s.log({ actor: "human", actorId: s.currentUserId, entity: "settings", entityId: member.id, action: "Invited team member", detail: `${member.name} <${member.email}>`, after: ROLE_LABEL[member.role] });
  return member;
}

const FIELD_LABEL: Partial<Record<keyof TeamMember, string>> = { role: "role", title: "title", capacityHours: "capacity", monthlyCost: "cost", status: "status", freelancer: "freelancer flag", name: "name" };

const fmt = (k: keyof TeamMember, v: unknown) => {
  if (v === undefined || v === null || v === "") return "—";
  if (k === "role") return ROLE_LABEL[v as Role];
  if (k === "monthlyCost") return money(Number(v));
  if (k === "capacityHours") return `${v} h/wk`;
  return String(v);
};

export function updateMember(id: string, patch: Partial<Omit<TeamMember, "id">>) {
  const s = useCRM.getState();
  const before = s.team.find((m) => m.id === id);
  if (!before) return;
  if (before.role === "admin" && patch.role && patch.role !== "admin" && s.team.filter((m) => m.role === "admin" && m.status !== "disabled").length <= 1) return; // never remove the last admin
  useCRM.setState((st) => ({ team: st.team.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  (Object.keys(patch) as (keyof TeamMember)[]).forEach((k) => {
    if (before[k] === patch[k as keyof typeof patch]) return;
    s.log({ actor: "human", actorId: s.currentUserId, entity: "settings", entityId: id, action: `Changed member ${FIELD_LABEL[k] ?? String(k)}`, detail: before.name, before: fmt(k, before[k]), after: fmt(k, patch[k as keyof typeof patch]) });
  });
}

export function setMemberStatus(id: string, status: NonNullable<TeamMember["status"]>) {
  const s = useCRM.getState();
  const m = s.team.find((x) => x.id === id);
  if (!m || id === s.currentUserId) return; // can't disable yourself
  updateMember(id, { status });
}

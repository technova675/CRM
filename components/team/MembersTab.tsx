"use client";

import { useMemo, useState } from "react";
import { Mail, Pencil, Plus, UserCheck, UserX, Users } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { ROLE_LABEL } from "@/lib/permissions";
import type { Role, TeamMember } from "@/lib/types";
import { cn, money } from "@/lib/utils";
import { inviteMember, setMemberStatus, updateMember } from "@/lib/domain/team";
import { Avatar, Badge, Button, Card, Checkbox, EmptyState, Field, Input, Modal, SearchInput, Select, Table, Td, Th } from "@/components/ui";
import { toast } from "@/components/shell/toast";

export const ROLES = Object.keys(ROLE_LABEL) as Role[];
const STATUS_TONE = { active: "success", invited: "info", disabled: "neutral" } as const;

function MemberForm({ initial, onClose }: { initial: TeamMember | null; onClose: () => void }) {
  const clients = useCRM((s) => s.clients);
  const me = useMe();
  const [f, setF] = useState({
    name: initial?.name ?? "",
    email: initial?.email ?? "",
    role: initial?.role ?? ("designer" as Role),
    title: initial?.title ?? "",
    capacityHours: initial?.capacityHours ?? 40,
    monthlyCost: initial?.monthlyCost ?? 0,
    freelancer: initial?.freelancer ?? false,
    clientId: initial?.clientId ?? clients[0]?.id ?? "",
  });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const lockRole = initial?.id === me.id; // can't change your own role
  const valid = f.name.trim() && /\S+@\S+\.\S+/.test(f.email);
  const save = () => {
    if (initial) {
      updateMember(initial.id, { name: f.name.trim(), role: f.role, title: f.title.trim(), capacityHours: f.capacityHours, monthlyCost: f.monthlyCost, freelancer: f.freelancer, clientId: f.role === "client" ? f.clientId : undefined });
      toast("Member updated", f.name);
    } else {
      const m = inviteMember({ ...f });
      if (!m) {
        toast("Already a member", `${f.email} is already on the team.`, "warning");
        return;
      }
      toast("Invite created", `${m.name} will appear as "invited" until they accept. Email delivery needs an auth provider.`);
    }
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? `Edit ${initial.name}` : "Invite member"}
      subtitle={initial ? initial.email : "Adds the person with status “invited”. Access follows their role's permissions."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid} onClick={save} icon={initial ? undefined : <Mail className="size-3.5" />}>
            {initial ? "Save" : "Send invite"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Full name">
          <Input value={f.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
        </Field>
        <Field label="Email">
          <Input type="email" value={f.email} disabled={!!initial} onChange={(e) => set({ email: e.target.value })} />
        </Field>
        <Field label="Role" hint={lockRole ? "You can't change your own role." : undefined}>
          <Select value={f.role} disabled={lockRole} onChange={(e) => set({ role: e.target.value as Role })}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Title">
          <Input value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder={ROLE_LABEL[f.role]} />
        </Field>
        {f.role === "client" ? (
          <Field label="Client account" className="col-span-2" hint="Client-portal users only ever see this client's records.">
            <Select value={f.clientId} onChange={(e) => set({ clientId: e.target.value })}>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <>
            <Field label="Weekly capacity (hours)">
              <Input type="number" min={0} max={80} value={f.capacityHours} onChange={(e) => set({ capacityHours: Number(e.target.value) })} />
            </Field>
            <Field label="Loaded monthly cost (₹)" hint="Used for client & project profitability">
              <Input type="number" min={0} value={f.monthlyCost || ""} onChange={(e) => set({ monthlyCost: Number(e.target.value) })} />
            </Field>
            <label className="col-span-2 flex items-center gap-2 text-[13px]">
              <Checkbox checked={f.freelancer} onChange={(v) => set({ freelancer: v })} /> Freelancer / contractor
            </label>
          </>
        )}
      </div>
    </Modal>
  );
}

export function MembersTab({ writable, showCost }: { writable: boolean; showCost: boolean }) {
  const team = useCRM((s) => s.team);
  const clients = useCRM((s) => s.clients);
  const me = useMe();
  const [q, setQ] = useState("");
  const [role, setRole] = useState<Role | "All">("All");
  const [status, setStatus] = useState<"All" | "active" | "invited" | "disabled">("All");
  const [editing, setEditing] = useState<TeamMember | "new" | null>(null);

  const rows = useMemo(
    () =>
      team.filter(
        (m) =>
          (role === "All" || m.role === role) &&
          (status === "All" || (m.status ?? "active") === status) &&
          `${m.name} ${m.email} ${m.title ?? ""}`.toLowerCase().includes(q.toLowerCase()),
      ),
    [team, role, status, q],
  );
  const payroll = useMemo(() => team.filter((m) => m.role !== "client" && m.status !== "disabled").reduce((a, m) => a + (m.monthlyCost ?? 0), 0), [team]);

  return (
    <Card>
      <div className="flex flex-col gap-2 border-b border-border p-3 lg:flex-row lg:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Search name, email, title…" className="lg:w-64" />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role | "All")} className="sm:w-48">
            <option value="All">All roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="sm:w-32">
            <option value="All">Any status</option>
            <option value="active">Active</option>
            <option value="invited">Invited</option>
            <option value="disabled">Disabled</option>
          </Select>
        </div>
        <div className="flex items-center gap-3 lg:ml-auto">
          {showCost && <span className="text-xs text-fg-3">Payroll {money(payroll)}/mo</span>}
          {writable && (
            <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing("new")}>
              Invite member
            </Button>
          )}
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<Users className="size-5" />} title="No members match" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Title</Th>
              <Th>Role</Th>
              <Th className="text-right">Capacity</Th>
              {showCost && <Th className="text-right">Monthly cost</Th>}
              <Th>Status</Th>
              {writable && <Th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const st = m.status ?? "active";
              return (
                <tr key={m.id} className={cn("hover:bg-surface-2", st === "disabled" && "opacity-60")}>
                  <Td>
                    <span className="flex items-center gap-2">
                      <Avatar name={m.name} color={m.avatarColor} size={26} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 font-medium">
                          {m.name}
                          {m.id === me.id && <span className="text-[11px] font-normal text-fg-3">(you)</span>}
                          {m.freelancer && <Badge tone="warning">Freelancer</Badge>}
                        </span>
                        <span className="block truncate text-xs text-fg-3">{m.email}</span>
                      </span>
                    </span>
                  </Td>
                  <Td className="text-fg-2">{m.role === "client" ? `Client portal · ${clients.find((c) => c.id === m.clientId)?.company ?? "—"}` : (m.title ?? "—")}</Td>
                  <Td>
                    <Badge tone={m.role === "admin" ? "accent" : m.role === "client" ? "info" : "neutral"}>{ROLE_LABEL[m.role]}</Badge>
                  </Td>
                  <Td className="text-right tabular-nums text-fg-2">{m.role === "client" ? "—" : `${m.capacityHours ?? 40} h/wk`}</Td>
                  {showCost && <Td className="text-right tabular-nums">{m.role === "client" ? "—" : money(m.monthlyCost ?? 0)}</Td>}
                  <Td>
                    <Badge tone={STATUS_TONE[st]} dot>
                      {st.charAt(0).toUpperCase() + st.slice(1)}
                    </Badge>
                  </Td>
                  {writable && (
                    <Td>
                      <div className="flex justify-end gap-1">
                        {st === "invited" && (
                          <Button size="xs" variant="ghost" onClick={() => toast("Invite re-sent (simulated)", `Email delivery needs an auth provider such as Clerk — ${m.email}`, "info")}>
                            Resend
                          </Button>
                        )}
                        <Button size="xs" variant="ghost" icon={<Pencil className="size-3" />} onClick={() => setEditing(m)}>
                          Edit
                        </Button>
                        {m.id !== me.id &&
                          (st === "disabled" ? (
                            <Button size="xs" variant="ghost" icon={<UserCheck className="size-3" />} onClick={() => { setMemberStatus(m.id, "active"); toast("Member re-enabled", m.name); }}>
                              Enable
                            </Button>
                          ) : (
                            <Button size="xs" variant="ghost" icon={<UserX className="size-3" />} onClick={() => { setMemberStatus(m.id, "disabled"); toast("Member disabled", `${m.name} can no longer sign in.`, "info"); }}>
                              Disable
                            </Button>
                          ))}
                      </div>
                    </Td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      {editing && <MemberForm initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

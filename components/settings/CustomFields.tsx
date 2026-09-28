"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useCRM } from "@/lib/store";
import type { CustomFieldDef } from "@/lib/types";
import { Button, Card, CardHeader, Input, Select, Table, Td, Th } from "@/components/ui";
import { toast } from "@/components/shell/toast";

const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export function CustomFields() {
  const fields = useCRM((s) => s.settings.leadCustomFields);
  const update = useCRM((s) => s.updateSettings);
  const log = useCRM((s) => s.log);
  const me = useCRM((s) => s.currentUserId);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomFieldDef["type"]>("text");
  const [options, setOptions] = useState("");

  const save = (next: CustomFieldDef[]) => update({ leadCustomFields: next });
  const patch = (key: string, p: Partial<CustomFieldDef>) => save(fields.map((f) => (f.key === key ? { ...f, ...p } : f)));
  const add = () => {
    const key = slug(label);
    if (!key) return;
    if (fields.some((f) => f.key === key)) {
      toast("Field already exists", key, "warning");
      return;
    }
    const f: CustomFieldDef = { key, label: label.trim(), type, ...(type === "select" ? { options: options.split(",").map((o) => o.trim()).filter(Boolean) } : {}) };
    save([...fields, f]);
    log({ actor: "human", actorId: me, entity: "settings", action: "Added lead custom field", detail: f.label, after: `${f.key} (${f.type})` });
    setLabel("");
    setOptions("");
    toast("Custom field added", f.label);
  };
  const del = (f: CustomFieldDef) => {
    save(fields.filter((x) => x.key !== f.key));
    log({ actor: "human", actorId: me, entity: "settings", action: "Removed lead custom field", detail: f.label, before: f.key, after: "removed" });
  };

  return (
    <Card>
      <CardHeader title="Lead custom fields" subtitle="Extra fields shown on every lead. Existing values are kept if a field is removed and re-added with the same key." />
      <Table>
        <thead>
          <tr>
            <Th>Label</Th>
            <Th>Key</Th>
            <Th>Type</Th>
            <Th>Options (comma-separated)</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.key}>
              <Td className="min-w-44">
                <Input value={f.label} onChange={(e) => patch(f.key, { label: e.target.value })} />
              </Td>
              <Td className="font-mono text-xs text-fg-3">{f.key}</Td>
              <Td className="min-w-28">
                <Select value={f.type} onChange={(e) => patch(f.key, { type: e.target.value as CustomFieldDef["type"], options: e.target.value === "select" ? (f.options ?? []) : undefined })}>
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="select">Select</option>
                </Select>
              </Td>
              <Td className="min-w-56">
                {f.type === "select" ? (
                  <Input defaultValue={(f.options ?? []).join(", ")} onBlur={(e) => patch(f.key, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })} placeholder="Option A, Option B" />
                ) : (
                  <span className="text-xs text-fg-3">—</span>
                )}
              </Td>
              <Td>
                <button onClick={() => del(f)} className="text-fg-3 hover:text-danger" aria-label={`Remove ${f.label}`}>
                  <Trash2 className="size-3.5" />
                </button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3"
      >
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="New field label, e.g. Monthly ad budget" className="min-w-48 flex-1" />
        <Select value={type} onChange={(e) => setType(e.target.value as CustomFieldDef["type"])} className="w-28">
          <option value="text">Text</option>
          <option value="number">Number</option>
          <option value="select">Select</option>
        </Select>
        {type === "select" && <Input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Options, comma-separated" className="min-w-48 flex-1" />}
        <Button type="submit" variant="primary" disabled={!slug(label)} icon={<Plus className="size-3.5" />}>
          Add field
        </Button>
        {label && <span className="w-full text-[11px] text-fg-3">Key: <span className="font-mono">{slug(label)}</span></span>}
      </form>
    </Card>
  );
}

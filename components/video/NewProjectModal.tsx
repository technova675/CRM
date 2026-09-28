"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCRM, useMe } from "@/lib/store";
import { newVideoProject, type Settings } from "@/lib/ai/video";
import { uid } from "@/lib/utils";
import { Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { SettingsFields } from "./common";

const DEFAULTS: Settings = { aspect: "9:16", targetDurationSec: 30, captionStyle: "Dynamic word-by-word", brandTemplate: "Clean minimal", music: "Upbeat pop", pace: "Fast", removeSilences: true, autoBroll: true, hookOptimization: true };

export function NewProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useMe();
  const router = useRouter();
  const clients = useCRM((s) => s.clients);
  const upsert = useCRM((s) => s.upsert);
  const log = useCRM((s) => s.log);
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [objective, setObjective] = useState("");
  const [settings, setSettings] = useState<Settings>(DEFAULTS);

  const create = () => {
    if (!title.trim()) return toast("Give the project a title", undefined, "warning");
    const now = new Date().toISOString();
    const p = newVideoProject({ id: uid("vid"), title: title.trim(), objective: objective.trim() || "Engaging short-form edit", clientId: clientId || undefined, ownerId: me.id, settings, now });
    upsert("videos", p);
    log({ actor: "human", actorId: me.id, entity: "video", entityId: p.id, action: "Created video project", detail: p.title });
    toast("Video project created", "Upload raw footage, script and reel plan next.");
    onClose();
    setTitle("");
    setObjective("");
    router.push(`/video/${p.id}`);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New video project"
      subtitle="Creating a project is free — video minutes are used only when the AI generates a draft."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={create}>Create project</Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Field label="Title">
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Serum launch reel" />
          </Field>
          <Field label="Client">
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Internal / no client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
            </Select>
          </Field>
          <Field label="Objective" hint="What the edit must achieve — the AI uses it for the hook, B-roll and CTA.">
            <Textarea value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Drive product page visits from cold Reels audiences" />
          </Field>
        </div>
        <SettingsFields value={settings} onChange={setSettings} />
      </div>
    </Modal>
  );
}

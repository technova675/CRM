"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { Button, Card, EmptyState, Field, Modal, PageHeader, Readonly, Select } from "@/components/ui";
import { toast } from "@/components/shell/toast";
import { DataSourceBadge, SeoWorkspace } from "@/components/seo/SeoWorkspace";
import { startProject } from "@/components/seo/actions";

function SeoInner() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const projects = useCRM((s) => s.seoProjects);
  const clients = useCRM((s) => s.clients);
  const knowledgeAll = useCRM((s) => s.knowledge);
  const integrations = useCRM((s) => s.integrations);
  const writable = can(me.role, "seo", "write") && me.role !== "client";
  const [starting, setStarting] = useState(false);
  const [newClient, setNewClient] = useState("");

  const visible = useMemo(() => projects.filter((p) => me.role !== "client" || p.clientId === me.clientId), [projects, me]);
  const clientName = (id: string) => clients.find((c) => c.id === id)?.company ?? id;
  const selectedId = params.get("p") ?? visible[0]?.id;
  const project = visible.find((p) => p.id === selectedId) ?? visible[0];
  const client = clients.find((c) => c.id === project?.clientId);
  const knowledge = knowledgeAll.find((k) => k.clientId === project?.clientId);
  const gsc = integrations.find((i) => i.key === "gsc");
  const live = gsc?.status === "connected" && !!project?.gscConnected;
  const withoutProject = clients.filter((c) => !projects.some((p) => p.clientId === c.id));
  const select = (id: string) => router.replace(`/seo?p=${id}`, { scroll: false });

  return (
    <div>
      <PageHeader
        icon={<Search className="size-5 text-fg-3" />}
        title="SEO"
        description="Website audit, rankings, content gaps, briefs and backlinks — with AI recommendations from the SEO agent."
        actions={
          <>
            {visible.length > 0 && (
              <Select value={project?.id} onChange={(e) => select(e.target.value)} className="w-56">
                {visible.map((p) => (
                  <option key={p.id} value={p.id}>
                    {clientName(p.clientId)} · {p.domain}
                  </option>
                ))}
              </Select>
            )}
            {writable && withoutProject.length > 0 && (
              <Button icon={<Plus className="size-3.5" />} onClick={() => { setNewClient(withoutProject[0]!.id); setStarting(true); }}>
                Start SEO project
              </Button>
            )}
          </>
        }
      />
      {!writable && <Readonly>You have read-only access to SEO.</Readonly>}
      {project ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-fg-3">
            <DataSourceBadge live={live} gsc={gsc} />
            {client && !client.services.includes("SEO") && <span>{client.company} doesn&apos;t have the SEO service on contract yet.</span>}
            {gsc?.status !== "connected" && (
              <Button href="/integrations" size="xs" variant="ghost">
                Connect Search Console →
              </Button>
            )}
          </div>
          <SeoWorkspace key={project.id} project={project} client={client} knowledge={knowledge} gsc={gsc} writable={writable} />
        </>
      ) : (
        <Card>
          <EmptyState icon={<Search className="size-5" />} title="No SEO projects yet" description="Start an SEO project for a client to track health, rankings and content." action={writable && withoutProject.length > 0 ? <Button onClick={() => { setNewClient(withoutProject[0]!.id); setStarting(true); }}>Start SEO project</Button> : undefined} />
        </Card>
      )}

      <Modal
        open={starting}
        onClose={() => setStarting(false)}
        title="Start SEO project"
        subtitle="Creates an empty project. Crawl, ranking and traffic data appear once your SEO tools / Search Console are connected."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setStarting(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!newClient}
              onClick={() => {
                const c = clients.find((x) => x.id === newClient);
                if (!c) return;
                const id = startProject(c);
                setStarting(false);
                select(id);
                toast("SEO project started", c.company);
              }}
            >
              Start project
            </Button>
          </>
        }
      >
        <Field label="Client">
          <Select value={newClient} onChange={(e) => setNewClient(e.target.value)}>
            {withoutProject.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company}
                {c.services.includes("SEO") ? " (SEO service)" : ""}
              </option>
            ))}
          </Select>
        </Field>
      </Modal>
    </div>
  );
}

export default function SeoPage() {
  return (
    <Suspense>
      <SeoInner />
    </Suspense>
  );
}

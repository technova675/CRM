"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { Gauge, ShieldCheck, UserCheck, Users } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import { PageHeader, Readonly, Stat, Tabs } from "@/components/ui";
import { StaffAccess } from "@/components/team/StaffAccess";
import { MembersTab } from "@/components/team/MembersTab";
import { PermissionsTab } from "@/components/team/PermissionsTab";
import { TimeTab } from "@/components/team/TimeTab";
import { WorkloadTab } from "@/components/team/WorkloadTab";

type Tab = "members" | "permissions" | "workload" | "time" | "staff";

function TeamInner() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const team = useCRM((s) => s.team);
  const writable = can(me.role, "team", "write") && me.role !== "client";
  const showCost = me.role === "admin" || me.role === "finance";
  const raw = params.get("tab");
  const tab: Tab = raw === "permissions" || raw === "workload" || raw === "time" || raw==="staff"&&me.role==="admin" ? raw : "members";
  const setTab = (t: Tab) => router.replace(t === "members" ? "/team" : `/team?tab=${t}`, { scroll: false });

  const stats = useMemo(() => {
    const staff = team.filter((m) => m.role !== "client");
    return {
      active: staff.filter((m) => (m.status ?? "active") === "active").length,
      invited: team.filter((m) => m.status === "invited").length,
      freelancers: staff.filter((m) => m.freelancer && m.status !== "disabled").length,
      capacity: staff.filter((m) => (m.status??"active") === "active").reduce((a, m) => a + (m.capacityHours ?? 40), 0),

    };
  }, [team]);

  return (
    <div>
      <PageHeader title="Team" description="Members, roles & permissions and workload across the agency." />
      {!writable && <Readonly>You have read-only access to team management.</Readonly>}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active members" value={stats.active}  icon={<Users className="size-3.5" />} />
        <Stat label="Pending profiles" value={stats.invited} icon={<UserCheck className="size-3.5" />} tone="warning" />
        <Stat label="Freelancers" value={stats.freelancers} icon={<Users className="size-3.5" />} />
        <Stat label="Weekly capacity" value={`${stats.capacity} h`} icon={<Gauge className="size-3.5" />} tone="success" />
      </div>
      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "members", label: "Members", count: team.length },
            ...(me.role==="admin"?[{value:"staff" as const,label:"Staff sign-in"}]:[]),
            { value: "permissions", label: (<span className="inline-flex items-center gap-1"><ShieldCheck className="size-3.5" />Roles & permissions</span>) },
            { value: "workload", label: "Workload" },
            { value: "time", label: "Time tracking" },
          ]}
        />
      </div>
      {tab==="staff"&&me.role==="admin"&&<StaffAccess/>}
      {tab === "members" && <MembersTab writable={writable} showCost={showCost} />}
      {tab === "permissions" && <PermissionsTab editable={me.role === "admin"} />}
      {tab === "workload" && <WorkloadTab />}
      {tab === "time" && <TimeTab writable={writable} />}
    </div>
  );
}

export default function TeamPage() {
  return (
    <Suspense>
      <TeamInner />
    </Suspense>
  );
}

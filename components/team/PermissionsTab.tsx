"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { useCRM } from "@/lib/store";
import { DEFAULT_PERMISSIONS,MODULES,MODULE_LABEL,ROLE_LABEL,type Access,type Module } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import { Badge,Button,Card,CardHeader,Field,Select } from "@/components/ui";

const roles=Object.keys(ROLE_LABEL) as Role[];
const labels:Record<Access,string>={none:"No access",read:"View only",full:"View and edit",own:"Client portal scope"};
const options=["none","read","full"] as const;

export function PermissionsTab({editable}:{editable:boolean}){
  const overrides=useCRM(s=>s.settings.permissionOverrides);
  const setOverride=useCRM(s=>s.setPermissionOverride);
  const updateSettings=useCRM(s=>s.updateSettings);
  const log=useCRM(s=>s.log);
  const actor=useCRM(s=>s.currentUserId);
  const [role,setRole]=useState<Role>("sales");
  const locked=role==="admin"||role==="client";
  const count=MODULES.filter(module=>overrides[role]?.[module]!==undefined).length;
  const change=(module:Module,value:Access)=>setOverride(role,module,value===DEFAULT_PERMISSIONS[role][module]?undefined:value);
  return <Card>
    <CardHeader title="Roles & permissions" subtitle="Choose a role to review or configure access for every agency module."/>
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Role to configure" className="w-full sm:w-64"><Select className="min-h-11" value={role} onChange={e=>setRole(e.target.value as Role)}>
          {roles.map(item=><option key={item} value={item}>{ROLE_LABEL[item]}</option>)}
        </Select></Field>
        {editable&&!locked&&count>0&&<Button className="min-h-11" onClick={()=>{
          updateSettings({permissionOverrides:{...overrides,[role]:{}}});
          log({actor:"human",actorId:actor,entity:"settings",action:"Reset role permissions",detail:ROLE_LABEL[role]});
        }}>Reset role defaults</Button>}
      </div>
      <p className="text-sm text-fg-2">Role settings are saved to this agency account. Staff profiles are used for planning and assignments under the agency login.</p>
      {locked&&<p className="flex items-center gap-2 text-sm text-fg-2"><Lock size={15}/>{role==="admin"?"Founder access is fixed.":"Client access is managed through the separate client portal."}</p>}
    </div>
    <ul className="divide-y divide-border border-t border-border">
      {MODULES.map(module=>{
        const current=locked?DEFAULT_PERMISSIONS[role][module]:overrides[role]?.[module]??DEFAULT_PERMISSIONS[role][module];
        return <li key={module} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
          <span className="text-sm font-medium">{MODULE_LABEL[module]} {overrides[role]?.[module]&&<Badge tone="info">Custom</Badge>}</span>
          {editable&&!locked?<Select aria-label={ROLE_LABEL[role]+" access to "+MODULE_LABEL[module]} value={current} className="min-h-11 w-full sm:w-48"
            onChange={e=>change(module,e.target.value as Access)}>{options.map(value=><option value={value} key={value}>{labels[value]}</option>)}</Select>
            :<Badge>{labels[current]}</Badge>}
        </li>;
      })}
    </ul>
  </Card>;
}

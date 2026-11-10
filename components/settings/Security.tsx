"use client";

import {Lock,ShieldCheck,Users} from "lucide-react";
import {useMe} from "@/lib/store";
import {Badge,Button,Card,CardHeader} from "@/components/ui";
import {CredentialVault,WorkspaceBackup} from "./WorkspaceRecovery";
import {ApiKeysCard} from "@/components/integrations/ApiKeysCard";

export function Security(){
  const owner=useMe().role==="admin";
  return <div className="space-y-4">
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Access and sessions" subtitle="Individual logins with current workspace membership checks." action={<Users className="size-5 text-accent-text"/>}/>
        <div className="space-y-3 px-4 pb-4 text-sm text-fg-2">
          <p>Owners can invite staff, assign roles, and revoke access. Revocation blocks the next request even if the teammate is still signed in.</p>
          <p>Supabase manages password sign-in, session cookies and sign-out. Google OAuth is {process.env.NEXT_PUBLIC_GOOGLE_OAUTH==="true"?"enabled on this deployment.":"available when configured."}</p>
          <div className="flex flex-wrap gap-2"><Button href="/team?tab=staff" className="min-h-11">Staff sign-in</Button><Button href="/team?tab=permissions" className="min-h-11">Permissions</Button><Button href="/audit" className="min-h-11">Audit log</Button></div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Data and credentials" subtitle="Organization and client scope are resolved on the server." action={<Lock className="size-5 text-accent-text"/>}/>
        <div className="space-y-3 px-4 pb-4 text-sm text-fg-2">
          <p>Staff can access permitted sections in their organization. Client portal access remains tied to one client.</p>
          <p>Invitation tokens and API keys are stored as hashes. The credential vault encrypts saved connector secrets before storing them. Transport and storage encryption are managed by the deployment and storage providers.</p>
          <Badge tone="info"><ShieldCheck className="size-3"/> Server-side access checks</Badge>
        </div>
      </Card>
    </div>
    <ApiKeysCard writable={owner}/>
    {owner&&<><CredentialVault/><WorkspaceBackup/></>}
  </div>;
}

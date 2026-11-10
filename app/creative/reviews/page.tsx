"use client";
import { ClipboardCheck } from "lucide-react";
import { Button,PageHeader } from "@/components/ui";
import { ReviewWorkspace } from "@/components/creative/ReviewWorkspace";
import { useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
export default function ReviewPage(){
  const me=useMe();
  return <div className="min-w-0 space-y-4">
    <PageHeader title="Creative review queue" description="Request feedback and approval for each version." icon={<ClipboardCheck size={20}/>} actions={<Button href="/creative" className="min-h-11">Creative Studio</Button>}/>
    <ReviewWorkspace writable={me.role!=="client"&&can(me.role,"creative","write")}/>
  </div>;
}

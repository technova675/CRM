import { History } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { AuditLog } from "@/components/settings/AuditLog";

export default function AuditPage(){
  return <div className="space-y-4">
    <PageHeader title="Activity & AI Audit Log" icon={<History className="size-5 text-fg-3"/>} description="Trace workspace changes, specialist actions and approval decisions."/>
    <AuditLog/>
  </div>;
}

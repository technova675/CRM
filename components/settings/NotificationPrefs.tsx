"use client";

import { Bell } from "lucide-react";
import { useCRM } from "@/lib/store";
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from "@/lib/types";
import { Button, Card, CardHeader, Table, Td, Th, Toggle } from "@/components/ui";

export function NotificationPrefs() {
  const prefs = useCRM(state=>state.settings.notificationPrefs);
  const update = useCRM(state=>state.updateSettings);
  const all = NOTIFICATION_CATEGORIES.every(category=>prefs[category]?.inApp !== false);
  const toggle = (category:NotificationCategory, enabled:boolean)=>update({
    notificationPrefs:{...prefs,[category]:{...prefs[category],inApp:enabled}},
  });
  const toggleAll = ()=>update({notificationPrefs:Object.fromEntries(NOTIFICATION_CATEGORIES.map(category=>[category,{...prefs[category],inApp:!all}])) as typeof prefs});
  return (
    <Card>
      <CardHeader title="Notification preferences" subtitle="Choose what appears in the notification bell. Preferences sync with your CRM account." />
      <Table>
        <thead><tr><Th>Category</Th><Th className="text-right"><span className="inline-flex items-center gap-2"><Bell className="size-4" /> In-app <Button size="sm" onClick={toggleAll}>{all?"Mute all":"Enable all"}</Button></span></Th></tr></thead>
        <tbody>{NOTIFICATION_CATEGORIES.map(category=><tr key={category}>
          <Td className="font-medium">{category}</Td>
          <Td className="text-right"><span className="inline-flex min-h-11 items-center"><Toggle checked={prefs[category]?.inApp!==false} label={category+" in-app notifications"} onChange={value=>toggle(category,value)} /></span></Td>
        </tr>)}</tbody>
      </Table>
    </Card>
  );
}

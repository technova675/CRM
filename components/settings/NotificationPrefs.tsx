"use client";

import { Bell, Mail, MessageSquare } from "lucide-react";
import { useCRM } from "@/lib/store";
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from "@/lib/types";
import { Card, CardHeader, Table, Td, Th, Toggle } from "@/components/ui";

type Channel = "inApp" | "email" | "slack";
const CHANNELS: { key: Channel; label: string; icon: typeof Bell }[] = [
  { key: "inApp", label: "In-app", icon: Bell },
  { key: "email", label: "Email", icon: Mail },
  { key: "slack", label: "Slack", icon: MessageSquare },
];

export function NotificationPrefs() {
  const prefs = useCRM((s) => s.settings.notificationPrefs);
  const update = useCRM((s) => s.updateSettings);
  const slack = useCRM((s) => s.integrations.find((i) => i.key === "slack")?.status);

  const set = (c: NotificationCategory, ch: Channel, v: boolean) => update({ notificationPrefs: { ...prefs, [c]: { ...prefs[c], [ch]: v } } });
  const setColumn = (ch: Channel, v: boolean) => update({ notificationPrefs: Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c, { ...prefs[c], [ch]: v }])) as typeof prefs });

  return (
    <Card>
      <CardHeader title="Notification preferences" subtitle="Choose where each type of event reaches you. In-app preferences apply immediately; email and Slack delivery run server-side once connected." />
      <Table>
        <thead>
          <tr>
            <Th>Category</Th>
            {CHANNELS.map((c) => {
              const all = NOTIFICATION_CATEGORIES.every((cat) => prefs[cat]?.[c.key]);
              return (
                <Th key={c.key} className="text-center">
                  <span className="inline-flex items-center gap-1">
                    <c.icon className="size-3.5" /> {c.label}
                  </span>
                  <button type="button" onClick={() => setColumn(c.key, !all)} className="block w-full text-[10px] font-normal text-accent-text hover:underline">
                    {all ? "None" : "All"}
                  </button>
                </Th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {NOTIFICATION_CATEGORIES.map((cat) => (
            <tr key={cat}>
              <Td className="font-medium">{cat}</Td>
              {CHANNELS.map((c) => (
                <Td key={c.key} className="text-center">
                  <span className="inline-flex">
                    <Toggle checked={!!prefs[cat]?.[c.key]} onChange={(v) => set(cat, c.key, v)} label={`${cat} via ${c.label}`} />
                  </span>
                </Td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
      <p className="px-4 py-3 text-xs text-fg-3">Slack is {slack === "connected" ? "connected" : "not connected — connect it in Integrations to receive Slack alerts"}. Email goes to each member&apos;s workspace address.</p>
    </Card>
  );
}

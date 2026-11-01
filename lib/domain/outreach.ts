import type { Channel, Lead, OutreachRecipient, Sequence, Suppression } from "../types.ts";

export const OUTREACH_CHANNELS = ["Email", "LinkedIn", "WhatsApp", "Instagram"] as const;
export function destination(lead: Lead, channel: Channel): string {
  if (channel === "Email") return lead.email?.trim().toLowerCase() ?? "";
  if (channel === "WhatsApp") return lead.phone?.replace(/[^+\d]/g, "") ?? "";
  if (channel === "LinkedIn") return lead.linkedin?.trim() ?? "";
  if (channel === "Instagram") return lead.instagram?.trim() ?? "";
  return "";
}
export function suppressed(lead: Lead, list: Suppression[]): boolean {
  const email = lead.email?.trim().toLowerCase() ?? "";
  const domain = email.split("@")[1];
  const phone = lead.phone?.replace(/\D/g, "");
  return !!lead.optedOut || list.some(item => {
    const value = item.value.trim().toLowerCase();
    return !!value && (value === email || value.replace(/^@/, "") === domain || (/^[+\d\s().-]+$/.test(value) && !!phone && value.replace(/\D/g, "") === phone));
  });
}
export function withOptOut(body: string) {
  return /\b(stop|unsubscribe|opt.out)\b/i.test(body) ? body.trim() : `${body.trim()}\n\nReply stop to opt out of further messages.`;
}
export function approvalContent(owner: string, campaign: string, lead: Lead, recipient: OutreachRecipient, channel: Channel) {
  return JSON.stringify([owner, campaign, lead.id, recipient.stepIndex, channel, destination(lead, channel), recipient.draft?.trim() ?? ""]);
}
export function sendWindowOpen(sequence: Sequence, date: Date) {
  const hour = date.getUTCHours();
  return (!sequence.sendWindow.weekdaysOnly || ![0, 6].includes(date.getUTCDay())) && hour >= sequence.sendWindow.startHour && hour < sequence.sendWindow.endHour;
}
export function dueFollowUp(recipient: OutreachRecipient, sequence: Sequence, date: Date) {
  const step = sequence.steps[recipient.stepIndex];
  const previous = sequence.steps[Math.max(0, recipient.stepIndex - 1)];
  if (recipient.state !== "sent" || !recipient.lastSentAt || !step) return false;
  const due = Date.parse(recipient.lastSentAt) + Math.max(0, step.dayOffset - (previous?.dayOffset ?? 0)) * 86400000;
  return Number.isFinite(due) && date.getTime() >= due;
}

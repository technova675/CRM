/**
 * External calendars: one connection per login (Google Calendar, Calendly or Cal.com), read-only.
 * This file is pure so the normalisers can be tested without network access.
 */
export const CALENDAR_PROVIDERS = ["google", "calendly", "calcom"] as const;
export type CalendarProvider = (typeof CALENDAR_PROVIDERS)[number];
export const PROVIDER_NAMES: Record<CalendarProvider, string> = { google: "Google Calendar", calendly: "Calendly", calcom: "Cal.com" };

/** Stored server-side only. `credential` is sealed with the workspace vault key and bound to the login. */
export interface CalendarLink {
  provider: CalendarProvider;
  account: string;
  connectedAt: string;
  lastSyncAt?: string;
  lastError?: string;
  credential: { nonce: string; ciphertext: string; tag: string; updatedAt: string };
}
/** What the browser may see about a connection. */
export type PublicCalendarLink = Omit<CalendarLink, "credential">;
export const publicLink = (link?: CalendarLink): PublicCalendarLink | null => {
  if (!link) return null;
  const { credential, ...rest } = link;
  void credential;
  return rest;
};

export interface CalendarEvent {
  id: string;
  provider: CalendarProvider;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  joinUrl: string;
  attendees: string[];
  status: "confirmed" | "tentative" | "cancelled";
  htmlLink: string;
}

const MAX_RANGE_DAYS = 62;
/** A valid, bounded window: from before to, at most about two months, so one request can never page a whole calendar. */
export function eventWindow(from: string | null, to: string | null, now = Date.now()) {
  const start = from && Number.isFinite(Date.parse(from)) ? Date.parse(from) : now - 7 * 864e5;
  const end = to && Number.isFinite(Date.parse(to)) ? Date.parse(to) : start + 35 * 864e5;
  if (end <= start) return null;
  return { from: new Date(start).toISOString(), to: new Date(Math.min(end, start + MAX_RANGE_DAYS * 864e5)).toISOString() };
}

const text = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const httpsUrl = (v: unknown) => {
  const s = text(v, 2000);
  try { return new URL(s).protocol === "https:" ? s : ""; } catch { return ""; }
};

type GoogleTime = { dateTime?: string; date?: string };
export function fromGoogle(items: unknown[]): CalendarEvent[] {
  return items.flatMap((raw) => {
    const e = raw as { id?: string; summary?: string; status?: string; start?: GoogleTime; end?: GoogleTime; location?: string; hangoutLink?: string; htmlLink?: string;
      conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] }; attendees?: { email?: string; displayName?: string; self?: boolean }[] };
    const allDay = !e.start?.dateTime && !!e.start?.date;
    const start = e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00` : "");
    const end = e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T00:00:00` : start);
    if (!e.id || !Number.isFinite(Date.parse(start)) || e.status === "cancelled") return [];
    const video = e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri;
    return [{
      id: `google:${e.id}`, provider: "google", title: text(e.summary) || "Busy", start: new Date(start).toISOString(), end: new Date(Date.parse(end) || Date.parse(start)).toISOString(),
      allDay, location: text(e.location), joinUrl: httpsUrl(e.hangoutLink ?? video), status: e.status === "tentative" ? "tentative" : "confirmed",
      attendees: (e.attendees ?? []).filter((a) => !a.self).map((a) => text(a.displayName) || text(a.email)).filter(Boolean).slice(0, 20), htmlLink: httpsUrl(e.htmlLink),
    } satisfies CalendarEvent];
  });
}

export function fromCalendly(items: unknown[]): CalendarEvent[] {
  return items.flatMap((raw) => {
    const e = raw as { uri?: string; name?: string; status?: string; start_time?: string; end_time?: string; location?: { join_url?: string; location?: string; type?: string } };
    if (!e.uri || !Number.isFinite(Date.parse(e.start_time ?? "")) || e.status === "canceled") return [];
    const id = e.uri.split("/").pop() ?? e.uri;
    return [{
      id: `calendly:${id}`, provider: "calendly", title: text(e.name) || "Calendly event", start: new Date(e.start_time!).toISOString(),
      end: new Date(Date.parse(e.end_time ?? "") || Date.parse(e.start_time!)).toISOString(), allDay: false,
      location: text(e.location?.location) || text(e.location?.type).replace(/_/g, " "), joinUrl: httpsUrl(e.location?.join_url), attendees: [], status: "confirmed",
      htmlLink: "https://calendly.com/app/scheduled_events/user/me",
    } satisfies CalendarEvent];
  });
}

export function fromCalcom(items: unknown[]): CalendarEvent[] {
  return items.flatMap((raw) => {
    const e = raw as { id?: number | string; uid?: string; title?: string; status?: string; start?: string; end?: string; startTime?: string; endTime?: string;
      location?: string; meetingUrl?: string; attendees?: { name?: string; email?: string }[] };
    const start = e.start ?? e.startTime ?? "", end = e.end ?? e.endTime ?? start;
    const status = (e.status ?? "").toLowerCase();
    if ((e.uid ?? e.id) == null || !Number.isFinite(Date.parse(start)) || ["cancelled", "canceled", "rejected"].includes(status)) return [];
    const location = text(e.location);
    return [{
      id: `calcom:${e.uid ?? e.id}`, provider: "calcom", title: text(e.title) || "Cal.com booking", start: new Date(start).toISOString(), end: new Date(Date.parse(end) || Date.parse(start)).toISOString(),
      allDay: false, location: /^https:\/\//.test(location) ? "" : location, joinUrl: httpsUrl(e.meetingUrl) || httpsUrl(location),
      attendees: (e.attendees ?? []).map((a) => text(a.name) || text(a.email)).filter(Boolean).slice(0, 20), status: status === "pending" ? "tentative" : "confirmed",
      htmlLink: e.uid ? `https://app.cal.com/booking/${encodeURIComponent(e.uid)}` : "",
    } satisfies CalendarEvent];
  });
}

/** Plausible secrets only: rejects pasted URLs, whitespace and obvious placeholders before any network call. */
export function tokenIssue(provider: "calendly" | "calcom", token: string) {
  const t = token.trim();
  if (t.length < 20 || t.length > 2000 || /\s/.test(t)) return "Paste the whole key, with no spaces.";
  if (provider === "calcom" && !/^cal_(live|test)_/i.test(t)) return "Cal.com API keys start with cal_live_.";
  return null;
}

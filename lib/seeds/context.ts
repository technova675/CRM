import type { Campaign, Client, Influencer, Lead, TeamMember, AdRow } from "../types";
import { DAY, rng } from "../utils";

// Shared inputs every module seed receives. Module seeds must be deterministic
// (use makeRand with their own seed) so demo data is stable between reloads.
export interface SeedCtx {
  team: TeamMember[];
  leads: Lead[];
  clients: Client[];
  campaigns: Campaign[];
  influencers: Influencer[];
  ads: AdRow[];
}

export function makeRand(seed: number) {
  const R = rng(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(R() * xs.length)]!;
  const int = (a: number, b: number) => Math.floor(a + R() * (b - a + 1));
  const some = <T,>(xs: readonly T[], min = 1, max = 3) => [...xs].sort(() => R() - 0.5).slice(0, int(min, max));
  return { R, pick, int, some };
}

export const ago = (days: number, hours = 0) => new Date(Date.now() - days * DAY - hours * 3_600_000).toISOString();
export const ahead = (days: number, hour?: number) => {
  const t = new Date(Date.now() + days * DAY);
  if (hour !== undefined) t.setHours(hour, 0, 0, 0);
  return t.toISOString();
};

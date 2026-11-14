import type { CRMLibrary } from "./crmLibrary";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
type Item = { id: string };
const isItems = (v: unknown): v is Item[] => Array.isArray(v) && v.every((x) => !!x && typeof x === "object" && typeof (x as Item).id === "string");

function mergeById(base: Item[], local: Item[], remote: Item[]): Item[] | null {
  const b = new Map(base.map((x) => [x.id, x])), l = new Map(local.map((x) => [x.id, x])), r = new Map(remote.map((x) => [x.id, x]));
  const merged = new Map<string, Item>();
  for (const id of new Set([...b.keys(), ...l.keys(), ...r.keys()])) {
    const bi = b.get(id), li = l.get(id), ri = r.get(id);
    let pick: Item | undefined;
    if (same(bi, li)) pick = ri; // only the other laptop touched it (or nobody)
    else if (same(bi, ri) || same(li, ri)) pick = li; // only this laptop touched it
    else return null; // both laptops edited the same record differently
    if (pick) merged.set(id, pick);
  }
  // Keep the other laptop's ordering; records only created here go first.
  const ordered = remote.map((x) => merged.get(x.id)).filter((x): x is Item => !!x);
  const seen = new Set(ordered.map((x) => x.id));
  const created = local.filter((x) => merged.has(x.id) && !seen.has(x.id)).map((x) => merged.get(x.id)!);
  return [...created, ...ordered, ...[...merged.values()].filter((x) => !seen.has(x.id) && !created.includes(x))];
}

// Three-way merge of whole-library snapshots. Edits to different records (or different
// collections) from two sessions are both kept; only the same record edited in both
// sessions is reported as a conflict (null).
export function mergeLibraries(base: CRMLibrary, local: CRMLibrary, remote: CRMLibrary): CRMLibrary | null {
  const out: Record<string, unknown> = { ...(remote as unknown as Record<string, unknown>) };
  const B = base as unknown as Record<string, unknown>, L = local as unknown as Record<string, unknown>, R = remote as unknown as Record<string, unknown>;
  for (const key of new Set([...Object.keys(B), ...Object.keys(L), ...Object.keys(R)])) {
    if (same(B[key], L[key])) { out[key] = R[key]; continue; }
    if (same(B[key], R[key]) || same(L[key], R[key])) { out[key] = L[key]; continue; }
    if (isItems(B[key] ?? []) && isItems(L[key] ?? []) && isItems(R[key] ?? [])) {
      const merged = mergeById((B[key] ?? []) as Item[], (L[key] ?? []) as Item[], (R[key] ?? []) as Item[]);
      if (!merged) return null;
      out[key] = merged;
      continue;
    }
    return null;
  }
  return out as unknown as CRMLibrary;
}

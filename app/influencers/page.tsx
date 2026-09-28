"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BadgeCheck, Plus, Star, Target, PlaySquare as Youtube } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can } from "@/lib/permissions";
import type { Influencer, InfluencerEngagement } from "@/lib/types";
import { CREATOR_CATEGORIES as CATEGORIES, engagementEconomics } from "@/lib/ai/influencer";
import { cn, compact, compactMoney, money } from "@/lib/utils";
import { Avatar, Badge, Button, Card, EmptyState, Input, PageHeader, Readonly, SearchInput, Segmented, Select, StatusBadge, Table, Tabs, Td, Th } from "@/components/ui";
import { CreatorModal } from "@/components/influencers/creator-modal";
import { MatchingPanel } from "@/components/influencers/matching";
import { InfluencerPipeline } from "@/components/influencers/pipeline";
import { EngagementDrawer } from "@/components/influencers/engagement-drawer";

type Tab = "creators" | "matching" | "pipeline";

function InfluencersInner() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const influencers = useCRM((s) => s.influencers);
  const engagements = useCRM((s) => s.engagements);
  const writable = can(me.role, "influencers", "write") && me.role !== "client";
  const [tab, setTabState] = useState<Tab>((params.get("tab") as Tab) || "creators");
  const setTab = (t: Tab) => { setTabState(t); router.replace(`/influencers?tab=${t}`, { scroll: false }); };
  const [openEng, setOpenEng] = useState<InfluencerEngagement | null>(null);
  const [platform, setPlatform] = useState("All");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [loc, setLoc] = useState("All");
  const [avail, setAvail] = useState("All");
  const [ver, setVer] = useState("All");
  const [tier, setTier] = useState("All");
  const [maxPrice, setMaxPrice] = useState("");
  const [view, setView] = useState<"table" | "grid">("table");
  const [editing, setEditing] = useState<Influencer | "new" | null>(null);

  const locations = useMemo(() => [...new Set(influencers.map((i) => i.location))].sort(), [influencers]);
  const list = useMemo(
    () =>
      influencers.filter((i) => {
        if (q && !`${i.name} ${i.instagram} ${i.youtube ?? ""} ${i.notes}`.toLowerCase().includes(q.toLowerCase())) return false;
        if (cat !== "All" && i.category !== cat) return false;
        if (loc !== "All" && i.location !== loc) return false;
        if (avail !== "All" && i.availability !== avail) return false;
        if (ver !== "All" && i.verification !== ver) return false;
        if (platform !== "All" && (i.platform ?? "Instagram") !== platform) return false;
        if (tier === "nano" && i.followers >= 10_000) return false;
        if (tier === "micro" && (i.followers < 10_000 || i.followers >= 100_000)) return false;
        if (tier === "macro" && (i.followers < 100_000 || i.followers >= 1_000_000)) return false;
        if (tier === "mega" && i.followers < 1_000_000) return false;
        if (maxPrice && i.pricePerPost > Number(maxPrice)) return false;
        return true;
      }),
    [influencers, q, cat, loc, avail, ver, tier, maxPrice, platform],
  );

  const stats = useMemo(() => {
    const active = engagements.filter((e) => e.stage !== "Paid");
    const withR = engagements.filter((e) => e.results && e.agreedFee > 0);
    const eng = withR.reduce((a, e) => a + e.results!.engagements, 0);
    const sales = withR.reduce((a, e) => a + e.results!.sales, 0);
    const fee = withR.reduce((a, e) => a + e.agreedFee, 0);
    return {
      active: active.length,
      committed: engagements.reduce((a, e) => a + e.agreedFee, 0),
      cpe: eng ? fee / eng : 0,
      cpa: sales ? fee / sales : 0,
      best: [...withR].sort((a, b) => (engagementEconomics(a)?.cpe ?? 1e9) - (engagementEconomics(b)?.cpe ?? 1e9))[0],
    };
  }, [engagements]);
  const bestName = influencers.find((i) => i.id === stats.best?.influencerId)?.name;

  return (
    <div>
      <PageHeader
        title="Influencers & creators"
        description="Adbibe's creator network — search, vet and match creators to client campaigns."
        actions={
          <>
            {tab === "creators" && <Segmented value={view} onChange={setView} options={[{ value: "table", label: "Table" }, { value: "grid", label: "Grid" }]} />}
            {tab !== "matching" && <Button icon={<Target className="size-3.5" />} onClick={() => setTab("matching")}>Match to campaign</Button>}
            {writable && <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing("new")}>Add creator</Button>}
          </>
        }
      />
      {!writable && <Readonly>Read-only access — ask an admin to edit creators.</Readonly>}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Card className="p-3"><p className="text-xs text-fg-3">Creators in database</p><p className="text-xl font-semibold tabular-nums mt-1">{influencers.length}</p></Card>
        <Card className="p-3"><p className="text-xs text-fg-3">Active engagements</p><p className="text-xl font-semibold tabular-nums mt-1">{stats.active}</p></Card>
        <Card className="p-3"><p className="text-xs text-fg-3">Committed fees</p><p className="text-xl font-semibold tabular-nums mt-1">{compactMoney(stats.committed)}</p></Card>
        <Card className="p-3"><p className="text-xs text-fg-3">Blended CPE · CPA</p><p className="text-xl font-semibold tabular-nums mt-1">{stats.cpe ? `₹${stats.cpe.toFixed(2)}` : "—"} <span className="text-sm text-fg-3">· {stats.cpa ? compactMoney(stats.cpa) : "—"}</span></p></Card>
        <Card className="p-3 col-span-2 lg:col-span-1"><p className="text-xs text-fg-3">Most efficient creator</p><p className="text-[15px] font-semibold mt-1 truncate">{bestName ?? "—"}</p>{stats.best && <p className="text-[11px] text-fg-3">₹{engagementEconomics(stats.best)?.cpe.toFixed(2)} per engagement</p>}</Card>
      </div>
      <div className="mb-4">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: "creators", label: "Creator database", count: influencers.length }, { value: "matching", label: "AI matching" }, { value: "pipeline", label: "Campaign pipeline", count: engagements.length }]} />
      </div>
      {tab === "matching" && <MatchingPanel writable={writable} onShortlisted={() => setTab("pipeline")} />}
      {tab === "pipeline" && <InfluencerPipeline writable={writable} onOpen={setOpenEng} />}
      {tab === "creators" && <Card>
        <div className="flex flex-wrap gap-2 p-3 border-b border-border">
          <SearchInput value={q} onChange={setQ} placeholder="Search creators…" className="w-full sm:w-56" />
          <Select value={cat} onChange={(e) => setCat(e.target.value)} className="w-32"><option value="All">Category</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select>
          <Select value={loc} onChange={(e) => setLoc(e.target.value)} className="w-32"><option value="All">Location</option>{locations.map((c) => <option key={c}>{c}</option>)}</Select>
          <Select value={avail} onChange={(e) => setAvail(e.target.value)} className="w-32"><option value="All">Availability</option><option>Available</option><option>Busy</option><option>Unavailable</option></Select>
          <Select value={platform} onChange={(e) => setPlatform(e.target.value)} className="w-32"><option value="All">Platform</option>{["Instagram", "YouTube", "LinkedIn", "X", "Moj"].map((p) => <option key={p}>{p}</option>)}</Select>
          <Select value={ver} onChange={(e) => setVer(e.target.value)} className="w-32"><option value="All">Verification</option><option>Verified</option><option>Pending</option><option>Unverified</option></Select>
          <Select value={tier} onChange={(e) => setTier(e.target.value)} className="w-36"><option value="All">Followers</option><option value="nano">Nano (&lt;10K)</option><option value="micro">Micro (10–100K)</option><option value="macro">Macro (100K–1M)</option><option value="mega">Mega (1M+)</option></Select>
          <Input type="number" placeholder="Max ₹/post" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="w-32" />
          <span className="ml-auto self-center text-xs text-fg-3">{list.length} creators</span>
        </div>
        {list.length === 0 ? (
          <EmptyState icon={<Star className="size-5" />} title="No creators match" />
        ) : view === "table" ? (
          <Table>
            <thead>
              <tr><Th>Creator</Th><Th>Platform</Th><Th>Category</Th><Th>Location</Th><Th>Followers</Th><Th>ER</Th><Th>Content</Th><Th>₹/post</Th><Th>Availability</Th><Th>Perf.</Th><Th>Projects</Th></tr>
            </thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id} className="cursor-pointer hover:bg-surface-2/60" onClick={() => setEditing(i)}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Avatar name={i.name} size={28} />
                      <div className="min-w-0">
                        <p className="font-medium flex items-center gap-1">{i.name}{i.verification === "Verified" && <BadgeCheck className="size-3.5 text-info" />}</p>
                        <p className="text-xs text-fg-3 flex items-center gap-1.5">{i.instagram}{i.youtube && <Youtube className="size-3" />}</p>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-xs text-fg-2">{i.platform ?? "Instagram"}</Td>
                  <Td><Badge>{i.category}</Badge></Td>
                  <Td className="text-fg-2">{i.location}{i.audience && <p className="text-[11px] text-fg-3">{i.audience.femalePct}% F · {i.audience.ageBand}</p>}</Td>
                  <Td className="tabular-nums">{compact(i.followers)}</Td>
                  <Td className={cn("tabular-nums", i.engagement >= 4 ? "text-success" : "")}>{i.engagement}%</Td>
                  <Td className="text-xs text-fg-2 max-w-40 truncate">{i.contentTypes.join(", ")}</Td>
                  <Td className="tabular-nums">{money(i.pricePerPost)}</Td>
                  <Td><StatusBadge status={i.availability} /></Td>
                  <Td className="tabular-nums">{i.performanceScore}</Td>
                  <Td className="text-xs text-fg-3 max-w-40 truncate">{i.previousProjects.join(", ") || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {list.map((i) => (
              <button key={i.id} onClick={() => setEditing(i)} className="text-left rounded-xl border border-border p-4 hover:border-border-strong transition">
                <div className="flex items-center gap-2.5">
                  <Avatar name={i.name} size={36} />
                  <div className="min-w-0">
                    <p className="font-medium text-[13px] flex items-center gap-1 truncate">{i.name}{i.verification === "Verified" && <BadgeCheck className="size-3.5 text-info" />}</p>
                    <p className="text-xs text-fg-3">{i.instagram}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1"><Badge>{i.category}</Badge><StatusBadge status={i.availability} /></div>
                <div className="mt-3 grid grid-cols-3 text-xs">
                  <div><p className="text-fg-3">Followers</p><p className="font-medium tabular-nums">{compact(i.followers)}</p></div>
                  <div><p className="text-fg-3">ER</p><p className="font-medium tabular-nums">{i.engagement}%</p></div>
                  <div><p className="text-fg-3">₹/post</p><p className="font-medium tabular-nums">{compact(i.pricePerPost)}</p></div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>}
      {editing && <CreatorModal creator={editing === "new" ? null : editing} writable={writable} onClose={() => setEditing(null)} />}
      {openEng && <EngagementDrawer key={openEng.id} id={openEng.id} writable={writable} onClose={() => setOpenEng(null)} />}
    </div>
  );
}

export default function InfluencersPage() {
  return (
    <Suspense>
      <InfluencersInner />
    </Suspense>
  );
}


"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bell, ChevronDown, ChevronsUpDown, Lock, Menu, Moon, Search, Sparkles, Sun, X } from "lucide-react";
import { useCRM, useMe } from "@/lib/store";
import { can, moduleFromPath, MODULE_LABEL, ROLE_LABEL, setPermissionOverrides } from "@/lib/permissions";
import { cn, relTime } from "@/lib/utils";
import { Avatar, Button, EmptyState, Kbd } from "@/components/ui";
import { CLIENT_LABELS, NAV, NAV_GROUPS, type NavGroup } from "./nav";
import { useUI } from "./ui-state";
import { Toaster } from "./toast";
import { CommandPalette } from "./CommandPalette";
import { AssistantPanel } from "./AssistantPanel";

function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem("adbibe-theme");
    } catch {}
    const d = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    // Theme lives in localStorage, which isn't available during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(d);
    document.documentElement.classList.toggle("dark", d);
  }, []);
  const toggle = () => {
    const d = !dark;
    setDark(d);
    document.documentElement.classList.toggle("dark", d);
    try {
      localStorage.setItem("adbibe-theme", d ? "dark" : "light");
    } catch {}
  };
  return { dark, toggle };
}

function Logo() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 px-2">
      <span className="ai-gradient grid size-7 place-items-center rounded-lg text-white font-bold text-sm shadow-card">A</span>
      <span className="font-semibold tracking-tight">Adbibe</span>
      <span className="rounded-md border border-border px-1.5 text-[10px] font-medium text-fg-3">OS</span>
    </Link>
  );
}

function useCollapsedGroups() {
  const [collapsed, setCollapsed] = useState<NavGroup[]>([]);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem("adbibe-nav-collapsed") ?? "[]");
      // Per-viewer convenience stored in localStorage (unavailable during SSR).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(v)) setCollapsed(v);
    } catch {}
  }, []);
  const toggle = (g: NavGroup) =>
    setCollapsed((c) => {
      const next = c.includes(g) ? c.filter((x) => x !== g) : [...c, g];
      try {
        localStorage.setItem("adbibe-nav-collapsed", JSON.stringify(next));
      } catch {}
      return next;
    });
  return { collapsed, toggle };
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const me = useMe();
  // Re-render when an admin edits the permission matrix.
  usePermissionOverrides();
  // Selectors return primitives: zustand v5 re-renders forever on fresh objects.
  const inboxCount = useCRM((s) => s.conversations.filter((c) => c.unread > 0 || c.status === "needs_human").length);
  const approvalCount = useCRM((s) => s.approvals.filter((a) => a.status === "pending").length);
  const recCount = useCRM((s) => s.recommendations.filter((r) => r.status === "New" && r.priority === "High").length);
  const clientReview = useCRM((s) => s.creatives.filter((c) => c.status === "Client Review" && (me.role !== "client" || c.clientId === me.clientId)).length);
  const counts: Partial<Record<string, number>> = { inbox: me.role === "client" ? 0 : inboxCount, automations: approvalCount, performance: recCount, creative: me.role === "client" ? clientReview : 0 };
  const { collapsed, toggle } = useCollapsedGroups();
  const isClient = me.role === "client";
  return (
    <nav className="flex h-full flex-col gap-3 overflow-y-auto px-3 py-4">
      <Logo />
      <div className="flex flex-col gap-2">
        {NAV_GROUPS.map((g) => {
          const items = NAV.filter((n) => n.group === g && can(me.role, n.module));
          if (!items.length) return null;
          const hasActive = items.some((n) => path === n.href || path.startsWith(n.href + "/"));
          const isCollapsed = collapsed.includes(g) && !hasActive;
          return (
            <div key={g}>
              {!isClient && (
                <button onClick={() => toggle(g)} className="flex w-full items-center gap-1 px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wider text-fg-3 hover:text-fg-2">
                  <span className="flex-1 text-left">{g}</span>
                  <ChevronDown className={cn("size-3 transition-transform", isCollapsed && "-rotate-90")} />
                </button>
              )}
              {!isCollapsed && (
                <ul className="space-y-0.5">
                  {items.map((n) => {
                    const active = path === n.href || path.startsWith(n.href + "/");
                    const badge = counts[n.module] ?? 0;
                    const label = (isClient && CLIENT_LABELS[n.module]) || n.label;
                    return (
                      <li key={n.href}>
                        <Link href={n.href} onClick={onNavigate} className={cn("group flex h-8 items-center gap-2.5 rounded-lg px-2 text-[13px] font-medium transition", active ? "bg-surface text-fg shadow-card border border-border" : "text-fg-2 hover:bg-surface-2 hover:text-fg border border-transparent")}>
                          <n.icon className={cn("size-4", active ? "text-accent" : "text-fg-3 group-hover:text-fg-2")} />
                          <span className="flex-1 truncate">{label}</span>
                          {badge > 0 && <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold text-white tabular-nums">{badge}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-auto">
        <UserSwitcher />
      </div>
    </nav>
  );
}

function UserSwitcher() {
  const me = useMe();
  const team = useCRM((s) => s.team);
  const setUser = useCRM((s) => s.setCurrentUser);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <div className="relative">
      {open && (
        <div className="animate-in absolute bottom-full mb-2 left-0 right-0 rounded-xl border border-border bg-surface p-1 shadow-pop z-20">
          <p className="px-2 py-1.5 text-[11px] text-fg-3">Switch user (demo RBAC)</p>
          {team.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setUser(t.id);
                setOpen(false);
                router.push("/dashboard");
              }}
              className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2", t.id === me.id && "bg-surface-2")}
            >
              <Avatar name={t.name} color={t.avatarColor} size={22} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">{t.name}</span>
                <span className="block text-[11px] text-fg-3">{ROLE_LABEL[t.role]}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-2 py-2 text-left hover:bg-surface-2 shadow-card">
        <Avatar name={me.name} color={me.avatarColor} size={26} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{me.name}</span>
          <span className="block text-[11px] text-fg-3">{ROLE_LABEL[me.role]}</span>
        </span>
        <ChevronsUpDown className="size-3.5 text-fg-3" />
      </button>
    </div>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const items = useCRM((s) => s.notifications);
  const markRead = useCRM((s) => s.markNotificationsRead);
  const unread = items.filter((n) => !n.read).length;
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative grid size-8 place-items-center rounded-lg text-fg-2 hover:bg-surface-2" aria-label="Notifications">
        <Bell className="size-4" />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-danger ring-2 ring-bg" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="animate-in absolute right-0 top-10 z-40 w-[min(360px,calc(100vw-2rem))] rounded-xl border border-border bg-surface shadow-pop">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
              <span className="text-[13px] font-semibold">Notifications</span>
              <button className="text-xs text-accent-text hover:underline" onClick={markRead}>
                Mark all read
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto p-1">
              {items.length === 0 && <EmptyState title="You're all caught up" />}
              {items.slice(0, 30).map((n) => (
                <Link key={n.id} href={n.href ?? "#"} onClick={() => setOpen(false)} className="flex gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-2">
                  <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", n.read ? "bg-transparent" : n.kind === "warning" ? "bg-warning" : n.kind === "success" ? "bg-success" : "bg-accent")} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium">{n.title}</span>
                    <span className="block text-xs text-fg-3">{n.body}</span>
                    <span className="block text-[11px] text-fg-3 mt-0.5">{relTime(n.at)}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Topbar() {
  const { dark, toggle } = useTheme();
  const setPalette = useUI((s) => s.setPalette);
  const openAssistant = useUI((s) => s.openAssistant);
  const setMobileNav = useUI((s) => s.setMobileNav);
  const aiEnabled = useCRM((s) => s.aiEnabled);
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-bg/80 px-4 backdrop-blur-xl lg:px-6">
      <button className="lg:hidden grid size-8 place-items-center rounded-lg hover:bg-surface-2" onClick={() => setMobileNav(true)} aria-label="Open navigation">
        <Menu className="size-4" />
      </button>
      <button onClick={() => setPalette(true)} className="flex h-8 min-w-0 flex-1 max-w-md items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-[13px] text-fg-3 hover:border-border-strong shadow-card">
        <Search className="size-3.5" />
        <span className="flex-1 text-left truncate">Search leads, clients, campaigns, creatives, docs…</span>
        <span className="hidden sm:flex gap-0.5">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <span className={cn("hidden md:inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[11px]", aiEnabled ? "text-success" : "text-fg-3")} title={aiEnabled ? "AI provider connected" : "Running local AI engine — add AI_GATEWAY_API_KEY to enable LLM features"}>
          <span className={cn("size-1.5 rounded-full", aiEnabled ? "bg-success" : "bg-fg-3")} />
          {aiEnabled ? "AI live" : "AI local"}
        </span>
        <Button variant="ai" size="sm" icon={<Sparkles className="size-3.5" />} onClick={() => openAssistant()}>
          <span className="hidden sm:inline">Ask AI</span>
        </Button>
        <Notifications />
        <button onClick={toggle} className="grid size-8 place-items-center rounded-lg text-fg-2 hover:bg-surface-2" aria-label="Toggle theme">
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </div>
    </header>
  );
}

// Keeps the pure `can()` helper in sync with the admin-edited permission matrix.
function usePermissionOverrides() {
  const o = useCRM((s) => s.settings.permissionOverrides);
  setPermissionOverrides(o);
  return o;
}

function AccessGate({ children }: { children: ReactNode }) {
  const path = usePathname();
  const me = useMe();
  const mod = moduleFromPath(path);
  const overrides = usePermissionOverrides();
  const allowed = useMemo(() => can(me.role, mod), [me.role, mod, overrides]); // eslint-disable-line react-hooks/exhaustive-deps
  if (allowed) return <>{children}</>;
  return (
    <EmptyState
      icon={<Lock className="size-5" />}
      title="You don't have access to this area"
      description={`The ${ROLE_LABEL[me.role]} role can't view ${MODULE_LABEL[mod]}. Ask an admin to update permissions in Team → Permissions.`}
      action={
        <Button href="/dashboard">Back to dashboard</Button>
      }
    />
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const mobileNav = useUI((s) => s.mobileNav);
  const setMobileNav = useUI((s) => s.setMobileNav);
  const setPalette = useUI((s) => s.setPalette);
  const setAIEnabled = useCRM((s) => s.setAIEnabled);
  const refreshOverdue = useCRM((s) => s.refreshOverdue);

  useEffect(() => {
    // Storage can be blocked (private mode, embedded frames); fall back to in-memory demo data.
    void Promise.resolve()
      .then(() => useCRM.persist.rehydrate())
      .catch(() => undefined)
      .then(() => {
        refreshOverdue();
        setReady(true);
      });
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then((d) => setAIEnabled(Boolean(d.enabled)))
      .catch(() => setAIEnabled(false));
  }, [setAIEnabled, refreshOverdue]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [setPalette]);

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-60 border-r border-border bg-bg">{ready && <Sidebar />}</aside>
      {mobileNav && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileNav(false)} />
          <aside className="animate-in absolute inset-y-0 left-0 w-72 border-r border-border bg-bg">
            <button className="absolute right-3 top-4 rounded-md p-1 hover:bg-surface-2" onClick={() => setMobileNav(false)} aria-label="Close navigation">
              <X className="size-4" />
            </button>
            {ready && <Sidebar onNavigate={() => setMobileNav(false)} />}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <Topbar />
        <main className="flex-1 px-4 py-5 lg:px-6 lg:py-6 max-w-[1600px] w-full mx-auto">
          {ready ? (
            <AccessGate>{children}</AccessGate>
          ) : (
            <div className="space-y-4">
              <div className="skeleton h-8 w-56 rounded-lg" />
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="skeleton h-24 rounded-xl" />
                ))}
              </div>
              <div className="skeleton h-72 rounded-xl" />
            </div>
          )}
        </main>
      </div>
      {ready && <CommandPalette />}
      {ready && <AssistantPanel />}
      <Toaster />
    </div>
  );
}

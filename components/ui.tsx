"use client";

import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Loader2, Search, Sparkles, X } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { useCRM } from "@/lib/store";

// ---------- Button ----------
type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "ai" | "outline";
type BtnSize = "xs" | "sm" | "md";
export function Button({
  variant = "secondary",
  size = "sm",
  loading,
  icon,
  className,
  children,
  href,
  external,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize; loading?: boolean; icon?: ReactNode; href?: string; external?: boolean }) {
  const classes = cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-all select-none disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]",
        size === "xs" && "h-7 px-2 text-xs",
        size === "sm" && "h-8 px-3 text-[13px]",
        size === "md" && "h-10 px-4 text-sm",
        variant === "primary" && "bg-fg text-bg hover:opacity-90 shadow-card",
        variant === "secondary" && "bg-surface border border-border hover:bg-surface-2 text-fg shadow-card",
        variant === "outline" && "border border-border-strong hover:bg-surface-2 text-fg",
        variant === "ghost" && "hover:bg-surface-2 text-fg-2 hover:text-fg",
        variant === "danger" && "bg-danger text-white hover:opacity-90",
        variant === "ai" && "ai-gradient text-white hover:opacity-95 shadow-card",
        className,
      );
  const content = (
    <>
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {children}
    </>
  );
  // With href, render a real link styled as a button (never nest <button> inside <a>).
  if (href) {
    return external ? (
      <a href={href} target="_blank" rel="noreferrer" className={classes}>
        {content}
      </a>
    ) : (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }
  return (
    <button {...rest} disabled={rest.disabled || loading} className={classes}>
      {content}
    </button>
  );
}

// ---------- Card ----------
export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn("rounded-xl border border-border bg-surface shadow-card", className)}>
      {children}
    </div>
  );
}
export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-4 pt-4 pb-2", className)}>
      <div className="min-w-0">
        <h3 className="text-[13px] font-semibold text-fg">{title}</h3>
        {subtitle && <p className="text-xs text-fg-3 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ---------- Badge ----------
export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";
export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap leading-4",
        tone === "neutral" && "bg-surface-2 text-fg-2 border border-border",
        tone === "accent" && "bg-accent-soft text-accent-text",
        tone === "success" && "bg-success-soft text-success",
        tone === "warning" && "bg-warning-soft text-warning",
        tone === "danger" && "bg-danger-soft text-danger",
        tone === "info" && "bg-info-soft text-info",
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  New: "info", Researching: "accent", Qualified: "accent", Contacted: "neutral", Replied: "success", Meeting: "warning",
  Proposal: "warning", Negotiation: "warning", Won: "success", Lost: "danger",
  "New Lead": "info",
  Draft: "neutral", Sent: "info", Viewed: "accent", Accepted: "success", Rejected: "danger",
  Pending: "warning", "Partially Paid": "info", Paid: "success", Overdue: "danger",
  Planning: "neutral", Active: "success", Paused: "warning", Completed: "neutral",
  Todo: "neutral", "In Progress": "info", Blocked: "danger", Done: "success",
  Low: "neutral", Medium: "info", High: "warning", Urgent: "danger",
  Healthy: "success", "At Risk": "warning", "Churn Risk": "danger",
  Available: "success", Busy: "warning", Unavailable: "neutral",
  Verified: "success", Unverified: "neutral",
  Positive: "success", "Needs Follow-up": "warning", "Not Interested": "danger", "No Show": "danger",
  Running: "success", Review: "warning",
  open: "info", waiting: "neutral", needs_human: "warning", closed: "neutral",
  connected: "success", available: "neutral", error: "danger",
};
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const label = status === "needs_human" ? "Needs human" : status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <Badge tone={STATUS_TONE[status] ?? "neutral"} dot className={className}>
      {label}
    </Badge>
  );
}

export function ScorePill({ score, overridden }: { score: number; overridden?: boolean }) {
  const tone = score >= 75 ? "bg-success" : score >= 55 ? "bg-accent" : score >= 35 ? "bg-warning" : "bg-fg-3";
  return (
    <span className="inline-flex items-center gap-1.5" title={overridden ? "Manually overridden" : "AI score"}>
      <span className="relative h-1.5 w-10 rounded-full bg-surface-3 overflow-hidden">
        <span className={cn("absolute inset-y-0 left-0 rounded-full", tone)} style={{ width: `${score}%` }} />
      </span>
      <span className="text-xs font-semibold tabular-nums text-fg">{score}</span>
      {overridden && <span className="text-[10px] text-fg-3">✎</span>}
    </span>
  );
}

// ---------- Form controls ----------
const field = "w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] text-fg placeholder:text-fg-3 outline-none transition focus:border-accent focus:ring-3 focus:ring-[var(--ring)]";
export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cn(field, "h-8", className)} />;
}
export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cn(field, "py-2 min-h-20 leading-relaxed", className)} />;
}
export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...p} className={cn(field, "h-8 pr-7 appearance-none bg-[length:12px] bg-[right_8px_center] bg-no-repeat cursor-pointer", className)} style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238b8b96' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")` }}>
      {children}
    </select>
  );
}
export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={cn("block space-y-1", className)}>
      <span className="text-xs font-medium text-fg-2">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-fg-3">{hint}</span>}
    </label>
  );
}
export function SearchInput({ value, onChange, placeholder = "Search…", className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-fg-3" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-8" />
    </div>
  );
}
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cn("relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-accent" : "bg-surface-3 border border-border")}>
      <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}
export function Checkbox({ checked, onChange, className, indeterminate }: { checked: boolean; onChange: (v: boolean) => void; className?: string; indeterminate?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} onClick={(e) => e.stopPropagation()} className={cn("size-3.5 rounded accent-[var(--accent)] cursor-pointer", className)} />;
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cn("inline-flex rounded-lg bg-surface-2 p-0.5 border border-border", className)}>
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} className={cn("h-7 px-2.5 rounded-md text-xs font-medium transition whitespace-nowrap", value === o.value ? "bg-surface text-fg shadow-card" : "text-fg-3 hover:text-fg")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="flex gap-1 border-b border-border overflow-x-auto">
      {tabs.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)} className={cn("relative h-9 px-3 text-[13px] font-medium whitespace-nowrap transition", value === t.value ? "text-fg" : "text-fg-3 hover:text-fg-2")}>
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 text-[11px] text-fg-3 tabular-nums">{t.count}</span>}
          {value === t.value && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
        </button>
      ))}
    </div>
  );
}

// ---------- Avatar ----------
export function Avatar({ name, color, size = 24, className }: { name: string; color?: string; size?: number; className?: string }) {
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", className)} style={{ width: size, height: size, fontSize: size * 0.4, background: color ?? `oklch(0.62 0.14 ${hue})` }} title={name}>
      {initials(name)}
    </span>
  );
}
export function MemberAvatar({ id, size = 22, showName }: { id?: string; size?: number; showName?: boolean }) {
  const m = useCRM((s) => s.team.find((t) => t.id === id));
  if (!m) return <span className="text-fg-3 text-xs">Unassigned</span>;
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <Avatar name={m.name} color={m.avatarColor} size={size} />
      {showName && <span className="truncate text-[13px] text-fg-2">{m.name.split(" ")[0]}</span>}
    </span>
  );
}

// ---------- Overlays ----------
function Portal({ children }: { children: ReactNode }) {
  return typeof document === "undefined" ? null : createPortal(children, document.body);
}
function useEsc(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
}
export function Modal({ open, onClose, title, subtitle, children, footer, size = "md" }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" | "xl" }) {
  useEsc(open, onClose);
  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
        <div className={cn("relative animate-in w-full max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-border bg-surface shadow-pop", size === "sm" && "sm:max-w-md", size === "md" && "sm:max-w-xl", size === "lg" && "sm:max-w-3xl", size === "xl" && "sm:max-w-5xl")}>
          <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-border">
            <div>
              <h2 className="text-[15px] font-semibold">{title}</h2>
              {subtitle && <p className="text-xs text-fg-3 mt-0.5">{subtitle}</p>}
            </div>
            <button onClick={onClose} className="rounded-md p-1 text-fg-3 hover:bg-surface-2 hover:text-fg" aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 px-5 py-3 border-t border-border bg-surface-2/50 rounded-b-2xl">{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}
export function Drawer({ open, onClose, title, subtitle, children, footer, width = 560 }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEsc(open, onClose);
  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/30" onClick={onClose} />
        <aside className="animate-slide absolute right-0 top-0 h-full w-full flex flex-col border-l border-border bg-surface shadow-pop" style={{ maxWidth: width }}>
          <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-border">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold truncate">{title}</h2>
              {subtitle && <div className="text-xs text-fg-3 mt-0.5">{subtitle}</div>}
            </div>
            <button onClick={onClose} className="rounded-md p-1 text-fg-3 hover:bg-surface-2 hover:text-fg" aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">{footer}</div>}
        </aside>
      </div>
    </Portal>
  );
}

// ---------- Layout helpers ----------
export function PageHeader({ title, description, actions, icon }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-5">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          {icon}
          {title}
        </h1>
        {description && <p className="text-[13px] text-fg-3 mt-1">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, delta, hint, icon, tone }: { label: string; value: ReactNode; delta?: number; hint?: ReactNode; icon?: ReactNode; tone?: Tone }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-fg-3">{label}</span>
        {icon && <span className={cn("rounded-md p-1", tone === "danger" ? "text-danger bg-danger-soft" : tone === "warning" ? "text-warning bg-warning-soft" : tone === "success" ? "text-success bg-success-soft" : "text-accent-text bg-accent-soft")}>{icon}</span>}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="mt-1 flex items-center gap-1.5 text-xs">
        {delta !== undefined && (
          <span className={cn("font-medium tabular-nums", delta >= 0 ? "text-success" : "text-danger")}>
            {delta >= 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(0)}%
          </span>
        )}
        {hint && <span className="text-fg-3 truncate">{hint}</span>}
      </div>
    </Card>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      {icon && <div className="mb-3 rounded-xl bg-surface-2 p-3 text-fg-3">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="text-xs text-fg-3 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Progress({ value, className, tone = "accent" }: { value: number; className?: string; tone?: "accent" | "success" | "warning" | "danger" }) {
  return (
    <div className={cn("h-1.5 w-full rounded-full bg-surface-3 overflow-hidden", className)}>
      <div className={cn("h-full rounded-full transition-all", tone === "accent" && "bg-accent", tone === "success" && "bg-success", tone === "warning" && "bg-warning", tone === "danger" && "bg-danger")} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function AIBadge({ children = "AI" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent-text uppercase tracking-wide">
      <Sparkles className="size-3" />
      {children}
    </span>
  );
}

// ---------- Table ----------
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-[13px] border-separate border-spacing-0">{children}</table>
    </div>
  );
}
export function Th({ children, className, onClick }: { children?: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <th onClick={onClick} className={cn("sticky top-0 z-[1] bg-surface-2/80 backdrop-blur text-left font-medium text-xs text-fg-3 px-3 h-9 border-b border-border whitespace-nowrap", onClick && "cursor-pointer hover:text-fg", className)}>
      {children}
    </th>
  );
}
export function Td({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn("px-3 py-2.5 border-b border-border align-middle", className)}>
      {children}
    </td>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-2 px-1 font-mono text-[10px] text-fg-3">{children}</kbd>;
}

export function Readonly({ children }: { children: ReactNode }) {
  return <div className="mb-4 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">{children}</div>;
}

// ---------- AI output ----------
// Every AI-generated line is tagged so users can tell data from inference.
const INSIGHT_META: Record<"data" | "assumption" | "recommendation" | "verified", { label: string; tone: Tone }> = {
  data: { label: "Data", tone: "info" },
  verified: { label: "Verified", tone: "info" },
  assumption: { label: "Assumption", tone: "warning" },
  recommendation: { label: "Recommendation", tone: "accent" },
};
export function InsightTag({ kind }: { kind: keyof typeof INSIGHT_META }) {
  const m = INSIGHT_META[kind];
  return <Badge tone={m.tone} className="shrink-0 w-[104px] justify-center">{m.label}</Badge>;
}
export function InsightList({ items, className, compact }: { items: { text: string; kind: keyof typeof INSIGHT_META; source?: string }[]; className?: string; compact?: boolean }) {
  if (!items.length) return null;
  return (
    <ul className={cn("space-y-1.5", className)}>
      {items.map((it, i) => (
        <li key={i} className={cn("flex items-start gap-2 text-[13px] leading-relaxed", compact && "text-xs")}>
          <InsightTag kind={it.kind} />
          <span className="min-w-0 flex-1 text-fg-2">
            {it.text}
            {it.source && <span className="ml-1 text-[11px] text-fg-3">· {it.source}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
export function InsightLegend() {
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-fg-3">
      <Badge tone="info">Data</Badge> from connected sources ·<Badge tone="warning">Assumption</Badge> AI inference ·<Badge tone="accent">Recommendation</Badge> suggested action
    </p>
  );
}
export function AgentChip({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-fg-2", className)}>
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      {name}
    </span>
  );
}

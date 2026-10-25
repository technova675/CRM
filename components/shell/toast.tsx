"use client";

import { create } from "zustand";
import { CheckCircle2, Info, Sparkles, TriangleAlert, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Kind = "success" | "info" | "warning" | "error" | "ai";
interface T {
  id: number;
  title: string;
  body?: string;
  kind: Kind;
}
const useToasts = create<{ items: T[]; push: (t: Omit<T, "id">) => void; drop: (id: number) => void }>((set) => ({
  items: [],
  push: (t) => {
    const id = Date.now() + Math.random();
    set((s) => ({ items: [...s.items, { ...t, id }] }));
    // Errors stay up longer: they usually say what to do next.
    setTimeout(() => set((s) => ({ items: s.items.filter((x) => x.id !== id) })), t.kind === "error" ? 6000 : 3800);
  },
  drop: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}));

export const toast = (title: string, body?: string, kind: Kind = "success") => useToasts.getState().push({ title, body, kind });

export function Toaster() {
  const items = useToasts((s) => s.items);
  const drop = useToasts((s) => s.drop);
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm pointer-events-none">
      {items.map((t) => {
        const Icon = t.kind === "success" ? CheckCircle2 : t.kind === "warning" ? TriangleAlert : t.kind === "error" ? XCircle : t.kind === "ai" ? Sparkles : Info;
        return (
          <button key={t.id} onClick={() => drop(t.id)} className="animate-in pointer-events-auto text-left flex gap-2.5 rounded-xl border border-border bg-surface p-3 shadow-pop">
            <Icon className={cn("size-4 mt-0.5 shrink-0", t.kind === "success" && "text-success", t.kind === "warning" && "text-warning", t.kind === "error" && "text-danger", t.kind === "ai" && "text-accent", t.kind === "info" && "text-info")} />
            <div className="min-w-0">
              <p className="text-[13px] font-medium">{t.title}</p>
              {t.body && <p className="text-xs text-fg-3 mt-0.5">{t.body}</p>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { useMe } from "@/lib/store";
import { buildSteps, resolveTourKey } from "@/lib/tours";

const storageKey = (userId: string, tour: string) => `crm-tour-seen:${userId}:${tour}`;

function hasSeen(userId: string, tour: string) {
  try {
    return localStorage.getItem(storageKey(userId, tour)) === "1";
  } catch {
    return true; // storage blocked: never nag
  }
}

function markSeen(userId: string, tour: string) {
  try {
    localStorage.setItem(storageKey(userId, tour), "1");
  } catch {
    /* ignore */
  }
}

function visible(selector: string) {
  const el = document.querySelector<HTMLElement>(selector);
  return !!el && el.getClientRects().length > 0;
}

/**
 * Page tour for the current route. Auto-starts once per user per page and
 * exposes `start` for the "Take a tour" button in the top bar.
 */
export function usePageTour(ready: boolean) {
  const me = useMe();
  const pathname = usePathname();
  const key = useMemo(() => resolveTourKey(pathname), [pathname]);
  const activeRef = useRef<ReturnType<typeof driver> | null>(null);

  const start = useCallback(() => {
    if (!key) return;
    activeRef.current?.destroy();
    const steps: DriveStep[] = buildSteps(key)
      .filter((s) => !s.roles || s.roles(me.role))
      .filter((s) => !s.target || visible(`[data-tour="${s.target}"]`))
      .map((s) => ({
        element: s.target ? `[data-tour="${s.target}"]` : undefined,
        popover: { title: s.title, description: s.description },
      }));
    // A tour with only the welcome step adds nothing.
    if (steps.length < 2) {
      markSeen(me.id, key);
      return;
    }
    const tour = driver({
      showProgress: true,
      allowClose: true,
      overlayOpacity: 0.55,
      stagePadding: 6,
      stageRadius: 10,
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Done",
      steps,
      onDestroyed: () => markSeen(me.id, key),
    });
    activeRef.current = tour;
    tour.drive();
  }, [key, me.id, me.role]);

  useEffect(() => {
    if (!ready || !key || hasSeen(me.id, key)) return;
    // Let data and layout settle first. Never open over a form or drawer the user already started:
    // the tour would cover it and discard what they typed. It is offered again on the next visit.
    const timer = window.setTimeout(() => { if (!document.querySelector('[role="dialog"]')) start(); }, 900);
    return () => {
      window.clearTimeout(timer);
      activeRef.current?.destroy();
    };
  }, [ready, key, me.id, start]);

  return { start, available: Boolean(key) };
}

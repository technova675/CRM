"use client";

import { useEffect, useRef } from "react";

const INTERVAL_MS = 60_000;

/** Tells the server this signed-in user is here, so the owner can see who is active. Best-effort. */
export function Heartbeat({ path }: { path: string }) {
  const pathRef = useRef(path);
  useEffect(() => { pathRef.current = path; }, [path]);
  useEffect(() => {
    let stopped = false;
    const beat = () => {
      if (stopped || document.visibilityState !== "visible") return;
      void fetch("/api/presence", {
        method: "POST", headers: { "content-type": "application/json" }, keepalive: true,
        body: JSON.stringify({ page: pathRef.current.split(/[?#]/)[0]!.slice(0, 200) }),
      }).catch(() => undefined);
    };
    const timer = window.setInterval(beat, INTERVAL_MS);
    document.addEventListener("visibilitychange", beat);
    return () => { stopped = true; window.clearInterval(timer); document.removeEventListener("visibilitychange", beat); };
  }, []);
  // Report the new page right away when the user navigates.
  useEffect(() => {
    if (document.visibilityState !== "visible") return;
    void fetch("/api/presence", {
      method: "POST", headers: { "content-type": "application/json" }, keepalive: true,
      body: JSON.stringify({ page: path.split(/[?#]/)[0]!.slice(0, 200) }),
    }).catch(() => undefined);
  }, [path]);
  return null;
}

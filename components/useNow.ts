"use client";

import { useEffect, useState } from "react";

/** Current timestamp in ms, refreshed every minute and on window focus. Safe to read during render. */
export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = setInterval(update, 60000);
    window.addEventListener("focus", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);
  return now;
}

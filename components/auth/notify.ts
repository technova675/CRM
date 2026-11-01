"use client";
export function notifyAuthChange() {
  try { localStorage.setItem("adbibe-auth-event", crypto.randomUUID()); } catch { /* Focus checks remain available if storage is blocked. */ }
}

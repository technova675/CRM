"use client";

import { create } from "zustand";

// Session-only media registry. Object URLs for uploaded files live here (never persisted —
// localStorage can't hold video). After a reload only the metadata remains, and the
// editor asks the user to re-attach a file to preview it.
interface MediaState {
  urls: Record<string, { url: string; type: string }>;
  set: (assetId: string, url: string, type: string) => void;
  drop: (assetId: string) => void;
}
export const useMedia = create<MediaState>((set, get) => ({
  urls: {},
  set: (id, url, type) => {
    const prev = get().urls[id];
    if (prev) URL.revokeObjectURL(prev.url);
    set((s) => ({ urls: { ...s.urls, [id]: { url, type } } }));
  },
  drop: (id) => {
    const prev = get().urls[id];
    if (prev) URL.revokeObjectURL(prev.url);
    set((s) => {
      const next = { ...s.urls };
      delete next[id];
      return { urls: next };
    });
  },
}));

// Reads duration (and frame size for video) through a hidden media element's loadedmetadata.
export function readMediaMeta(url: string, kind: "video" | "audio"): Promise<{ durationSec?: number; width?: number; height?: number }> {
  return new Promise((resolve) => {
    const el = document.createElement(kind);
    el.preload = "metadata";
    el.muted = true;
    const done = (v: { durationSec?: number; width?: number; height?: number }) => {
      el.removeAttribute("src");
      el.load();
      resolve(v);
    };
    const timer = window.setTimeout(() => done({}), 8000);
    el.onloadedmetadata = () => {
      window.clearTimeout(timer);
      const d = Number.isFinite(el.duration) ? Math.round(el.duration * 10) / 10 : undefined;
      const v = el as HTMLVideoElement;
      done({ durationSec: d, width: kind === "video" ? v.videoWidth : undefined, height: kind === "video" ? v.videoHeight : undefined });
    };
    el.onerror = () => {
      window.clearTimeout(timer);
      done({});
    };
    el.src = url;
  });
}

export const isTextFile = (f: File) => /^text\//.test(f.type) || /\.(txt|srt|vtt|md|markdown|csv)$/i.test(f.name);

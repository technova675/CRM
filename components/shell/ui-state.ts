"use client";

import { create } from "zustand";

interface UIState {
  assistantOpen: boolean;
  assistantPrompt?: string;
  paletteOpen: boolean;
  mobileNav: boolean;
  openAssistant: (prompt?: string) => void;
  setAssistant: (v: boolean) => void;
  setPalette: (v: boolean) => void;
  setMobileNav: (v: boolean) => void;
}

export const useUI = create<UIState>((set) => ({
  assistantOpen: false,
  paletteOpen: false,
  mobileNav: false,
  openAssistant: (prompt) => set({ assistantOpen: true, assistantPrompt: prompt }),
  setAssistant: (v) => set({ assistantOpen: v, assistantPrompt: undefined }),
  setPalette: (v) => set({ paletteOpen: v }),
  setMobileNav: (v) => set({ mobileNav: v }),
}));

"use client";

import { useMemo } from "react";
import { useCRM } from "@/lib/store";
import type { Client } from "@/lib/types";
import { clientHealth, type HealthData } from "@/lib/ai/client-success";

// Selects raw slices (Zustand v5 safe) and derives health with useMemo.
export function useHealthData(): HealthData {
  const campaigns = useCRM((s) => s.campaigns);
  const invoices = useCRM((s) => s.invoices);
  const tasks = useCRM((s) => s.tasks);
  const conversations = useCRM((s) => s.conversations);
  const messages = useCRM((s) => s.messages);
  return useMemo(() => ({ campaigns, invoices, tasks, conversations, messages }), [campaigns, invoices, tasks, conversations, messages]);
}

export function useClientHealth(client: Client | undefined) {
  const data = useHealthData();
  return useMemo(() => (client ? clientHealth(client, data) : null), [client, data]);
}

"use client";

import { Suspense } from "react";
import { PerformanceView } from "@/components/performance/PerformanceView";

export default function PerformancePage() {
  return (
    <Suspense>
      <PerformanceView />
    </Suspense>
  );
}

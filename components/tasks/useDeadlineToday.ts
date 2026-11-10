"use client";

import { useEffect, useState } from "react";
import { deadlineDay } from "@/lib/domain/projectTasks";

export function useDeadlineToday() {
  const [today, setToday] = useState(() => deadlineDay(Date.now()));
  useEffect(() => {
    const update = () => setToday(deadlineDay(Date.now()));
    const timer = setInterval(update, 60000);
    window.addEventListener("focus",update);
    return () => { clearInterval(timer);window.removeEventListener("focus",update); };
  }, []);
  return today;
}

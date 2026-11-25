"use client";

import { useEffect, useState } from "react";

/**
 * Current time, re-rendered every `intervalMs` so "5m ago" labels stay correct.
 * Null until mounted: reading the clock during prerender would freeze it into the static shell.
 */
export function useNow(intervalMs = 15_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}

"use client";

import { useEffect, useState } from "react";

// Presence must expire even when no further database updates arrive.
export function useCurrentTime() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

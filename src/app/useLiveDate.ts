import { useEffect, useState } from "react";

export const LIVE_DATE_INTERVAL_MS = 60_000;

export const useLiveDate = (frozenDate?: Date, intervalMs = LIVE_DATE_INTERVAL_MS) => {
  // A stable "now" that only advances on a slow tick. Calling `new Date()`
  // directly in render hands back a fresh object every render, which rebuilds
  // derived week state and can churn downstream callbacks mid-interaction.
  const [liveDate, setLiveDate] = useState(() => new Date());

  useEffect(() => {
    if (frozenDate) {
      return undefined;
    }

    const id = window.setInterval(() => setLiveDate(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [frozenDate, intervalMs]);

  return frozenDate ?? liveDate;
};

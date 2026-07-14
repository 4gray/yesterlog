import { useCallback, useState } from "react";

const DOCK_OPEN_STORAGE_KEY = "timebro-active-dock";
const DOCK_INITIAL_SHOWN = 6;
const DOCK_PAGE_SIZE = 4;

const readDockOpen = () => {
  try {
    const stored = localStorage.getItem(DOCK_OPEN_STORAGE_KEY);
    return stored == null ? true : stored === "1";
  } catch {
    return true;
  }
};

/** Shared collapse preference and paging for every view that hosts the active-work dock. */
export const useActiveWorkDock = (ticketCount: number) => {
  const [open, setOpen] = useState(readDockOpen);
  const [shownCount, setShownCount] = useState(DOCK_INITIAL_SHOWN);

  const toggleOpen = useCallback(() => {
    setOpen((current) => {
      const next = !current;
      try {
        localStorage.setItem(DOCK_OPEN_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore unavailable storage */
      }
      return next;
    });
  }, []);

  const loadMore = useCallback(
    () => setShownCount((current) => Math.min(ticketCount, current + DOCK_PAGE_SIZE)),
    [ticketCount]
  );

  return { open, shownCount, toggleOpen, loadMore };
};

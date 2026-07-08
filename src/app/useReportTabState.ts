import { useCallback, useState } from "react";
import { REPORT_TABS, type ReportTab } from "../components/Sidebar";

const STORAGE_KEY = "timebro.reportTab";
const VALID_TABS = REPORT_TABS.map((tab) => tab.id);

const isReportTab = (value: string | null): value is ReportTab =>
  Boolean(value && VALID_TABS.includes(value as ReportTab));

const readStored = (): ReportTab | undefined => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isReportTab(stored) ? stored : undefined;
  } catch {
    return undefined;
  }
};

interface UseReportTabStateOptions {
  /** Explicit starting tab (e.g. from a demo deep-link). Wins over storage. */
  initialTab?: ReportTab;
  /** Persist the last-selected tab across sessions (disabled in demo mode). */
  persist?: boolean;
}

/**
 * Remembers the last-selected Reports sub-page, mirroring how the app persists
 * other lightweight UI prefs. Selecting REPORTS keeps whatever tab was last open.
 */
export const useReportTabState = ({ initialTab, persist = true }: UseReportTabStateOptions = {}) => {
  const [reportTab, setReportTabState] = useState<ReportTab>(() => initialTab ?? readStored() ?? "summary");

  const setReportTab = useCallback(
    (tab: ReportTab) => {
      setReportTabState(tab);
      if (persist) {
        try {
          window.localStorage.setItem(STORAGE_KEY, tab);
        } catch {
          /* storage unavailable — keep the in-memory value */
        }
      }
    },
    [persist]
  );

  return { reportTab, setReportTab };
};

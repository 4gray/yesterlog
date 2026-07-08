import { useEffect, useState } from "react";
import type {
  AppSettings,
  RecurringEvent,
  RecurringOccurrence,
  SyncResult,
  WeekOverride,
  WeekState
} from "../../shared/types";
import { buildWeekState } from "../domain/week";
import {
  getPersonalNotes,
  getRecurringOccurrences,
  getSyncResult,
  getWeekOverride
} from "../storage/db";
import { addDays, fromLocalDateKey, toLocalDateKey } from "../utils/date";
import type { MonthStateStorageClient } from "./useMonthState";

/** Weeks of history before the visible one — 12 total including it. */
const DEFAULT_WEEKS_BACK = 11;

const defaultStorage: MonthStateStorageClient = {
  getWeekOverride,
  getSyncResult,
  getPersonalNotes,
  getRecurringOccurrences
};

interface UseReportsHistoryOptions {
  isReportsView: boolean;
  isBooting: boolean;
  currentDate: Date;
  settings: AppSettings;
  visibleWeekState: WeekState;
  recurringEvents: RecurringEvent[];
  recurringOccurrences: RecurringOccurrence[];
  weeksBack?: number;
  demoWeekStart?: Date;
  demoWeekOverride?: WeekOverride;
  demoSyncResult?: SyncResult;
  storage?: MonthStateStorageClient;
  onError: (message: string) => void;
}

/**
 * Builds the trailing window of {@link WeekState}s ending at the visible Reports
 * week, mirroring {@link useMonthState}: the visible week is reused as-is and the
 * preceding weeks are rebuilt from their persisted (or demo) per-week data. Only
 * runs while the Reports view is active so other views don't pay the load cost.
 */
export const useReportsHistory = ({
  isReportsView,
  isBooting,
  currentDate,
  settings,
  visibleWeekState,
  recurringEvents,
  recurringOccurrences,
  weeksBack = DEFAULT_WEEKS_BACK,
  demoWeekStart,
  demoWeekOverride,
  demoSyncResult,
  storage = defaultStorage,
  onError
}: UseReportsHistoryOptions): WeekState[] | undefined => {
  const [weekStates, setWeekStates] = useState<WeekState[] | undefined>();

  useEffect(() => {
    if (!isReportsView || isBooting) {
      return;
    }

    let isMounted = true;

    const load = async () => {
      const visibleStart = fromLocalDateKey(visibleWeekState.weekKey);
      const starts: Date[] = [];
      for (let offset = weeksBack; offset >= 0; offset -= 1) {
        starts.push(addDays(visibleStart, -7 * offset));
      }
      const demoWeekKey = demoWeekStart ? toLocalDateKey(demoWeekStart) : undefined;

      const built = await Promise.all(
        starts.map(async (start) => {
          const weekKey = toLocalDateKey(start);
          if (weekKey === visibleWeekState.weekKey) {
            return visibleWeekState;
          }

          if (demoWeekKey && demoWeekOverride) {
            const isDemoWeek = weekKey === demoWeekKey;
            return buildWeekState(
              start,
              settings,
              isDemoWeek ? demoWeekOverride : { weekKey, skippedDates: [] },
              isDemoWeek ? demoSyncResult : undefined,
              [],
              currentDate,
              recurringEvents,
              isDemoWeek ? recurringOccurrences : []
            );
          }

          const [storedOverride, storedSyncResult, storedPersonalNotes, storedRecurringOccurrences] =
            await Promise.all([
              storage.getWeekOverride(weekKey),
              storage.getSyncResult(weekKey),
              storage.getPersonalNotes(weekKey),
              storage.getRecurringOccurrences(weekKey)
            ]);
          return buildWeekState(
            start,
            settings,
            storedOverride,
            storedSyncResult,
            storedPersonalNotes,
            currentDate,
            recurringEvents,
            storedRecurringOccurrences
          );
        })
      );

      if (isMounted) {
        setWeekStates(built);
      }
    };

    load().catch((error) => {
      console.error(error);
      if (isMounted) {
        onError("Unable to load reporting history.");
      }
    });

    return () => {
      isMounted = false;
    };
  }, [
    currentDate,
    demoSyncResult,
    demoWeekOverride,
    demoWeekStart,
    isBooting,
    isReportsView,
    onError,
    recurringEvents,
    recurringOccurrences,
    settings,
    storage,
    visibleWeekState,
    weeksBack
  ]);

  // Only expose the window once it actually contains the visible week. The load
  // is async, so right after navigating weeks `weekStates` still holds the prior
  // window (ending at the old week); handing that to the reports would compare
  // against the wrong week until the rebuild lands. Gating on the key keeps the
  // consumers on a consistent "building" state instead of a mismatched window.
  return weekStates?.some((week) => week.weekKey === visibleWeekState.weekKey) ? weekStates : undefined;
};

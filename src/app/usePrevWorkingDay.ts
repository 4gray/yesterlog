import { useEffect, useState } from "react";
import type {
  AppSettings,
  DayTrackingSummary,
  RecurringEvent,
  RecurringOccurrence,
  SyncResult,
  WeekOverride,
  WeekState,
  WorklogAllocationPreference
} from "../../shared/types";
import { buildWeekState } from "../domain/week";
import { projectWorklogsForWeek } from "../domain/worklogAllocation";
import { getPersonalNotes, getRecurringOccurrences, getSyncResult, getWeekOverride } from "../storage/db";
import { addDays, fromLocalDateKey, toLocalDateKey } from "../utils/date";
import type { MonthStateStorageClient } from "./useMonthState";

const EMPTY_ALLOCATION_PREFERENCES: WorklogAllocationPreference[] = [];
const EMPTY_SKIPPED_DATES: string[] = [];

const defaultStorage: MonthStateStorageClient = {
  getWeekOverride,
  getSyncResult,
  getPersonalNotes,
  getRecurringOccurrences
};

interface UsePrevWorkingDayOptions {
  isTodayView: boolean;
  isBooting: boolean;
  currentDate: Date;
  settings: AppSettings;
  /** The visible (current) week — also the source for the in-week check. */
  visibleWeekState: WeekState;
  recurringEvents: RecurringEvent[];
  recurringOccurrences: RecurringOccurrence[];
  allocationSkippedDates?: string[];
  worklogAllocationPreferences?: WorklogAllocationPreference[];
  demoWeekStart?: Date;
  demoWeekOverride?: WeekOverride;
  demoSyncResult?: SyncResult;
  storage?: MonthStateStorageClient;
  onError: (message: string) => void;
}

/** The last configured, non-skipped working day of a resolved week. */
const lastWorkingDay = (week: WeekState): DayTrackingSummary | undefined => {
  const working = week.days.filter((day) => day.isConfiguredWorkingDay && !day.isSkipped);
  return working[working.length - 1];
};

/**
 * Resolves the previous working day when it falls in the *prior* week — i.e.
 * today is the visible week's first active working day (the Monday → last-Friday
 * case, including a Monday spent on vacation). The cheap in-week case is handled
 * in {@link buildIssueMetadata}; this hook only loads when no earlier active
 * working day exists in the visible week, and only on the Today view — mirroring
 * {@link useReportsHistory} / {@link useMonthState}'s load pattern (visible week
 * reused, prior week rebuilt from persisted or demo per-week data).
 */
export const usePrevWorkingDay = ({
  isTodayView,
  isBooting,
  currentDate,
  settings,
  visibleWeekState,
  recurringEvents,
  recurringOccurrences,
  allocationSkippedDates = EMPTY_SKIPPED_DATES,
  worklogAllocationPreferences = EMPTY_ALLOCATION_PREFERENCES,
  demoWeekStart,
  demoWeekOverride,
  demoSyncResult,
  storage = defaultStorage,
  onError
}: UsePrevWorkingDayOptions): DayTrackingSummary | undefined => {
  const [prevDay, setPrevDay] = useState<DayTrackingSummary | undefined>();

  const todayKey = toLocalDateKey(currentDate);
  // The prior week is only needed when no earlier active working day exists in
  // the visible week (today is its first working day, or earlier days were
  // skipped). Otherwise the in-week path already supplies the previous day.
  const needsCrossWeek = !visibleWeekState.days.some(
    (day) => day.isConfiguredWorkingDay && !day.isSkipped && day.dateKey < todayKey
  );

  useEffect(() => {
    if (!isTodayView || isBooting || !needsCrossWeek) {
      // Clear any stale cross-week value (e.g. after a Monday → Tuesday rollover).
      setPrevDay(undefined);
      return;
    }

    let isMounted = true;

    const load = async () => {
      const prevWeekStart = addDays(fromLocalDateKey(visibleWeekState.weekKey), -7);
      const weekKey = toLocalDateKey(prevWeekStart);
      const demoWeekKey = demoWeekStart ? toLocalDateKey(demoWeekStart) : undefined;

      let prevWeek: WeekState;
      if (demoWeekKey && demoWeekOverride) {
        const isDemoWeek = weekKey === demoWeekKey;
        prevWeek = buildWeekState(
          prevWeekStart,
          settings,
          isDemoWeek ? demoWeekOverride : { weekKey, skippedDates: [] },
          projectWorklogsForWeek(isDemoWeek ? demoSyncResult : undefined, {
            settings,
            skippedDates: allocationSkippedDates,
            preferences: worklogAllocationPreferences,
            now: currentDate
          }),
          [],
          currentDate,
          recurringEvents,
          isDemoWeek ? recurringOccurrences : []
        );
      } else {
        const [storedOverride, storedSyncResult, storedPersonalNotes, storedRecurringOccurrences] =
          await Promise.all([
            storage.getWeekOverride(weekKey),
            storage.getSyncResult(weekKey),
            storage.getPersonalNotes(weekKey),
            storage.getRecurringOccurrences(weekKey)
          ]);
        prevWeek = buildWeekState(
          prevWeekStart,
          settings,
          storedOverride,
          projectWorklogsForWeek(storedSyncResult, {
            settings,
            skippedDates: allocationSkippedDates,
            preferences: worklogAllocationPreferences,
            now: currentDate
          }),
          storedPersonalNotes,
          currentDate,
          recurringEvents,
          storedRecurringOccurrences
        );
      }

      if (isMounted) {
        setPrevDay(lastWorkingDay(prevWeek));
      }
    };

    load().catch((error) => {
      console.error(error);
      if (isMounted) {
        onError("Unable to load yesterday's recap.");
      }
    });

    return () => {
      isMounted = false;
    };
  }, [
    currentDate,
    allocationSkippedDates,
    demoSyncResult,
    demoWeekOverride,
    demoWeekStart,
    isBooting,
    isTodayView,
    needsCrossWeek,
    onError,
    recurringEvents,
    recurringOccurrences,
    settings,
    storage,
    visibleWeekState,
    worklogAllocationPreferences
  ]);

  return prevDay;
};

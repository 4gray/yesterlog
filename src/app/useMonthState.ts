import { useEffect, useState } from "react";
import type {
  AppSettings,
  PersonalNote,
  RecurringEvent,
  RecurringOccurrence,
  SyncResult,
  WeekOverride,
  WeekState,
  WorklogAllocationPreference
} from "../../shared/types";
import { buildMonthState, getMonthWeekStarts, type MonthState } from "../domain/month";
import { buildWeekState } from "../domain/week";
import { projectWorklogsForWeek } from "../domain/worklogAllocation";
import {
  getPersonalNotes,
  getRecurringOccurrences,
  getSyncResult,
  getWeekOverride
} from "../storage/db";
import { toLocalDateKey } from "../utils/date";

const EMPTY_ALLOCATION_PREFERENCES: WorklogAllocationPreference[] = [];
const EMPTY_SKIPPED_DATES: string[] = [];

export interface MonthStateStorageClient {
  getWeekOverride(weekKey: string): Promise<WeekOverride>;
  getSyncResult(weekKey: string): Promise<SyncResult | undefined>;
  getPersonalNotes(weekKey: string): Promise<PersonalNote[]>;
  getRecurringOccurrences(weekKey: string): Promise<RecurringOccurrence[]>;
}

interface UseMonthStateOptions {
  isMonthView: boolean;
  isBooting: boolean;
  monthAnchor: Date;
  currentDate: Date;
  settings: AppSettings;
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

const defaultStorage: MonthStateStorageClient = {
  getWeekOverride,
  getSyncResult,
  getPersonalNotes,
  getRecurringOccurrences
};

export const useMonthState = ({
  isMonthView,
  isBooting,
  monthAnchor,
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
}: UseMonthStateOptions) => {
  const [monthState, setMonthState] = useState<MonthState | undefined>();

  useEffect(() => {
    if (!isMonthView || isBooting) {
      return;
    }

    let isMounted = true;

    const loadMonth = async () => {
      const demoWeekKey = demoWeekStart ? toLocalDateKey(demoWeekStart) : undefined;
      const weekStarts = getMonthWeekStarts(monthAnchor);
      const weekStates = await Promise.all(
        weekStarts.map(async (start) => {
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
        })
      );

      if (!isMounted) {
        return;
      }

      setMonthState(buildMonthState(monthAnchor, currentDate, settings, weekStates));
    };

    loadMonth().catch((error) => {
      console.error(error);
      if (isMounted) {
        onError("Unable to load the selected month.");
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
    isMonthView,
    monthAnchor,
    onError,
    recurringEvents,
    recurringOccurrences,
    settings,
    storage,
    visibleWeekState,
    worklogAllocationPreferences
  ]);

  return monthState;
};

import { useMemo } from "react";
import type {
  AppSettings,
  PersonalNote,
  RecurringEvent,
  RecurringOccurrence,
  SyncResult,
  WeekOverride
} from "../../shared/types";
import { buildWeekState } from "../domain/week";

interface UseWeekStateOptions {
  weekStart: Date;
  settings: AppSettings;
  weekOverride: WeekOverride;
  syncResult?: SyncResult;
  personalNotes: PersonalNote[];
  currentDate: Date;
  recurringEvents: RecurringEvent[];
  recurringOccurrences: RecurringOccurrence[];
}

export const useWeekState = ({
  weekStart,
  settings,
  weekOverride,
  syncResult,
  personalNotes,
  currentDate,
  recurringEvents,
  recurringOccurrences
}: UseWeekStateOptions) =>
  useMemo(
    () =>
      buildWeekState(
        weekStart,
        settings,
        weekOverride,
        syncResult,
        personalNotes,
        currentDate,
        recurringEvents,
        recurringOccurrences
      ),
    [currentDate, personalNotes, recurringEvents, recurringOccurrences, settings, syncResult, weekOverride, weekStart]
  );

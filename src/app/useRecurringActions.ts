import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { RecurringEntry, RecurringEvent, RecurringOccurrence, WeekdayNumber } from "../../shared/types";
import { getRecurringCandidates, indexOccurrences } from "../domain/recurring";
import { getWeekBounds } from "../domain/week";
import {
  getRecurringOccurrences as getRecurringOccurrencesFromStorage,
  saveRecurringEvents as saveRecurringEventsToStorage,
  saveRecurringOccurrences as saveRecurringOccurrencesToStorage
} from "../storage/db";
import { formatClock, fromLocalDateKey, isoWeekday, toLocalDateKey } from "../utils/date";

export interface RecurringEventDraft {
  id?: string;
  title: string;
  daysOfWeek: WeekdayNumber[];
  localTime: string;
  durationMinutes: number;
  defaultNote: string;
}

export interface RecurringConfirmPayload {
  eventId: string;
  dateKey: string;
  timeSpentSeconds: number;
  note?: string;
}

export interface RecurringMovePatch {
  localTime: string;
  timeSpentSeconds: number;
}

interface UseRecurringActionsOptions {
  recurringEvents: RecurringEvent[];
  setRecurringEvents: Dispatch<SetStateAction<RecurringEvent[]>>;
  recurringOccurrences: RecurringOccurrence[];
  setRecurringOccurrences: Dispatch<SetStateAction<RecurringOccurrence[]>>;
  visibleWeekKey: string;
  isDemo: boolean;
  saveRecurringEvents?: (events: RecurringEvent[]) => Promise<void>;
  getRecurringOccurrences?: (weekKey: string) => Promise<RecurringOccurrence[]>;
  saveRecurringOccurrences?: (weekKey: string, occurrences: RecurringOccurrence[]) => Promise<void>;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

const getWeekKeyForDate = (dateKey: string) => toLocalDateKey(getWeekBounds(fromLocalDateKey(dateKey)).weekStart);

export const useRecurringActions = ({
  recurringEvents,
  setRecurringEvents,
  recurringOccurrences,
  setRecurringOccurrences,
  visibleWeekKey,
  isDemo,
  saveRecurringEvents = saveRecurringEventsToStorage,
  getRecurringOccurrences = getRecurringOccurrencesFromStorage,
  saveRecurringOccurrences = saveRecurringOccurrencesToStorage,
  showSuccess,
  showError
}: UseRecurringActionsOptions) => {
  const persistRecurringEvents = useCallback(
    async (next: RecurringEvent[]) => {
      setRecurringEvents(next);
      if (!isDemo) {
        await saveRecurringEvents(next);
      }
    },
    [isDemo, saveRecurringEvents, setRecurringEvents]
  );

  const handleSaveRecurringEvent = useCallback(
    async (draft: RecurringEventDraft) => {
      const title = draft.title.trim();
      if (!title || draft.daysOfWeek.length === 0) {
        return;
      }

      const now = new Date().toISOString();
      const next = draft.id
        ? recurringEvents.map((event) =>
            event.id === draft.id
              ? {
                  ...event,
                  title,
                  daysOfWeek: [...draft.daysOfWeek],
                  localTime: draft.localTime,
                  durationMinutes: draft.durationMinutes,
                  defaultNote: draft.defaultNote,
                  updatedAt: now
                }
              : event
          )
        : [
            ...recurringEvents,
            {
              id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              title,
              daysOfWeek: [...draft.daysOfWeek],
              localTime: draft.localTime,
              durationMinutes: draft.durationMinutes,
              defaultNote: draft.defaultNote,
              active: true,
              createdAt: now,
              updatedAt: now
            }
          ];

      try {
        await persistRecurringEvents(next);
        showSuccess(draft.id ? "Updated recurring event." : "Added recurring event.");
      } catch (error) {
        showError(error instanceof Error ? error.message : "Unable to save the recurring event.");
      }
    },
    [persistRecurringEvents, recurringEvents, showError, showSuccess]
  );

  const handleDeleteRecurringEvent = useCallback(
    async (id: string) => {
      const next = recurringEvents.filter((event) => event.id !== id);
      try {
        await persistRecurringEvents(next);
        showSuccess("Removed recurring event.");
      } catch (error) {
        showError(error instanceof Error ? error.message : "Unable to remove the recurring event.");
      }
    },
    [persistRecurringEvents, recurringEvents, showError, showSuccess]
  );

  const handleToggleRecurringEvent = useCallback(
    async (id: string) => {
      const now = new Date().toISOString();
      const next = recurringEvents.map((event) =>
        event.id === id ? { ...event, active: !event.active, updatedAt: now } : event
      );
      try {
        await persistRecurringEvents(next);
      } catch (error) {
        showError(error instanceof Error ? error.message : "Unable to update the recurring event.");
      }
    },
    [persistRecurringEvents, recurringEvents, showError]
  );

  const upsertRecurringOccurrence = useCallback(
    async (occurrence: RecurringOccurrence) => {
      const replace = (list: RecurringOccurrence[]) => [
        ...list.filter((item) => !(item.eventId === occurrence.eventId && item.dateKey === occurrence.dateKey)),
        occurrence
      ];

      if (isDemo) {
        setRecurringOccurrences((current) => replace(current));
        return true;
      }

      try {
        const current =
          occurrence.weekKey === visibleWeekKey
            ? recurringOccurrences
            : await getRecurringOccurrences(occurrence.weekKey);
        const next = replace(current);
        await saveRecurringOccurrences(occurrence.weekKey, next);
        if (occurrence.weekKey === visibleWeekKey) {
          setRecurringOccurrences(next);
        }
        return true;
      } catch (error) {
        showError(error instanceof Error ? error.message : "Unable to save the recurring entry locally.");
        return false;
      }
    },
    [
      getRecurringOccurrences,
      isDemo,
      recurringOccurrences,
      saveRecurringOccurrences,
      setRecurringOccurrences,
      showError,
      visibleWeekKey
    ]
  );

  const handleConfirmRecurring = useCallback(
    async (payload: RecurringConfirmPayload) => {
      const event = recurringEvents.find((candidate) => candidate.id === payload.eventId);
      const weekKey = getWeekKeyForDate(payload.dateKey);
      const existing = recurringOccurrences.find(
        (item) => item.eventId === payload.eventId && item.dateKey === payload.dateKey
      );
      const now = new Date().toISOString();
      const ok = await upsertRecurringOccurrence({
        eventId: payload.eventId,
        weekKey,
        dateKey: payload.dateKey,
        status: "confirmed",
        localTime: existing?.localTime,
        timeSpentSeconds: Math.round(payload.timeSpentSeconds),
        note: payload.note?.trim() || undefined,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      });
      if (ok) {
        showSuccess(`Logged ${formatClock(payload.timeSpentSeconds)} to ${event?.title ?? "recurring event"} locally.`);
      }
      return ok;
    },
    [recurringEvents, recurringOccurrences, showSuccess, upsertRecurringOccurrence]
  );

  const handleMoveRecurring = useCallback(
    async (entry: RecurringEntry, patch: RecurringMovePatch) => {
      const weekKey = getWeekKeyForDate(entry.dateKey);
      const existing = recurringOccurrences.find(
        (item) => item.eventId === entry.eventId && item.dateKey === entry.dateKey
      );
      const now = new Date().toISOString();
      return upsertRecurringOccurrence({
        ...existing,
        eventId: entry.eventId,
        weekKey,
        dateKey: entry.dateKey,
        status: "confirmed",
        localTime: patch.localTime,
        timeSpentSeconds: Math.max(60, Math.round(patch.timeSpentSeconds)),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      });
    },
    [recurringOccurrences, upsertRecurringOccurrence]
  );

  const handleSkipRecurring = useCallback(
    async (eventId: string, dateKey: string) => {
      const weekKey = getWeekKeyForDate(dateKey);
      const existing = recurringOccurrences.find((item) => item.eventId === eventId && item.dateKey === dateKey);
      const now = new Date().toISOString();
      return upsertRecurringOccurrence({
        eventId,
        weekKey,
        dateKey,
        status: "skipped",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      });
    },
    [recurringOccurrences, upsertRecurringOccurrence]
  );

  const handleDeleteRecurringOccurrence = useCallback(
    async (eventId: string, dateKey: string) => {
      const weekKey = getWeekKeyForDate(dateKey);
      const event = recurringEvents.find((candidate) => candidate.id === eventId);
      const remove = (list: RecurringOccurrence[]) =>
        list.filter((item) => !(item.eventId === eventId && item.dateKey === dateKey));

      if (isDemo) {
        setRecurringOccurrences((current) => remove(current));
        showSuccess(`Removed ${event?.title ?? "recurring entry"} — it's a suggestion again.`);
        return true;
      }

      try {
        const current = weekKey === visibleWeekKey ? recurringOccurrences : await getRecurringOccurrences(weekKey);
        const next = remove(current);
        await saveRecurringOccurrences(weekKey, next);
        if (weekKey === visibleWeekKey) {
          setRecurringOccurrences(next);
        }
        showSuccess(`Removed ${event?.title ?? "recurring entry"} — it's a suggestion again.`);
        return true;
      } catch (error) {
        showError(error instanceof Error ? error.message : "Unable to remove the recurring entry locally.");
        return false;
      }
    },
    [
      getRecurringOccurrences,
      isDemo,
      recurringEvents,
      recurringOccurrences,
      saveRecurringOccurrences,
      setRecurringOccurrences,
      showError,
      showSuccess,
      visibleWeekKey
    ]
  );

  const recurringCandidatesForDate = useCallback(
    (dateKey: string) => {
      const weekday = isoWeekday(fromLocalDateKey(dateKey)) as WeekdayNumber;
      return getRecurringCandidates(recurringEvents, indexOccurrences(recurringOccurrences), dateKey, weekday);
    },
    [recurringEvents, recurringOccurrences]
  );

  return {
    handleSaveRecurringEvent,
    handleDeleteRecurringEvent,
    handleToggleRecurringEvent,
    handleConfirmRecurring,
    handleMoveRecurring,
    handleSkipRecurring,
    handleDeleteRecurringOccurrence,
    recurringCandidatesForDate
  };
};

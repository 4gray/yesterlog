import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
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

const replaceOccurrence = (list: RecurringOccurrence[], occurrence: RecurringOccurrence) => [
  ...list.filter((item) => !(item.eventId === occurrence.eventId && item.dateKey === occurrence.dateKey)),
  occurrence
];

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
  const visibleWeekStateRef = useRef({ weekKey: visibleWeekKey, occurrences: recurringOccurrences });
  const occurrenceWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  visibleWeekStateRef.current = { weekKey: visibleWeekKey, occurrences: recurringOccurrences };

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

  const mutateRecurringOccurrences = useCallback(
    (
      weekKey: string,
      mutate: (current: RecurringOccurrence[]) => RecurringOccurrence[],
      failureMessage = "Unable to save the recurring entry locally."
    ): Promise<boolean> => {
      if (isDemo) {
        setRecurringOccurrences((current) => {
          const next = mutate(current);
          if (weekKey === visibleWeekStateRef.current.weekKey) {
            visibleWeekStateRef.current = { weekKey, occurrences: next };
          }
          return next;
        });
        return Promise.resolve(true);
      }

      const persist = async () => {
        try {
          const visibleAtStart = visibleWeekStateRef.current;
          const current =
            weekKey === visibleAtStart.weekKey
              ? visibleAtStart.occurrences
              : await getRecurringOccurrences(weekKey);
          const next = mutate(current);
          await saveRecurringOccurrences(weekKey, next);
          if (weekKey === visibleWeekStateRef.current.weekKey) {
            visibleWeekStateRef.current = { weekKey, occurrences: next };
            setRecurringOccurrences(next);
          }
          return true;
        } catch (error) {
          showError(error instanceof Error ? error.message : failureMessage);
          return false;
        }
      };

      const result = occurrenceWriteQueueRef.current.then(persist);
      occurrenceWriteQueueRef.current = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    },
    [
      getRecurringOccurrences,
      isDemo,
      saveRecurringOccurrences,
      setRecurringOccurrences,
      showError
    ]
  );

  const handleConfirmRecurring = useCallback(
    async (payload: RecurringConfirmPayload) => {
      const event = recurringEvents.find((candidate) => candidate.id === payload.eventId);
      const weekKey = getWeekKeyForDate(payload.dateKey);
      const now = new Date().toISOString();
      const ok = await mutateRecurringOccurrences(weekKey, (current) => {
        const existing = current.find(
          (item) => item.eventId === payload.eventId && item.dateKey === payload.dateKey
        );
        return replaceOccurrence(current, {
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
      });
      if (ok) {
        showSuccess(`Logged ${formatClock(payload.timeSpentSeconds)} to ${event?.title ?? "recurring event"} locally.`);
      }
      return ok;
    },
    [mutateRecurringOccurrences, recurringEvents, showSuccess]
  );

  const handleMoveRecurring = useCallback(
    async (entry: RecurringEntry, patch: RecurringMovePatch) => {
      const weekKey = getWeekKeyForDate(entry.dateKey);
      const now = new Date().toISOString();
      return mutateRecurringOccurrences(weekKey, (current) => {
        const existing = current.find((item) => item.eventId === entry.eventId && item.dateKey === entry.dateKey);
        return replaceOccurrence(current, {
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
      });
    },
    [mutateRecurringOccurrences]
  );

  const handleSkipRecurring = useCallback(
    async (eventId: string, dateKey: string) => {
      const weekKey = getWeekKeyForDate(dateKey);
      const now = new Date().toISOString();
      return mutateRecurringOccurrences(weekKey, (current) => {
        const existing = current.find((item) => item.eventId === eventId && item.dateKey === dateKey);
        return replaceOccurrence(current, {
          eventId,
          weekKey,
          dateKey,
          status: "skipped",
          createdAt: existing?.createdAt ?? now,
          updatedAt: now
        });
      });
    },
    [mutateRecurringOccurrences]
  );

  const handleDeleteRecurringOccurrence = useCallback(
    async (eventId: string, dateKey: string) => {
      const weekKey = getWeekKeyForDate(dateKey);
      const event = recurringEvents.find((candidate) => candidate.id === eventId);
      const remove = (list: RecurringOccurrence[]) =>
        list.filter((item) => !(item.eventId === eventId && item.dateKey === dateKey));

      const ok = await mutateRecurringOccurrences(
        weekKey,
        remove,
        "Unable to remove the recurring entry locally."
      );
      if (ok) {
        showSuccess(`Removed ${event?.title ?? "recurring entry"} — it's a suggestion again.`);
      }
      return ok;
    },
    [mutateRecurringOccurrences, recurringEvents, showSuccess]
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

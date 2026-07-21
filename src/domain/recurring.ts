import type {
  PendingRecurringOccurrence,
  RecurringEntry,
  RecurringEvent,
  RecurringOccurrence,
  WeekdayNumber
} from "../../shared/types";

/**
 * Seeded the first time a user opens the recurring settings — mirrors the
 * prototype's defaults so the feature is discoverable rather than empty.
 */
export const DEFAULT_RECURRING_EVENTS: Omit<RecurringEvent, "createdAt" | "updatedAt">[] = [
  {
    id: "rec-daily",
    title: "Daily Standup",
    daysOfWeek: [1, 2, 3, 4, 5],
    localTime: "09:15",
    durationMinutes: 15,
    defaultNote: "Daily sync — blockers & plan for the day",
    active: true
  },
  {
    id: "rec-plan",
    title: "Sprint Planning",
    daysOfWeek: [1],
    localTime: "10:00",
    durationMinutes: 60,
    defaultNote: "Planned sprint scope & estimates",
    active: true
  },
  {
    id: "rec-refine",
    title: "Backlog Refinement",
    daysOfWeek: [3],
    localTime: "14:00",
    durationMinutes: 45,
    defaultNote: "Refined upcoming stories with PM",
    active: true
  },
  {
    id: "rec-sync",
    title: "Weekly Team Sync",
    daysOfWeek: [4],
    localTime: "15:00",
    durationMinutes: 30,
    defaultNote: "Team weekly — demos & announcements",
    active: true
  }
];

export const buildDefaultRecurringEvents = (now = new Date().toISOString()): RecurringEvent[] =>
  DEFAULT_RECURRING_EVENTS.map((event) => ({
    ...event,
    daysOfWeek: [...event.daysOfWeek],
    createdAt: now,
    updatedAt: now
  }));

/** Stable key identifying a single occurrence of an event on a given date. */
export const occurrenceKey = (eventId: string, dateKey: string) => `${eventId}|${dateKey}`;

export const eventOccursOnWeekday = (event: RecurringEvent, weekday: WeekdayNumber) =>
  event.active && event.daysOfWeek.includes(weekday);

export const indexOccurrences = (occurrences: RecurringOccurrence[]) => {
  const map = new Map<string, RecurringOccurrence>();
  for (const occurrence of occurrences) {
    map.set(occurrenceKey(occurrence.eventId, occurrence.dateKey), occurrence);
  }
  return map;
};

export interface DayRecurring {
  entries: RecurringEntry[];
  pending: PendingRecurringOccurrence[];
  confirmedSeconds: number;
}

/**
 * Resolves a single day's recurring events against stored occurrences.
 *
 * - Confirmed occurrences become {@link RecurringEntry}s and contribute their
 *   seconds to local tracked time.
 * - Skipped occurrences are dropped silently.
 * - Unresolved events on a working day up to and including today surface as
 *   pending suggestions; future days never prompt.
 */
export const buildDayRecurring = (
  events: RecurringEvent[],
  occurrencesByKey: Map<string, RecurringOccurrence>,
  dateKey: string,
  weekday: WeekdayNumber,
  options: { isWorkingDay: boolean; isPastOrToday: boolean }
): DayRecurring => {
  const entries: RecurringEntry[] = [];
  const pending: PendingRecurringOccurrence[] = [];
  let confirmedSeconds = 0;

  for (const event of events) {
    if (!eventOccursOnWeekday(event, weekday)) {
      continue;
    }

    const occurrence = occurrencesByKey.get(occurrenceKey(event.id, dateKey));

    if (occurrence?.status === "confirmed") {
      const timeSpentSeconds = occurrence.timeSpentSeconds ?? event.durationMinutes * 60;
      const note = occurrence.note ?? event.defaultNote;
      confirmedSeconds += timeSpentSeconds;
      entries.push({
        eventId: event.id,
        dateKey,
        title: event.title,
        localTime: occurrence.localTime ?? event.localTime,
        timeSpentSeconds,
        note: note?.trim() ? note : undefined
      });
      continue;
    }

    if (occurrence?.status === "skipped") {
      continue;
    }

    if (options.isWorkingDay && options.isPastOrToday) {
      pending.push({
        eventId: event.id,
        dateKey,
        title: event.title,
        localTime: event.localTime,
        defaultDurationMinutes: event.durationMinutes,
        defaultNote: event.defaultNote
      });
    }
  }

  entries.sort((a, b) => a.localTime.localeCompare(b.localTime));
  pending.sort((a, b) => a.localTime.localeCompare(b.localTime));

  return { entries, pending, confirmedSeconds };
};

/** Candidate events for the Add Time "Recurring" tab on a given day. */
export const getRecurringCandidates = (
  events: RecurringEvent[],
  occurrencesByKey: Map<string, RecurringOccurrence>,
  dateKey: string,
  weekday: WeekdayNumber
) =>
  events.filter((event) => {
    if (!eventOccursOnWeekday(event, weekday)) {
      return false;
    }
    const occurrence = occurrencesByKey.get(occurrenceKey(event.id, dateKey));
    return occurrence?.status !== "confirmed";
  });

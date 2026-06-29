import type {
  AppSettings,
  PersonalNote,
  RecurringEvent,
  RecurringOccurrence,
  SyncResult,
  WeekOverride,
  WeekState,
  WeekdayNumber
} from "../../shared/types";
import { DEFAULT_WORKING_DAYS, normalizeWorkingDays } from "../../shared/weekdays";
import {
  addDays,
  formatShortDate,
  formatWeekRange,
  isoWeekday,
  startOfWeekMonday,
  toLocalDateKey,
  WEEKDAY_LABELS
} from "../utils/date";
import { buildDayRecurring, indexOccurrences } from "./recurring";

export const DEFAULT_SETTINGS: AppSettings = {
  jiraBaseUrl: "",
  jiraEmail: "",
  jiraApiToken: "",
  bitbucketEmail: "",
  bitbucketApiToken: "",
  bitbucketWorkspace: "",
  bitbucketRepositories: "",
  bitbucketReviewBucketIssueKey: "",
  weeklyTargetHours: 40,
  workingDays: [...DEFAULT_WORKING_DAYS],
  reminderTime: "16:30",
  remindersEnabled: true,
  aiEnabled: false,
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "llama3.1:8b"
};

export const getWeekBounds = (input: Date) => {
  const weekStart = startOfWeekMonday(input);
  const weekEndExclusive = addDays(weekStart, 7);

  return {
    weekStart,
    weekEndExclusive,
    weekKey: toLocalDateKey(weekStart)
  };
};

export const buildWeekState = (
  weekStart: Date,
  settings: AppSettings,
  override: WeekOverride,
  syncResult?: SyncResult,
  personalNotesOrToday: PersonalNote[] | Date = [],
  todayArg = new Date(),
  recurringEvents: RecurringEvent[] = [],
  recurringOccurrences: RecurringOccurrence[] = []
): WeekState => {
  const personalNotes = Array.isArray(personalNotesOrToday) ? personalNotesOrToday : [];
  const today = Array.isArray(personalNotesOrToday) ? todayArg : personalNotesOrToday;
  const weekEndExclusive = addDays(weekStart, 7);
  const weekKey = toLocalDateKey(weekStart);
  const todayKey = toLocalDateKey(today);
  const occurrencesByKey = indexOccurrences(recurringOccurrences);
  const skippedDates = override.weekKey === weekKey ? override.skippedDates : [];
  const effectiveSyncResult = syncResult?.weekKey === weekKey ? syncResult : undefined;
  const configuredWorkingDays = normalizeWorkingDays(settings.workingDays);
  const workDates = configuredWorkingDays.map((weekday) => addDays(weekStart, weekday - 1));
  const notesByDate = personalNotes.reduce<Record<string, PersonalNote[]>>((notes, note) => {
    if (!notes[note.dateKey]) {
      notes[note.dateKey] = [];
    }
    notes[note.dateKey].push(note);
    return notes;
  }, {});
  const configuredWorkingDayCount = configuredWorkingDays.length;
  const dailyTargetHours = settings.weeklyTargetHours / configuredWorkingDayCount;
  const activeWorkingDates = workDates
    .filter((date) => {
      const weekday = isoWeekday(date) as WeekdayNumber;
      return configuredWorkingDays.includes(weekday) && !skippedDates.includes(toLocalDateKey(date));
    })
    .map(toLocalDateKey);
  const weeklyTargetHours = dailyTargetHours * activeWorkingDates.length;

  let recurringConfirmedSeconds = 0;

  const days = workDates.map((date) => {
    const dateKey = toLocalDateKey(date);
    const weekday = isoWeekday(date) as WeekdayNumber;
    const isConfiguredWorkingDay = configuredWorkingDays.includes(weekday);
    const isSkipped = skippedDates.includes(dateKey);
    const targetHours = isConfiguredWorkingDay && !isSkipped ? dailyTargetHours : 0;
    const bucket = effectiveSyncResult?.daySummaries[dateKey];
    const dayNotes = [...(notesByDate[dateKey] ?? [])].sort(
      (a, b) => new Date(a.startedISO).getTime() - new Date(b.startedISO).getTime()
    );
    const noteSeconds = dayNotes.reduce((sum, note) => sum + note.timeSpentSeconds, 0);
    const recurring = buildDayRecurring(recurringEvents, occurrencesByKey, dateKey, weekday, {
      isWorkingDay: isConfiguredWorkingDay && !isSkipped,
      isPastOrToday: dateKey <= todayKey
    });
    recurringConfirmedSeconds += recurring.confirmedSeconds;
    const trackedHours = ((bucket?.trackedSeconds ?? 0) + noteSeconds + recurring.confirmedSeconds) / 3600;

    return {
      dateKey,
      dateLabel: formatShortDate(date),
      weekdayName: WEEKDAY_LABELS[weekday - 1],
      isToday: dateKey === todayKey,
      isConfiguredWorkingDay,
      isSkipped,
      targetHours,
      trackedHours,
      missingHours: Math.max(targetHours - trackedHours, 0),
      issues: bucket?.issues ?? [],
      personalNotes: dayNotes,
      recurringEntries: recurring.entries,
      pendingRecurring: recurring.pending
    };
  });

  const jiraTrackedWeekHours =
    days.reduce((sum, day) => sum + (effectiveSyncResult?.daySummaries[day.dateKey]?.trackedSeconds ?? 0), 0) / 3600;
  const personalNoteHours = days.reduce(
    (sum, day) => sum + day.personalNotes.reduce((daySum, note) => daySum + note.timeSpentSeconds / 3600, 0),
    0
  );
  const recurringTrackedHours = recurringConfirmedSeconds / 3600;
  const trackedWeekHours = days.reduce((sum, day) => sum + day.trackedHours, 0);

  return {
    weekKey,
    weekStartISO: weekStart.toISOString(),
    weekEndExclusiveISO: weekEndExclusive.toISOString(),
    weekRangeLabel: formatWeekRange(weekStart),
    weeklyTargetHours,
    trackedWeekHours,
    jiraTrackedWeekHours,
    personalNoteHours,
    remainingWeekHours: Math.max(weeklyTargetHours - trackedWeekHours, 0),
    dailyTargetHours: activeWorkingDates.length > 0 ? dailyTargetHours : 0,
    activeWorkingDates,
    skippedDates,
    days,
    recurringTrackedHours
  };
};

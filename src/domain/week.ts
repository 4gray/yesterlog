import type { AppSettings, PersonalNote, SyncResult, WeekOverride, WeekState, WeekdayNumber } from "../../shared/types";
import {
  addDays,
  formatShortDate,
  formatWeekRange,
  isoWeekday,
  startOfWeekMonday,
  toLocalDateKey,
  WEEKDAY_LABELS
} from "../utils/date";

export const DEFAULT_SETTINGS: AppSettings = {
  jiraBaseUrl: "",
  jiraEmail: "",
  jiraApiToken: "",
  weeklyTargetHours: 40,
  workingDays: [1, 2, 3, 4, 5],
  reminderTime: "16:30",
  remindersEnabled: true
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
  todayArg = new Date()
): WeekState => {
  const personalNotes = Array.isArray(personalNotesOrToday) ? personalNotesOrToday : [];
  const today = Array.isArray(personalNotesOrToday) ? todayArg : personalNotesOrToday;
  const weekEndExclusive = addDays(weekStart, 7);
  const weekKey = toLocalDateKey(weekStart);
  const todayKey = toLocalDateKey(today);
  const skippedDates = override.skippedDates;
  const workDates = Array.from({ length: 5 }, (_value, index) => addDays(weekStart, index));
  const notesByDate = personalNotes.reduce<Record<string, PersonalNote[]>>((notes, note) => {
    if (!notes[note.dateKey]) {
      notes[note.dateKey] = [];
    }
    notes[note.dateKey].push(note);
    return notes;
  }, {});
  const configuredWorkingDayCount = Math.max(settings.workingDays.length, 1);
  const dailyTargetHours = settings.weeklyTargetHours / configuredWorkingDayCount;
  const activeWorkingDates = workDates
    .filter((date) => {
      const weekday = isoWeekday(date) as WeekdayNumber;
      return settings.workingDays.includes(weekday) && !skippedDates.includes(toLocalDateKey(date));
    })
    .map(toLocalDateKey);
  const weeklyTargetHours = dailyTargetHours * activeWorkingDates.length;

  const days = workDates.map((date, index) => {
    const dateKey = toLocalDateKey(date);
    const weekday = isoWeekday(date) as WeekdayNumber;
    const isConfiguredWorkingDay = settings.workingDays.includes(weekday);
    const isSkipped = skippedDates.includes(dateKey);
    const targetHours = isConfiguredWorkingDay && !isSkipped ? dailyTargetHours : 0;
    const bucket = syncResult?.daySummaries[dateKey];
    const dayNotes = [...(notesByDate[dateKey] ?? [])].sort(
      (a, b) => new Date(a.startedISO).getTime() - new Date(b.startedISO).getTime()
    );
    const noteSeconds = dayNotes.reduce((sum, note) => sum + note.timeSpentSeconds, 0);
    const trackedHours = ((bucket?.trackedSeconds ?? 0) + noteSeconds) / 3600;

    return {
      dateKey,
      dateLabel: formatShortDate(date),
      weekdayName: WEEKDAY_LABELS[index],
      isToday: dateKey === todayKey,
      isConfiguredWorkingDay,
      isSkipped,
      targetHours,
      trackedHours,
      missingHours: Math.max(targetHours - trackedHours, 0),
      issues: bucket?.issues ?? [],
      personalNotes: dayNotes
    };
  });

  const jiraTrackedWeekHours = (syncResult?.trackedSeconds ?? 0) / 3600;
  const personalNoteHours = personalNotes.reduce((sum, note) => sum + note.timeSpentSeconds / 3600, 0);
  const trackedWeekHours = jiraTrackedWeekHours + personalNoteHours;

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
    days
  };
};

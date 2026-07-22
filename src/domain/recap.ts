import type { DayTrackingSummary, WeekdayNumber } from "../../shared/types";
import { normalizeWorkingDays } from "../../shared/weekdays";
import {
  SHORT_WEEKDAY_LABELS,
  WEEKDAY_LABELS,
  addDays,
  formatShortDate,
  fromLocalDateKey,
  isoWeekday,
  toLocalDateKey
} from "../utils/date";
import { ACTIVITY_CATEGORIES, type ActivityKey, dayActivitySeconds } from "./activity";
import { formatReconDuration } from "./reconstruct";

/**
 * "Yesterday" standup recap — a pure, read-only narrative of a single tracked
 * day, grouped into the canonical activity model (Tickets → Meetings →
 * Firefighting). It is reconstruction's read-side twin: the same
 * {@link DayTrackingSummary} the rings describe by *shape*, told as a *list*.
 *
 * Everything here is I/O-free and unit-testable. Raw seconds are the only
 * stored unit; all formatting happens at the string boundary
 * ({@link recapToPlainText} / {@link recapToMarkdown}).
 */

export interface RecapLine {
  /** Ticket issue key (e.g. "TBRO-328"); absent for meetings / firefighting. */
  key?: string;
  /** One-line display text. */
  summary: string;
  /** Raw seconds — formatters convert at the edge. */
  seconds: number;
}

export interface RecapGroup {
  key: ActivityKey;
  label: string;
  /** `var(--ring-*)` token, shared with the ring + legend. */
  color: string;
  /** Category total (from {@link dayActivitySeconds} — the source of truth). */
  seconds: number;
  /** Lines, descending by seconds (ties: key asc, then summary asc). */
  lines: RecapLine[];
}

export interface RecapModel {
  dateKey: string;
  /** Full weekday, e.g. "Friday" — used by the empty-state string. */
  weekdayLabel: string;
  /** Locale short date, e.g. "Jun 27". */
  shortDateLabel: string;
  totalSeconds: number;
  /** Canonical order; consumers omit groups whose seconds are 0. */
  groups: RecapGroup[];
  isEmpty: boolean;
}

/** Collapse any internal whitespace/newlines so a note renders on one line. */
const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

/** A note's display text: an explicit title wins, else the note body. */
const noteSummary = (title: string | undefined, text: string) =>
  oneLine(title && title.trim() ? title : text);

const sortLines = (lines: RecapLine[]): RecapLine[] =>
  lines
    .slice()
    .sort(
      (a, b) =>
        b.seconds - a.seconds ||
        (a.key ?? "").localeCompare(b.key ?? "") ||
        a.summary.localeCompare(b.summary)
    );

/**
 * Build the recap model for one resolved day. Group totals come straight from
 * {@link dayActivitySeconds}; the per-line predicates mirror it exactly so the
 * rendered lines can never disagree with the category totals (notably: a note
 * with no `category` counts as firefighting).
 */
export const buildRecap = (day: DayTrackingSummary): RecapModel => {
  const seconds = dayActivitySeconds(day);

  const ticketLines: RecapLine[] = day.issues.map((issue) => ({
    key: issue.key,
    summary: oneLine(issue.summary || issue.key),
    seconds: issue.loggedSeconds
  }));

  const meetingLines: RecapLine[] = [
    ...day.recurringEntries.map((entry) => ({
      summary: oneLine(entry.title),
      seconds: entry.timeSpentSeconds
    })),
    ...day.personalNotes
      .filter((note) => note.category === "meeting")
      .map((note) => ({ summary: noteSummary(note.title, note.text), seconds: note.timeSpentSeconds }))
  ];

  const fireLines: RecapLine[] = day.personalNotes
    .filter((note) => note.category !== "meeting")
    .map((note) => ({ summary: noteSummary(note.title, note.text), seconds: note.timeSpentSeconds }));

  const linesByKey: Record<ActivityKey, RecapLine[]> = {
    ticket: ticketLines,
    meeting: meetingLines,
    fire: fireLines
  };

  const groups: RecapGroup[] = ACTIVITY_CATEGORIES.map((category) => ({
    key: category.key,
    label: category.label,
    color: category.color,
    seconds: seconds[category.key],
    lines: sortLines(linesByKey[category.key])
  }));

  const totalSeconds = seconds.ticket + seconds.meeting + seconds.fire;
  const date = fromLocalDateKey(day.dateKey);

  return {
    dateKey: day.dateKey,
    weekdayLabel: WEEKDAY_LABELS[isoWeekday(date) - 1],
    shortDateLabel: formatShortDate(date),
    totalSeconds,
    groups,
    isEmpty: totalSeconds === 0
  };
};

/** "Fri Jun 27" — short weekday + locale short date, for copy headers. */
const recapDateLabel = (model: RecapModel) =>
  `${SHORT_WEEKDAY_LABELS[isoWeekday(fromLocalDateKey(model.dateKey)) - 1]} ${model.shortDateLabel}`;

// Minute-based formatting (e.g. "8h 45m", "40m") — drops the awkward leading
// "0h" on sub-hour values, so the copy reads naturally aloud and matches the
// on-screen item rows.
const dur = (seconds: number) => formatReconDuration(seconds / 60);

/**
 * Plain-text recap, optimized to read aloud at standup. Includes every line
 * (ignores any on-screen item cap). This is also the input to the optional
 * AI Polish step.
 */
export const recapToPlainText = (model: RecapModel): string => {
  const dateLabel = recapDateLabel(model);
  if (model.isEmpty) {
    return `Yesterday (${dateLabel}) — nothing tracked.`;
  }
  const header = `Yesterday (${dateLabel}) — ${dur(model.totalSeconds)} tracked.`;
  const blocks = model.groups
    .filter((group) => group.seconds > 0)
    .map((group) => {
      const head = `${group.label} (${dur(group.seconds)}):`;
      const items = group.lines.map(
        (line) => `• ${line.key ? `${line.key} ` : ""}${line.summary} — ${dur(line.seconds)}`
      );
      return [head, ...items].join("\n");
    });
  return [header, "", blocks.join("\n\n")].join("\n");
};

/** Markdown recap — same content, destination-agnostic (no posting presets). */
export const recapToMarkdown = (model: RecapModel): string => {
  const dateLabel = recapDateLabel(model);
  if (model.isEmpty) {
    return `**Yesterday** (${dateLabel}) — nothing tracked.`;
  }
  const header = `**Yesterday** (${dateLabel}) — ${dur(model.totalSeconds)} tracked.`;
  const blocks = model.groups
    .filter((group) => group.seconds > 0)
    .map((group) => {
      const head = `**${group.label}** · ${dur(group.seconds)}`;
      const items = group.lines.map(
        (line) => `- ${line.key ? `\`${line.key}\` ` : ""}${line.summary} — ${dur(line.seconds)}`
      );
      return [head, ...items].join("\n");
    });
  return [header, "", blocks.join("\n\n")].join("\n");
};

/**
 * The previous working dateKey before `dateKey`, walking backwards over
 * weekends/non-working days (Monday → the prior Friday under a Mon–Fri week).
 * Weekday-pattern only — the production data paths additionally honour per-week
 * vacation (`isSkipped`). Returns null if none is found within `maxLookback`.
 */
export const previousWorkingDayKey = (
  dateKey: string,
  workingDays: WeekdayNumber[],
  maxLookback = 14
): string | null => {
  const days = normalizeWorkingDays(workingDays);
  let cursor = addDays(fromLocalDateKey(dateKey), -1);
  for (let step = 0; step < maxLookback; step += 1) {
    if (days.includes(isoWeekday(cursor) as WeekdayNumber)) {
      return toLocalDateKey(cursor);
    }
    cursor = addDays(cursor, -1);
  }
  return null;
};

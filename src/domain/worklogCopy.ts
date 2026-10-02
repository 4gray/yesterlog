import type { DayTrackingSummary, JiraTicket, JiraWorklog } from "../../shared/types";
import {
  DEFAULT_WINDOW_END_MIN,
  DEFAULT_WINDOW_START_MIN,
  MINUTES_PER_DAY,
  findGaps,
  minutesFromMidnight,
  overlapsCommitted,
  type CalendarItem
} from "./dayCalendar";

/**
 * Pure helpers behind "copy this worklog to another day". Yesterlog never duplicates a Jira
 * worklog server-side: a copy is an ordinary new worklog created through the existing Add Time
 * write path, prefilled from the source so the user only confirms the day.
 */

/** Minimal ticket shape the Quick Log / Add Time flows need when the issue is not in the dock. */
export const ticketFromWorklog = (worklog: JiraWorklog): JiraTicket => ({
  id: worklog.issueId,
  key: worklog.issueKey,
  summary: worklog.issueSummary,
  projectKey: worklog.projectKey ?? worklog.issueKey.split("-")[0] ?? "",
  projectName: worklog.projectName ?? "",
  statusName: "",
  statusCategory: "unknown",
  loggedSecondsTotal: 0,
  issueType: worklog.issueType,
  epic: worklog.epic,
  url: worklog.issueUrl ?? ""
});

/** A worklog row can be copied only when it is a real Jira item, not a projected bulk slice. */
export const canCopyWorklogs = (logs: JiraWorklog[]) =>
  logs.length > 0 && logs.every((log) => !log.allocation);

interface CopyStartOptions {
  /** Clock minutes of the source worklog on its own day. */
  sourceStartMinutes: number;
  durationMinutes: number;
  /** Committed items already on the target day. */
  committed: CalendarItem[];
  windowStartMin?: number;
  windowEndMin?: number;
}

export type CopyStartPlacement = "same-time" | "after-last" | "first-gap";

export interface CopyStartResult {
  startMinutes: number;
  placement: CopyStartPlacement;
}

/**
 * Where a copied worklog lands on the target day, in order of preference: the source's own
 * clock time when that interval is free, otherwise the first free slot after the day's last
 * committed item, otherwise the first gap anywhere in the working window. `undefined` means
 * the day has no room for the duration and the caller should fall back to its default start.
 */
export const copyStartMinutes = ({
  sourceStartMinutes,
  durationMinutes,
  committed,
  windowStartMin = DEFAULT_WINDOW_START_MIN,
  windowEndMin = DEFAULT_WINDOW_END_MIN
}: CopyStartOptions): CopyStartResult | undefined => {
  const duration = Math.max(1, Math.round(durationMinutes));
  const sourceEnd = sourceStartMinutes + duration;
  if (sourceEnd <= MINUTES_PER_DAY && !overlapsCommitted(sourceStartMinutes, sourceEnd, committed)) {
    return { startMinutes: sourceStartMinutes, placement: "same-time" };
  }

  const committedBlocks = committed.filter((item) => item.layer === "committed");
  if (committedBlocks.length > 0) {
    const lastEnd = Math.max(...committedBlocks.map((item) => item.endMin));
    const [afterLast] = findGaps(committed, Math.max(lastEnd, windowStartMin), windowEndMin, duration);
    if (afterLast) {
      return { startMinutes: afterLast.startMin, placement: "after-last" };
    }
  }

  const [firstGap] = findGaps(committed, windowStartMin, windowEndMin, duration);
  return firstGap ? { startMinutes: firstGap.startMin, placement: "first-gap" } : undefined;
};

export type CopyTargetBlockedReason = "source" | "future" | "vacation" | "non-working";

export interface CopyTarget {
  dateKey: string;
  weekdayName: string;
  dateLabel: string;
  isToday: boolean;
  enabled: boolean;
  blockedReason?: CopyTargetBlockedReason;
  trackedHours: number;
  targetHours: number;
  /** Hours already logged to the copied issue on this day, so double-logging is a visible choice. */
  sameIssueHours: number;
}

interface BuildCopyTargetsOptions {
  days: DayTrackingSummary[];
  sourceDateKey: string;
  todayKey: string;
  issueKey: string;
}

/** Every day of the visible week as a chip, in calendar order, with the same eligibility rule as dock drops. */
export const buildCopyTargets = ({ days, sourceDateKey, todayKey, issueKey }: BuildCopyTargetsOptions): CopyTarget[] =>
  days.map((day) => {
    const blockedReason: CopyTargetBlockedReason | undefined =
      day.dateKey === sourceDateKey
        ? "source"
        : day.dateKey > todayKey
          ? "future"
          : day.isSkipped
            ? "vacation"
            : !day.isConfiguredWorkingDay
              ? "non-working"
              : undefined;
    const sameIssueSeconds = day.issues.find((issue) => issue.key === issueKey)?.loggedSeconds ?? 0;
    return {
      dateKey: day.dateKey,
      weekdayName: day.weekdayName,
      dateLabel: day.dateLabel,
      isToday: day.isToday,
      enabled: !blockedReason,
      blockedReason,
      trackedHours: day.trackedHours,
      targetHours: day.targetHours,
      sameIssueHours: sameIssueSeconds / 3600
    };
  });

export interface WorklogCopyDraft {
  ticket: JiraTicket;
  ticketKey: string;
  ticketSummary: string;
  /** Total duration of the copied row in hours. */
  hours: number;
  /** The one comment shared by the source row; empty when the row's worklogs disagree. */
  comment: string;
  /** Earliest clock minutes among the source worklogs. */
  sourceStartMinutes: number;
}

/**
 * Collapses a Summary row (one issue, possibly several worklogs on the same day) into a copy draft.
 * Durations add up; the comment is kept only when every commented worklog says the same thing.
 */
export const copyDraftFromWorklogs = (logs: JiraWorklog[]): WorklogCopyDraft | undefined => {
  if (!canCopyWorklogs(logs)) {
    return undefined;
  }
  const [first] = logs;
  const totalSeconds = logs.reduce((sum, log) => sum + log.timeSpentSeconds, 0);
  const comments = Array.from(
    new Set(logs.map((log) => log.comment?.trim()).filter((comment): comment is string => Boolean(comment)))
  );
  return {
    ticket: ticketFromWorklog(first),
    ticketKey: first.issueKey,
    ticketSummary: first.issueSummary,
    hours: totalSeconds / 3600,
    comment: comments.length === 1 ? comments[0] : "",
    sourceStartMinutes: Math.min(...logs.map((log) => minutesFromMidnight(new Date(log.started))))
  };
};

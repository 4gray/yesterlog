import type { DayTrackingSummary, WeekState } from "../../shared/types";

export type ActivityKey = "ticket" | "meeting" | "fire";

export interface ActivityCategory {
  key: ActivityKey;
  label: string;
  /** Stroke / dot colour token, shared by the ring arc and the legend. */
  color: string;
}

/**
 * The three buckets a developer's tracked day splits into — the "rings" of the
 * day. Order is meaningful: it's the order arcs fill the ring (tickets →
 * meetings → firefighting) and the order legends render in.
 *
 *  - ticket:  formally tracked ticket work (Jira worklogs)
 *  - meeting: confirmed recurring rituals (standup, planning, refinement…)
 *  - fire:    everything untracked-but-real — personal notes, ops, mentoring,
 *             discussions: the day's "firefighting"
 */
export const ACTIVITY_CATEGORIES: ActivityCategory[] = [
  { key: "ticket", label: "Tickets", color: "var(--ring-ticket)" },
  { key: "meeting", label: "Meetings", color: "var(--ring-meeting)" },
  { key: "fire", label: "Firefighting", color: "var(--ring-fire)" }
];

export interface ActivitySeconds {
  ticket: number;
  meeting: number;
  fire: number;
}

export const EMPTY_ACTIVITY: ActivitySeconds = { ticket: 0, meeting: 0, fire: 0 };

const sumBy = <T,>(items: T[], pick: (item: T) => number) => items.reduce((total, item) => total + pick(item), 0);

/** Per-category seconds for a single resolved day. */
export const dayActivitySeconds = (day: DayTrackingSummary): ActivitySeconds => {
  const meetingNotes = day.personalNotes.filter((note) => note.category === "meeting");
  const fireNotes = day.personalNotes.filter((note) => note.category !== "meeting");
  return {
    ticket: sumBy(day.issues, (issue) => issue.loggedSeconds),
    meeting: sumBy(day.recurringEntries, (entry) => entry.timeSpentSeconds) + sumBy(meetingNotes, (note) => note.timeSpentSeconds),
    fire: sumBy(fireNotes, (note) => note.timeSpentSeconds)
  };
};

/**
 * The billable axis, orthogonal to the activity categories: ticket work is
 * synced to Jira (billable), while meetings and firefighting live only locally
 * (real, but not yet officially tracked). Surfaced so the UI can nudge toward
 * getting every worked hour into Jira.
 */
export interface BillableSplit {
  /** Hours synced to Jira worklogs — official / billable. */
  billableHours: number;
  /** Hours that exist only locally (notes + recurring) — not yet in Jira. */
  localHours: number;
  /** billableHours + localHours, for convenience. */
  totalHours: number;
}

export const billableSplitFromSeconds = (seconds: ActivitySeconds): BillableSplit => {
  const billableHours = seconds.ticket / 3600;
  const localHours = (seconds.meeting + seconds.fire) / 3600;
  return { billableHours, localHours, totalHours: billableHours + localHours };
};

/** Billable (Jira) vs local (not-yet-tracked) split for a single resolved day. */
export const dayBillableSplit = (day: DayTrackingSummary): BillableSplit =>
  billableSplitFromSeconds(dayActivitySeconds(day));

/**
 * Billable (Jira) vs local split for a whole week, read from the precomputed
 * {@link WeekState} totals. `jiraTrackedWeekHours` is the synced/billable axis;
 * everything else tracked (notes + recurring) is the local remainder. The single
 * source of truth for the week-scope split shown in the Week and Reports headers.
 */
export const weekBillableSplit = (
  week: Pick<WeekState, "jiraTrackedWeekHours" | "trackedWeekHours">
): BillableSplit => {
  const billableHours = week.jiraTrackedWeekHours;
  const localHours = Math.max(week.trackedWeekHours - billableHours, 0);
  return { billableHours, localHours, totalHours: billableHours + localHours };
};

/** Fold per-category seconds across many days (week / month aggregate). */
export const sumActivitySeconds = (parts: ActivitySeconds[]): ActivitySeconds =>
  parts.reduce<ActivitySeconds>(
    (acc, part) => ({
      ticket: acc.ticket + part.ticket,
      meeting: acc.meeting + part.meeting,
      fire: acc.fire + part.fire
    }),
    { ...EMPTY_ACTIVITY }
  );

export interface ActivitySegment extends ActivityCategory {
  hours: number;
}

/** Ordered ring segments (in hours) from a per-category seconds breakdown. */
export const activitySegments = (seconds: ActivitySeconds): ActivitySegment[] =>
  ACTIVITY_CATEGORIES.map((category) => ({ ...category, hours: seconds[category.key] / 3600 }));

/** Ordered ring segments (in hours) from a per-category hours breakdown. */
export const activitySegmentsFromHours = (hours: ActivitySeconds): ActivitySegment[] =>
  ACTIVITY_CATEGORIES.map((category) => ({ ...category, hours: hours[category.key] }));

export interface RingSpan {
  key: string;
  color: string;
  /** Start fraction (0–1) of the filled arc, measured clockwise from 12 o'clock. */
  start: number;
  /** End fraction (0–1). */
  end: number;
}

/**
 * Lay ring segments end-to-end as fractions of a full circle. The denominator is
 * the larger of the target and the total, so the ring closes exactly at target
 * and overtime fills it completely (never overflows); a shortfall is left as the
 * unfilled remainder. Zero/negative segments are skipped. Pure — the SVG layer
 * adds gaps and paths on top.
 */
export const ringSegmentFractions = (
  segments: { key: string; hours: number; color: string }[],
  targetHours: number
): RingSpan[] => {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.hours), 0);
  const denominator = Math.max(targetHours, total, 0.0001);
  const spans: RingSpan[] = [];
  let cursor = 0;
  for (const segment of segments) {
    const fraction = Math.max(0, segment.hours) / denominator;
    if (fraction <= 0) {
      continue;
    }
    spans.push({ key: segment.key, color: segment.color, start: cursor, end: cursor + fraction });
    cursor += fraction;
  }
  return spans;
};

import type { WeekState } from "../../shared/types";
import { fromLocalDateKey, getIsoWeekNumber } from "../utils/date";

/** A single week's tracked-vs-target point on the week-over-week trend line. */
export interface TrendPoint {
  weekKey: string;
  label: string;
  trackedHours: number;
  targetHours: number;
  onTarget: boolean;
  isCurrent: boolean;
}

/**
 * One week's composition, split the same three ways the tracked total is built
 * from: Jira ticket work, recurring meetings, and personal "firefighting" notes.
 * Because it reuses the week-level totals, the segments always sum to
 * trackedWeekHours — the strip can never disagree with the headline figure.
 */
export interface CompositionWeek {
  weekKey: string;
  label: string;
  ticketHours: number;
  meetingHours: number;
  fireHours: number;
  totalHours: number;
  isCurrent: boolean;
}

export interface KpiDelta {
  current: number;
  previous: number;
  delta: number;
}

export interface ReportsKpiDeltas {
  dailyAverage: KpiDelta;
  billablePct: KpiDelta;
  ticketsTouched: KpiDelta;
  daysOnTarget: KpiDelta;
}

export interface ReportsHistory {
  trend: TrendPoint[];
  composition: CompositionWeek[];
  /** Undefined when there is no prior week to compare against. */
  deltas?: ReportsKpiDeltas;
  /** Weeks in the window that carry tracked time. */
  populatedWeeks: number;
  /** True once enough populated weeks exist for the trend to say anything. */
  hasBaseline: boolean;
}

/** Trends stay in a "building baseline" state below this many populated weeks. */
export const MIN_TREND_WEEKS = 3;

const weekLabel = (weekKey: string) => `W${getIsoWeekNumber(fromLocalDateKey(weekKey))}`;

const dailyAverageHours = (week: WeekState): number => {
  const activeDays = week.days.filter((day) => day.trackedHours > 0).length;
  return activeDays > 0 ? week.trackedWeekHours / activeDays : 0;
};

const billablePct = (week: WeekState): number =>
  week.trackedWeekHours > 0 ? (week.jiraTrackedWeekHours / week.trackedWeekHours) * 100 : 0;

const distinctTicketCount = (week: WeekState): number =>
  new Set(week.days.flatMap((day) => day.issues.map((issue) => issue.key))).size;

const daysOnTargetCount = (week: WeekState): number =>
  week.days.filter((day) => day.targetHours > 0 && day.trackedHours >= day.targetHours).length;

const makeDelta = (current: number, previous: number): KpiDelta => ({
  current,
  previous,
  delta: current - previous
});

/**
 * Week-over-week deltas for the four Reports KPIs. Percentages and counts are
 * compared at display precision (whole numbers) so the chip never shows a delta
 * the rounded headline value contradicts.
 */
export const buildKpiDeltas = (
  current: WeekState,
  previous: WeekState | undefined
): ReportsKpiDeltas | undefined => {
  if (!previous) {
    return undefined;
  }
  return {
    dailyAverage: makeDelta(dailyAverageHours(current), dailyAverageHours(previous)),
    billablePct: makeDelta(Math.round(billablePct(current)), Math.round(billablePct(previous))),
    ticketsTouched: makeDelta(distinctTicketCount(current), distinctTicketCount(previous)),
    daysOnTarget: makeDelta(daysOnTargetCount(current), daysOnTargetCount(previous))
  };
};

/**
 * Reports trend, composition and deltas over a trailing window of weeks. The
 * window is ascending and ends at the currently-viewed week; the previous week
 * is the one immediately before it.
 */
export const buildReportsHistory = (
  weekStates: WeekState[],
  currentWeekKey: string
): ReportsHistory => {
  const currentIndex = weekStates.findIndex((week) => week.weekKey === currentWeekKey);

  const trend: TrendPoint[] = weekStates.map((week) => ({
    weekKey: week.weekKey,
    label: weekLabel(week.weekKey),
    trackedHours: week.trackedWeekHours,
    targetHours: week.weeklyTargetHours,
    onTarget: week.weeklyTargetHours > 0 && week.trackedWeekHours >= week.weeklyTargetHours,
    isCurrent: week.weekKey === currentWeekKey
  }));

  const composition: CompositionWeek[] = weekStates.map((week) => {
    const ticketHours = week.jiraTrackedWeekHours;
    const meetingHours = week.recurringTrackedHours;
    const fireHours = week.personalNoteHours;
    return {
      weekKey: week.weekKey,
      label: weekLabel(week.weekKey),
      ticketHours,
      meetingHours,
      fireHours,
      totalHours: ticketHours + meetingHours + fireHours,
      isCurrent: week.weekKey === currentWeekKey
    };
  });

  const current = currentIndex >= 0 ? weekStates[currentIndex] : undefined;
  const previous = currentIndex > 0 ? weekStates[currentIndex - 1] : undefined;
  const deltas = current ? buildKpiDeltas(current, previous) : undefined;

  const populatedWeeks = weekStates.filter((week) => week.trackedWeekHours > 0).length;

  return {
    trend,
    composition,
    deltas,
    populatedWeeks,
    hasBaseline: populatedWeeks >= MIN_TREND_WEEKS
  };
};

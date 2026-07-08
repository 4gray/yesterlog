import type { DayTrackingSummary, WeekState } from "../../shared/types";
import { fromLocalDateKey, getIsoWeekNumber } from "../utils/date";
import { dayActivitySeconds, sumActivitySeconds, type ActivityKey } from "./activity";

/**
 * The insight aggregators behind the Reports sub-pages (Composition, Focus,
 * Trends). Everything here is pure and computed from the {@link WeekState}s the
 * app already reconstructs, so the same three activity buckets that drive the
 * day rings — ticket / meeting / fire — drive every report and the numbers can
 * never disagree with the headline totals.
 *
 * "Visible work" is hands-on ticket time (synced to Jira); "invisible work" is
 * everything else — meetings, review and firefighting the app reconstructs but
 * that no timesheet would have caught. That single split powers Composition and
 * one Trends KPI.
 */

/** A block ≥ this many minutes counts as "deep" / focused work. */
export const DEEP_BLOCK_MINUTES = 45;

/** A day is only called out as "worst" for Composition once invisible work
 * outweighs code on it — below this the "almost no code shipped" note is wrong. */
const WORST_DAY_MIN_INVISIBLE_PCT = 50;

/** Focus ratings that make a day worth flagging as the week's "most fragmented"
 * — a clean 'best'/'good' day should never earn that callout. */
const FRAGMENTED_RATINGS: ReadonlySet<FocusRating> = new Set(["fair", "choppy"]);

/**
 * One logged unit within a day: a ticket's daily total, a recurring ritual, or a
 * personal note. The app logs time per ticket per day (not per intraday
 * session), so each ticket-day is treated as a single block — a faithful,
 * documented approximation used for the Focus metrics.
 */
export interface WorkBlock {
  category: ActivityKey;
  minutes: number;
  isDeep: boolean;
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

export const weekLabel = (weekKey: string) => `W${getIsoWeekNumber(fromLocalDateKey(weekKey))}`;

/** Days that should appear in per-day report strips: configured or worked days. */
const reportableDays = (week: WeekState): DayTrackingSummary[] =>
  week.days.filter((day) => day.isConfiguredWorkingDay || day.trackedHours > 0);

/** The blocks logged on a single day, split into the three activity buckets. */
export const dayBlocks = (day: DayTrackingSummary): WorkBlock[] => {
  const blocks: WorkBlock[] = [];
  const push = (category: ActivityKey, seconds: number) => {
    const minutes = seconds / 60;
    if (minutes > 0) {
      blocks.push({ category, minutes, isDeep: minutes >= DEEP_BLOCK_MINUTES });
    }
  };
  for (const issue of day.issues) {
    push("ticket", issue.loggedSeconds);
  }
  for (const entry of day.recurringEntries) {
    push("meeting", entry.timeSpentSeconds);
  }
  for (const note of day.personalNotes) {
    push(note.category === "meeting" ? "meeting" : "fire", note.timeSpentSeconds);
  }
  return blocks;
};

// ============================ Shared week metrics ============================

/** Hands-on ticket hours (visible/billable) for a week. */
const visibleHoursOf = (week: WeekState) => week.jiraTrackedWeekHours;
/** Meetings + firefighting hours (invisible/reconstructed) for a week. */
const invisibleHoursOf = (week: WeekState) => Math.max(0, week.trackedWeekHours - week.jiraTrackedWeekHours);

/**
 * Meeting hours for a week (recurring rituals + meeting-tagged notes), taken
 * straight from the canonical day-ring buckets so every report agrees with the
 * rings and with each other — never re-derive this split by hand.
 */
const weekMeetingHours = (week: WeekState): number =>
  sumActivitySeconds(week.days.map(dayActivitySeconds)).meeting / 3600;

/** Invisible-work share of a week, 0–100. */
export const weekInvisiblePct = (week: WeekState): number =>
  pct(invisibleHoursOf(week), week.trackedWeekHours);

/** The single longest focus block in a week, in minutes. */
export const weekLongestBlockMinutes = (week: WeekState): number =>
  week.days.reduce(
    (max, day) => Math.max(max, ...dayBlocks(day).map((block) => block.minutes), 0),
    0
  );

/** Share of active minutes spent in deep (≥45 min) blocks, 0–100. */
export const weekDeepSharePct = (week: WeekState): number => {
  let active = 0;
  let deep = 0;
  for (const day of week.days) {
    for (const block of dayBlocks(day)) {
      active += block.minutes;
      if (block.isDeep) {
        deep += block.minutes;
      }
    }
  }
  return pct(deep, active);
};

/** Context switches in a week: per day, one per block beyond the first. */
export const weekContextSwitches = (week: WeekState): number =>
  week.days.reduce((total, day) => total + Math.max(0, dayBlocks(day).length - 1), 0);

// ============================ Composition ============================

const ACTIVITY_LABEL: Record<ActivityKey, string> = {
  ticket: "Coding & tickets",
  meeting: "Meetings & comms",
  fire: "Ops & firefighting"
};

export interface CompositionCategory {
  key: ActivityKey;
  label: string;
  /** CSS var / colour token shared with the day rings. */
  color: string;
  hours: number;
  pct: number;
}

export interface CompositionDay {
  dateKey: string;
  /** Three-letter axis label, e.g. "WED". */
  label: string;
  /** Full weekday name for prose, e.g. "Wednesday". */
  weekday: string;
  isToday: boolean;
  visibleHours: number;
  invisibleHours: number;
  totalHours: number;
  invisiblePct: number;
  /** The most-invisible day of the week (worst for shipping code). */
  isWorst: boolean;
}

export interface CompositionReport {
  totalHours: number;
  visibleHours: number;
  invisibleHours: number;
  invisiblePct: number;
  visiblePct: number;
  categories: CompositionCategory[];
  days: CompositionDay[];
  /** Largest invisible category, for the "none of it on a timesheet" callout. */
  topInvisible?: CompositionCategory;
  worstDay?: CompositionDay;
  hasData: boolean;
}

const COMPOSITION_ORDER: Array<{ key: ActivityKey; color: string }> = [
  { key: "ticket", color: "var(--blue)" },
  { key: "meeting", color: "var(--amber)" },
  { key: "fire", color: "var(--teal)" }
];

export const buildComposition = (week: WeekState): CompositionReport => {
  const totalHours = week.trackedWeekHours;
  const visibleHours = visibleHoursOf(week);
  const invisibleHours = invisibleHoursOf(week);

  // Category hours reuse the same buckets as the ring: ticket = jira, meetings =
  // recurring + meeting notes, fire = the remaining firefighting notes.
  const meetingHours = weekMeetingHours(week);
  const fireHours = Math.max(0, invisibleHours - meetingHours);
  const hoursByKey: Record<ActivityKey, number> = {
    ticket: visibleHours,
    meeting: meetingHours,
    fire: fireHours
  };

  const categories: CompositionCategory[] = COMPOSITION_ORDER.map(({ key, color }) => ({
    key,
    label: ACTIVITY_LABEL[key],
    color,
    hours: hoursByKey[key],
    pct: pct(hoursByKey[key], totalHours)
  }));

  const rawDays = reportableDays(week).map((day) => {
    const dayVisible = day.issues.reduce((sum, issue) => sum + issue.loggedSeconds, 0) / 3600;
    const dayTotal = day.trackedHours;
    const dayInvisible = Math.max(0, dayTotal - dayVisible);
    return {
      dateKey: day.dateKey,
      label: day.weekdayName.slice(0, 3).toUpperCase(),
      weekday: day.weekdayName,
      isToday: day.isToday,
      visibleHours: dayVisible,
      invisibleHours: dayInvisible,
      totalHours: dayTotal,
      invisiblePct: pct(dayInvisible, dayTotal),
      isWorst: false
    };
  });

  // Worst day = the day that shipped the least code proportionally (highest
  // invisible share) — but only worth calling out when invisible work actually
  // dominated it, so an all-visible coding week gets no (contradictory) "0%
  // invisible — almost no code shipped" footnote.
  let worstIndex = -1;
  let worstPct = WORST_DAY_MIN_INVISIBLE_PCT;
  rawDays.forEach((day, index) => {
    if (day.totalHours > 0 && day.invisiblePct > worstPct) {
      worstPct = day.invisiblePct;
      worstIndex = index;
    }
  });
  const days = rawDays.map((day, index) => ({ ...day, isWorst: index === worstIndex }));

  const invisibleCategories = categories.filter((category) => category.key !== "ticket");
  const topInvisible = invisibleCategories.reduce<CompositionCategory | undefined>(
    (top, category) => (category.hours > (top?.hours ?? 0) ? category : top),
    undefined
  );

  return {
    totalHours,
    visibleHours,
    invisibleHours,
    invisiblePct: Math.round(weekInvisiblePct(week)),
    visiblePct: Math.round(pct(visibleHours, totalHours)),
    categories,
    days,
    topInvisible: topInvisible && topInvisible.hours > 0 ? topInvisible : undefined,
    worstDay: worstIndex >= 0 ? days[worstIndex] : undefined,
    hasData: totalHours > 0
  };
};

// ============================ Focus ============================

export type FocusRating = "best" | "good" | "fair" | "choppy" | "none";
export type FocusSegmentKind = "deep" | "shallow" | "gap";

export interface FocusSegment {
  kind: FocusSegmentKind;
  pct: number;
}

export interface FocusDay {
  dateKey: string;
  label: string;
  weekday: string;
  isToday: boolean;
  activeMinutes: number;
  longestMinutes: number;
  switches: number;
  rating: FocusRating;
  segments: FocusSegment[];
  isWorst: boolean;
}

export interface FocusReport {
  deepSharePct: number;
  longestBlockMinutes: number;
  longestBlockDayLabel?: string;
  contextSwitches: number;
  avgSwitchesPerDay: number;
  /** Change in weekly context switches vs the prior week (positive = worse). */
  switchesDelta?: number;
  days: FocusDay[];
  worstDay?: FocusDay;
  hasData: boolean;
}

const rateDay = (activeMinutes: number, longestMinutes: number, switches: number): FocusRating => {
  if (activeMinutes <= 0) {
    return "none";
  }
  if (longestMinutes >= 90 && switches <= 2) {
    return "best";
  }
  if (longestMinutes < 30 || switches >= 8) {
    return "choppy";
  }
  if (longestMinutes >= 60 && switches <= 4) {
    return "good";
  }
  return "fair";
};

export const buildFocus = (week: WeekState, previousWeek?: WeekState): FocusReport => {
  const days: FocusDay[] = [];
  let totalActive = 0;
  let totalDeep = 0;
  let longestBlockMinutes = 0;
  let longestBlockDayLabel: string | undefined;

  // Common horizontal scale so a full target-length day fills its row.
  const perDayBlocks = reportableDays(week).map((day) => ({ day, blocks: dayBlocks(day) }));
  const maxActive = perDayBlocks.reduce(
    (max, { blocks }) => Math.max(max, blocks.reduce((sum, block) => sum + block.minutes, 0)),
    0
  );
  const scaleMinutes = Math.max(week.dailyTargetHours * 60, maxActive, 1);

  for (const { day, blocks } of perDayBlocks) {
    const sorted = [...blocks].sort((a, b) => b.minutes - a.minutes);
    const activeMinutes = sorted.reduce((sum, block) => sum + block.minutes, 0);
    const deepMinutes = sorted.filter((block) => block.isDeep).reduce((sum, block) => sum + block.minutes, 0);
    const longestMinutes = sorted[0]?.minutes ?? 0;
    const switches = Math.max(0, sorted.length - 1);

    totalActive += activeMinutes;
    totalDeep += deepMinutes;
    if (longestMinutes > longestBlockMinutes) {
      longestBlockMinutes = longestMinutes;
      longestBlockDayLabel = day.weekdayName;
    }

    const segments: FocusSegment[] = sorted.map((block) => ({
      kind: block.isDeep ? "deep" : "shallow",
      pct: (block.minutes / scaleMinutes) * 100
    }));
    const gap = scaleMinutes - activeMinutes;
    if (gap > 0.5) {
      segments.push({ kind: "gap", pct: (gap / scaleMinutes) * 100 });
    }

    days.push({
      dateKey: day.dateKey,
      label: day.weekdayName.slice(0, 3).toUpperCase(),
      weekday: day.weekdayName,
      isToday: day.isToday,
      activeMinutes,
      longestMinutes,
      switches,
      rating: rateDay(activeMinutes, longestMinutes, switches),
      segments,
      isWorst: false
    });
  }

  const contextSwitches = days.reduce((sum, day) => sum + day.switches, 0);
  const activeDayCount = days.filter((day) => day.activeMinutes > 0).length;

  // Worst = the most fragmented active day: most switches, shortest deep block.
  // Only kept when the day is genuinely choppy — otherwise a clean single-block
  // week would be labelled "most fragmented day — 0 context switches".
  let worstIndex = -1;
  days.forEach((day, index) => {
    if (day.activeMinutes <= 0) {
      return;
    }
    if (worstIndex < 0) {
      worstIndex = index;
      return;
    }
    const worst = days[worstIndex];
    if (day.switches > worst.switches || (day.switches === worst.switches && day.longestMinutes < worst.longestMinutes)) {
      worstIndex = index;
    }
  });
  if (worstIndex >= 0 && !FRAGMENTED_RATINGS.has(days[worstIndex].rating)) {
    worstIndex = -1;
  }
  if (worstIndex >= 0) {
    days[worstIndex].isWorst = true;
  }

  return {
    deepSharePct: Math.round(pct(totalDeep, totalActive)),
    longestBlockMinutes,
    longestBlockDayLabel,
    contextSwitches,
    avgSwitchesPerDay: activeDayCount > 0 ? Math.round(contextSwitches / activeDayCount) : 0,
    switchesDelta: previousWeek ? contextSwitches - weekContextSwitches(previousWeek) : undefined,
    days,
    worstDay: worstIndex >= 0 ? days[worstIndex] : undefined,
    hasData: totalActive > 0
  };
};

// ============================ Trends ============================

export type DeltaTone = "good" | "bad" | "flat";

export type TrendsComparison = "last" | "4week";

export interface TrendKpi {
  /** Percentage/point change vs the comparison baseline; undefined when none. */
  deltaLabel?: string;
  deltaTone: DeltaTone;
  /** Whether the delta arrow points up (▲) or down (▼). */
  deltaUp: boolean;
  /** Baseline value, e.g. "27.7h" — paired with the report's previousCaption. */
  previousLabel?: string;
}

export interface TrendsDay {
  label: string;
  isToday: boolean;
  thisHours: number;
  lastHours: number;
}

export interface SparklineMetric {
  key: "total" | "review" | "deep";
  label: string;
  /** CSS colour for the latest (highlighted) bar. */
  color: string;
  /** Latest raw value; the component formats it per `unit`. */
  latestValue: number;
  unit: "hours" | "percent";
  /** Normalised bar heights 0–1, oldest → newest (latest is highlighted). */
  bars: number[];
}

export interface TrendsReport {
  comparison: TrendsComparison;
  hasComparison: boolean;
  hasFourWeek: boolean;
  comparisonLabel: string;
  /** Caption for the baseline value, e.g. "last week" or "4-week avg". */
  previousCaption: string;
  /** Header headline: total-logged % change vs the baseline. */
  headlinePct?: number;
  headlineTone: DeltaTone;
  totalLoggedHours: number;
  totalLogged: TrendKpi;
  invisiblePct: number;
  invisible: TrendKpi;
  longestFocusMinutes: number;
  longestFocus: TrendKpi;
  days: TrendsDay[];
  sparklines: SparklineMetric[];
  reviewHoursThisWeek: number;
}

const magnitudeDelta = (current: number, previous: number): { pct: number; tone: DeltaTone; up: boolean } => {
  if (previous <= 0) {
    return { pct: current > 0 ? 100 : 0, tone: current > 0 ? "good" : "flat", up: current > 0 };
  }
  const change = ((current - previous) / previous) * 100;
  const rounded = Math.round(change);
  return { pct: Math.abs(rounded), tone: rounded === 0 ? "flat" : rounded > 0 ? "good" : "bad", up: rounded > 0 };
};

const normaliseBars = (values: number[]): number[] => {
  const max = Math.max(...values, 0);
  return values.map((value) => (max > 0 ? value / max : 0));
};

const average = (values: number[]): number | undefined =>
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;

/**
 * Everything the Trends page renders. The KPI deltas + header compare the
 * visible week to a baseline — either the immediately prior week (`"last"`) or
 * the average of the trailing weeks (`"4week"`). The hours-per-day overlay is
 * always this-vs-last-week; the sparklines always show the trailing 4-week
 * window. `weekStates` is ascending and ends at the current week.
 */
export const buildTrends = (
  weekStates: WeekState[],
  currentWeekKey: string,
  comparison: TrendsComparison = "last"
): TrendsReport | undefined => {
  const currentIndex = weekStates.findIndex((week) => week.weekKey === currentWeekKey);
  if (currentIndex < 0) {
    return undefined;
  }
  const current = weekStates[currentIndex];
  const lastWeek = currentIndex > 0 ? weekStates[currentIndex - 1] : undefined;
  const priorWeeks = weekStates.slice(Math.max(0, currentIndex - 3), currentIndex);

  const currentTotal = current.trackedWeekHours;
  const invisibleNow = weekInvisiblePct(current);
  const longestNow = weekLongestBlockMinutes(current);

  // The baseline scalars depend on the comparison mode.
  const baseTotal =
    comparison === "4week" ? average(priorWeeks.map((week) => week.trackedWeekHours)) : lastWeek?.trackedWeekHours;
  const baseInvisible =
    comparison === "4week" ? average(priorWeeks.map(weekInvisiblePct)) : lastWeek ? weekInvisiblePct(lastWeek) : undefined;
  const baseLongest =
    comparison === "4week"
      ? average(priorWeeks.map(weekLongestBlockMinutes))
      : lastWeek
        ? weekLongestBlockMinutes(lastWeek)
        : undefined;

  const totalDelta = baseTotal !== undefined ? magnitudeDelta(currentTotal, baseTotal) : undefined;
  const invisiblePp = baseInvisible !== undefined ? Math.round(invisibleNow - baseInvisible) : undefined;
  const longestDeltaMin = baseLongest !== undefined ? Math.round(longestNow - baseLongest) : undefined;
  const hasComparison = baseTotal !== undefined;
  const previousCaption = comparison === "4week" ? `${priorWeeks.length}-week avg` : "last week";

  // Match this week's days to last week's by weekday, not by position — the two
  // weeks can filter different leading days, which would otherwise misalign the
  // overlay (this Tuesday drawn against last Monday, etc.).
  const lastByWeekday = new Map(lastWeek?.days.map((day) => [day.weekdayName, day.trackedHours]) ?? []);
  const days: TrendsDay[] = reportableDays(current).map((day) => ({
    label: day.weekdayName.slice(0, 3).toUpperCase(),
    isToday: day.isToday,
    thisHours: day.trackedHours,
    lastHours: lastByWeekday.get(day.weekdayName) ?? 0
  }));

  // The 4-week window ends at the *selected* week, not the newest week overall —
  // otherwise navigating back would still show the latest weeks' sparklines.
  const window = weekStates.slice(Math.max(0, currentIndex - 3), currentIndex + 1);
  const hasFourWeek = window.length >= 2;
  const totals = window.map((week) => week.trackedWeekHours);
  const reviews = window.map((week) => weekMeetingHours(week));
  const deeps = window.map((week) => weekDeepSharePct(week));

  const sparklines: SparklineMetric[] = [
    {
      key: "total",
      label: "Total hours",
      color: "var(--blue)",
      latestValue: totals[totals.length - 1] ?? 0,
      unit: "hours",
      bars: normaliseBars(totals)
    },
    {
      key: "review",
      label: "Meetings & review",
      color: "var(--purple)",
      latestValue: reviews[reviews.length - 1] ?? 0,
      unit: "hours",
      bars: normaliseBars(reviews)
    },
    {
      key: "deep",
      label: "Deep-work share",
      color: "var(--green)",
      latestValue: deeps[deeps.length - 1] ?? 0,
      unit: "percent",
      bars: normaliseBars(deeps)
    }
  ];

  return {
    comparison,
    hasComparison,
    hasFourWeek,
    comparisonLabel:
      comparison === "4week"
        ? `${weekLabel(current.weekKey)} vs its ${priorWeeks.length}-week average`
        : lastWeek
          ? `${weekLabel(current.weekKey)} compared to ${weekLabel(lastWeek.weekKey)}`
          : weekLabel(current.weekKey),
    previousCaption,
    headlinePct: totalDelta ? totalDelta.pct : undefined,
    headlineTone: totalDelta ? totalDelta.tone : "flat",
    totalLoggedHours: currentTotal,
    totalLogged: {
      deltaLabel: totalDelta ? `${totalDelta.up ? "+" : "−"}${totalDelta.pct}%` : undefined,
      deltaTone: totalDelta?.tone ?? "flat",
      deltaUp: totalDelta?.up ?? false,
      previousLabel: baseTotal !== undefined ? `${round1(baseTotal)}h` : undefined
    },
    invisiblePct: Math.round(invisibleNow),
    invisible: {
      deltaLabel:
        invisiblePp !== undefined && invisiblePp !== 0 ? `${invisiblePp > 0 ? "+" : "−"}${Math.abs(invisiblePp)}pp` : undefined,
      // More invisible work is a bad trend; less is good.
      deltaTone: invisiblePp === undefined || invisiblePp === 0 ? "flat" : invisiblePp > 0 ? "bad" : "good",
      deltaUp: (invisiblePp ?? 0) > 0,
      previousLabel: baseInvisible !== undefined ? `${Math.round(baseInvisible)}%` : undefined
    },
    longestFocusMinutes: longestNow,
    longestFocus: {
      deltaLabel:
        longestDeltaMin !== undefined && longestDeltaMin !== 0
          ? `${longestDeltaMin > 0 ? "+" : "−"}${Math.abs(longestDeltaMin)}m`
          : undefined,
      // A longer deep block is a good trend; shorter is bad.
      deltaTone: longestDeltaMin === undefined || longestDeltaMin === 0 ? "flat" : longestDeltaMin > 0 ? "good" : "bad",
      deltaUp: (longestDeltaMin ?? 0) > 0,
      previousLabel: baseLongest !== undefined ? `${Math.round(baseLongest)}m` : undefined
    },
    days,
    sparklines,
    reviewHoursThisWeek: reviews[reviews.length - 1] ?? 0
  };
};

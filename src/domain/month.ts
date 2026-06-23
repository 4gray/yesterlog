import type { AppSettings, WeekState } from "../../shared/types";
import {
  addDays,
  fromLocalDateKey,
  getIsoWeekNumber,
  startOfWeekMonday,
  toLocalDateKey
} from "../utils/date";

// Day classifications drive the cell colour in the month grid.
//  - full:   on target (tracked >= daily target)
//  - under:  past working day below target but above the gap threshold
//  - gap:    past working day well under target (counts toward "gaps to fill")
//  - today:  the current day
//  - future: an in-month day still ahead of today
//  - other:  a day that belongs to a neighbouring month (week spills over)
export type MonthDayStatus = "full" | "under" | "gap" | "today" | "future" | "other";

export type MonthWeekStatus = "met" | "under" | "current" | "future" | "partial";

export interface MonthDay {
  dateKey: string;
  dayNumber: number;
  trackedHours: number;
  targetHours: number;
  status: MonthDayStatus;
  /** Bar fill, 0–100, of tracked against the daily target. */
  fillPct: number;
}

export interface MonthWeek {
  weekKey: string;
  /** ISO week label, e.g. "W25". */
  label: string;
  /** In-month working-day span, e.g. "JUN 1–5". */
  rangeLabel: string;
  status: MonthWeekStatus;
  isCurrent: boolean;
  days: MonthDay[];
  trackedHours: number;
  targetHours: number;
  /** Bar fill, 0–100, of the week total against the week target. */
  fillPct: number;
  deltaLabel: string;
}

export interface MonthState {
  monthKey: string;
  /** e.g. "JUNE 2026". */
  monthLabel: string;
  isCurrentMonth: boolean;
  trackedHours: number;
  targetHours: number;
  /** Whole-hours rounded percentage of the month target that has been logged. */
  loggedPct: number;
  gapCount: number;
  hoursToFill: number;
  weeksOnTarget: number;
  closedWeekCount: number;
  firstMetWeekLabel?: string;
  /** Average total across closed, full (5-working-day) weeks. */
  averageFullWeekHours: number;
  fullWeekCount: number;
  gapThresholdHours: number;
  weeks: MonthWeek[];
}

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const RANGE_MONTH_FORMATTER = new Intl.DateTimeFormat(undefined, { month: "short" });

export const getMonthAnchor = (input: Date) => new Date(input.getFullYear(), input.getMonth(), 1);

export const getMonthBounds = (anchor: Date) => {
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const monthEndExclusive = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  return { monthStart, monthEndExclusive };
};

// Every Monday-anchored week that has at least one day inside the month.
export const getMonthWeekStarts = (anchor: Date): Date[] => {
  const { monthStart, monthEndExclusive } = getMonthBounds(anchor);
  const starts: Date[] = [];
  let cursor = startOfWeekMonday(monthStart);
  while (cursor < monthEndExclusive) {
    starts.push(cursor);
    cursor = addDays(cursor, 7);
  }
  return starts;
};

const isInMonth = (dateKey: string, anchor: Date) => {
  const date = fromLocalDateKey(dateKey);
  return date.getFullYear() === anchor.getFullYear() && date.getMonth() === anchor.getMonth();
};

const formatRange = (firstKey: string, lastKey: string) => {
  const first = fromLocalDateKey(firstKey);
  const last = fromLocalDateKey(lastKey);
  const firstMonth = RANGE_MONTH_FORMATTER.format(first).toUpperCase();
  if (first.getMonth() === last.getMonth()) {
    return `${firstMonth} ${first.getDate()}–${last.getDate()}`;
  }
  const lastMonth = RANGE_MONTH_FORMATTER.format(last).toUpperCase();
  return `${firstMonth} ${first.getDate()} – ${lastMonth} ${last.getDate()}`;
};

const formatHourValue = (hours: number) => {
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

export const buildMonthState = (
  anchor: Date,
  today: Date,
  settings: AppSettings,
  weekStates: WeekState[]
): MonthState => {
  const dailyTarget = settings.weeklyTargetHours / Math.max(settings.workingDays.length, 1);
  const gapThreshold = Math.max(1, dailyTarget - 1);
  const todayKey = toLocalDateKey(today);
  const monthStart = getMonthBounds(anchor).monthStart;

  let trackedHours = 0;
  let targetHours = 0;
  let gapCount = 0;
  let hoursToFill = 0;
  let weeksOnTarget = 0;
  let closedWeekCount = 0;
  let fullWeekTotal = 0;
  let fullWeekCount = 0;
  let firstMetWeekLabel: string | undefined;

  const weeks: MonthWeek[] = weekStates.map((weekState) => {
    const weekStart = fromLocalDateKey(weekState.weekKey);
    const label = `W${getIsoWeekNumber(weekStart)}`;

    let weekTracked = 0;
    let weekTarget = 0;
    let inMonthWorkingDays = 0;
    let hasToday = false;
    let allInMonthFuture = true;
    const inMonthKeys: string[] = [];

    const days: MonthDay[] = weekState.days.map((day) => {
      const inMonth = isInMonth(day.dateKey, anchor);
      const dayNumber = fromLocalDateKey(day.dateKey).getDate();

      if (!inMonth) {
        return {
          dateKey: day.dateKey,
          dayNumber,
          trackedHours: 0,
          targetHours: 0,
          status: "other",
          fillPct: 0
        };
      }

      inMonthKeys.push(day.dateKey);
      const dayTarget = day.isConfiguredWorkingDay && !day.isSkipped ? dailyTarget : 0;
      if (dayTarget > 0) {
        inMonthWorkingDays += 1;
        weekTarget += dayTarget;
      }
      weekTracked += day.trackedHours;

      const isToday = day.dateKey === todayKey;
      const isPast = day.dateKey < todayKey;
      if (!isPast && !isToday) {
        // still in the future
      } else {
        allInMonthFuture = false;
      }

      let status: MonthDayStatus;
      if (isToday) {
        hasToday = true;
        allInMonthFuture = false;
        status = "today";
      } else if (!isPast) {
        status = "future";
      } else if (day.trackedHours >= dailyTarget) {
        status = "full";
      } else if (dayTarget > 0 && day.trackedHours < gapThreshold) {
        status = "gap";
      } else if (dayTarget > 0) {
        status = "under";
      } else {
        // non-working past day with no target — treat as neutral/future styling
        status = "future";
      }

      if (status === "gap") {
        gapCount += 1;
        hoursToFill += Math.max(dailyTarget - day.trackedHours, 0);
      }

      return {
        dateKey: day.dateKey,
        dayNumber,
        trackedHours: day.trackedHours,
        targetHours: dayTarget,
        status,
        fillPct: dailyTarget > 0 ? Math.min(100, Math.round((day.trackedHours / dailyTarget) * 100)) : 0
      };
    });

    trackedHours += weekTracked;
    targetHours += weekTarget;

    const isPartialWeek = inMonthWorkingDays > 0 && inMonthWorkingDays < settings.workingDays.length;
    const isClosed = !hasToday && !allInMonthFuture;

    let status: MonthWeekStatus;
    if (hasToday) {
      status = "current";
    } else if (allInMonthFuture) {
      status = isPartialWeek ? "partial" : "future";
    } else {
      status = weekTracked >= weekTarget && weekTarget > 0 ? "met" : "under";
    }

    if (isClosed) {
      closedWeekCount += 1;
      if (status === "met") {
        weeksOnTarget += 1;
        if (!firstMetWeekLabel) {
          firstMetWeekLabel = label;
        }
      }
      if (!isPartialWeek) {
        fullWeekCount += 1;
        fullWeekTotal += weekTracked;
      }
    }

    const remaining = weekTarget - weekTracked;
    let deltaLabel: string;
    if (status === "met") {
      deltaLabel = "✓ met";
    } else if (status === "current") {
      deltaLabel = remaining > 0 ? `${formatHourValue(remaining)}h left` : "✓ met";
    } else if (status === "under") {
      deltaLabel = `-${formatHourValue(Math.max(remaining, 0))}h`;
    } else if (status === "partial") {
      deltaLabel = `${inMonthWorkingDays} day${inMonthWorkingDays === 1 ? "" : "s"}`;
    } else {
      deltaLabel = "upcoming";
    }

    const firstKey = inMonthKeys[0] ?? weekState.weekKey;
    const lastKey = inMonthKeys[inMonthKeys.length - 1] ?? weekState.weekKey;

    return {
      weekKey: weekState.weekKey,
      label,
      rangeLabel: formatRange(firstKey, lastKey),
      status,
      isCurrent: hasToday,
      days,
      trackedHours: weekTracked,
      targetHours: weekTarget,
      fillPct: weekTarget > 0 ? Math.min(100, Math.round((weekTracked / weekTarget) * 100)) : 0,
      deltaLabel
    };
  });

  const isCurrentMonth =
    today.getFullYear() === anchor.getFullYear() && today.getMonth() === anchor.getMonth();

  return {
    monthKey: toLocalDateKey(monthStart),
    monthLabel: MONTH_LABEL_FORMATTER.format(monthStart).toUpperCase(),
    isCurrentMonth,
    trackedHours,
    targetHours,
    loggedPct: targetHours > 0 ? Math.round((trackedHours / targetHours) * 100) : 0,
    gapCount,
    hoursToFill: Math.round(hoursToFill),
    weeksOnTarget,
    closedWeekCount,
    firstMetWeekLabel,
    averageFullWeekHours: fullWeekCount > 0 ? fullWeekTotal / fullWeekCount : 0,
    fullWeekCount,
    gapThresholdHours: Math.round(gapThreshold),
    weeks
  };
};

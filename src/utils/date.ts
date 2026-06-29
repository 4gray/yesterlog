export const WEEKDAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const SHORT_WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

export const startOfWeekMonday = (date: Date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = start.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + offset);
  start.setHours(0, 0, 0, 0);
  return start;
};

export const toLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const fromLocalDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export const isoWeekday = (date: Date) => {
  const day = date.getDay();
  return day === 0 ? 7 : day;
};

export const formatWeekRange = (weekStart: Date) => {
  const weekEnd = addDays(weekStart, 6);
  const sameYear = weekStart.getFullYear() === weekEnd.getFullYear();
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const monthFormatter = new Intl.DateTimeFormat(undefined, { month: "short" });

  if (sameMonth && sameYear) {
    return `${monthFormatter.format(weekStart)} ${weekStart.getDate()} - ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
  }

  if (sameYear) {
    return `${monthFormatter.format(weekStart)} ${weekStart.getDate()} - ${monthFormatter.format(weekEnd)} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
  }

  return `${monthFormatter.format(weekStart)} ${weekStart.getDate()}, ${weekStart.getFullYear()} - ${monthFormatter.format(weekEnd)} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
};

export const formatShortDate = (date: Date) => {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(date);
};

export const getIsoWeekNumber = (date: Date) => {
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // Shift to the Thursday of the current ISO week.
  const dayOffset = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayOffset + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const firstDayOffset = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayOffset + 3);
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000));
};

export const formatWeekRangeCompact = (weekStart: Date) => {
  const weekEnd = addDays(weekStart, 6);
  const monthFormatter = new Intl.DateTimeFormat(undefined, { month: "short" });
  const startMonth = monthFormatter.format(weekStart).toUpperCase();

  if (weekStart.getMonth() === weekEnd.getMonth()) {
    return `${startMonth} ${weekStart.getDate()}–${weekEnd.getDate()}`;
  }

  const endMonth = monthFormatter.format(weekEnd).toUpperCase();
  return `${startMonth} ${weekStart.getDate()} – ${endMonth} ${weekEnd.getDate()}`;
};

export const formatHours = (hours: number, maxFractions = 1) => {
  const safeHours = Number.isFinite(hours) ? hours : 0;
  return `${safeHours.toLocaleString(undefined, {
    minimumFractionDigits: safeHours % 1 === 0 ? 0 : 1,
    maximumFractionDigits: maxFractions
  })}h`;
};

export const formatDuration = (hours: number) => {
  const totalMinutes = Math.max(Math.round(hours * 60), 0);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${wholeHours}h` : `${wholeHours}h ${String(minutes).padStart(2, "0")}m`;
};

// Always shows minutes (e.g. "2h 00m", "45m") — used by the time composer.
export const formatClock = (seconds: number) => {
  const totalMinutes = Math.max(Math.round(seconds / 60), 0);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return wholeHours === 0 ? `${minutes}m` : `${wholeHours}h ${String(minutes).padStart(2, "0")}m`;
};

export type JiraDurationUnit = "h" | "d" | "w";

export const JIRA_DURATION_UNIT_SECONDS: Record<JiraDurationUnit, number> = {
  h: 3600,
  d: 8 * 3600,
  w: 5 * 8 * 3600
};

export const jiraUnitDurationToSeconds = (amountValue: string | number, unit: JiraDurationUnit) => {
  const amount = typeof amountValue === "number" ? amountValue : Number(amountValue);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }
  return Math.round(amount * JIRA_DURATION_UNIT_SECONDS[unit]);
};

// Parses Jira-style durations ("2w 4d 6h 45m", "1h 30m", "45m") or a bare
// number of hours. Jira defaults: 1w = 5d, 1d = 8h. Returns null if unparseable.
export const parseDurationToSeconds = (text: string): number | null => {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const unitSeconds: Record<string, number> = { ...JIRA_DURATION_UNIT_SECONDS, m: 60 };
  const matches = [...trimmed.matchAll(/(\d+(?:\.\d+)?)\s*(w|d|h|m)/g)];

  if (matches.length > 0) {
    const seconds = matches.reduce((sum, match) => sum + parseFloat(match[1]) * unitSeconds[match[2]], 0);
    return Math.round(seconds);
  }

  const plainHours = Number(trimmed);
  return Number.isFinite(plainHours) ? Math.round(plainHours * 3600) : null;
};

// 24h "H:MM" (no leading zero on hour) to match the design's worklog ranges.
export const formatHm24 = (date: Date) => `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;

import type { WeekdayNumber } from "./types";

export const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const satisfies readonly WeekdayNumber[];
export const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5] as const satisfies readonly WeekdayNumber[];

export const WEEKDAY_OPTIONS = [
  { value: 1, label: "MON", longLabel: "Monday", shortLabel: "Mon" },
  { value: 2, label: "TUE", longLabel: "Tuesday", shortLabel: "Tue" },
  { value: 3, label: "WED", longLabel: "Wednesday", shortLabel: "Wed" },
  { value: 4, label: "THU", longLabel: "Thursday", shortLabel: "Thu" },
  { value: 5, label: "FRI", longLabel: "Friday", shortLabel: "Fri" },
  { value: 6, label: "SAT", longLabel: "Saturday", shortLabel: "Sat" },
  { value: 7, label: "SUN", longLabel: "Sunday", shortLabel: "Sun" }
] as const satisfies readonly {
  value: WeekdayNumber;
  label: string;
  longLabel: string;
  shortLabel: string;
}[];

export const isWeekdayNumber = (value: unknown): value is WeekdayNumber =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 7;

export const normalizeWorkingDays = (days: readonly unknown[] | undefined): WeekdayNumber[] => {
  const normalized = Array.from(new Set((days ?? []).filter(isWeekdayNumber))).sort((a, b) => a - b);
  return normalized.length > 0 ? normalized : [...DEFAULT_WORKING_DAYS];
};

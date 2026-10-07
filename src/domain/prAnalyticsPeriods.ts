import { addDays, fromLocalDateKey, toLocalDateKey } from "../utils/date";
import type { AnalyticsRange } from "./prAnalytics";

const validDate = (key: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return undefined;
  const date = fromLocalDateKey(key);
  return Number.isFinite(+date) && toLocalDateKey(date) === key ? date : undefined;
};
export const calendarDays = (range: AnalyticsRange) => {
  const civil = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((civil(range.end) - civil(range.start)) / 86400000);
};
export function customAnalyticsRange(
  from: string,
  to: string,
  today: Date
): { range?: AnalyticsRange; error?: string } {
  const start = validDate(from),
    last = validDate(to);
  if (!start || !last) return { error: "Choose valid start and end dates." };
  if (+start > +last) return { error: "End date must be on or after start date." };
  if (to > toLocalDateKey(today)) return { error: "Choose an end date no later than today." };
  const range = { start, end: addDays(last, 1) };
  if (calendarDays(range) > 366) return { error: "Choose a period of up to 366 days." };
  return { range };
}
export const previousAnalyticsRange = (range: AnalyticsRange): AnalyticsRange => ({
  start: addDays(range.start, -calendarDays(range)),
  end: new Date(range.start)
});
export const analyticsRangeLabel = (range: AnalyticsRange) => {
  const label = (date: Date) =>
    date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${label(range.start)} – ${label(addDays(range.end, -1))}`;
};

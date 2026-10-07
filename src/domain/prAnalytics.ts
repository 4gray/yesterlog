import {
  ALL_ANALYTICS_REPOSITORIES,
  analyticsUserKey,
  sameAnalyticsUser,
  type PrAnalyticsPullRequest,
  type PrAnalyticsRepository
} from "../../shared/prAnalytics";
import { addDays, startOfWeekMonday, toLocalDateKey } from "../utils/date";

export type AnalyticsAuthor = "me" | "all";
export type AnalyticsGrouping = "week" | "month";
export type AnalyticsPeriod = "4w" | "12w" | "6m" | "12m";
export interface AnalyticsRange {
  start: Date;
  end: Date;
}
export interface Distribution {
  median?: number;
  p75?: number;
  n: number;
}
export type AnalyticsCohort = "created" | "merged" | "comments";
export const inAnalyticsRange = (at: string | undefined, range: AnalyticsRange) =>
  Boolean(at && Date.parse(at) >= range.start.getTime() && Date.parse(at) < range.end.getTime());
export const elapsedHours = (start?: string, end?: string): number | undefined => {
  const value = start && end ? (Date.parse(end) - Date.parse(start)) / 3600000 : NaN;
  return Number.isFinite(value) && value >= 0 ? value : undefined;
};
export const distribution = (values: Array<number | undefined>): Distribution => {
  const sorted = values
    .filter((v): v is number => v !== undefined && Number.isFinite(v))
    .sort((a, b) => a - b);
  const quantile = (q: number) => {
    if (!sorted.length) return undefined;
    const pos = (sorted.length - 1) * q,
      lower = Math.floor(pos);
    return sorted[lower] + (sorted[Math.ceil(pos)] - sorted[lower]) * (pos - lower);
  };
  return { median: quantile(0.5), p75: quantile(0.75), n: sorted.length };
};
export const analyticsRange = (today: Date, period: AnalyticsPeriod): AnalyticsRange => {
  // Include the current, explicitly partial week/month through the end of today.
  const end = addDays(new Date(today.getFullYear(), today.getMonth(), today.getDate()), 1);
  const start = period.endsWith("w")
    ? addDays(startOfWeekMonday(today), -(parseInt(period) - 1) * 7)
    : new Date(today.getFullYear(), today.getMonth() - (parseInt(period) - 1), 1);
  return { start, end };
};
export const analyticsCohort = (
  prs: PrAnalyticsPullRequest[],
  range: AnalyticsRange,
  cohort: AnalyticsCohort
) =>
  prs.filter((p) =>
    cohort === "created"
      ? inAnalyticsRange(p.createdAt, range)
      : cohort === "merged"
        ? p.activityComplete && inAnalyticsRange(p.mergedAt, range)
        : p.commentsComplete && p.comments.some((c) => inAnalyticsRange(c.createdAt, range))
  );

export function summarizePrAnalytics(prs: PrAnalyticsPullRequest[], range: AnalyticsRange) {
  const created = analyticsCohort(prs, range, "created");
  const merged = analyticsCohort(prs, range, "merged");
  const responseEligible = created.filter(
    (p) => p.activityComplete && p.commentsComplete && analyticsUserKey(p.author)
  );
  return {
    created: created.length,
    merged: merged.length,
    comments: prs
      .filter((p) => p.commentsComplete)
      .reduce((sum, p) => sum + p.comments.filter((c) => inAnalyticsRange(c.createdAt, range)).length, 0),
    merge: distribution(merged.map((p) => elapsedHours(p.createdAt, p.mergedAt))),
    response: distribution(responseEligible.map((p) => elapsedHours(p.createdAt, p.firstResponseAt))),
    review: distribution(
      merged.filter((p) => p.commentsComplete).map((p) => elapsedHours(p.firstResponseAt, p.mergedAt))
    ),
    responseEligible: responseEligible.length,
    missingMerge: prs.filter((p) => p.mergeTimeMissing).length,
    unknownAuthor: prs.filter((p) => !analyticsUserKey(p.author)).length
  };
}
export function buildPrAnalytics(
  repositories: PrAnalyticsRepository[],
  configured: string[],
  repository: string,
  author: AnalyticsAuthor,
  range: AnalyticsRange,
  grouping: AnalyticsGrouping
) {
  const selected = repository === ALL_ANALYTICS_REPOSITORIES ? configured : configured.filter((r) => r === repository);
  const coverage = selected.map((name) => {
    const result = repositories.find((r) => r.repository === name);
    const coversRange = Boolean(
      result &&
      Date.parse(result.rangeStart) <= range.start.getTime() &&
      Date.parse(result.rangeEnd) >= range.end.getTime()
    );
    return {
      repository: name,
      result,
      coversRange,
      complete: Boolean(result?.complete && coversRange)
    };
  });
  // Never show an old, shorter window as a newly selected larger range.
  const records = coverage
    .filter((c) => c.coversRange)
    .flatMap((c) =>
      c.result!.pullRequests.filter((p) => author === "all" || sameAnalyticsUser(p.author, c.result!.user))
    );
  const prs = [...new Map(records.map((p) => [p.key, p])).values()];
  const missingAuthors = coverage.some(
    (c) => c.coversRange && c.result?.pullRequests.some((p) => !analyticsUserKey(p.author))
  );
  const complete =
    coverage.length > 0 && coverage.every((c) => c.complete) && (author === "all" || !missingAuthors);
  const buckets = [];
  let cursor =
    grouping === "week"
      ? startOfWeekMonday(range.start)
      : new Date(range.start.getFullYear(), range.start.getMonth(), 1);
  while (cursor < range.end) {
    const end =
      grouping === "week" ? addDays(cursor, 7) : new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const bucketRange = {
      start: new Date(Math.max(+cursor, +range.start)),
      end: new Date(Math.min(+end, +range.end))
    };
    buckets.push({
      key: toLocalDateKey(cursor),
      label: cursor.toLocaleDateString("en-GB", {
        month: "short",
        ...(grouping === "week" ? { day: "numeric" } : { year: "2-digit" })
      }),
      range: bucketRange,
      partial: +cursor < +range.start || +end > +range.end,
      ...summarizePrAnalytics(prs, bucketRange)
    });
    cursor = end;
  }
  return {
    prs,
    coverage,
    complete,
    missingAuthors,
    buckets,
    ...summarizePrAnalytics(prs, range)
  };
}
export const formatAnalyticsDuration = (hours?: number) =>
  hours === undefined
    ? "—"
    : hours < 1
      ? `${Math.round(hours * 60)}m`
      : hours < 24
        ? `${hours.toFixed(1)}h`
        : `${(hours / 24).toFixed(1)}d`;

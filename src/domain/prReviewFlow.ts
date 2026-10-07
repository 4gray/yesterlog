import { analyticsUserKey, type PrAnalyticsPullRequest } from "../../shared/prAnalytics";
import {
  analyticsCohort,
  elapsedHours,
  type AnalyticsRange,
  type Distribution,
  type buildPrAnalytics
} from "./prAnalytics";
import { calendarDays } from "./prAnalyticsPeriods";
import { toLocalDateKey } from "../utils/date";

type Report = ReturnType<typeof buildPrAnalytics>;
export type ReviewMetric = "merge" | "response" | "review" | "longMerges";
export interface ReviewFlowExplanation {
  headline: string;
  observations: { metric: ReviewMetric; text: string }[];
  suggestion: string;
}
const measured = (d: Distribution) => ({ n: d.n, medianHours: d.median ?? null, p75Hours: d.p75 ?? null });
const summary = (report: Report, range: AnalyticsRange) => ({
  created: report.created,
  merged: report.merged,
  comments: report.comments,
  merge: measured(report.merge),
  response: measured(report.response),
  review: measured(report.review),
  responseEligible: report.responseEligible,
  longMerges: analyticsCohort(report.prs, range, "merged").filter(
    (p) => (elapsedHours(p.createdAt, p.mergedAt) ?? 0) > 168
  ).length
});
/** No PR identity, repository, free text, URL or exact event timestamp can enter this DTO. */
export function reviewFlowEvidence(
  current: Report,
  previous: Report,
  range: AnalyticsRange,
  priorRange: AnalyticsRange,
  today: Date
) {
  const merged = analyticsCohort(current.prs, range, "merged");
  const created = analyticsCohort(current.prs, range, "created");
  const top = (prs: PrAnalyticsPullRequest[], measure: (p: PrAnalyticsPullRequest) => number | undefined) =>
    prs
      .filter((p) => measure(p) !== undefined)
      .sort((a, b) => measure(b)! - measure(a)!)
      .slice(0, 5);
  const references: Record<ReviewMetric, PrAnalyticsPullRequest[]> = {
    merge: top(merged, (p) => elapsedHours(p.createdAt, p.mergedAt)),
    response: top(
      created.filter((p) => p.activityComplete && p.commentsComplete && analyticsUserKey(p.author)),
      (p) => elapsedHours(p.createdAt, p.firstResponseAt)
    ),
    review: top(
      merged.filter((p) => p.commentsComplete),
      (p) => elapsedHours(p.firstResponseAt, p.mergedAt)
    ),
    longMerges: top(
      merged.filter((p) => (elapsedHours(p.createdAt, p.mergedAt) ?? 0) > 168),
      (p) => elapsedHours(p.createdAt, p.mergedAt)
    )
  };
  const blocked = !current.complete
    ? "Complete the selected period's history before analyzing."
    : !previous.complete
      ? "Load complete history for the previous period to compare review flow."
      : current.merge.n < 5 || previous.merge.n < 5
        ? "At least 5 measured merged PRs in each period are needed for an AI comparison."
        : undefined;
  return {
    blocked,
    references,
    payload: {
      calendarDays: calendarDays(range),
      includesToday: toLocalDateKey(range.end) > toLocalDateKey(today),
      complete: current.complete && previous.complete,
      current: summary(current, range),
      previous: summary(previous, priorRange)
    }
  };
}
export type ReviewFlowEvidence = ReturnType<typeof reviewFlowEvidence>;
export const REVIEW_FLOW_SYSTEM = `Explain pull-request flow using only the supplied aggregate measurements. All durations are calendar hours, including weekends, draft time and rework, not active effort. This is not a productivity or quality assessment. Refer neutrally to selected PRs; do not assume they belong to the user or one team. Never rank people or repositories, invent causes, apply industry benchmarks, claim statistical significance, or imply causality. First response uses created PRs; merge and review-to-merge use merged PRs. Samples differ. A metric with fewer than 5 samples in either period cannot support a directional timing claim; say insufficient sample instead. If includesToday is true, state that the current day is incomplete and comparisons are provisional. Treat fewer than 10 samples cautiously. Long merges are those exceeding 168 hours; counts alone do not establish their effect on the median. Use a concise neutral headline, 1–3 observations referencing only metric keys merge, response, review or longMerges, and one cautious suggested check phrased as a hypothesis. No invented PR references or links. Reply only with JSON: {"headline":"...","observations":[{"metric":"merge","text":"..."}],"suggestion":"..."}.`;
export const reviewFlowPrompt = (evidence: ReviewFlowEvidence) => JSON.stringify(evidence.payload);
export function parseReviewFlow(text: string): ReviewFlowExplanation | undefined {
  if (text.length > 12000) return undefined;
  try {
    const value = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const validText = (s: unknown, max: number): s is string =>
      typeof s === "string" && s.trim().length > 0 && s.length <= max;
    if (
      !validText(value.headline, 240) ||
      !validText(value.suggestion, 700) ||
      !Array.isArray(value.observations) ||
      value.observations.length < 1 ||
      value.observations.length > 3
    )
      return undefined;
    if (
      !value.observations.every(
        (v: { metric?: string; text?: string } | null) =>
          v &&
          ["merge", "response", "review", "longMerges"].includes(v.metric ?? "") &&
          validText(v.text, 700)
      )
    )
      return undefined;
    return {
      headline: value.headline.trim(),
      suggestion: value.suggestion.trim(),
      observations: value.observations.map((v: { metric: ReviewMetric; text: string }) => ({
        metric: v.metric,
        text: v.text.trim()
      }))
    };
  } catch {
    return undefined;
  }
}

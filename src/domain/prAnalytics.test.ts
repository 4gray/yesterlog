import { describe, expect, it } from "vitest";
import { analyticsCohort, analyticsRange, buildPrAnalytics, distribution, elapsedHours } from "./prAnalytics";
import type { PrAnalyticsPullRequest, PrAnalyticsRepository } from "../../shared/prAnalytics";
import { addDays } from "../utils/date";

const range = {
  start: new Date("2026-06-01T00:00:00Z"),
  end: new Date("2026-07-01T00:00:00Z")
};
const pr = (id: number, overrides: Partial<PrAnalyticsPullRequest> = {}): PrAnalyticsPullRequest => ({
  key: `repo:${id}`,
  id,
  repository: "repo",
  title: "PR",
  url: "https://bitbucket.org/team/repo/pull-requests/1",
  state: "MERGED",
  draft: false,
  author: { accountId: "me", displayName: "Same name" },
  createdAt: "2026-06-02T10:00:00Z",
  updatedAt: "2026-06-04T10:00:00Z",
  mergedAt: "2026-06-03T10:00:00Z",
  firstResponseAt: "2026-06-02T12:00:00Z",
  comments: [],
  activityComplete: true,
  commentsComplete: true,
  mergeTimeMissing: false,
  ...overrides
});
const repo = (
  name: string,
  prs: PrAnalyticsPullRequest[],
  overrides: Partial<PrAnalyticsRepository> = {}
): PrAnalyticsRepository => ({
  workspace: "team",
  repository: name,
  user: { accountId: "me" },
  rangeStart: range.start.toISOString(),
  rangeEnd: range.end.toISOString(),
  syncedAt: range.end.toISOString(),
  complete: true,
  listComplete: true,
  warnings: [],
  pullRequests: prs.map((p) => ({
    ...p,
    repository: name,
    key: `${name}:${p.id}`
  })),
  ...overrides
});
describe("PR analytics cohorts", () => {
  it("counts old PR merges and comments by event time, not last update", () => {
    const p = pr(1, {
      createdAt: "2026-05-20T00:00:00Z",
      mergedAt: "2026-06-04T00:00:00Z",
      updatedAt: "2026-07-02T00:00:00Z",
      comments: [
        {
          id: 1,
          createdAt: "2026-06-08T00:00:00Z",
          author: { accountId: "peer" }
        }
      ]
    });
    const report = buildPrAnalytics([repo("repo", [p])], ["repo"], "*", "me", range, "week");
    expect([report.created, report.merged, report.comments]).toEqual([0, 1, 1]);
    expect(report.buckets.reduce((n, b) => n + b.merged, 0)).toBe(1);
    expect(analyticsCohort(report.prs, range, "comments")).toHaveLength(1);
  });
  it("pools unequal samples and keeps equal PR ids in different repositories", () => {
    const a = repo("a", [pr(1, { mergedAt: "2026-06-06T14:00:00Z" })]); // 100h
    const b = repo("b", [
      pr(1, { mergedAt: "2026-06-02T11:00:00Z" }),
      pr(2, { mergedAt: "2026-06-02T12:00:00Z" }),
      pr(3, { mergedAt: "2026-06-02T13:00:00Z" })
    ]);
    const report = buildPrAnalytics([a, b], ["a", "b"], "*", "me", range, "month");
    expect(report.created).toBe(4);
    expect(report.merge.median).toBe(2.5);
    expect(report.merge.p75).toBe(27.25);
  });
  it("matches author identities, never display names, and retains peer comments", () => {
    const data = repo("repo", [
      pr(1, {
        comments: [
          {
            id: 1,
            createdAt: "2026-06-04T00:00:00Z",
            author: { accountId: "other" }
          }
        ]
      }),
      pr(2, { author: { accountId: "other", displayName: "Same name" } }),
      pr(3, { author: { displayName: "Same name" } })
    ]);
    const me = buildPrAnalytics([data], ["repo"], "*", "me", range, "week");
    expect([me.created, me.comments, me.complete, me.missingAuthors]).toEqual([1, 1, false, true]);
    expect(buildPrAnalytics([data], ["repo"], "*", "all", range, "week").created).toBe(3);
  });
  it("keeps missing histories and unresponsive PRs out of duration samples", () => {
    const data = repo(
      "repo",
      [
        pr(1, { firstResponseAt: undefined }),
        pr(2, { commentsComplete: false }),
        pr(3, {
          activityComplete: false,
          mergedAt: undefined,
          mergeTimeMissing: true
        })
      ],
      { complete: false }
    );
    const report = buildPrAnalytics([data], ["repo"], "repo", "me", range, "week");
    expect(report.response).toEqual({
      median: undefined,
      p75: undefined,
      n: 0
    });
    expect(report.responseEligible).toBe(1);
    expect(report.review.n).toBe(0);
    expect(report.missingMerge).toBe(1);
    expect(report.complete).toBe(false);
  });
  it("does not treat missing repositories or a narrower cached range as zero", () => {
    const data = repo("a", [pr(1)]);
    const report = buildPrAnalytics([data], ["a", "b"], "*", "all", range, "week");
    expect(report.complete).toBe(false);
    expect(report.created).toBe(1);
    expect(report.coverage[1].coversRange).toBe(false);
    const wider = buildPrAnalytics(
      [data],
      ["a"],
      "*",
      "all",
      { ...range, start: new Date("2026-05-01") },
      "week"
    );
    expect(wider.prs).toHaveLength(0);
    expect(wider.complete).toBe(false);
  });
  it("uses half-open bounds for creation, merge and comment counts", () => {
    const a = pr(1, {
      createdAt: range.start.toISOString(),
      mergedAt: range.end.toISOString(),
      comments: [{ id: 1, createdAt: range.end.toISOString(), author: {} }]
    });
    const b = pr(2, {
      createdAt: range.end.toISOString(),
      mergedAt: undefined
    });
    const report = buildPrAnalytics([repo("repo", [a, b])], ["repo"], "*", "all", range, "month");
    expect([report.created, report.merged, report.comments]).toEqual([1, 0, 0]);
  });
  it("retains calendar months, Monday weeks and marks the current partial bucket", () => {
    const selected = analyticsRange(new Date(2026, 0, 1, 14), "12w");
    expect(selected.start.getDay()).toBe(1);
    expect(selected.end.getDate()).toBe(2);
    expect(selected.end.getHours()).toBe(0);
    const monthly = analyticsRange(new Date(2026, 0, 1, 14), "6m");
    expect([monthly.start.getFullYear(), monthly.start.getMonth(), monthly.start.getDate()]).toEqual([
      2025, 7, 1
    ]);
    const buckets = buildPrAnalytics([], [], "all", "all", selected, "week").buckets;
    expect(buckets).toHaveLength(12);
    expect(buckets.at(-1)?.partial).toBe(true);
    expect(buckets.every((b) => b.range.start.getDay() === 1)).toBe(true);
  });
  it("walks DST weeks using local dates", () => {
    const start = new Date(2026, 2, 23),
      end = addDays(start, 14);
    const report = buildPrAnalytics([], [], "all", "all", { start, end }, "week");
    expect(report.buckets.map((b) => b.range.start.getHours())).toEqual([0, 0]);
    expect(report.buckets.map((b) => b.key)).toEqual(["2026-03-23", "2026-03-30"]);
  });
  it("preserves zero durations while excluding invalid or negative timestamps", () => {
    expect(elapsedHours("2026-01-01", "2026-01-01")).toBe(0);
    expect(elapsedHours("2026-01-02", "2026-01-01")).toBeUndefined();
    expect(elapsedHours("invalid", "2026-01-01")).toBeUndefined();
    expect(distribution([0, undefined, 2]).median).toBe(1);
  });
  it("does not count stale comments from an incomplete refresh", () => {
    const p = pr(1, {
      commentsComplete: false,
      comments: [{ id: 1, createdAt: "2026-06-02T00:00:00Z", author: { accountId: "peer" } }]
    });
    const report = buildPrAnalytics(
      [repo("repo", [p], { complete: false })],
      ["repo"],
      "*",
      "all",
      range,
      "month"
    );
    expect(report.comments).toBe(0);
    expect(report.complete).toBe(false);
    expect(analyticsCohort(report.prs, range, "comments")).toHaveLength(0);
  });
});

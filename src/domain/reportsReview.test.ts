import { describe, expect, it } from "vitest";
import type { BitbucketReviewSession, BitbucketReviewSyncResult } from "../../shared/types";
import { buildReportsReview, reviewSessionEffort } from "./reportsReview";

const session = (
  id: string,
  overrides: Partial<BitbucketReviewSession> = {}
): BitbucketReviewSession => ({
  id,
  workspace: "team",
  repositorySlug: "explorer-web",
  repositoryName: "Explorer Web",
  pullRequestId: 214,
  pullRequestTitle: "Review report",
  pullRequestUrl: "https://bitbucket.org/team/explorer-web/pull-requests/214",
  pullRequestState: "OPEN",
  pullRequestAuthorAccountId: "author-account",
  pullRequestAuthorDisplayName: "Mira Novak",
  isPullRequestAuthor: false,
  jiraIssueKey: "YLOG-214",
  dateKey: "2026-06-15",
  startedISO: "2026-06-15T09:00:00.000Z",
  endedISO: "2026-06-15T09:45:00.000Z",
  estimatedSeconds: 45 * 60,
  reviewStateLabel: "COMMENTED",
  commentCount: 3,
  activityCount: 4,
  confidence: "high",
  events: [],
  status: "unlogged",
  ...overrides
});

const result = (sessions: BitbucketReviewSession[]): BitbucketReviewSyncResult => ({
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-15T00:00:00.000Z",
  weekEndExclusiveISO: "2026-06-22T00:00:00.000Z",
  syncedAt: "2026-06-18T12:00:00.000Z",
  accountId: "reviewer",
  workspace: "team",
  repositoryCount: 1,
  pullRequestCount: new Set(sessions.map((item) => item.pullRequestId)).size,
  sessionCount: sessions.length,
  sessions
});

describe("reviewSessionEffort", () => {
  it("prefers the actual Jira duration for logged sessions", () => {
    expect(
      reviewSessionEffort(
        session("logged", {
          status: "logged",
          logged: {
            issueKey: "YLOG-214",
            worklogId: "wl-1",
            loggedAt: "2026-06-15T12:00:00.000Z",
            targetMode: "reviewed-ticket",
            timeSpentSeconds: 60 * 60,
            estimatedSecondsAtLog: 45 * 60
          }
        })
      )
    ).toEqual({
      loggedSeconds: 60 * 60,
      estimatedSeconds: 0,
      totalSeconds: 60 * 60
    });
  });

  it("keeps a legacy logged session estimate-backed when the actual amount is absent", () => {
    expect(
      reviewSessionEffort(
        session("legacy", {
          status: "logged",
          logged: {
            issueKey: "YLOG-214",
            worklogId: "wl-legacy",
            loggedAt: "2026-06-15T12:00:00.000Z",
            targetMode: "reviewed-ticket",
            estimatedSecondsAtLog: 50 * 60
          }
        })
      )
    ).toEqual({
      loggedSeconds: 0,
      estimatedSeconds: 50 * 60,
      totalSeconds: 50 * 60
    });
  });
});

describe("buildReportsReview", () => {
  it("separates peer review from own-PR follow-up", () => {
    const report = buildReportsReview(
      result([
        session("peer", { estimatedSeconds: 45 * 60 }),
        session("own", {
          pullRequestId: 220,
          isPullRequestAuthor: true,
          estimatedSeconds: 30 * 60,
          commentCount: 2
        })
      ])
    );

    expect(report.peerReview.totalSeconds).toBe(45 * 60);
    expect(report.ownPrFollowUp.totalSeconds).toBe(30 * 60);
    expect(report.reviewedPullRequestCount).toBe(1);
    expect(report.ownPullRequestCount).toBe(1);
    expect(report.commentsByYou).toBe(3);
  });

  it("aggregates multiple days for one PR and uses the latest state", () => {
    const report = buildReportsReview(
      result([
        session("day-one", {
          dateKey: "2026-06-15",
          startedISO: "2026-06-15T09:00:00.000Z",
          estimatedSeconds: 30 * 60,
          commentCount: 2,
          confidence: "high",
          reviewStateLabel: "COMMENTED"
        }),
        session("day-two", {
          dateKey: "2026-06-17",
          startedISO: "2026-06-17T11:00:00.000Z",
          estimatedSeconds: 45 * 60,
          commentCount: 5,
          confidence: "medium",
          reviewStateLabel: "CHANGES"
        })
      ])
    );

    expect(report.pullRequests).toHaveLength(1);
    expect(report.pullRequests[0]).toMatchObject({
      totalSeconds: 75 * 60,
      commentCount: 7,
      sessionCount: 2,
      firstDateKey: "2026-06-15",
      lastDateKey: "2026-06-17",
      reviewStateLabel: "CHANGES",
      confidence: "medium"
    });
    expect(report.days).toHaveLength(2);
  });

  it("keeps logged and estimated portions visible on a mixed PR", () => {
    const report = buildReportsReview(
      result([
        session("logged", {
          estimatedSeconds: 40 * 60,
          status: "logged",
          logged: {
            issueKey: "YLOG-214",
            worklogId: "wl-1",
            loggedAt: "2026-06-15T12:00:00.000Z",
            targetMode: "reviewed-ticket",
            timeSpentSeconds: 50 * 60,
            estimatedSecondsAtLog: 40 * 60
          }
        }),
        session("estimate", {
          dateKey: "2026-06-16",
          startedISO: "2026-06-16T11:00:00.000Z",
          estimatedSeconds: 25 * 60
        })
      ])
    );

    expect(report.pullRequests[0]).toMatchObject({
      loggedSeconds: 50 * 60,
      estimatedSeconds: 25 * 60,
      totalSeconds: 75 * 60,
      effortOrigin: "mixed"
    });
    expect(report.peerReview).toMatchObject({
      loggedSeconds: 50 * 60,
      estimatedSeconds: 25 * 60
    });
  });

  it("sorts by effort, then comments, with stable repository and PR fallbacks", () => {
    const report = buildReportsReview(
      result([
        session("low", { pullRequestId: 100, estimatedSeconds: 30 * 60, commentCount: 9 }),
        session("top-comments", {
          pullRequestId: 300,
          estimatedSeconds: 60 * 60,
          commentCount: 8
        }),
        session("top-effort", {
          pullRequestId: 200,
          estimatedSeconds: 60 * 60,
          commentCount: 12
        })
      ])
    );

    expect(report.pullRequests.map((pullRequest) => pullRequest.pullRequestId)).toEqual([
      200,
      300,
      100
    ]);
    expect(report.mostInvolved?.pullRequestId).toBe(200);
  });
});

import { describe, expect, it } from "vitest";
import type { AppSettings, BitbucketReviewSession, BitbucketReviewSyncResult } from "../../shared/types";
import {
  buildReviewWorklogComment,
  getBitbucketRepositorySlugs,
  getReviewStats,
  getReviewTargetIssueKey,
  isBitbucketConfigured,
  markReviewSessionsLogged,
  mergeReviewSessionStates
} from "./bitbucketReview";

const settings: AppSettings = {
  jiraBaseUrl: "https://example.atlassian.net",
  jiraEmail: "dev@example.com",
  jiraApiToken: "jira-token",
  bitbucketEmail: "dev@example.com",
  bitbucketApiToken: "bb-token",
  bitbucketWorkspace: "team",
  bitbucketRepositories: "explorer-web, explorer-core\nexplorer-web",
  bitbucketReviewBucketIssueKey: "TEAM-77",
  weeklyTargetHours: 40,
  workingDays: [1, 2, 3, 4, 5],
  reminderTime: "16:30",
  remindersEnabled: true
};

const session = (overrides: Partial<BitbucketReviewSession> = {}): BitbucketReviewSession => ({
  id: "team/explorer-web#214:2026-06-15",
  workspace: "team",
  repositorySlug: "explorer-web",
  repositoryName: "explorer-web",
  pullRequestId: 214,
  pullRequestTitle: "Active interrupt handling for poller",
  pullRequestUrl: "https://bitbucket.org/team/explorer-web/pull-requests/214",
  pullRequestState: "OPEN",
  sourceBranch: "feature/FTDM-328-poller",
  destinationBranch: "main",
  jiraIssueKey: "FTDM-328",
  dateKey: "2026-06-15",
  startedISO: "2026-06-15T07:40:00.000Z",
  endedISO: "2026-06-15T08:25:00.000Z",
  estimatedSeconds: 45 * 60,
  reviewStateLabel: "APPROVED",
  commentCount: 9,
  activityCount: 10,
  confidence: "high",
  events: [
    {
      id: "comment-1",
      type: "comment",
      occurredAt: "2026-06-15T07:45:00.000Z"
    }
  ],
  status: "unlogged",
  ...overrides
});

const result = (sessions: BitbucketReviewSession[]): BitbucketReviewSyncResult => ({
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-15T00:00:00.000Z",
  weekEndExclusiveISO: "2026-06-22T00:00:00.000Z",
  syncedAt: "2026-06-15T12:00:00.000Z",
  accountId: "{account-id}",
  displayName: "Demo Reviewer",
  workspace: "team",
  repositoryCount: 1,
  pullRequestCount: 1,
  sessionCount: sessions.length,
  sessions
});

describe("bitbucket review helpers", () => {
  it("parses unique configured repository slugs", () => {
    expect(getBitbucketRepositorySlugs(settings)).toEqual(["explorer-web", "explorer-core"]);
    expect(isBitbucketConfigured(settings)).toBe(true);
  });

  it("resolves reviewed-ticket and bucket targets", () => {
    expect(getReviewTargetIssueKey(session(), settings, "reviewed-ticket")).toBe("FTDM-328");
    expect(getReviewTargetIssueKey(session(), settings, "review-bucket")).toBe("TEAM-77");
    expect(getReviewTargetIssueKey(session({ jiraIssueKey: undefined }), settings, "reviewed-ticket")).toBeUndefined();
  });

  it("builds a Jira worklog comment from PR evidence", () => {
    const comment = buildReviewWorklogComment(session());

    expect(comment).toContain("Reviewed Bitbucket PR #214");
    expect(comment).toContain("https://bitbucket.org/team/explorer-web/pull-requests/214");
    expect(comment).toContain("9 comments");
  });

  it("preserves locally logged review session state after a fresh sync", () => {
    const logged = markReviewSessionsLogged(result([session()]), [
      {
        sessionId: session().id,
        logged: {
          issueKey: "FTDM-328",
          worklogId: "10001",
          loggedAt: "2026-06-15T12:30:00.000Z",
          targetMode: "reviewed-ticket"
        }
      }
    ]);

    const merged = mergeReviewSessionStates(result([session()]), logged);

    expect(merged.sessions[0]).toMatchObject({
      status: "logged",
      logged: {
        issueKey: "FTDM-328",
        worklogId: "10001"
      }
    });
  });

  it("summarizes review sessions", () => {
    expect(getReviewStats(result([session(), session({ id: "team/core#3:2026-06-16", repositorySlug: "core" })]))).toMatchObject({
      sessionCount: 2,
      unloggedCount: 2,
      estimatedSeconds: 90 * 60,
      reviewedPullRequestCount: 2,
      repositoryCount: 2,
      averageSecondsPerSession: 45 * 60
    });
  });
});

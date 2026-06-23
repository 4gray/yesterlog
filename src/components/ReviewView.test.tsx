import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AppSettings, BitbucketReviewSyncResult } from "../../shared/types";
import { ReviewView } from "./ReviewView";

const settings: AppSettings = {
  jiraBaseUrl: "https://example.atlassian.net",
  jiraEmail: "dev@example.com",
  jiraApiToken: "jira-token",
  bitbucketEmail: "dev@example.com",
  bitbucketApiToken: "bb-token",
  bitbucketWorkspace: "team",
  bitbucketRepositories: "explorer-web",
  bitbucketReviewBucketIssueKey: "TEAM-77",
  weeklyTargetHours: 40,
  workingDays: [1, 2, 3, 4, 5],
  reminderTime: "16:30",
  remindersEnabled: true
};

const reviewResult: BitbucketReviewSyncResult = {
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-15T00:00:00.000Z",
  weekEndExclusiveISO: "2026-06-22T00:00:00.000Z",
  syncedAt: "2026-06-15T12:00:00.000Z",
  accountId: "reviewer",
  displayName: "Demo Reviewer",
  workspace: "team",
  repositoryCount: 1,
  pullRequestCount: 1,
  sessionCount: 1,
  sessions: [
    {
      id: "team/explorer-web#214:2026-06-15",
      workspace: "team",
      repositorySlug: "explorer-web",
      repositoryName: "Explorer Web",
      pullRequestId: 214,
      pullRequestTitle: "Active interrupt handling for poller",
      pullRequestUrl: "https://bitbucket.org/team/explorer-web/pull-requests/214",
      pullRequestState: "OPEN",
      pullRequestAuthorAccountId: "author-account",
      pullRequestAuthorDisplayName: "Feature Author",
      isPullRequestAuthor: false,
      jiraIssueKey: "FTDM-328",
      dateKey: "2026-06-15",
      startedISO: "2026-06-15T09:40:00.000Z",
      endedISO: "2026-06-15T10:25:00.000Z",
      estimatedSeconds: 45 * 60,
      reviewStateLabel: "APPROVED",
      commentCount: 9,
      activityCount: 10,
      confidence: "high",
      events: [
        {
          id: "comment-1",
          type: "comment",
          occurredAt: "2026-06-15T09:45:00.000Z"
        }
      ],
      status: "unlogged"
    }
  ]
};

describe("ReviewView", () => {
  it("renders Bitbucket review sessions and Jira targets", () => {
    const markup = renderToStaticMarkup(
      <ReviewView
        weekKey="2026-06-15"
        weekStartISO="2026-06-15T00:00:00.000Z"
        settings={settings}
        result={reviewResult}
        issueUrlsByKey={{ "FTDM-328": "https://example.atlassian.net/browse/FTDM-328" }}
        issueTypesByKey={{}}
        isConfigured={true}
        isSyncing={false}
        isLogging={false}
        targetMode="reviewed-ticket"
        onTargetModeChange={() => undefined}
        onSync={() => undefined}
        onLogSessions={async () => true}
        onPreviousWeek={() => undefined}
        onCurrentWeek={() => undefined}
        onNextWeek={() => undefined}
      />
    );

    expect(markup).toContain("REVIEW — WEEK 25");
    expect(markup).toContain("PR #214");
    expect(markup).toContain("REVIEWED BY ME");
    expect(markup).toContain("MY PRS");
    expect(markup).toContain("How review time is estimated");
    expect(markup).toContain("APPROVED");
    expect(markup).toContain("Active interrupt handling for poller");
    expect(markup).toContain("author: Feature Author");
    expect(markup).toContain("FTDM-328");
    expect(markup).toContain("LOG 1 SESSION");
  });
});

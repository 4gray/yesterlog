// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, BitbucketReviewSession, BitbucketReviewSyncResult } from "../../shared/types";
import { ReviewView } from "./ReviewView";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
  remindersEnabled: true,
  aiEnabled: false,
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "llama3.1:8b",
};

const buildSession = (
  pullRequestId: number,
  overrides: Partial<BitbucketReviewSession> = {}
): BitbucketReviewSession => ({
  id: `team/explorer-web#${pullRequestId}:2026-06-15`,
  workspace: "team",
  repositorySlug: "explorer-web",
  repositoryName: "Explorer Web",
  pullRequestId,
  pullRequestTitle: `Review flow ${pullRequestId}`,
  pullRequestUrl: `https://bitbucket.org/team/explorer-web/pull-requests/${pullRequestId}`,
  pullRequestState: "OPEN",
  pullRequestAuthorAccountId: "author-account",
  pullRequestAuthorDisplayName: "Feature Author",
  isPullRequestAuthor: false,
  jiraIssueKey: `TBRO-${pullRequestId}`,
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
      id: `comment-${pullRequestId}`,
      type: "comment",
      occurredAt: "2026-06-15T09:45:00.000Z"
    }
  ],
  status: "unlogged",
  ...overrides
});

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
    buildSession(214, {
      pullRequestTitle: "Active interrupt handling for poller",
      jiraIssueKey: "TBRO-328"
    })
  ]
};

type ReviewViewProps = ComponentProps<typeof ReviewView>;

const baseProps = (): ReviewViewProps => ({
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-15T00:00:00.000Z",
  settings,
  result: reviewResult,
  issueUrlsByKey: { "TBRO-328": "https://example.atlassian.net/browse/TBRO-328" },
  issueTypesByKey: {},
  isConfigured: true,
  isSyncing: false,
  isLogging: false,
  targetMode: "reviewed-ticket" as const,
  onTargetModeChange: () => undefined,
  onSync: () => undefined,
  onLogSessions: async () => true,
  onPreviousWeek: () => undefined,
  onCurrentWeek: () => undefined,
  onNextWeek: () => undefined
});

let container: HTMLDivElement;
let root: Root;

const renderView = (props: Partial<ReviewViewProps> = {}) => {
  act(() => {
    root.render(<ReviewView {...baseProps()} {...props} />);
  });
};

const getButtonByText = (text: string) => {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent?.trim() === text
  );

  if (!button) {
    throw new Error(`Button not found: ${text}`);
  }

  return button;
};

const getDialogPanel = () => {
  const dialogPanel = container.querySelector<HTMLElement>(".review-dialog-panel");

  if (!dialogPanel) {
    throw new Error("Review dialog panel not found.");
  }

  return dialogPanel;
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ReviewView", () => {
  it("renders Bitbucket review sessions and Jira targets", () => {
    const markup = renderToStaticMarkup(
      <ReviewView
        weekKey="2026-06-15"
        weekStartISO="2026-06-15T00:00:00.000Z"
        settings={settings}
        result={reviewResult}
        issueUrlsByKey={{ "TBRO-328": "https://example.atlassian.net/browse/TBRO-328" }}
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
    expect(markup).toContain("TBRO-328");
    expect(markup).toContain("LOG 1 SESSION");
  });

  it("renders logged review sessions with Jira target, actual duration, and estimate delta", () => {
    const loggedResult = {
      ...reviewResult,
      sessions: [
        buildSession(214, {
          pullRequestTitle: "Active interrupt handling for poller",
          jiraIssueKey: "TBRO-328",
          status: "logged",
          logged: {
            issueKey: "TBRO-328",
            worklogId: "wl-214",
            loggedAt: "2026-06-15T12:30:00.000Z",
            targetMode: "reviewed-ticket",
            timeSpentSeconds: 60 * 60,
            estimatedSecondsAtLog: 45 * 60
          }
        })
      ]
    };

    const markup = renderToStaticMarkup(
      <ReviewView
        {...baseProps()}
        result={loggedResult}
        issueUrlsByKey={{ "TBRO-328": "https://example.atlassian.net/browse/TBRO-328" }}
      />
    );

    expect(markup).toContain("LOGGED");
    expect(markup).toContain("Review session for PR 214 logged");
    expect(markup).toContain("1h 00m");
    expect(markup).toContain("suggested 45m");
    expect(markup).toContain("+15m");
    expect(markup).toContain("TBRO-328");
    expect(markup).toContain("LOG 0 SESSIONS");
  });

  it("keeps the confirm dialog scoped to manually selected sessions after editing duration", async () => {
    const result = {
      ...reviewResult,
      pullRequestCount: 2,
      sessionCount: 2,
      sessions: [
        buildSession(214, {
          pullRequestTitle: "Active interrupt handling for poller",
          jiraIssueKey: "TBRO-328"
        }),
        buildSession(215, {
          pullRequestTitle: "Refresh account picker",
          jiraIssueKey: "TBRO-329"
        })
      ]
    };
    const onLogSessions = vi.fn(async () => true);
    renderView({
      result,
      issueUrlsByKey: {
        "TBRO-328": "https://example.atlassian.net/browse/TBRO-328",
        "TBRO-329": "https://example.atlassian.net/browse/TBRO-329"
      },
      onLogSessions
    });

    act(() => {
      container.querySelector<HTMLButtonElement>("[aria-label='Select PR 215']")?.click();
    });

    expect(getButtonByText("LOG 1 SESSION").disabled).toBe(false);

    act(() => {
      getButtonByText("LOG 1 SESSION").click();
    });

    expect(container.querySelectorAll(".review-dialog-item")).toHaveLength(1);
    expect(getDialogPanel().textContent).toContain("Active interrupt handling for poller");
    expect(getDialogPanel().textContent).not.toContain("Refresh account picker");

    act(() => {
      getButtonByText("1h").click();
    });

    expect(container.querySelectorAll(".review-dialog-item")).toHaveLength(1);
    expect(getButtonByText("CREATE 1 WORKLOG").disabled).toBe(false);

    await act(async () => {
      getButtonByText("CREATE 1 WORKLOG").click();
    });

    expect(onLogSessions).toHaveBeenCalledWith(["team/explorer-web#214:2026-06-15"], "reviewed-ticket", {
      "team/explorer-web#214:2026-06-15": 3600
    });
  });
});

// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, BitbucketReviewSyncResult } from "../../shared/types";
import { AppReviewRoute, type AppReviewRouteProps } from "./AppReviewRoute";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { reviewViewProps } = vi.hoisted(() => ({
  reviewViewProps: [] as Record<string, unknown>[]
}));

vi.mock("../components/ReviewView", () => ({
  ReviewView: (props: Record<string, unknown>) => {
    reviewViewProps.push(props);
    return (
      <section
        data-testid="review-view"
        data-week={String(props.weekKey)}
        data-configured={String(props.isConfigured)}
        data-syncing={String(props.isSyncing)}
        data-logging={String(props.isLogging)}
        data-target={String(props.targetMode)}
      >
        <button type="button" onClick={() => (props.onSync as () => void)()}>
          sync
        </button>
        <button type="button" onClick={() => (props.onTargetModeChange as (mode: string) => void)("review-bucket")}>
          target
        </button>
        <button
          type="button"
          onClick={() =>
            (props.onLogSessions as (
              sessionIds: string[],
              targetMode: string,
              durationOverrides: Record<string, number>,
              startedISOOverrides: Record<string, string>
            ) => void)(
              ["session-1"],
              "review-bucket",
              { "session-1": 1800 },
              { "session-1": "2026-06-18T09:30:00.000Z" }
            )
          }
        >
          log
        </button>
      </section>
    );
  }
}));

const settings: AppSettings = {
  jiraBaseUrl: "https://example.atlassian.net",
  jiraEmail: "person@example.com",
  jiraApiToken: "token",
  bitbucketEmail: "person@example.com",
  bitbucketApiToken: "bb-token",
  bitbucketWorkspace: "workspace",
  bitbucketRepositories: "repo",
  bitbucketReviewBucketIssueKey: "REV-1",
  weeklyTargetHours: 32,
  workingDays: [1, 2, 3, 4],
  reminderTime: "17:30",
  remindersEnabled: true,
  aiEnabled: false,
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "llama3.1:8b",
};

const result = {
  syncedAt: "2026-06-25T09:00:00.000Z",
  sessions: []
} as unknown as BitbucketReviewSyncResult;

const noop = () => undefined;
const asyncFalse = async () => false;

const baseProps = (): AppReviewRouteProps => ({
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-15T00:00:00.000Z",
  settings,
  visibleBitbucketReviewResult: result,
  issueUrlsByKey: { "YLOG-999": "https://example.atlassian.net/browse/YLOG-999" },
  issueTypesByKey: {},
  isBitbucketReady: true,
  isSyncingReviews: false,
  isLoggingReview: false,
  reviewTargetMode: "reviewed-ticket",
  setReviewTargetMode: noop,
  handleReviewSync: noop,
  handleLogReviewSessions: asyncFalse,
  goToPreviousWeek: noop,
  goToCurrentWeek: noop,
  goToNextWeek: noop
});

let container: HTMLDivElement;
let root: Root;

const renderRoute = (props: Partial<AppReviewRouteProps> = {}) => {
  act(() => {
    root.render(<AppReviewRoute {...baseProps()} {...props} />);
  });
};

beforeEach(() => {
  reviewViewProps.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("AppReviewRoute", () => {
  it("maps app-level review state to ReviewView props", () => {
    renderRoute({ isSyncingReviews: true, isLoggingReview: true, reviewTargetMode: "review-bucket" });

    const rendered = container.querySelector("[data-testid='review-view']");
    expect(rendered?.getAttribute("data-week")).toBe("2026-06-15");
    expect(rendered?.getAttribute("data-configured")).toBe("true");
    expect(rendered?.getAttribute("data-syncing")).toBe("true");
    expect(rendered?.getAttribute("data-logging")).toBe("true");
    expect(rendered?.getAttribute("data-target")).toBe("review-bucket");
    expect(reviewViewProps[0]?.settings).toBe(settings);
    expect(reviewViewProps[0]?.result).toBe(result);
    expect(reviewViewProps[0]?.issueUrlsByKey).toEqual({
      "YLOG-999": "https://example.atlassian.net/browse/YLOG-999"
    });
  });

  it("passes ReviewView actions through unchanged", () => {
    const handleReviewSync = vi.fn();
    const setReviewTargetMode = vi.fn();
    const handleLogReviewSessions = vi.fn();
    renderRoute({
      handleReviewSync,
      setReviewTargetMode,
      handleLogReviewSessions
    });

    act(() => {
      container.querySelectorAll("button")[0]?.click();
      container.querySelectorAll("button")[1]?.click();
      container.querySelectorAll("button")[2]?.click();
    });

    expect(handleReviewSync).toHaveBeenCalledTimes(1);
    expect(setReviewTargetMode).toHaveBeenCalledWith("review-bucket");
    expect(handleLogReviewSessions).toHaveBeenCalledWith(
      ["session-1"],
      "review-bucket",
      { "session-1": 1800 },
      { "session-1": "2026-06-18T09:30:00.000Z" }
    );
  });
});

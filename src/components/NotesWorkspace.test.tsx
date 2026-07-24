// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AppSettings,
  BitbucketPullRequestDetailsResult,
  BitbucketReviewSyncResult,
  JiraTicket
} from "../../shared/types";
import * as aiApi from "../api/ollama";
import { nativeApi } from "../api/native";
import type {
  NoteTicketActivity,
  WorkspaceNoteBucket
} from "../domain/ticketNotes";
import { NotesWorkspace, type NotesWorkspaceProps } from "./NotesWorkspace";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const storageMocks = vi.hoisted(() => ({
  getWorkspaceNoteBuckets: vi.fn<() => Promise<WorkspaceNoteBucket[]>>(),
  getNoteNotebooks: vi.fn<() => Promise<never[]>>(),
  getNoteTicketActivity: vi.fn<() => Promise<NoteTicketActivity[]>>(),
  getBitbucketReviewResults: vi.fn<() => Promise<BitbucketReviewSyncResult[]>>(),
  saveWorkspaceNoteBucket: vi.fn(async (_bucket: WorkspaceNoteBucket) => undefined),
  saveWorkspaceNoteBuckets: vi.fn(async (_buckets: WorkspaceNoteBucket[]) => undefined),
  saveNoteNotebooks: vi.fn(async (_notebooks: unknown[]) => undefined)
}));

vi.mock("../storage/db", () => storageMocks);

const settings: AppSettings = {
  jiraBaseUrl: "https://example.atlassian.net",
  jiraEmail: "person@example.com",
  jiraApiToken: "token",
  bitbucketEmail: "person@example.com",
  bitbucketApiToken: "bb-token",
  bitbucketWorkspace: "team",
  bitbucketRepositories: "web",
  bitbucketReviewBucketIssueKey: "",
  weeklyTargetHours: 40,
  workingDays: [1, 2, 3, 4, 5],
  reminderTime: "17:00",
  remindersEnabled: false,
  aiEnabled: false,
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "llama3.1:8b"
};

const ticket: JiraTicket = {
  id: "10001",
  key: "TB-352",
  summary: "Migrate session storage to Redis",
  projectKey: "TB",
  projectName: "Yesterlog",
  statusName: "In progress",
  statusCategory: "indeterminate",
  loggedSecondsTotal: 13_500,
  issueType: { name: "Task", hierarchyLevel: 0 },
  url: "https://example.atlassian.net/browse/TB-352"
};

const currentDate = new Date(2026, 5, 17, 12);
const currentStarted = new Date(2026, 5, 17, 10).toISOString();

const reviewResultFor = (
  pullRequestId: number,
  occurredAt = currentStarted
): BitbucketReviewSyncResult => ({
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-15T00:00:00.000Z",
  weekEndExclusiveISO: "2026-06-22T00:00:00.000Z",
  syncedAt: occurredAt,
  workspace: "team",
  repositoryCount: 1,
  pullRequestCount: 1,
  sessionCount: 1,
  sessions: [
    {
      id: `session-${pullRequestId}`,
      workspace: "team",
      repositorySlug: "web",
      repositoryName: "Web",
      pullRequestId,
      pullRequestTitle: `Redis store ${pullRequestId}`,
      pullRequestUrl: `https://bitbucket.org/team/web/pull-requests/${pullRequestId}`,
      pullRequestState: "OPEN",
      jiraIssueKey: "TB-352",
      dateKey: "2026-06-17",
      startedISO: occurredAt,
      endedISO: occurredAt,
      estimatedSeconds: 900,
      reviewStateLabel: "COMMENTED",
      commentCount: 1,
      activityCount: 1,
      confidence: "high",
      events: [],
      status: "unlogged"
    }
  ]
});

const pullRequestDetailsFor = (
  pullRequestId: number
): BitbucketPullRequestDetailsResult => ({
  workspace: "team",
  repositorySlug: "web",
  pullRequestId,
  title: `Redis store ${pullRequestId}`,
  state: "OPEN",
  url: `https://bitbucket.org/team/web/pull-requests/${pullRequestId}`,
  approvalCount: 1,
  commentCount: 0,
  tasks: [],
  comments: []
});

const baseProps = (
  overrides: Partial<NotesWorkspaceProps> = {}
): NotesWorkspaceProps => ({
  settings,
  currentDate,
  isDemo: false,
  ticketOptions: [ticket],
  tickets: undefined,
  syncResult: undefined,
  reviewResult: undefined,
  searchTickets: vi.fn(async () => []),
  onError: vi.fn(),
  ...overrides
});

const setInput = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const buttonWithText = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
    button.textContent?.includes(text)
  );

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  storageMocks.getWorkspaceNoteBuckets.mockReset().mockResolvedValue([]);
  storageMocks.getNoteNotebooks.mockReset().mockResolvedValue([]);
  storageMocks.getNoteTicketActivity.mockReset().mockResolvedValue([]);
  storageMocks.getBitbucketReviewResults.mockReset().mockResolvedValue([]);
  storageMocks.saveWorkspaceNoteBucket.mockClear();
  storageMocks.saveWorkspaceNoteBuckets.mockClear();
  storageMocks.saveNoteNotebooks.mockClear();
  vi.restoreAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("NotesWorkspace", () => {
  it("creates a local to-do from the [] composer prefix", async () => {
    await act(async () => {
      root.render(<NotesWorkspace {...baseProps()} />);
    });
    await flush();

    const composer = container.querySelector<HTMLInputElement>(
      'input[placeholder^="Add a note to General"]'
    )!;
    setInput(composer, "[] Benchmark session reads");
    act(() => {
      composer.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
    });
    await flush();

    expect(container.textContent).toContain("Benchmark session reads");
    expect(storageMocks.saveWorkspaceNoteBucket).toHaveBeenCalledWith(
      expect.objectContaining({
        containerId: "GENERAL",
        notes: [
          expect.objectContaining({
            type: "todo",
            done: false,
            text: "Benchmark session reads"
          })
        ]
      })
    );
  });

  it("keeps readable local notes available when optional activity history fails", async () => {
    storageMocks.getWorkspaceNoteBuckets.mockResolvedValue([
      {
        containerId: "GENERAL",
        notes: [
          {
            id: "saved-note",
            type: "text",
            done: false,
            text: "Saved locally",
            createdAt: currentStarted,
            updatedAt: currentStarted
          }
        ]
      }
    ]);
    storageMocks.getNoteTicketActivity.mockRejectedValue(
      new Error("Activity index unavailable")
    );
    storageMocks.getBitbucketReviewResults.mockRejectedValue(
      new Error("Review history unavailable")
    );
    const onError = vi.fn();

    await act(async () => {
      root.render(<NotesWorkspace {...baseProps({ onError })} />);
    });
    await flush();

    expect(container.textContent).toContain("Saved locally");
    expect(container.textContent).not.toContain("Local notes could not be opened");
    expect(onError).not.toHaveBeenCalled();
  });

  it("blocks note writes and offers retry when critical local storage cannot be read", async () => {
    storageMocks.getWorkspaceNoteBuckets.mockRejectedValue(
      new Error("IndexedDB unavailable")
    );

    await act(async () => {
      root.render(<NotesWorkspace {...baseProps()} />);
    });
    await flush();

    expect(container.textContent).toContain("Local notes could not be opened");
    expect(buttonWithText(container, "Retry")).toBeTruthy();
    expect(storageMocks.saveWorkspaceNoteBucket).not.toHaveBeenCalled();
  });

  it("cancels inline edits with Escape and archives/restores without counting the item", async () => {
    storageMocks.getWorkspaceNoteBuckets.mockResolvedValue([
      {
        containerId: "GENERAL",
        notes: [
          {
            id: "note-1",
            type: "todo",
            done: false,
            text: "Keep the original",
            createdAt: currentStarted,
            updatedAt: currentStarted
          }
        ]
      }
    ]);
    await act(async () => {
      root.render(<NotesWorkspace {...baseProps()} />);
    });
    await flush();

    act(() => buttonWithText(container, "Keep the original")?.click());
    const edit = container.querySelector<HTMLInputElement>(".notes-inline-edit")!;
    setInput(edit, "Changed accidentally");
    act(() => {
      edit.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    expect(container.textContent).toContain("Keep the original");
    expect(container.textContent).not.toContain("Changed accidentally");

    act(() =>
      container
        .querySelector<HTMLButtonElement>('button[aria-label="Archive note"]')
        ?.click()
    );
    await flush();
    expect(buttonWithText(container, "Archive · 1")).toBeTruthy();
    expect(container.textContent).not.toContain("Keep the original");

    act(() => buttonWithText(container, "Archive · 1")?.click());
    expect(container.textContent).toContain("Keep the original");
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Restore from archive"]'
        )
        ?.click()
    );
    await flush();
    expect(buttonWithText(container, "Archive · 0")).toBeTruthy();
  });

  it("keeps the selected Jira snapshot while modal search changes, then lands on the note", async () => {
    vi.useFakeTimers();
    const searchTickets = vi.fn(async () => []);
    await act(async () => {
      root.render(
        <NotesWorkspace {...baseProps({ searchTickets })} />
      );
    });
    await flush();

    act(() =>
      container
        .querySelector<HTMLButtonElement>('button[aria-label="New note"]')
        ?.click()
    );
    const textInput = container.querySelector<HTMLInputElement>(
      'input[placeholder^="Write a note"]'
    )!;
    setInput(textInput, "Remember the failover owner");
    act(() => buttonWithText(container, "TB-352 — Migrate session")?.click());

    const search = container.querySelector<HTMLInputElement>(
      'input[placeholder^="Search tickets"]'
    )!;
    setInput(search, "nothing");
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    act(() => buttonWithText(container, "Save note")?.click());
    await flush();

    expect(storageMocks.saveWorkspaceNoteBucket).toHaveBeenCalledWith(
      expect.objectContaining({
        containerId: "TB-352",
        jira: expect.objectContaining({
          key: "TB-352",
          summary: "Migrate session storage to Redis"
        }),
        notes: [
          expect.objectContaining({ text: "Remember the failover owner" })
        ]
      })
    );
    expect(container.querySelector("h1")?.textContent).toBe(
      "Migrate session storage to Redis"
    );
  });

  it("resolves live Bitbucket tasks and copies comments only through + to-do", async () => {
    const activity: NoteTicketActivity = {
      key: ticket.key,
      summary: ticket.summary,
      url: ticket.url,
      statusName: ticket.statusName,
      statusCategory: ticket.statusCategory,
      issueType: ticket.issueType,
      lastWorkedAt: currentStarted,
      loggedSeconds: 13_500
    };
    storageMocks.getNoteTicketActivity.mockResolvedValue([activity]);
    const reviewResult: BitbucketReviewSyncResult = {
      weekKey: "2026-06-15",
      weekStartISO: "2026-06-15T00:00:00.000Z",
      weekEndExclusiveISO: "2026-06-22T00:00:00.000Z",
      syncedAt: currentStarted,
      workspace: "team",
      repositoryCount: 1,
      pullRequestCount: 1,
      sessionCount: 1,
      sessions: [
        {
          id: "session-1",
          workspace: "team",
          repositorySlug: "web",
          repositoryName: "Web",
          pullRequestId: 472,
          pullRequestTitle: "Redis store",
          pullRequestUrl: "https://bitbucket.org/team/web/pull-requests/472",
          pullRequestState: "OPEN",
          jiraIssueKey: "TB-352",
          dateKey: "2026-06-17",
          startedISO: currentStarted,
          endedISO: currentStarted,
          estimatedSeconds: 900,
          reviewStateLabel: "COMMENTED",
          commentCount: 1,
          activityCount: 1,
          confidence: "high",
          events: [],
          status: "unlogged"
        }
      ]
    };
    const details: BitbucketPullRequestDetailsResult = {
      workspace: "team",
      repositorySlug: "web",
      pullRequestId: 472,
      title: "Redis store",
      state: "OPEN",
      url: "https://bitbucket.org/team/web/pull-requests/472",
      approvalCount: 1,
      commentCount: 1,
      tasks: [
        {
          id: 10,
          content: "Add a regression test",
          state: "UNRESOLVED",
          resolved: false,
          authorInitials: "AK"
        }
      ],
      comments: [
        {
          id: 20,
          content: "Import the TTL constant.",
          authorDisplayName: "Anna K.",
          authorInitials: "AK"
        }
      ]
    };
    vi.spyOn(nativeApi, "fetchBitbucketPullRequestDetails").mockResolvedValue(details);
    vi.spyOn(nativeApi, "setBitbucketPullRequestTaskState").mockResolvedValue({
      ok: true,
      task: { ...details.tasks[0], state: "RESOLVED", resolved: true }
    });

    await act(async () => {
      root.render(
        <NotesWorkspace {...baseProps({ reviewResult })} />
      );
    });
    await flush();
    await flush();

    act(() => buttonWithText(container, "PR #472")?.click());
    expect(container.textContent).toContain("Import the TTL constant.");
    expect(storageMocks.saveWorkspaceNoteBucket).not.toHaveBeenCalled();

    const resolve = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Resolve task in Bitbucket"]'
    )!;
    await act(async () => {
      resolve.click();
      await Promise.resolve();
    });
    expect(nativeApi.setBitbucketPullRequestTaskState).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 10,
        content: "Add a regression test",
        resolved: true
      })
    );

    act(() => buttonWithText(container, "+ to-do")?.click());
    await flush();
    expect(storageMocks.saveWorkspaceNoteBucket).toHaveBeenCalledWith(
      expect.objectContaining({
        notes: [
          expect.objectContaining({
            type: "todo",
            text: "Anna on PR: Import the TTL constant."
          })
        ]
      })
    );
  });

  it("refreshes live PR details when a Jira ticket is relinked to a different PR", async () => {
    storageMocks.getNoteTicketActivity.mockResolvedValue([
      {
        key: ticket.key,
        summary: ticket.summary,
        lastWorkedAt: currentStarted,
        loggedSeconds: 3600
      }
    ]);
    let rejectStaleRequest!: (reason?: unknown) => void;
    const staleRequest = new Promise<BitbucketPullRequestDetailsResult>(
      (_resolve, reject) => {
        rejectStaleRequest = reject;
      }
    );
    const fetchDetails = vi
      .spyOn(nativeApi, "fetchBitbucketPullRequestDetails")
      .mockImplementation(async (request) =>
        request.pullRequestId === 472
          ? staleRequest
          : pullRequestDetailsFor(request.pullRequestId)
      );
    const onError = vi.fn();

    await act(async () => {
      root.render(
        <NotesWorkspace
          {...baseProps({ reviewResult: reviewResultFor(472), onError })}
        />
      );
    });
    await flush();
    await flush();
    expect(fetchDetails).toHaveBeenCalledWith(
      expect.objectContaining({ pullRequestId: 472 })
    );

    await act(async () => {
      root.render(
        <NotesWorkspace
          {...baseProps({ reviewResult: reviewResultFor(473), onError })}
        />
      );
    });
    await flush();
    await flush();

    expect(fetchDetails).toHaveBeenCalledWith(
      expect.objectContaining({ pullRequestId: 473 })
    );
    act(() => buttonWithText(container, "PR #473")?.click());
    expect(container.textContent).toContain("Redis store 473");
    expect(container.textContent).not.toContain("Redis store 472");

    await act(async () => {
      rejectStaleRequest(new Error("Stale PR failure"));
      await Promise.resolve();
    });
    expect(onError).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Redis store 473");
  });

  it("retries a failed live PR detail request without remounting", async () => {
    storageMocks.getNoteTicketActivity.mockResolvedValue([
      {
        key: ticket.key,
        summary: ticket.summary,
        lastWorkedAt: currentStarted,
        loggedSeconds: 3600
      }
    ]);
    const fetchDetails = vi
      .spyOn(nativeApi, "fetchBitbucketPullRequestDetails")
      .mockRejectedValueOnce(new Error("Temporary Bitbucket failure"))
      .mockResolvedValueOnce(pullRequestDetailsFor(472));

    await act(async () => {
      root.render(
        <NotesWorkspace
          {...baseProps({ reviewResult: reviewResultFor(472) })}
        />
      );
    });
    await flush();
    await flush();

    act(() => buttonWithText(container, "PR #472")?.click());
    expect(container.textContent).toContain(
      "Pull request details are unavailable."
    );

    act(() => buttonWithText(container, "Retry")?.click());
    await flush();
    await flush();

    expect(fetchDetails).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Redis store 472");
    expect(container.textContent).not.toContain(
      "Pull request details are unavailable."
    );
  });

  it("does not claim diffstat evidence when Bitbucket returns none", async () => {
    storageMocks.getNoteTicketActivity.mockResolvedValue([
      {
        key: ticket.key,
        summary: ticket.summary,
        lastWorkedAt: currentStarted,
        loggedSeconds: 3600
      }
    ]);
    vi.spyOn(nativeApi, "fetchBitbucketPullRequestDetails").mockResolvedValue(
      pullRequestDetailsFor(472)
    );
    vi.spyOn(nativeApi, "fetchJiraIssueDetails").mockResolvedValue({
      ...ticket,
      description: "Remote Jira description",
      comments: [],
      myLoggedSecondsTotal: 3600,
      myWorklogCount: 1
    });
    vi.spyOn(aiApi, "computeNotesBriefing").mockResolvedValue([]);

    await act(async () => {
      root.render(
        <NotesWorkspace
          {...baseProps({
            settings: { ...settings, aiEnabled: true },
            reviewResult: reviewResultFor(472)
          })}
        />
      );
    });
    await flush();
    await flush();

    await act(async () => {
      buttonWithText(container, "AI briefing")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("description · PR #472");
    expect(container.textContent).not.toContain("PR #472 diffstat");
  });

  it("keeps AI suggestions ephemeral until + to-do and excludes local notes from input", async () => {
    const activity: NoteTicketActivity = {
      key: ticket.key,
      summary: ticket.summary,
      statusName: ticket.statusName,
      statusCategory: ticket.statusCategory,
      lastWorkedAt: currentStarted,
      loggedSeconds: 3600
    };
    storageMocks.getNoteTicketActivity.mockResolvedValue([activity]);
    storageMocks.getWorkspaceNoteBuckets.mockResolvedValue([
      {
        containerId: "TB-352",
        jira: {
          key: ticket.key,
          summary: ticket.summary,
          statusName: ticket.statusName,
          statusCategory: ticket.statusCategory
        },
        notes: [
          {
            id: "private",
            type: "text",
            done: false,
            text: "PRIVATE LOCAL NOTE",
            createdAt: currentStarted,
            updatedAt: currentStarted
          }
        ]
      }
    ]);
    vi.spyOn(nativeApi, "fetchJiraIssueDetails").mockResolvedValue({
      ...ticket,
      description: "Remote Jira description",
      comments: ["Remote Jira comment"],
      myLoggedSecondsTotal: 3600,
      myWorklogCount: 1
    });
    const compute = vi.spyOn(aiApi, "computeNotesBriefing").mockResolvedValue([
      {
        id: "suggestion-1",
        kind: "check",
        text: "Verify the remote fallback path."
      }
    ]);

    await act(async () => {
      root.render(
        <NotesWorkspace
          {...baseProps({ settings: { ...settings, aiEnabled: true } })}
        />
      );
    });
    await flush();

    await act(async () => {
      buttonWithText(container, "AI briefing")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(compute).toHaveBeenCalledWith(
      expect.objectContaining({
        ticket: expect.objectContaining({
          description: "Remote Jira description",
          comments: ["Remote Jira comment"]
        })
      }),
      expect.anything()
    );
    expect(JSON.stringify(compute.mock.calls[0]?.[0])).not.toContain(
      "PRIVATE LOCAL NOTE"
    );
    expect(container.textContent).toContain("Verify the remote fallback path.");
    expect(storageMocks.saveWorkspaceNoteBucket).not.toHaveBeenCalled();

    act(() => buttonWithText(container, "+ to-do")?.click());
    await flush();
    expect(storageMocks.saveWorkspaceNoteBucket).toHaveBeenCalledWith(
      expect.objectContaining({
        notes: expect.arrayContaining([
          expect.objectContaining({
            type: "todo",
            text: "Verify the remote fallback path."
          })
        ])
      })
    );
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../shared/types";
import {
  buildCommitGroupsForPullRequest,
  fetchBitbucketPullRequestDetails,
  setBitbucketPullRequestTaskState,
  syncBitbucketReviewSessions,
  testBitbucketConnection
} from "./bitbucket";

const settings: AppSettings = {
  jiraBaseUrl: "https://example.atlassian.net",
  jiraEmail: "person@example.test",
  jiraApiToken: "jira-token",
  bitbucketEmail: "person@example.test",
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

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  });

const bitbucketUser = {
  uuid: "{reviewer}",
  account_id: "reviewer-account",
  display_name: "Demo Reviewer"
};

describe("Bitbucket review sync", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tests credentials against the current user and first configured repository", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith("/2.0/user")) {
        return jsonResponse(bitbucketUser);
      }

      if (url.includes("/2.0/repositories/team/explorer-web") && !url.includes("pullrequests")) {
        return jsonResponse({ slug: "explorer-web", name: "Explorer Web" });
      }

      return new Response("Not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await testBitbucketConnection(settings);

    expect(result).toMatchObject({
      ok: true,
      accountId: "reviewer-account",
      displayName: "Demo Reviewer",
      workspace: "team"
    });
  });

  it("builds dated review sessions from PR comments and approvals by the current user", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith("/2.0/user")) {
        return jsonResponse(bitbucketUser);
      }

      if (url.includes("/2.0/repositories/team/explorer-web") && !url.includes("pullrequests")) {
        return jsonResponse({ slug: "explorer-web", name: "Explorer Web" });
      }

      if (url.includes("/pullrequests?") && url.includes("state=OPEN")) {
        return jsonResponse({
          values: [
            {
              id: 214,
              title: "YLOG-328 Active interrupt handling for poller",
              description: "Review notes",
              state: "OPEN",
              updated_on: "2026-06-15T12:00:00.000Z",
              author: { uuid: "{author}", account_id: "author-account", display_name: "Feature Author" },
              source: { branch: { name: "feature/YLOG-328-poller" } },
              destination: { branch: { name: "main" } },
              links: {
                html: {
                  href: "https://bitbucket.org/team/explorer-web/pull-requests/214"
                }
              }
            }
          ]
        });
      }

      if (url.includes("/pullrequests?")) {
        return jsonResponse({ values: [] });
      }

      if (url.includes("/pullrequests/214/activity")) {
        return jsonResponse({
          values: [
            {
              comment: {
                id: 1,
                created_on: "2026-06-15T09:45:00.000Z",
                user: bitbucketUser,
                content: { raw: "Small naming question." }
              }
            },
            {
              approval: {
                date: "2026-06-15T10:20:00.000Z",
                user: bitbucketUser
              }
            },
            {
              comment: {
                id: 2,
                created_on: "2026-06-15T11:00:00.000Z",
                user: { uuid: "{other}", display_name: "Other Reviewer" },
                content: { raw: "Not ours." }
              }
            }
          ]
        });
      }

      return new Response("Not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncBitbucketReviewSessions({
      settings,
      weekKey: "2026-06-15",
      weekStartISO: "2026-06-15T00:00:00.000Z",
      weekEndExclusiveISO: "2026-06-22T00:00:00.000Z"
    });

    expect(result).toMatchObject({
      weekKey: "2026-06-15",
      workspace: "team",
      repositoryCount: 1,
      pullRequestCount: 1,
      sessionCount: 1
    });
    expect(result.sessions[0]).toMatchObject({
      repositorySlug: "explorer-web",
      pullRequestId: 214,
      pullRequestAuthorAccountId: "author-account",
      pullRequestAuthorDisplayName: "Feature Author",
      isPullRequestAuthor: false,
      jiraIssueKey: "YLOG-328",
      reviewStateLabel: "APPROVED",
      commentCount: 1,
      activityCount: 2,
      confidence: "high",
      status: "unlogged"
    });
    expect(result.sessions[0].estimatedSeconds).toBe(45 * 60);
  });
});

describe("Bitbucket pull request notes integration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads all tasks, unresolved top-level comments, PR counts, and a compact diffstat summary", async () => {
    const apiBase = "https://api.bitbucket.org/2.0/repositories/team/explorer-web/pullrequests/472";
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url === apiBase) {
        return jsonResponse({
          id: 472,
          title: "YLOG-352 Redis session store",
          description: "Move sessions to Redis.",
          state: "OPEN",
          author: { display_name: "Sam Rivera" },
          source: { branch: { name: "feature/YLOG-352-redis" } },
          destination: {
            branch: { name: "main" },
            repository: { name: "Explorer Web", slug: "explorer-web" }
          },
          participants: [
            { user: { display_name: "Anna K." }, approved: true },
            { user: { display_name: "Lee Jones" }, state: "approved" },
            { user: { display_name: "Chris T." }, approved: false }
          ],
          comment_count: 14,
          links: {
            html: {
              href: "https://bitbucket.org/team/explorer-web/pull-requests/472"
            }
          }
        });
      }

      if (url === `${apiBase}/tasks?pagelen=50`) {
        return jsonResponse({
          values: [
            {
              id: 10,
              state: "UNRESOLVED",
              content: { raw: "Add a regression test." },
              creator: { display_name: "Anna K." },
              created_on: "2026-06-20T09:00:00.000Z"
            },
            {
              id: 11,
              state: "RESOLVED",
              content: { raw: "Document the fallback." },
              creator: { display_name: "Lee Jones" }
            }
          ],
          next: `${apiBase}/tasks?page=2`
        });
      }

      if (url === `${apiBase}/tasks?page=2`) {
        return jsonResponse({
          values: [
            {
              id: 12,
              state: "UNRESOLVED",
              content: { raw: "Check timeout handling." },
              creator: { nickname: "mononym" }
            }
          ]
        });
      }

      if (url === `${apiBase}/comments?pagelen=50`) {
        return jsonResponse({
          values: [
            {
              id: 21,
              user: { display_name: "Anna K." },
              content: { raw: "Could this leak a connection?" },
              created_on: "2026-06-20T10:00:00.000Z"
            },
            {
              id: 22,
              user: { display_name: "Lee Jones" },
              content: { raw: "Please guard the empty key." },
              inline: { path: "src/session/store.ts", from: 39, to: 41 }
            },
            {
              id: 23,
              parent: { id: 21 },
              user: { display_name: "Sam Rivera" },
              content: { raw: "A reply is not a top-level thread." }
            },
            {
              id: 24,
              resolution: { type: "RESOLVED" },
              user: { display_name: "Anna K." },
              content: { raw: "Already resolved." }
            },
            {
              id: 25,
              deleted: true,
              user: { display_name: "Anna K." },
              content: { raw: "Deleted." }
            },
            {
              id: 26,
              user: { display_name: "Anna K." },
              content: { raw: "   " }
            },
            {
              id: 28,
              pending: true,
              user: { display_name: "Sam Rivera" },
              content: { raw: "Unpublished draft." }
            }
          ],
          next: `${apiBase}/comments?page=2`
        });
      }

      if (url === `${apiBase}/comments?page=2`) {
        return jsonResponse({
          values: [
            {
              id: 27,
              user: { nickname: "solo" },
              content: { raw: "Global follow-up." },
              updated_on: "2026-06-20T11:00:00.000Z"
            }
          ]
        });
      }

      if (url === `${apiBase}/diffstat?pagelen=100`) {
        return jsonResponse({
          values: [
            {
              status: "modified",
              lines_added: 20,
              lines_removed: 4,
              new: { path: "src/session/store.ts" }
            },
            {
              status: "added",
              lines_added: 31,
              lines_removed: 0,
              new: { path: "src/session/store.test.ts" }
            }
          ],
          next: `${apiBase}/diffstat?page=2`
        });
      }

      if (url === `${apiBase}/diffstat?page=2`) {
        return jsonResponse({
          values: [
            {
              status: "removed",
              lines_added: 0,
              lines_removed: 8,
              old: { path: "src/session/memory.ts" }
            }
          ]
        });
      }

      return new Response("Not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchBitbucketPullRequestDetails({
      settings,
      workspace: "team",
      repositorySlug: "explorer-web",
      pullRequestId: 472
    });

    expect(result).toMatchObject({
      workspace: "team",
      repositorySlug: "explorer-web",
      repositoryName: "Explorer Web",
      pullRequestId: 472,
      title: "YLOG-352 Redis session store",
      state: "OPEN",
      jiraIssueKey: "YLOG-352",
      approvalCount: 2,
      commentCount: 14
    });
    expect(result.tasks).toEqual([
      expect.objectContaining({
        id: 10,
        content: "Add a regression test.",
        state: "UNRESOLVED",
        resolved: false,
        authorInitials: "AK"
      }),
      expect.objectContaining({
        id: 11,
        content: "Document the fallback.",
        state: "RESOLVED",
        resolved: true,
        authorInitials: "LJ"
      }),
      expect.objectContaining({
        id: 12,
        content: "Check timeout handling.",
        state: "UNRESOLVED",
        authorInitials: "M"
      })
    ]);
    expect(result.comments).toEqual([
      expect.objectContaining({
        id: 21,
        content: "Could this leak a connection?",
        authorDisplayName: "Anna K.",
        authorInitials: "AK"
      }),
      expect.objectContaining({
        id: 22,
        content: "Please guard the empty key.",
        path: "src/session/store.ts",
        line: 41,
        authorInitials: "LJ"
      }),
      expect.objectContaining({
        id: 27,
        content: "Global follow-up.",
        authorDisplayName: "solo",
        authorInitials: "S"
      })
    ]);
    expect(result.diffstatSummary).toBe(
      "3 files changed, +51 -12. src/session/store.ts (modified, +20 -4); " +
        "src/session/store.test.ts (added, +31 -0); src/session/memory.ts (removed, +0 -8)"
    );
  });

  it("keeps live PR tasks and comments usable when optional diffstat fails", async () => {
    const apiBase = "https://api.bitbucket.org/2.0/repositories/team/explorer-web/pullrequests/472";
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === apiBase) {
        return jsonResponse({
          id: 472,
          title: "YLOG-352 Redis session store",
          state: "OPEN",
          destination: {
            repository: { name: "Explorer Web", slug: "explorer-web" }
          }
        });
      }
      if (url === `${apiBase}/tasks?pagelen=50`) {
        return jsonResponse({
          values: [
            {
              id: 10,
              state: "UNRESOLVED",
              content: { raw: "Keep the task visible." }
            }
          ]
        });
      }
      if (url === `${apiBase}/comments?pagelen=50`) {
        return jsonResponse({
          values: [
            {
              id: 21,
              user: { display_name: "Anna K." },
              content: { raw: "Keep the comment visible." }
            }
          ]
        });
      }
      if (url === `${apiBase}/diffstat?pagelen=100`) {
        return new Response("Forbidden", { status: 403 });
      }
      return new Response("Not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchBitbucketPullRequestDetails({
      settings,
      workspace: "team",
      repositorySlug: "explorer-web",
      pullRequestId: 472
    });

    expect(result.tasks).toHaveLength(1);
    expect(result.comments).toHaveLength(1);
    expect(result.diffstatSummary).toBeUndefined();
  });

  it.each([
    { resolved: true, state: "RESOLVED" as const },
    { resolved: false, state: "UNRESOLVED" as const }
  ])("writes task state $state with the current raw content preserved", async ({ resolved, state }) => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        content: { raw: string };
        state: string;
      };
      return jsonResponse({
        id: 10,
        state: body.state,
        content: body.content,
        creator: { display_name: "Anna K." },
        updated_on: "2026-06-20T12:00:00.000Z"
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await setBitbucketPullRequestTaskState({
      settings,
      workspace: "team",
      repositorySlug: "explorer-web",
      pullRequestId: 472,
      taskId: 10,
      content: "Keep  spacing and punctuation!",
      resolved
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "https://api.bitbucket.org/2.0/repositories/team/explorer-web/pullrequests/472/tasks/10"
    );
    expect(init?.method).toBe("PUT");
    expect(init?.headers).toMatchObject({
      Accept: "application/json",
      Authorization: expect.stringMatching(/^Basic /),
      "Content-Type": "application/json"
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      content: { raw: "Keep  spacing and punctuation!" },
      state
    });
    expect(result).toEqual({
      ok: true,
      task: {
        id: 10,
        content: "Keep  spacing and punctuation!",
        state,
        resolved,
        authorDisplayName: "Anna K.",
        authorInitials: "AK",
        createdAt: undefined,
        updatedAt: "2026-06-20T12:00:00.000Z"
      }
    });
  });
});

describe("buildCommitGroupsForPullRequest", () => {
  const me = { account_id: "me", uuid: "{me}" };
  const weekStart = new Date(2026, 5, 15);
  const weekEndExclusive = new Date(2026, 5, 22);
  const pullRequest = {
    id: 220,
    title: "Auth middleware",
    source: { branch: { name: "feature/YLOG-328-auth" } },
    destination: { branch: { name: "main" } },
    author: me
  };
  const repository = { slug: "explorer-web", name: "explorer-web" };

  it("groups the user's own commits by day, maps the ticket, and estimates duration", () => {
    const groups = buildCommitGroupsForPullRequest({
      workspace: "team",
      repository,
      pullRequest,
      currentUser: me,
      weekStart,
      weekEndExclusive,
      commits: [
        { hash: "a", date: "2026-06-15T09:12:00", message: "YLOG-328 add middleware", author: { user: me } },
        { hash: "b", date: "2026-06-15T11:05:00", message: "wip", author: { user: me } },
        // other author — excluded
        { hash: "c", date: "2026-06-15T12:00:00", message: "tweak", author: { user: { account_id: "other" } } },
        // before the window — excluded
        { hash: "d", date: "2026-06-10T09:00:00", message: "old", author: { user: me } }
      ]
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      dateKey: "2026-06-15",
      jiraIssueKey: "YLOG-328",
      pullRequestId: 220,
      branch: "feature/YLOG-328-auth",
      commitCount: 2,
      primaryMessage: "add middleware",
      confidence: "high"
    });
    expect(groups[0].estimatedSeconds).toBeGreaterThan(0);
  });
});

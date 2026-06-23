import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../shared/types";
import { syncBitbucketReviewSessions, testBitbucketConnection } from "./bitbucket";

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
  remindersEnabled: true
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
              title: "FTDM-328 Active interrupt handling for poller",
              description: "Review notes",
              state: "OPEN",
              updated_on: "2026-06-15T12:00:00.000Z",
              author: { uuid: "{author}", account_id: "author-account", display_name: "Feature Author" },
              source: { branch: { name: "feature/FTDM-328-poller" } },
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
      jiraIssueKey: "FTDM-328",
      reviewStateLabel: "APPROVED",
      commentCount: 1,
      activityCount: 2,
      confidence: "high",
      status: "unlogged"
    });
    expect(result.sessions[0].estimatedSeconds).toBe(45 * 60);
  });
});

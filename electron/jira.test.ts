import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../shared/types";
import { fetchAssignedTickets, fetchJiraIssueDetails, searchJiraTickets, syncJiraActivity, syncJiraWorklogs } from "./jira";

const settings: AppSettings = {
  jiraBaseUrl: "https://example.atlassian.net",
  jiraEmail: "person@example.test",
  jiraApiToken: "token",
  bitbucketEmail: "",
  bitbucketApiToken: "",
  bitbucketWorkspace: "",
  bitbucketRepositories: "",
  bitbucketReviewBucketIssueKey: "",
  weeklyTargetHours: 40,
  workingDays: [1, 2, 3, 4, 5],
  reminderTime: "16:30",
  remindersEnabled: true,
  aiEnabled: false,
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "llama3.1:8b",
};

const jiraSearchResponse = (issues: unknown[] = []) =>
  new Response(
    JSON.stringify({
      issues,
      isLast: true
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  });

describe("syncJiraWorklogs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the visible week raw while retaining earlier worklogs for bulk projection", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const requestedUrl = new URL(String(url));
      if (requestedUrl.pathname === "/rest/api/3/myself") {
        return jsonResponse({ accountId: "me", displayName: "Me" });
      }
      if (requestedUrl.pathname === "/rest/api/3/search/jql") {
        return jiraSearchResponse([
          {
            id: "10001",
            key: "OPS-77",
            fields: { summary: "Long migration" }
          }
        ]);
      }
      if (requestedUrl.pathname === "/rest/api/3/issue/OPS-77/worklog") {
        return jsonResponse({
          startAt: 0,
          maxResults: 100,
          total: 2,
          worklogs: [
            {
              id: "bulk",
              author: { accountId: "me" },
              started: "2026-07-01T09:00:00.000+0000",
              created: "2026-07-14T17:00:00.000+0000",
              updated: "2026-07-14T17:00:00.000+0000",
              timeSpentSeconds: 80 * 3600
            },
            {
              id: "visible",
              author: { accountId: "me" },
              started: "2026-07-14T09:00:00.000+0000",
              created: "2026-07-14T10:00:00.000+0000",
              updated: "2026-07-14T10:00:00.000+0000",
              timeSpentSeconds: 3600
            }
          ]
        });
      }
      throw new Error(`Unexpected Jira request: ${requestedUrl.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncJiraWorklogs({
      settings,
      weekKey: "2026-07-13",
      weekStartISO: "2026-07-13T00:00:00.000Z",
      weekEndExclusiveISO: "2026-07-20T00:00:00.000Z"
    });

    const searchRequest = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .find((url) => url.pathname === "/rest/api/3/search/jql");
    const worklogRequest = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .find((url) => url.pathname === "/rest/api/3/issue/OPS-77/worklog");

    expect(searchRequest?.searchParams.get("jql")).toContain('worklogDate >= "2026-04-14"');
    expect(Number(worklogRequest?.searchParams.get("startedAfter"))).toBeLessThan(new Date("2026-07-01").getTime());
    expect(result.jiraSite).toBe("https://example.atlassian.net");
    expect(result.sourceWorklogs?.map((worklog) => worklog.id)).toEqual(["bulk", "visible"]);
    expect(result.sourceWorklogs?.[0]).toMatchObject({
      created: "2026-07-14T17:00:00.000+0000",
      updated: "2026-07-14T17:00:00.000+0000"
    });
    expect(result.daySummaries["2026-07-14"].worklogs.map((worklog) => worklog.id)).toEqual(["visible"]);
    expect(result.trackedSeconds).toBe(3600);
  });
});

describe("fetchAssignedTickets", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("scopes both ticket buckets to the current user by default", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const requestedUrl = new URL(String(url));
      return requestedUrl.pathname === "/rest/api/3/myself"
        ? jsonResponse({ accountId: "me" })
        : jiraSearchResponse();
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchAssignedTickets({ settings });

    const jql = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname === "/rest/api/3/search/jql")
      .map((url) => url.searchParams.get("jql"));
    expect(jql).toEqual([
      "assignee = currentUser() AND statusCategory != Done ORDER BY statusCategory DESC, updated DESC",
      "assignee = currentUser() AND statusCategory = Done AND resolved >= -14d ORDER BY resolved DESC"
    ]);
  });

  it("can fetch accessible tickets across assignees", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const requestedUrl = new URL(String(url));
      return requestedUrl.pathname === "/rest/api/3/myself"
        ? jsonResponse({ accountId: "me" })
        : jiraSearchResponse();
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchAssignedTickets({ settings, assignedOnly: false });

    const jql = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname === "/rest/api/3/search/jql")
      .map((url) => url.searchParams.get("jql"));
    expect(jql).toEqual([
      "statusCategory != Done ORDER BY statusCategory DESC, updated DESC",
      "statusCategory = Done AND resolved >= -14d ORDER BY resolved DESC"
    ]);
  });
});

describe("searchJiraTickets", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds the assigned-to-me filter to Jira search JQL when requested", async () => {
    const fetchMock = vi.fn(async () => jiraSearchResponse());
    vi.stubGlobal("fetch", fetchMock);

    await searchJiraTickets({
      settings,
      query: "metadata",
      assignedOnly: true,
      sortMode: "createdAsc",
      limit: 40
    });

    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestedUrl.pathname).toBe("/rest/api/3/search/jql");
    expect(requestedUrl.searchParams.get("maxResults")).toBe("40");
    expect(requestedUrl.searchParams.get("jql")).toBe(
      'assignee = currentUser() AND (text ~ "metadata") ORDER BY created ASC'
    );
  });

  it("leaves Jira search unassigned-scoped by default", async () => {
    const fetchMock = vi.fn(async () => jiraSearchResponse());
    vi.stubGlobal("fetch", fetchMock);

    await searchJiraTickets({
      settings,
      query: "metadata",
      sortMode: "createdDesc"
    });

    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestedUrl.searchParams.get("jql")).toBe('(text ~ "metadata") ORDER BY created DESC');
  });

  it("can browse assigned Jira tickets without a text query", async () => {
    const fetchMock = vi.fn(async () => jiraSearchResponse());
    vi.stubGlobal("fetch", fetchMock);

    await searchJiraTickets({
      settings,
      query: "",
      assignedOnly: true,
      allowEmptyQuery: true,
      sortMode: "createdDesc",
      limit: 20
    });

    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestedUrl.searchParams.get("jql")).toBe("assignee = currentUser() ORDER BY created DESC");
  });

  it("can browse accessible Jira tickets without the assigned filter", async () => {
    const fetchMock = vi.fn(async () => jiraSearchResponse());
    vi.stubGlobal("fetch", fetchMock);

    await searchJiraTickets({
      settings,
      query: "",
      allowEmptyQuery: true,
      sortMode: "createdAsc"
    });

    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestedUrl.searchParams.get("jql")).toBe("created <= now() ORDER BY created ASC");
  });

  it("requests and normalizes Jira issue status and assignee fields", async () => {
    const fetchMock = vi.fn(async () =>
      jiraSearchResponse([
        {
          id: "10001",
          key: "OPS-77",
          fields: {
            summary: "Pair on incident review notes",
            project: { key: "OPS", name: "Operations" },
            status: {
              name: "Refused",
              statusCategory: { key: "completed" }
            },
            updated: "2026-06-19T12:00:00.000Z",
            assignee: { displayName: "Sam Rivera" }
          }
        }
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchJiraTickets({
      settings,
      query: "incident",
      sortMode: "createdDesc"
    });

    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestedUrl.searchParams.get("fields")?.split(",")).toContain("status");
    expect(requestedUrl.searchParams.get("fields")?.split(",")).toContain("updated");
    expect(requestedUrl.searchParams.get("fields")?.split(",")).toContain("assignee");
    expect(result.issues[0]).toMatchObject({
      key: "OPS-77",
      statusName: "Refused",
      statusCategory: "done",
      updatedAt: "2026-06-19T12:00:00.000Z",
      assigneeDisplayName: "Sam Rivera"
    });
  });
});

describe("fetchJiraIssueDetails", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests Jira issue basics and sums only the current user's worklogs", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const requestedUrl = new URL(String(url));

      if (requestedUrl.pathname === "/rest/api/3/myself") {
        return jsonResponse({ accountId: "me", displayName: "Me" });
      }

      if (requestedUrl.pathname === "/rest/api/3/issue/OPS-77") {
        return jsonResponse({
          id: "10001",
          key: "OPS-77",
          fields: {
            summary: "Pair on incident review notes",
            description: {
              type: "doc",
              version: 1,
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Write the incident follow-up." }]
                }
              ]
            },
            aggregatetimespent: 12_600,
            project: { key: "OPS", name: "Operations" },
            status: {
              name: "In Progress",
              statusCategory: { key: "indeterminate" }
            },
            assignee: { displayName: "Sam Rivera" },
            issuetype: { name: "Task", hierarchyLevel: 0 }
          }
        });
      }

      if (requestedUrl.pathname === "/rest/api/3/issue/OPS-77/worklog") {
        return jsonResponse({
          startAt: 0,
          maxResults: 100,
          total: 3,
          worklogs: [
            { id: "1", author: { accountId: "me" }, started: "2026-06-22T09:00:00.000+0000", timeSpentSeconds: 3600 },
            { id: "2", author: { accountId: "other" }, started: "2026-06-22T10:00:00.000+0000", timeSpentSeconds: 7200 },
            { id: "3", author: { accountId: "me" }, started: "2026-06-23T09:00:00.000+0000", timeSpentSeconds: 1800 }
          ]
        });
      }

      throw new Error(`Unexpected Jira request: ${requestedUrl.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchJiraIssueDetails({ settings, issueKey: "ops-77" });
    const issueRequest = fetchMock.mock.calls
      .map((call) => new URL(String(call[0])))
      .find((url) => url.pathname === "/rest/api/3/issue/OPS-77");

    expect(issueRequest?.searchParams.get("fields")?.split(",")).toContain("description");
    expect(result).toMatchObject({
      key: "OPS-77",
      summary: "Pair on incident review notes",
      description: "Write the incident follow-up.",
      descriptionAdf: {
        type: "doc",
        version: 1
      },
      statusName: "In Progress",
      statusCategory: "indeterminate",
      assigneeDisplayName: "Sam Rivera",
      loggedSecondsTotal: 12_600,
      myLoggedSecondsTotal: 5400,
      myWorklogCount: 2
    });
  });
});

describe("syncJiraActivity", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes created issues, comments, status changes, and field-change markers by current user", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const requestedUrl = new URL(String(url));

      if (requestedUrl.pathname === "/rest/api/3/myself") {
        return jsonResponse({ accountId: "me", displayName: "Me Example" });
      }

      if (requestedUrl.pathname === "/rest/api/3/search/jql") {
        return jiraSearchResponse([
          {
            id: "10001",
            key: "OPS-77",
            fields: {
              summary: "Pair on incident review notes",
              created: "2026-06-15T09:05:00.000+0000",
              creator: { accountId: "me", displayName: "Me Example" },
              issuetype: { name: "Task", hierarchyLevel: 0 }
            }
          }
        ]);
      }

      if (requestedUrl.pathname === "/rest/api/3/issue/OPS-77/comment") {
        return jsonResponse({
          startAt: 0,
          maxResults: 100,
          total: 2,
          comments: [
            {
              id: "20001",
              author: { accountId: "me", displayName: "Me Example" },
              updateAuthor: { accountId: "me", displayName: "Me Example" },
              created: "2026-06-15T10:30:00.000+0000",
              updated: "2026-06-15T10:30:00.000+0000",
              body: {
                type: "doc",
                version: 1,
                content: [{ type: "paragraph", content: [{ type: "text", text: "Left follow-up notes." }] }]
              }
            },
            {
              id: "20002",
              author: { accountId: "other", displayName: "Other" },
              created: "2026-06-15T11:30:00.000+0000",
              updated: "2026-06-15T11:30:00.000+0000"
            }
          ]
        });
      }

      if (requestedUrl.pathname === "/rest/api/3/issue/OPS-77/changelog") {
        return jsonResponse({
          startAt: 0,
          maxResults: 100,
          total: 4,
          values: [
            {
              id: "30001",
              author: { accountId: "me", displayName: "Me Example" },
              created: "2026-06-15T12:00:00.000+0000",
              items: [{ field: "status", fromString: "To Do", toString: "In Progress" }]
            },
            {
              id: "30002",
              author: { accountId: "me", displayName: "Me Example" },
              created: "2026-06-15T13:00:00.000+0000",
              items: [{ field: "Priority", fromString: "Medium", toString: "High" }]
            },
            {
              id: "30003",
              author: { accountId: "me", displayName: "Me Example" },
              created: "2026-06-15T14:00:00.000+0000",
              items: [{ field: "timeSpent", fromString: "0", toString: "1h" }]
            },
            {
              id: "30004",
              author: { accountId: "other", displayName: "Other" },
              created: "2026-06-15T15:00:00.000+0000",
              items: [{ field: "status", fromString: "In Progress", toString: "Done" }]
            }
          ]
        });
      }

      throw new Error(`Unexpected Jira request: ${requestedUrl.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncJiraActivity({
      settings,
      weekKey: "2026-06-15",
      weekStartISO: "2026-06-15T00:00:00.000Z",
      weekEndExclusiveISO: "2026-06-22T00:00:00.000Z"
    });

    const searchRequest = fetchMock.mock.calls.map((call) => new URL(String(call[0]))).find((url) => url.pathname === "/rest/api/3/search/jql");
    expect(searchRequest?.searchParams.get("jql")).toBe(
      'issuekey in updatedBy("me", "2026-06-15", "2026-06-21") ORDER BY updated DESC'
    );
    expect(searchRequest?.searchParams.get("fields")).toBe("summary,issuetype,parent,created,creator");
    expect(result.issueCount).toBe(1);
    expect(result.activityCount).toBe(4);
    expect(result.isPartial).toBeUndefined();
    expect(result.activities.map((activity) => activity.kind)).toEqual([
      "issue-created",
      "comment",
      "status-change",
      "field-change"
    ]);
    expect(result.activities[1]).toMatchObject({
      issueKey: "OPS-77",
      title: "Commented on OPS-77",
      commentBody: "Left follow-up notes.",
      estimatedSeconds: 900,
      confidence: "medium"
    });
    expect(result.activities[2]).toMatchObject({
      title: "Moved OPS-77",
      fieldName: "status",
      fromValue: "To Do",
      toValue: "In Progress",
      estimatedSeconds: 600
    });
    expect(result.activities[3]).toMatchObject({
      title: "Updated Jira fields on OPS-77",
      estimatedSeconds: 0,
      confidence: "low"
    });
  });

  it("does not treat reporter as issue creator", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const requestedUrl = new URL(String(url));

      if (requestedUrl.pathname === "/rest/api/3/myself") {
        return jsonResponse({ accountId: "me", displayName: "Me Example" });
      }

      if (requestedUrl.pathname === "/rest/api/3/search/jql") {
        return jiraSearchResponse([
          {
            id: "10088",
            key: "OPS-88",
            fields: {
              summary: "Reported by me but created by someone else",
              created: "2026-06-15T09:05:00.000+0000",
              creator: { accountId: "other", displayName: "Other Person" },
              reporter: { accountId: "me", displayName: "Me Example" }
            }
          }
        ]);
      }

      if (requestedUrl.pathname === "/rest/api/3/issue/OPS-88/comment") {
        return jsonResponse({ startAt: 0, maxResults: 100, total: 0, comments: [] });
      }

      if (requestedUrl.pathname === "/rest/api/3/issue/OPS-88/changelog") {
        return jsonResponse({ startAt: 0, maxResults: 100, total: 0, values: [] });
      }

      throw new Error(`Unexpected Jira request: ${requestedUrl.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncJiraActivity({
      settings,
      weekKey: "2026-06-15",
      weekStartISO: "2026-06-15T00:00:00.000Z",
      weekEndExclusiveISO: "2026-06-22T00:00:00.000Z"
    });

    expect(result.activities).toHaveLength(0);
  });

  it("bounds Jira activity issue scans and marks the result partial", async () => {
    const issues = Array.from({ length: 50 }, (_, index) => ({
      id: `limit-${index}`,
      key: `OPS-${index + 1}`,
      fields: {
        summary: `Busy issue ${index + 1}`,
        created: "2026-06-15T09:05:00.000+0000",
        creator: { accountId: "other", displayName: "Other Person" }
      }
    }));
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const requestedUrl = new URL(String(url));

      if (requestedUrl.pathname === "/rest/api/3/myself") {
        return jsonResponse({ accountId: "me", displayName: "Me Example" });
      }

      if (requestedUrl.pathname === "/rest/api/3/search/jql") {
        expect(requestedUrl.searchParams.get("maxResults")).toBe("50");
        return jsonResponse({ issues, isLast: false, nextPageToken: "next" });
      }

      if (requestedUrl.pathname.endsWith("/comment")) {
        return jsonResponse({ startAt: 0, maxResults: 100, total: 0, comments: [] });
      }

      if (requestedUrl.pathname.endsWith("/changelog")) {
        return jsonResponse({ startAt: 0, maxResults: 100, total: 0, values: [] });
      }

      throw new Error(`Unexpected Jira request: ${requestedUrl.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncJiraActivity({
      settings,
      weekKey: "2026-06-15",
      weekStartISO: "2026-06-15T00:00:00.000Z",
      weekEndExclusiveISO: "2026-06-22T00:00:00.000Z"
    });

    const commentRequestCount = fetchMock.mock.calls
      .map((call) => new URL(String(call[0])).pathname)
      .filter((pathname) => pathname.endsWith("/comment")).length;
    expect(commentRequestCount).toBe(50);
    expect(result).toMatchObject({
      issueCount: 50,
      scannedIssueCount: 50,
      isPartial: true,
      truncatedIssueCount: 1
    });
  });

  it("bounds paged comment and changelog scans per issue", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const requestedUrl = new URL(String(url));

      if (requestedUrl.pathname === "/rest/api/3/myself") {
        return jsonResponse({ accountId: "me", displayName: "Me Example" });
      }

      if (requestedUrl.pathname === "/rest/api/3/search/jql") {
        return jiraSearchResponse([
          {
            id: "10099",
            key: "OPS-99",
            fields: {
              summary: "Issue with deep activity history",
              created: "2026-06-15T09:05:00.000+0000",
              creator: { accountId: "other", displayName: "Other Person" }
            }
          }
        ]);
      }

      if (requestedUrl.pathname === "/rest/api/3/issue/OPS-99/comment") {
        const startAt = Number(requestedUrl.searchParams.get("startAt") ?? "0");
        return jsonResponse({
          startAt,
          maxResults: 100,
          total: 400,
          comments: []
        });
      }

      if (requestedUrl.pathname === "/rest/api/3/issue/OPS-99/changelog") {
        const startAt = Number(requestedUrl.searchParams.get("startAt") ?? "0");
        return jsonResponse({
          startAt,
          maxResults: 100,
          total: 400,
          values: []
        });
      }

      throw new Error(`Unexpected Jira request: ${requestedUrl.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await syncJiraActivity({
      settings,
      weekKey: "2026-06-15",
      weekStartISO: "2026-06-15T00:00:00.000Z",
      weekEndExclusiveISO: "2026-06-22T00:00:00.000Z"
    });

    const paths = fetchMock.mock.calls.map((call) => new URL(String(call[0])).pathname);
    expect(paths.filter((pathname) => pathname.endsWith("/comment"))).toHaveLength(3);
    expect(paths.filter((pathname) => pathname.endsWith("/changelog"))).toHaveLength(3);
    expect(result).toMatchObject({
      isPartial: true,
      truncatedDetailIssueCount: 1
    });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../shared/types";
import { searchJiraTickets } from "./jira";

const settings: AppSettings = {
  jiraBaseUrl: "https://example.atlassian.net",
  jiraEmail: "person@example.test",
  jiraApiToken: "token",
  weeklyTargetHours: 40,
  workingDays: [1, 2, 3, 4, 5],
  reminderTime: "16:30",
  remindersEnabled: true
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
    expect(requestedUrl.searchParams.get("fields")?.split(",")).toContain("assignee");
    expect(result.issues[0]).toMatchObject({
      key: "OPS-77",
      statusName: "Refused",
      statusCategory: "done",
      assigneeDisplayName: "Sam Rivera"
    });
  });
});

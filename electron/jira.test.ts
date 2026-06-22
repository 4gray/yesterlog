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

const jiraSearchResponse = () =>
  new Response(
    JSON.stringify({
      issues: [],
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
});

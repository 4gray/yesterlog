// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, JiraTicket, SyncResult, TicketsResult } from "../../shared/types";
import type { DemoScenario } from "../demo/fixtures";
import { useTickets, type TicketsClient } from "./useTickets";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const settings: AppSettings = {
  jiraBaseUrl: "https://example.atlassian.net",
  jiraEmail: "person@example.com",
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

const buildTicket = (key: string, overrides: Partial<JiraTicket> = {}): JiraTicket => ({
  id: key,
  key,
  summary: `${key} summary`,
  projectKey: key.split("-")[0],
  projectName: "Yesterlog",
  statusName: "In Progress",
  statusCategory: "indeterminate",
  loggedSecondsTotal: 0,
  createdAt: "2026-06-17T10:00:00.000Z",
  assigneeDisplayName: "Demo Timekeeper",
  url: `https://example.atlassian.net/browse/${key}`,
  ...overrides
});

const makeTicketsResult = (overrides: Partial<TicketsResult> = {}): TicketsResult => ({
  fetchedAt: "2026-06-17T10:00:00.000Z",
  accountId: "account-1",
  inProgress: [buildTicket("TB-1"), buildTicket("TB-2")],
  recentlyClosed: [buildTicket("TB-3", { statusName: "Done", statusCategory: "done" })],
  ...overrides
});

const makeDemoScenario = (tickets = makeTicketsResult()): Pick<DemoScenario, "tickets" | "favoriteKeys" | "selectedTicket" | "syncResult"> => ({
  tickets,
  favoriteKeys: ["TB-3"],
  selectedTicket: buildTicket("TB-9", { summary: "Selected ticket" }),
  syncResult: {
    weekKey: "2026-06-15",
    weekStartISO: "2026-06-15T00:00:00.000Z",
    weekEndExclusiveISO: "2026-06-22T00:00:00.000Z",
    syncedAt: "2026-06-17T10:00:00.000Z",
    accountId: "account-1",
    displayName: "Demo Timekeeper",
    trackedSeconds: 0,
    issueCount: 0,
    worklogCount: 0,
    daySummaries: {}
  } as SyncResult
});

type TicketsApi = ReturnType<typeof useTickets>;

let container: HTMLDivElement;
let root: Root;
let api: TicketsApi | undefined;
let fetchAssignedTickets: ReturnType<typeof vi.fn<TicketsClient["fetchAssignedTickets"]>>;
let searchJiraTickets: ReturnType<typeof vi.fn<TicketsClient["searchJiraTickets"]>>;
let saveFavoriteKeys: ReturnType<typeof vi.fn<(keys: string[]) => Promise<void>>>;
let client: TicketsClient;

function Harness({
  currentSettings = settings,
  isBooting = true,
  demoScenario
}: {
  currentSettings?: AppSettings;
  isBooting?: boolean;
  demoScenario?: Pick<DemoScenario, "tickets" | "favoriteKeys" | "selectedTicket" | "syncResult">;
}) {
  api = useTickets({
    settings: currentSettings,
    isBooting,
    demoScenario,
    client,
    saveFavoriteKeys
  });
  return null;
}

const getApi = () => {
  if (!api) {
    throw new Error("Tickets hook was not rendered.");
  }
  return api;
};

const renderHarness = (props: Parameters<typeof Harness>[0] = {}) => {
  act(() => {
    root.render(<Harness {...props} />);
  });
};

const flushAsyncUpdates = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(() => {
  api = undefined;
  fetchAssignedTickets = vi.fn();
  searchJiraTickets = vi.fn();
  client = {
    fetchAssignedTickets,
    searchJiraTickets
  };
  saveFavoriteKeys = vi.fn(async () => undefined);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("useTickets", () => {
  it("derives ticket options from selected ticket, favorites, and in-progress tickets", () => {
    renderHarness({ demoScenario: makeDemoScenario() });

    expect(getApi().ticketOptions.map((ticket) => ticket.key)).toEqual(["TB-9", "TB-3", "TB-1", "TB-2"]);
    expect(getApi().dockTickets.map((ticket) => ticket.key)).toEqual(["TB-1", "TB-2", "TB-3"]);
    expect(getApi().activeTicketCount).toBe(2);
  });

  it("loads assigned tickets when booting is complete", async () => {
    const loaded = makeTicketsResult({ inProgress: [buildTicket("LOAD-1")] });
    fetchAssignedTickets.mockResolvedValue(loaded);

    renderHarness({ isBooting: false });
    await flushAsyncUpdates();

    expect(fetchAssignedTickets).toHaveBeenCalledWith({ settings });
    expect(getApi().tickets).toBe(loaded);
    expect(getApi().ticketsLoading).toBe(false);
    expect(getApi().ticketsError).toBeUndefined();
  });

  it("coalesces repeated ticket refreshes into one trailing request per Jira identity", async () => {
    let resolveFirst!: (result: TicketsResult) => void;
    let resolveTrailing!: (result: TicketsResult) => void;
    fetchAssignedTickets
      .mockReturnValueOnce(new Promise<TicketsResult>((resolve) => {
        resolveFirst = resolve;
      }))
      .mockReturnValueOnce(new Promise<TicketsResult>((resolve) => {
        resolveTrailing = resolve;
      }));
    const firstResult = makeTicketsResult({ inProgress: [buildTicket("FIRST-1")] });
    const trailingResult = makeTicketsResult({ inProgress: [buildTicket("TRAILING-1")] });
    renderHarness();

    const first = getApi().loadTickets();
    const second = getApi().loadTickets();
    const third = getApi().loadTickets();
    expect(fetchAssignedTickets).toHaveBeenCalledTimes(1);

    resolveFirst(firstResult);
    await act(async () => {
      await first;
      await Promise.resolve();
    });
    expect(fetchAssignedTickets).toHaveBeenCalledTimes(2);

    resolveTrailing(trailingResult);
    await act(async () => {
      await expect(second).resolves.toBe(trailingResult);
      await expect(third).resolves.toBe(trailingResult);
    });

    expect(fetchAssignedTickets).toHaveBeenCalledTimes(2);
    expect(getApi().tickets?.inProgress[0].key).toBe("TRAILING-1");
  });

  it("ignores an assigned-ticket response from a previous Jira identity", async () => {
    let resolveFirst!: (result: TicketsResult) => void;
    let resolveSecond!: (result: TicketsResult) => void;
    fetchAssignedTickets
      .mockReturnValueOnce(
        new Promise<TicketsResult>((resolve) => {
          resolveFirst = resolve;
        })
      )
      .mockReturnValueOnce(
        new Promise<TicketsResult>((resolve) => {
          resolveSecond = resolve;
        })
      );
    const otherSettings: AppSettings = {
      ...settings,
      jiraBaseUrl: "https://other.atlassian.net",
      jiraEmail: "other@example.com"
    };
    const first = makeTicketsResult({
      accountId: "account-1",
      inProgress: [buildTicket("FIRST-1")]
    });
    const second = makeTicketsResult({
      accountId: "account-2",
      inProgress: [
        buildTicket("SECOND-1", {
          url: "https://other.atlassian.net/browse/SECOND-1"
        })
      ]
    });

    renderHarness({ isBooting: false });
    await flushAsyncUpdates();
    renderHarness({ currentSettings: otherSettings, isBooting: false });
    await flushAsyncUpdates();

    expect(fetchAssignedTickets).toHaveBeenCalledTimes(2);
    expect(getApi().tickets).toBeUndefined();
    expect(getApi().ticketOptions).toEqual([]);

    await act(async () => {
      resolveSecond(second);
      await Promise.resolve();
    });
    expect(getApi().tickets?.inProgress[0].key).toBe("SECOND-1");

    await act(async () => {
      resolveFirst(first);
      await Promise.resolve();
    });
    expect(getApi().tickets?.inProgress[0].key).toBe("SECOND-1");
  });

  it("filters the Tickets view by multiple Jira status categories without re-fetching", async () => {
    const loaded = makeTicketsResult({
      inProgress: [
        buildTicket("TODO-1", { statusName: "To Do", statusCategory: "new" }),
        buildTicket("DOING-1", { statusName: "In Progress", statusCategory: "indeterminate" })
      ],
      recentlyClosed: [buildTicket("DONE-1", { statusName: "Done", statusCategory: "done" })]
    });
    fetchAssignedTickets.mockResolvedValue(loaded);

    renderHarness({ isBooting: false });
    await flushAsyncUpdates();

    act(() => {
      getApi().setTicketFilters({
        assignedOnly: true,
        statusCategories: ["new", "done"],
        query: "",
        sortMode: "updatedDesc"
      });
    });

    expect(getApi().ticketViewTickets?.inProgress.map((ticket) => ticket.key)).toEqual(["TODO-1"]);
    expect(getApi().ticketViewTickets?.recentlyClosed.map((ticket) => ticket.key)).toEqual(["DONE-1"]);
    expect(fetchAssignedTickets).toHaveBeenCalledTimes(1);
  });

  it("searches and sorts the fetched Tickets-view pool locally", async () => {
    const loaded = makeTicketsResult({
      inProgress: [
        buildTicket("TB-10", {
          summary: "Polish reports",
          updatedAt: "2026-06-18T10:00:00.000Z"
        }),
        buildTicket("TB-2", {
          summary: "Polish ticket search",
          updatedAt: "2026-06-19T10:00:00.000Z"
        })
      ],
      recentlyClosed: []
    });
    fetchAssignedTickets.mockResolvedValue(loaded);

    renderHarness({ isBooting: false });
    await flushAsyncUpdates();

    expect(getApi().ticketViewTickets?.inProgress.map((ticket) => ticket.key)).toEqual(["TB-2", "TB-10"]);

    act(() => {
      getApi().setTicketFilters({
        assignedOnly: true,
        statusCategories: ["new", "indeterminate", "done"],
        query: "ticket search",
        sortMode: "keyAsc"
      });
    });

    expect(getApi().ticketViewTickets?.inProgress.map((ticket) => ticket.key)).toEqual(["TB-2"]);
    expect(fetchAssignedTickets).toHaveBeenCalledTimes(1);
  });

  it("loads a bounded all-assignee pool when the assignment filter is turned off", async () => {
    const assigned = makeTicketsResult({ inProgress: [buildTicket("MINE-1")] });
    const accessible = makeTicketsResult({
      inProgress: [buildTicket("TEAM-1", { assigneeDisplayName: "Someone Else" })],
      recentlyClosed: []
    });
    fetchAssignedTickets.mockResolvedValueOnce(assigned).mockResolvedValueOnce(accessible);

    renderHarness({ isBooting: false });
    await flushAsyncUpdates();

    act(() => {
      getApi().setTicketFilters({
        assignedOnly: false,
        statusCategories: ["new", "indeterminate", "done"],
        query: "",
        sortMode: "updatedDesc"
      });
    });
    await flushAsyncUpdates();

    expect(fetchAssignedTickets).toHaveBeenNthCalledWith(2, { settings, assignedOnly: false });
    expect(getApi().ticketViewTickets?.inProgress.map((ticket) => ticket.key)).toEqual(["TEAM-1"]);
    expect(getApi().tickets?.inProgress.map((ticket) => ticket.key)).toEqual(["MINE-1"]);
  });

  it("lets an in-flight all-assignee request finish when an assigned refresh fails", async () => {
    const assigned = makeTicketsResult({
      inProgress: [buildTicket("MINE-REFRESH")]
    });
    const accessible = makeTicketsResult({
      inProgress: [
        buildTicket("TEAM-REFRESH", {
          assigneeDisplayName: "Someone Else"
        })
      ],
      recentlyClosed: []
    });
    let resolveAccessible!: (result: TicketsResult) => void;
    fetchAssignedTickets
      .mockResolvedValueOnce(assigned)
      .mockReturnValueOnce(
        new Promise<TicketsResult>((resolve) => {
          resolveAccessible = resolve;
        })
      )
      .mockRejectedValueOnce(new Error("Assigned refresh failed"));

    renderHarness({ isBooting: false });
    await flushAsyncUpdates();
    act(() => {
      getApi().setTicketFilters({
        assignedOnly: false,
        statusCategories: ["new", "indeterminate", "done"],
        query: "",
        sortMode: "updatedDesc"
      });
    });
    await flushAsyncUpdates();

    await act(async () => {
      await getApi().loadTickets();
    });
    expect(getApi().ticketsLoading).toBe(true);

    await act(async () => {
      resolveAccessible(accessible);
      await Promise.resolve();
    });

    expect(getApi().ticketsLoading).toBe(false);
    expect(getApi().ticketViewTickets?.inProgress[0].key).toBe(
      "TEAM-REFRESH"
    );
  });

  it("reports load errors without throwing", async () => {
    fetchAssignedTickets.mockRejectedValue(new Error("Jira unavailable"));

    renderHarness({ isBooting: false });
    await flushAsyncUpdates();

    expect(getApi().tickets).toBeUndefined();
    expect(getApi().ticketsError).toBe("Jira unavailable");
    expect(getApi().ticketsLoading).toBe(false);
  });

  it("does not load or persist favorites in demo mode", () => {
    renderHarness({ isBooting: false, demoScenario: makeDemoScenario() });

    expect(fetchAssignedTickets).not.toHaveBeenCalled();

    act(() => getApi().toggleFavorite("TB-1"));

    expect(getApi().favoriteKeys).toEqual(["TB-3", "TB-1"]);
    expect(saveFavoriteKeys).not.toHaveBeenCalled();
  });

  it("persists favorite changes outside demo mode", () => {
    renderHarness();

    act(() => getApi().toggleFavorite("TB-1"));

    expect(getApi().favoriteKeys).toEqual(["TB-1"]);
    expect(saveFavoriteKeys).toHaveBeenCalledWith(["TB-1"]);
  });

  it("searches demo tickets with assignment filtering and created-date sorting", async () => {
    const tickets = makeTicketsResult({
      inProgress: [
        buildTicket("TB-1", {
          summary: "Refactor search",
          createdAt: "2026-06-16T10:00:00.000Z",
          assigneeDisplayName: "Demo Timekeeper"
        }),
        buildTicket("TB-2", {
          summary: "Refactor search",
          createdAt: "2026-06-17T10:00:00.000Z",
          assigneeDisplayName: "Someone Else"
        })
      ],
      recentlyClosed: [
        buildTicket("TB-3", {
          summary: "Refactor search",
          createdAt: "2026-06-18T10:00:00.000Z",
          assigneeDisplayName: "Demo Timekeeper"
        })
      ]
    });
    renderHarness({ demoScenario: makeDemoScenario(tickets) });

    const assignedResults = await getApi().searchTickets("refactor", "createdDesc", 10, true);

    expect(assignedResults.map((ticket) => ticket.key)).toEqual(["TB-3", "TB-1"]);
    expect(searchJiraTickets).not.toHaveBeenCalled();
  });

  it("delegates non-demo Jira searches to the native client", async () => {
    const issue = buildTicket("JRA-1");
    searchJiraTickets.mockResolvedValue({ query: "JRA", issues: [issue] });
    renderHarness();

    const results = await getApi().searchTickets("JRA", "createdAsc", 5, true, false);

    expect(searchJiraTickets).toHaveBeenCalledWith({
      settings,
      query: "JRA",
      limit: 5,
      sortMode: "createdAsc",
      assignedOnly: true,
      allowEmptyQuery: false
    });
    expect(results).toEqual([issue]);
  });

  it("skips short searches and unconfigured Jira settings", async () => {
    renderHarness({
      currentSettings: {
        ...settings,
        jiraApiToken: ""
      }
    });

    expect(await getApi().searchTickets("J")).toEqual([]);
    expect(searchJiraTickets).not.toHaveBeenCalled();
  });
});

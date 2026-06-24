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
  remindersEnabled: true
};

const buildTicket = (key: string, overrides: Partial<JiraTicket> = {}): JiraTicket => ({
  id: key,
  key,
  summary: `${key} summary`,
  projectKey: key.split("-")[0],
  projectName: "TimeBro",
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
  recentlyClosed: [buildTicket("TB-3")],
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

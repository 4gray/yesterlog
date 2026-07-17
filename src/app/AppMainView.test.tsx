// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppMainView, type AppMainViewProps } from "./AppMainView";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../components/LoadingView", () => ({
  LoadingView: () => <section data-testid="loading-view">Loading</section>
}));

vi.mock("../components/TodayView", () => ({
  TodayView: ({
    reminderTime,
    dockTickets,
    activeTicketCount
  }: {
    reminderTime: string;
    dockTickets: unknown[];
    activeTicketCount: number;
  }) => (
    <section
      data-testid="today-view"
      data-dock={String(dockTickets.length)}
      data-active-count={String(activeTicketCount)}
    >
      {reminderTime}
    </section>
  )
}));

vi.mock("../components/WeekView", () => ({
  WeekView: ({ isSyncing }: { isSyncing: boolean }) => (
    <section data-testid="week-view" data-syncing={String(isSyncing)} />
  )
}));

vi.mock("../components/MonthView", () => ({
  MonthView: ({ monthState }: { monthState: { monthLabel: string } }) => (
    <section data-testid="month-view">{monthState.monthLabel}</section>
  )
}));

vi.mock("../components/ReviewView", () => ({
  ReviewView: ({ weekKey }: { weekKey: string }) => <section data-testid="review-view">{weekKey}</section>
}));

vi.mock("../components/TicketsView", () => ({
  TicketsView: ({ inProgress, recentlyClosed }: { inProgress: unknown[]; recentlyClosed: unknown[] }) => (
    <section data-testid="tickets-view">
      {inProgress.length}/{recentlyClosed.length}
    </section>
  )
}));

vi.mock("../components/ReportsView", () => ({
  ReportsView: ({ weekState }: { weekState: { weekRangeLabel: string } }) => (
    <section data-testid="reports-view">{weekState.weekRangeLabel}</section>
  )
}));

vi.mock("../components/SettingsView", () => ({
  SettingsView: ({ weekRangeLabel }: { weekRangeLabel: string }) => (
    <section data-testid="settings-view">{weekRangeLabel}</section>
  )
}));

const settings = {
  jiraBaseUrl: "https://example.atlassian.net",
  jiraEmail: "person@example.com",
  jiraApiToken: "token",
  bitbucketEmail: "person@example.com",
  bitbucketApiToken: "bb-token",
  bitbucketWorkspace: "workspace",
  bitbucketRepositories: "repo",
  bitbucketReviewBucketIssueKey: "TB-1",
  weeklyTargetHours: 32,
  workingDays: [1, 2, 3, 4] as AppMainViewProps["settings"]["workingDays"],
  reminderTime: "17:30",
  remindersEnabled: true,
  aiEnabled: false,
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "llama3.1:8b",
};

const weekState = {
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-15T00:00:00.000Z",
  weekEndExclusiveISO: "2026-06-22T00:00:00.000Z",
  weekRangeLabel: "Jun 15-21",
  trackedWeekHours: 12,
  dailyTargetHours: 8
} as AppMainViewProps["weekState"];

const monthState = { monthLabel: "June 2026" } as AppMainViewProps["monthState"];

const asyncFalse = async () => false;
const noop = () => undefined;

const baseProps = (): AppMainViewProps => ({
  view: "week",
  reportTab: "summary",
  isBooting: false,
  currentDate: new Date(2026, 5, 17, 12),
  ticketOptions: [],
  todayWorklogs: [],
  todaySignals: [],
  todayPersonalNotes: [],
  todayRecurringEntries: [],
  todayPendingRecurring: [],
  issueUrlsByKey: {},
  issueTypesByKey: {},
  todayTrackedHours: 0,
  todayDailyTargetHours: 8,
  touchedNotLogged: [],
  recapDaySummary: undefined,
  settings,
  settingsDraft: settings,
  isSettingsDirty: false,
  weekState,
  personalNotes: [],
  syncResult: undefined,
  jiraActivityResult: undefined,
  monthState,
  visibleBitbucketReviewResult: undefined,
  tickets: { inProgress: [{}], recentlyClosed: [{}, {}] } as AppMainViewProps["tickets"],
  ticketFilters: {
    assignedOnly: true,
    statusCategories: ["new", "indeterminate", "done"],
    query: "",
    sortMode: "updatedDesc"
  },
  setTicketFilters: noop,
  favoriteKeys: [],
  hoursByKey: {},
  dockTickets: [],
  activeTicketCount: 0,
  reviewTargetMode: "reviewed-ticket",
  isConfigured: true,
  isBitbucketReady: true,
  isSyncing: false,
  isSyncingReviews: false,
  isLogging: false,
  isLoggingReview: false,
  ticketsLoading: false,
  ticketsError: undefined,
  isTesting: false,
  isTestingBitbucket: false,
  effectiveTheme: "dark",
  updateInfo: undefined,
  isCheckingUpdates: false,
  recurringEvents: [],
  recurringOccurrences: [],
  isImportingPersonalNotes: false,
  handleAddWorklog: asyncFalse as AppMainViewProps["handleAddWorklog"],
  handleMoveWorklog: asyncFalse as AppMainViewProps["handleMoveWorklog"],
  handleSync: noop,
  goToPreviousWeek: noop,
  goToCurrentWeek: noop,
  goToNextWeek: noop,
  goToPreviousMonth: noop,
  goToCurrentMonth: noop,
  goToNextMonth: noop,
  openWeekFromMonth: noop,
  handleReviewSync: noop,
  handleLogReviewSessions: asyncFalse as AppMainViewProps["handleLogReviewSessions"],
  setReviewTargetMode: noop,
  toggleFavorite: noop,
  handleLogTicket: noop,
  setSettingsDraft: noop,
  handleSaveSettings: noop,
  handleTestConnection: noop,
  handleTestBitbucketConnection: noop,
  selectTheme: noop,
  checkForUpdatesFromSettings: noop,
  openCurrentReleaseNotes: noop,
  downloadCurrentUpdate: noop,
  installDownloadedUpdate: noop,
  openReleasePage: noop,
  handleExportWeekCsv: noop,
  handleImportPersonalNotes: noop,
  handleSaveRecurringEvent: noop,
  handleDeleteRecurringEvent: noop,
  handleToggleRecurringEvent: noop,
  openAddTime: noop,
  openEditWorklog: noop,
  openEditPersonalNote: noop,
  handleToggleSkipped: noop,
  handleConfirmRecurring: asyncFalse as AppMainViewProps["handleConfirmRecurring"],
  handleSkipRecurring: asyncFalse as AppMainViewProps["handleSkipRecurring"],
  handleDeleteRecurringOccurrence: asyncFalse as AppMainViewProps["handleDeleteRecurringOccurrence"],
  openSettings: noop,
  openTicketDetails: noop,
  settingsSection: "jira",
  syncState: "synced",
  syncLabel: "SYNCED 6:47 PM",
  viewMode: "summary",
  onViewModeChange: noop,
  onOpenCommandPalette: noop
});

let container: HTMLDivElement;
let root: Root;

const renderView = (props: Partial<AppMainViewProps> = {}) => {
  act(() => {
    root.render(<AppMainView {...baseProps()} {...props} />);
  });
};

const rendered = (testId: string) => container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("AppMainView", () => {
  it("renders the loading surface while the app is booting", () => {
    renderView({ isBooting: true, view: "week" });

    expect(rendered("loading-view")).not.toBeNull();
    expect(rendered("week-view")).toBeNull();
  });

  it.each([
    ["today", "today-view"],
    ["week", "week-view"],
    ["month", "month-view"],
    ["review", "review-view"],
    ["tickets", "tickets-view"],
    ["reports", "reports-view"],
    ["settings", "settings-view"]
  ] as const)("routes the %s app view", (view, testId) => {
    renderView({ view });

    expect(rendered(testId)).not.toBeNull();
    expect(container.querySelector(".main-area")).not.toBeNull();
  });

  it("uses the loading surface while month data is not ready", () => {
    renderView({ view: "month", monthState: undefined });

    expect(rendered("loading-view")).not.toBeNull();
    expect(rendered("month-view")).toBeNull();
  });

  it("combines Jira and review sync state for the week view", () => {
    renderView({ view: "week", isSyncing: false, isSyncingReviews: true });

    expect(rendered("week-view")?.dataset.syncing).toBe("true");
  });

  it("passes active-work dock data to the today view", () => {
    renderView({ view: "today", dockTickets: [{}, {}] as AppMainViewProps["dockTickets"], activeTicketCount: 1 });

    expect(rendered("today-view")?.dataset.dock).toBe("2");
    expect(rendered("today-view")?.dataset.activeCount).toBe("1");
  });

  it("passes empty ticket buckets when ticket data has not loaded", () => {
    renderView({ view: "tickets", tickets: undefined });

    expect(rendered("tickets-view")?.textContent).toBe("0/0");
  });
});

// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AppSettings,
  BitbucketReviewSyncResult,
  JiraActivitySyncResult,
  PersonalNote,
  RecurringEvent,
  RecurringOccurrence,
  SyncResult,
  WeekOverride,
  WorklogAllocationPreference
} from "../../shared/types";
import { buildDefaultRecurringEvents } from "../domain/recurring";
import { toLocalDateKey } from "../utils/date";
import { useWeekStorage, type WeekStorageClient } from "./useWeekStorage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const settings: AppSettings = {
  jiraBaseUrl: "https://example.atlassian.net",
  jiraEmail: "person@example.com",
  jiraApiToken: "token",
  bitbucketEmail: "person@example.com",
  bitbucketApiToken: "bb-token",
  bitbucketWorkspace: "timebro",
  bitbucketRepositories: "app",
  bitbucketReviewBucketIssueKey: "REV-1",
  weeklyTargetHours: 40,
  workingDays: [1, 2, 3, 4, 5],
  reminderTime: "16:30",
  remindersEnabled: true,
  aiEnabled: false,
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "llama3.1:8b",
};

const buildOverride = (weekKey: string, skippedDates: string[] = []): WeekOverride => ({ weekKey, skippedDates });

const buildSyncResult = (weekKey: string): SyncResult => ({
  weekKey,
  weekStartISO: `${weekKey}T00:00:00.000Z`,
  weekEndExclusiveISO: `${weekKey}T00:00:00.000Z`,
  syncedAt: "2026-06-17T10:00:00.000Z",
  accountId: "account-1",
  trackedSeconds: 0,
  issueCount: 0,
  worklogCount: 0,
  daySummaries: {}
});

const buildJiraActivityResult = (weekKey: string): JiraActivitySyncResult => ({
  weekKey,
  weekStartISO: `${weekKey}T00:00:00.000Z`,
  weekEndExclusiveISO: `${weekKey}T00:00:00.000Z`,
  syncedAt: "2026-06-17T10:00:00.000Z",
  accountId: "account-1",
  issueCount: 1,
  activityCount: 0,
  activities: []
});

const buildReviewResult = (weekKey: string): BitbucketReviewSyncResult => ({
  weekKey,
  weekStartISO: `${weekKey}T00:00:00.000Z`,
  weekEndExclusiveISO: `${weekKey}T00:00:00.000Z`,
  syncedAt: "2026-06-17T10:00:00.000Z",
  accountId: "account-1",
  workspace: "timebro",
  repositoryCount: 1,
  pullRequestCount: 0,
  sessionCount: 0,
  sessions: []
});

const buildNote = (id: string, weekKey: string): PersonalNote => ({
  id,
  weekKey,
  dateKey: weekKey,
  text: id,
  timeSpentSeconds: 1800,
  startedISO: `${weekKey}T09:00:00.000Z`,
  createdAt: `${weekKey}T09:00:00.000Z`,
  updatedAt: `${weekKey}T09:00:00.000Z`
});

const buildOccurrence = (weekKey: string): RecurringOccurrence => ({
  eventId: "daily",
  weekKey,
  dateKey: weekKey,
  status: "confirmed",
  timeSpentSeconds: 900,
  createdAt: `${weekKey}T09:00:00.000Z`,
  updatedAt: `${weekKey}T09:00:00.000Z`
});

let container: HTMLDivElement;
let root: Root;
let storage: WeekStorageClient;
let getSettings: ReturnType<typeof vi.fn<WeekStorageClient["getSettings"]>>;
let getWeekOverride: ReturnType<typeof vi.fn<WeekStorageClient["getWeekOverride"]>>;
let getWeekOverrides: ReturnType<typeof vi.fn<WeekStorageClient["getWeekOverrides"]>>;
let getSyncResult: ReturnType<typeof vi.fn<WeekStorageClient["getSyncResult"]>>;
let getWorklogAllocationPreferences: ReturnType<typeof vi.fn<WeekStorageClient["getWorklogAllocationPreferences"]>>;
let getJiraActivityResult: ReturnType<typeof vi.fn<WeekStorageClient["getJiraActivityResult"]>>;
let getFavoriteKeys: ReturnType<typeof vi.fn<WeekStorageClient["getFavoriteKeys"]>>;
let getPersonalNotes: ReturnType<typeof vi.fn<WeekStorageClient["getPersonalNotes"]>>;
let getBitbucketReviewResult: ReturnType<typeof vi.fn<WeekStorageClient["getBitbucketReviewResult"]>>;
let getRecurringEvents: ReturnType<typeof vi.fn<WeekStorageClient["getRecurringEvents"]>>;
let getRecurringOccurrences: ReturnType<typeof vi.fn<WeekStorageClient["getRecurringOccurrences"]>>;
let saveRecurringEvents: ReturnType<typeof vi.fn<WeekStorageClient["saveRecurringEvents"]>>;
let setSettings: ReturnType<typeof vi.fn<(value: AppSettings) => void>>;
let setSettingsDraft: ReturnType<typeof vi.fn<(value: AppSettings) => void>>;
let setWeekOverride: ReturnType<typeof vi.fn<(value: WeekOverride) => void>>;
let setWeekOverrides: ReturnType<typeof vi.fn<(value: WeekOverride[]) => void>>;
let setSyncResult: ReturnType<typeof vi.fn<(value: SyncResult | undefined) => void>>;
let setWorklogAllocationPreferences: ReturnType<typeof vi.fn<(value: WorklogAllocationPreference[]) => void>>;
let setJiraActivityResult: ReturnType<typeof vi.fn<(value: JiraActivitySyncResult | undefined) => void>>;
let setFavoriteKeys: ReturnType<typeof vi.fn<(value: string[]) => void>>;
let setPersonalNotes: ReturnType<typeof vi.fn<(value: PersonalNote[]) => void>>;
let setBitbucketReviewResult: ReturnType<typeof vi.fn<(value: BitbucketReviewSyncResult | undefined) => void>>;
let setRecurringEvents: ReturnType<typeof vi.fn<(value: RecurringEvent[]) => void>>;
let setRecurringOccurrences: ReturnType<typeof vi.fn<(value: RecurringOccurrence[]) => void>>;
let setIsBooting: ReturnType<typeof vi.fn<(value: boolean) => void>>;
let showError: ReturnType<typeof vi.fn<(message: string) => void>>;

function Harness({
  isDemo = false,
  isBooting = true,
  weekStart = new Date(2026, 5, 15)
}: {
  isDemo?: boolean;
  isBooting?: boolean;
  weekStart?: Date;
}) {
  useWeekStorage({
    isDemo,
    isBooting,
    weekStart,
    storage,
    setSettings,
    setSettingsDraft,
    setWeekOverride,
    setWeekOverrides,
    setSyncResult,
    setWorklogAllocationPreferences,
    setJiraActivityResult,
    setFavoriteKeys,
    setPersonalNotes,
    setBitbucketReviewResult,
    setRecurringEvents,
    setRecurringOccurrences,
    setIsBooting,
    showError
  });
  return null;
}

const renderHarness = (props: Parameters<typeof Harness>[0] = {}) => {
  act(() => {
    root.render(<Harness {...props} />);
  });
};

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const waitFor = async (assertion: () => void) => {
  let lastError: unknown;
  for (let index = 0; index < 20; index += 1) {
    await flush();
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

beforeEach(() => {
  getSettings = vi.fn(async () => settings);
  getWeekOverride = vi.fn(async (weekKey) => buildOverride(weekKey, weekKey === "2026-06-22" ? ["2026-06-23"] : []));
  getWeekOverrides = vi.fn(async () => [buildOverride("2026-06-08", ["2026-06-12"])]);
  getSyncResult = vi.fn(async (weekKey) => buildSyncResult(weekKey));
  getWorklogAllocationPreferences = vi.fn(async () => []);
  getJiraActivityResult = vi.fn(async (weekKey) => buildJiraActivityResult(weekKey));
  getFavoriteKeys = vi.fn(async () => ["TB-1"]);
  getPersonalNotes = vi.fn(async (weekKey) => [buildNote(`note-${weekKey}`, weekKey)]);
  getBitbucketReviewResult = vi.fn(async (weekKey) => buildReviewResult(weekKey));
  getRecurringEvents = vi.fn(async () => undefined);
  getRecurringOccurrences = vi.fn(async (weekKey) => [buildOccurrence(weekKey)]);
  saveRecurringEvents = vi.fn(async () => undefined);
  storage = {
    getSettings,
    getWeekOverride,
    getWeekOverrides,
    getSyncResult,
    getWorklogAllocationPreferences,
    getJiraActivityResult,
    getFavoriteKeys,
    getPersonalNotes,
    getBitbucketReviewResult,
    getRecurringEvents,
    getRecurringOccurrences,
    saveRecurringEvents
  };
  setSettings = vi.fn();
  setSettingsDraft = vi.fn();
  setWeekOverride = vi.fn();
  setWeekOverrides = vi.fn();
  setSyncResult = vi.fn();
  setWorklogAllocationPreferences = vi.fn();
  setJiraActivityResult = vi.fn();
  setFavoriteKeys = vi.fn();
  setPersonalNotes = vi.fn();
  setBitbucketReviewResult = vi.fn();
  setRecurringEvents = vi.fn();
  setRecurringOccurrences = vi.fn();
  setIsBooting = vi.fn();
  showError = vi.fn();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("useWeekStorage", () => {
  it("loads initial state in parallel and seeds default recurring events", async () => {
    renderHarness();

    await waitFor(() => expect(setIsBooting).toHaveBeenCalledWith(false));

    const weekKey = "2026-06-15";
    expect(getSettings).toHaveBeenCalledTimes(1);
    expect(getWeekOverride).toHaveBeenCalledWith(weekKey);
    expect(getWeekOverrides).toHaveBeenCalledTimes(1);
    expect(getSyncResult).toHaveBeenCalledWith(weekKey);
    expect(getWorklogAllocationPreferences).toHaveBeenCalledTimes(1);
    expect(getJiraActivityResult).toHaveBeenCalledWith(weekKey);
    expect(getFavoriteKeys).toHaveBeenCalledTimes(1);
    expect(getPersonalNotes).toHaveBeenCalledWith(weekKey);
    expect(getBitbucketReviewResult).toHaveBeenCalledWith(weekKey);
    expect(getRecurringEvents).toHaveBeenCalledTimes(1);
    expect(getRecurringOccurrences).toHaveBeenCalledWith(weekKey);
    expect(saveRecurringEvents).toHaveBeenCalledTimes(1);
    const seededRecurringEvents = saveRecurringEvents.mock.calls[0][0];
    expect(seededRecurringEvents.map((event) => event.id)).toEqual(["rec-daily", "rec-plan", "rec-refine", "rec-sync"]);
    expect(setSettings).toHaveBeenCalledWith(settings);
    expect(setSettingsDraft).toHaveBeenCalledWith(settings);
    expect(setWeekOverride).toHaveBeenCalledWith(buildOverride(weekKey));
    expect(setWeekOverrides).toHaveBeenCalledWith([buildOverride("2026-06-08", ["2026-06-12"])]);
    expect(setSyncResult).toHaveBeenCalledWith(buildSyncResult(weekKey));
    expect(setWorklogAllocationPreferences).toHaveBeenCalledWith([]);
    expect(setJiraActivityResult).toHaveBeenCalledWith(buildJiraActivityResult(weekKey));
    expect(setFavoriteKeys).toHaveBeenCalledWith(["TB-1"]);
    expect(setPersonalNotes).toHaveBeenCalledWith([buildNote(`note-${weekKey}`, weekKey)]);
    expect(setBitbucketReviewResult).toHaveBeenCalledWith(buildReviewResult(weekKey));
    expect(setRecurringEvents).toHaveBeenCalledWith(seededRecurringEvents);
    expect(setRecurringOccurrences).toHaveBeenCalledWith([buildOccurrence(weekKey)]);
    expect(showError).not.toHaveBeenCalled();
  });

  it("uses stored recurring events without reseeding them", async () => {
    const storedRecurringEvents = buildDefaultRecurringEvents().slice(0, 1);
    getRecurringEvents.mockResolvedValue(storedRecurringEvents);
    renderHarness();

    await waitFor(() => expect(setRecurringEvents).toHaveBeenCalledWith(storedRecurringEvents));

    expect(saveRecurringEvents).not.toHaveBeenCalled();
  });

  it("skips the first post-bootstrap week reload and then loads selected weeks", async () => {
    const initialWeekStart = new Date(2026, 5, 15);
    const nextWeekStart = new Date(2026, 5, 22);
    renderHarness({ isBooting: true, weekStart: initialWeekStart });
    await waitFor(() => expect(setIsBooting).toHaveBeenCalledWith(false));

    getWeekOverride.mockClear();
    getSyncResult.mockClear();
    getJiraActivityResult.mockClear();
    getPersonalNotes.mockClear();
    getBitbucketReviewResult.mockClear();
    getRecurringOccurrences.mockClear();
    setWeekOverride.mockClear();
    setSyncResult.mockClear();
    setJiraActivityResult.mockClear();
    setPersonalNotes.mockClear();
    setBitbucketReviewResult.mockClear();
    setRecurringOccurrences.mockClear();

    renderHarness({ isBooting: false, weekStart: initialWeekStart });
    await flush();
    expect(getWeekOverride).not.toHaveBeenCalled();

    renderHarness({ isBooting: false, weekStart: nextWeekStart });
    await waitFor(() => expect(setWeekOverride).toHaveBeenCalledWith(buildOverride("2026-06-22", ["2026-06-23"])));

    const nextWeekKey = toLocalDateKey(nextWeekStart);
    expect(getSyncResult).toHaveBeenCalledWith(nextWeekKey);
    expect(getJiraActivityResult).toHaveBeenCalledWith(nextWeekKey);
    expect(getPersonalNotes).toHaveBeenCalledWith(nextWeekKey);
    expect(getBitbucketReviewResult).toHaveBeenCalledWith(nextWeekKey);
    expect(getRecurringOccurrences).toHaveBeenCalledWith(nextWeekKey);
    expect(setSyncResult).toHaveBeenCalledWith(buildSyncResult(nextWeekKey));
    expect(setJiraActivityResult).toHaveBeenCalledWith(buildJiraActivityResult(nextWeekKey));
    expect(setPersonalNotes).toHaveBeenCalledWith([buildNote(`note-${nextWeekKey}`, nextWeekKey)]);
    expect(setBitbucketReviewResult).toHaveBeenCalledWith(buildReviewResult(nextWeekKey));
    expect(setRecurringOccurrences).toHaveBeenCalledWith([buildOccurrence(nextWeekKey)]);
  });

  it("does not read storage in demo mode", async () => {
    renderHarness({ isDemo: true, isBooting: false });
    await flush();

    expect(getSettings).not.toHaveBeenCalled();
    expect(getWeekOverride).not.toHaveBeenCalled();
    expect(setIsBooting).not.toHaveBeenCalled();
  });

  it("reports initial load failures and clears booting state", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    getSettings.mockRejectedValue(new Error("IndexedDB unavailable"));
    renderHarness();

    await waitFor(() => expect(showError).toHaveBeenCalledWith("Unable to load local tracker data."));

    expect(setIsBooting).toHaveBeenCalledWith(false);
    expect(consoleError).toHaveBeenCalled();
  });

  it("reports selected-week load failures", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const initialWeekStart = new Date(2026, 5, 15);
    const nextWeekStart = new Date(2026, 5, 22);
    renderHarness({ isBooting: true, weekStart: initialWeekStart });
    await waitFor(() => expect(setIsBooting).toHaveBeenCalledWith(false));

    showError.mockClear();
    getWeekOverride.mockRejectedValue(new Error("Week read failed"));
    renderHarness({ isBooting: false, weekStart: initialWeekStart });
    await flush();
    renderHarness({ isBooting: false, weekStart: nextWeekStart });

    await waitFor(() => expect(showError).toHaveBeenCalledWith("Unable to load the selected week."));

    expect(consoleError).toHaveBeenCalled();
  });
});

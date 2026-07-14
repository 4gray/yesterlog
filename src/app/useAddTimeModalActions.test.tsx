// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppSettings, JiraWorklog, PersonalNote, WeekState } from "../../shared/types";
import type { AddTimePrefill } from "../components/AddTimeModal";
import { buildWeekState, DEFAULT_SETTINGS } from "../domain/week";
import { toLocalDateKey } from "../utils/date";
import { useAddTimeModalActions } from "./useAddTimeModalActions";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const settings: AppSettings = {
  ...DEFAULT_SETTINGS,
  jiraBaseUrl: "https://example.atlassian.net",
  jiraEmail: "person@example.com",
  jiraApiToken: "token"
};

const weekStart = new Date(2026, 5, 15);
const defaultCurrentDate = new Date(2026, 5, 17, 14, 37, 22, 456);
const defaultWeekState = buildWeekState(
  weekStart,
  settings,
  { weekKey: toLocalDateKey(weekStart), skippedDates: [] },
  undefined,
  [],
  defaultCurrentDate,
  [],
  []
);

const worklog: JiraWorklog = {
  id: "10001",
  issueId: "20001",
  issueKey: "TB-42",
  issueSummary: "Refactor modal actions",
  authorAccountId: "account-1",
  started: "2026-06-17T10:00:00.000Z",
  timeSpentSeconds: 3600,
  comment: "Existing worklog"
};

const personalNote: PersonalNote = {
  id: "note-1",
  weekKey: "2026-06-15",
  dateKey: "2026-06-17",
  text: "Local planning",
  timeSpentSeconds: 1800,
  startedISO: "2026-06-17T09:00:00.000Z",
  createdAt: "2026-06-17T09:00:00.000Z",
  updatedAt: "2026-06-17T09:00:00.000Z"
};

type AddTimeModalActionsApi = ReturnType<typeof useAddTimeModalActions>;

let container: HTMLDivElement;
let root: Root;
let api: AddTimeModalActionsApi | undefined;
let addModalDate: Date | undefined;
let addTimePrefill: AddTimePrefill | undefined;
let editingWorklog: JiraWorklog | undefined;
let editingPersonalNote: PersonalNote | undefined;
let weekStartState: Date;
let logError: string | undefined;

interface HarnessProps {
  currentDate?: Date;
  currentWeekState?: WeekState;
  isConfigured?: boolean;
  welcomeConnected?: boolean;
  isBooting?: boolean;
  initialAddModalDate?: Date;
  initialAddTimePrefill?: AddTimePrefill;
  initialEditingWorklog?: JiraWorklog;
  initialEditingPersonalNote?: PersonalNote;
  initialWeekStart?: Date;
  initialLogError?: string;
}

function Harness({
  currentDate = defaultCurrentDate,
  currentWeekState = defaultWeekState,
  isConfigured = true,
  welcomeConnected = false,
  isBooting = false,
  initialAddModalDate,
  initialAddTimePrefill,
  initialEditingWorklog,
  initialEditingPersonalNote,
  initialWeekStart = weekStart,
  initialLogError
}: HarnessProps) {
  const [weekStartValue, setWeekStart] = useState(initialWeekStart);
  const [addModalDateValue, setAddModalDate] = useState<Date | undefined>(initialAddModalDate);
  const [addTimePrefillValue, setAddTimePrefill] = useState<AddTimePrefill | undefined>(initialAddTimePrefill);
  const [editingWorklogValue, setEditingWorklog] = useState<JiraWorklog | undefined>(initialEditingWorklog);
  const [editingPersonalNoteValue, setEditingPersonalNote] = useState<PersonalNote | undefined>(
    initialEditingPersonalNote
  );
  const [logErrorValue, setLogError] = useState<string | undefined>(initialLogError);

  weekStartState = weekStartValue;
  addModalDate = addModalDateValue;
  addTimePrefill = addTimePrefillValue;
  editingWorklog = editingWorklogValue;
  editingPersonalNote = editingPersonalNoteValue;
  logError = logErrorValue;
  api = useAddTimeModalActions({
    currentDate,
    weekState: currentWeekState,
    isConfigured,
    welcomeConnected,
    isBooting,
    addModalDate: addModalDateValue,
    editingWorklog: editingWorklogValue,
    editingPersonalNote: editingPersonalNoteValue,
    setWeekStart,
    setAddModalDate,
    setAddTimePrefill,
    setEditingWorklog,
    setEditingPersonalNote,
    setLogError
  });

  return null;
}

const getApi = () => {
  if (!api) {
    throw new Error("Add Time modal actions hook was not rendered.");
  }
  return api;
};

const renderHarness = (props: HarnessProps = {}) => {
  act(() => {
    root.render(<Harness {...props} />);
  });
};

beforeEach(() => {
  api = undefined;
  addModalDate = undefined;
  addTimePrefill = undefined;
  editingWorklog = undefined;
  editingPersonalNote = undefined;
  weekStartState = weekStart;
  logError = undefined;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useAddTimeModalActions", () => {
  it("opens Add Time for the requested date while clearing edit state and log errors", () => {
    renderHarness({
      initialEditingWorklog: worklog,
      initialEditingPersonalNote: personalNote,
      initialLogError: "Previous error"
    });

    act(() => getApi().openAddTime(new Date(2026, 5, 16, 9, 10)));

    expect(toLocalDateKey(addModalDate ?? new Date(0))).toBe("2026-06-16");
    expect(addModalDate?.getHours()).toBe(14);
    expect(addModalDate?.getMinutes()).toBe(37);
    expect(addTimePrefill).toEqual({ retrospective: true });
    expect(editingWorklog).toBeUndefined();
    expect(editingPersonalNote).toBeUndefined();
    expect(logError).toBeUndefined();
  });

  it("opens Add Time with an optional prefill and clears it on close", () => {
    const prefill: AddTimePrefill = {
      timeSpentSeconds: 40 * 60,
      startedISO: "2026-06-17T09:00:00.000Z",
      comment: "Reconstructed work"
    };
    renderHarness();

    act(() => getApi().openAddTime(new Date(2026, 5, 17, 9, 0), prefill));

    expect(addTimePrefill).toBe(prefill);

    act(() => getApi().closeAddTime());

    expect(addModalDate).toBeUndefined();
    expect(addTimePrefill).toBeUndefined();
  });

  it("opens the tracking shortcut on the current week and rounds to the minute", () => {
    const currentDate = new Date(2026, 6, 8, 16, 12, 44, 123);
    renderHarness({
      currentDate,
      initialWeekStart: new Date(2026, 5, 15),
      initialLogError: "Previous error"
    });

    act(() => getApi().openTrackingShortcut());

    expect(toLocalDateKey(weekStartState)).toBe("2026-07-06");
    expect(addModalDate?.getTime()).toBe(new Date(2026, 6, 8, 16, 12, 0, 0).getTime());
    expect(addTimePrefill).toEqual({ retrospective: true });
    expect(editingWorklog).toBeUndefined();
    expect(editingPersonalNote).toBeUndefined();
    expect(logError).toBeUndefined();
  });

  it("does not open the tracking shortcut while another modal is active", () => {
    const existingModalDate = new Date(2026, 5, 16, 9);
    renderHarness({
      initialAddModalDate: existingModalDate,
      initialWeekStart: new Date(2026, 5, 15)
    });

    act(() => getApi().openTrackingShortcut());

    expect(addModalDate).toBe(existingModalDate);
    expect(toLocalDateKey(weekStartState)).toBe("2026-06-15");
  });

  it("handles Ctrl+K globally and prevents the browser default", () => {
    renderHarness();

    const event = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
    act(() => window.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(true);
    expect(toLocalDateKey(addModalDate ?? new Date(0))).toBe("2026-06-17");
  });

  it("ignores shortcut keypresses when the app is not ready for logging", () => {
    renderHarness({ isConfigured: false });

    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
      cancelable: true
    });
    act(() => window.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(true);
    expect(addModalDate).toBeUndefined();
  });

  it("opens worklog editing while clearing add/personal-note state and log errors", () => {
    const existingModalDate = new Date(2026, 5, 16, 9);
    renderHarness({
      initialAddModalDate: existingModalDate,
      initialEditingPersonalNote: personalNote,
      initialLogError: "Previous error"
    });

    act(() => getApi().openEditWorklog(worklog));

    expect(addModalDate).toBeUndefined();
    expect(addTimePrefill).toBeUndefined();
    expect(editingPersonalNote).toBeUndefined();
    expect(editingWorklog).toBe(worklog);
    expect(logError).toBeUndefined();
  });

  it("opens personal-note editing while clearing add/worklog state and log errors", () => {
    const existingModalDate = new Date(2026, 5, 16, 9);
    renderHarness({
      initialAddModalDate: existingModalDate,
      initialEditingWorklog: worklog,
      initialLogError: "Previous error"
    });

    act(() => getApi().openEditPersonalNote(personalNote));

    expect(addModalDate).toBeUndefined();
    expect(addTimePrefill).toBeUndefined();
    expect(editingWorklog).toBeUndefined();
    expect(editingPersonalNote).toBe(personalNote);
    expect(logError).toBeUndefined();
  });

  it("closes each modal state without changing the others", () => {
    const existingModalDate = new Date(2026, 5, 16, 9);
    renderHarness({
      initialAddModalDate: existingModalDate,
      initialEditingWorklog: worklog,
      initialEditingPersonalNote: personalNote,
      initialLogError: "Keep this error visible"
    });

    act(() => getApi().closeAddTime());

    expect(addModalDate).toBeUndefined();
    expect(editingWorklog).toBe(worklog);
    expect(editingPersonalNote).toBe(personalNote);
    expect(logError).toBe("Keep this error visible");

    act(() => getApi().closeEditingWorklog());

    expect(editingWorklog).toBeUndefined();
    expect(editingPersonalNote).toBe(personalNote);
    expect(logError).toBe("Keep this error visible");

    act(() => getApi().closeEditingPersonalNote());

    expect(editingPersonalNote).toBeUndefined();
    expect(logError).toBe("Keep this error visible");
  });
});

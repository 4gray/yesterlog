// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  AppSettings,
  PersonalNote,
  RecurringEvent,
  RecurringOccurrence,
  WeekOverride,
  WeekState
} from "../../shared/types";
import { DEFAULT_SETTINGS } from "../domain/week";
import { useWeekState } from "./useWeekState";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const weekStart = new Date(2026, 5, 15);
const currentDate = new Date(2026, 5, 17, 10);
const settings: AppSettings = {
  ...DEFAULT_SETTINGS,
  jiraBaseUrl: "https://example.atlassian.net",
  jiraEmail: "person@example.com",
  jiraApiToken: "token"
};
const baseOverride: WeekOverride = { weekKey: "2026-06-15", skippedDates: [] };
const note: PersonalNote = {
  id: "note-1",
  weekKey: "2026-06-15",
  dateKey: "2026-06-16",
  text: "Local planning",
  timeSpentSeconds: 90 * 60,
  startedISO: "2026-06-16T09:00:00.000Z",
  createdAt: "2026-06-16T09:00:00.000Z",
  updatedAt: "2026-06-16T09:00:00.000Z"
};
const notes = [note];
const recurringEvents: RecurringEvent[] = [];
const recurringOccurrences: RecurringOccurrence[] = [];

let container: HTMLDivElement;
let root: Root;
let renderedWeekState: WeekState | undefined;

function Harness({
  override = baseOverride,
  personalNotes = notes
}: {
  override?: WeekOverride;
  personalNotes?: PersonalNote[];
}) {
  renderedWeekState = useWeekState({
    weekStart,
    settings,
    weekOverride: override,
    syncResult: undefined,
    personalNotes,
    currentDate,
    recurringEvents,
    recurringOccurrences
  });

  return null;
}

const getWeekState = () => {
  if (!renderedWeekState) {
    throw new Error("Week state hook was not rendered.");
  }
  return renderedWeekState;
};

const renderHarness = (props: Parameters<typeof Harness>[0] = {}) => {
  act(() => {
    root.render(<Harness {...props} />);
  });
};

beforeEach(() => {
  renderedWeekState = undefined;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useWeekState", () => {
  it("derives visible week state and preserves identity while inputs are unchanged", () => {
    renderHarness();
    const firstState = getWeekState();

    expect(firstState.weekKey).toBe("2026-06-15");
    expect(firstState.activeWorkingDates).toEqual([
      "2026-06-15",
      "2026-06-16",
      "2026-06-17",
      "2026-06-18",
      "2026-06-19"
    ]);
    expect(firstState.personalNoteHours).toBe(1.5);
    expect(firstState.days[1].personalNotes[0]).toBe(note);

    renderHarness();

    expect(getWeekState()).toBe(firstState);
  });

  it("recomputes when the week override changes", () => {
    renderHarness();
    const firstState = getWeekState();
    const skippedOverride: WeekOverride = { weekKey: "2026-06-15", skippedDates: ["2026-06-17"] };

    renderHarness({ override: skippedOverride });

    expect(getWeekState()).not.toBe(firstState);
    expect(getWeekState().activeWorkingDates).toEqual(["2026-06-15", "2026-06-16", "2026-06-18", "2026-06-19"]);
    expect(getWeekState().days[2].isSkipped).toBe(true);
  });
});

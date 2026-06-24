// @vitest-environment jsdom
import { useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecurringEvent, RecurringOccurrence } from "../../shared/types";
import { useRecurringActions, type RecurringEventDraft } from "./useRecurringActions";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const visibleWeekKey = "2026-06-15";
const nextWeekKey = "2026-06-22";
const thursdayDateKey = "2026-06-18";

const buildEvent = (overrides: Partial<RecurringEvent> = {}): RecurringEvent => ({
  id: "rec-standup",
  title: "Daily Standup",
  daysOfWeek: [4],
  localTime: "09:15",
  durationMinutes: 15,
  defaultNote: "Daily sync",
  active: true,
  createdAt: "2026-06-15T08:00:00.000Z",
  updatedAt: "2026-06-15T08:00:00.000Z",
  ...overrides
});

const buildOccurrence = (overrides: Partial<RecurringOccurrence> = {}): RecurringOccurrence => ({
  eventId: "rec-standup",
  weekKey: visibleWeekKey,
  dateKey: thursdayDateKey,
  status: "confirmed",
  timeSpentSeconds: 900,
  note: "Daily sync",
  createdAt: "2026-06-18T08:00:00.000Z",
  updatedAt: "2026-06-18T08:00:00.000Z",
  ...overrides
});

const draft = (overrides: Partial<RecurringEventDraft> = {}): RecurringEventDraft => ({
  title: "Planning",
  daysOfWeek: [1, 3],
  localTime: "10:00",
  durationMinutes: 45,
  defaultNote: "Plan work",
  ...overrides
});

type RecurringActionsApi = ReturnType<typeof useRecurringActions> & {
  events: RecurringEvent[];
  occurrences: RecurringOccurrence[];
};

let container: HTMLDivElement;
let root: Root;
let api: RecurringActionsApi | undefined;
let storedOccurrences: Map<string, RecurringOccurrence[]>;
let saveRecurringEvents: ReturnType<typeof vi.fn<(events: RecurringEvent[]) => Promise<void>>>;
let getRecurringOccurrences: ReturnType<typeof vi.fn<(weekKey: string) => Promise<RecurringOccurrence[]>>>;
let saveRecurringOccurrences: ReturnType<typeof vi.fn<(weekKey: string, occurrences: RecurringOccurrence[]) => Promise<void>>>;
let showSuccess: ReturnType<typeof vi.fn<(message: string) => void>>;
let showError: ReturnType<typeof vi.fn<(message: string) => void>>;

function Harness({
  initialEvents = [buildEvent()],
  initialOccurrences = [],
  isDemo = false
}: {
  initialEvents?: RecurringEvent[];
  initialOccurrences?: RecurringOccurrence[];
  isDemo?: boolean;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [occurrences, setOccurrences] = useState(initialOccurrences);
  const hook = useRecurringActions({
    recurringEvents: events,
    setRecurringEvents: setEvents,
    recurringOccurrences: occurrences,
    setRecurringOccurrences: setOccurrences,
    visibleWeekKey,
    isDemo,
    saveRecurringEvents,
    getRecurringOccurrences,
    saveRecurringOccurrences,
    showSuccess,
    showError
  });
  api = { ...hook, events, occurrences };
  return null;
}

const getApi = () => {
  if (!api) {
    throw new Error("Recurring actions hook was not rendered.");
  }
  return api;
};

const renderHarness = (props: Parameters<typeof Harness>[0] = {}) => {
  act(() => {
    root.render(<Harness {...props} />);
  });
};

beforeEach(() => {
  api = undefined;
  storedOccurrences = new Map();
  saveRecurringEvents = vi.fn(async () => undefined);
  getRecurringOccurrences = vi.fn(async (weekKey) => storedOccurrences.get(weekKey) ?? []);
  saveRecurringOccurrences = vi.fn(async (weekKey, occurrences) => {
    storedOccurrences.set(weekKey, occurrences);
  });
  showSuccess = vi.fn();
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

describe("useRecurringActions", () => {
  it("ignores invalid recurring event drafts", async () => {
    renderHarness();

    await act(async () => {
      await getApi().handleSaveRecurringEvent(draft({ title: " " }));
      await getApi().handleSaveRecurringEvent(draft({ daysOfWeek: [] }));
    });

    expect(saveRecurringEvents).not.toHaveBeenCalled();
    expect(showSuccess).not.toHaveBeenCalled();
    expect(getApi().events).toEqual([buildEvent()]);
  });

  it("adds a demo recurring event without storage", async () => {
    renderHarness({ initialEvents: [], isDemo: true });

    await act(async () => {
      await getApi().handleSaveRecurringEvent(draft({ title: " Planning " }));
    });

    expect(saveRecurringEvents).not.toHaveBeenCalled();
    expect(getApi().events).toHaveLength(1);
    expect(getApi().events[0]).toMatchObject({
      title: "Planning",
      daysOfWeek: [1, 3],
      localTime: "10:00",
      durationMinutes: 45,
      defaultNote: "Plan work",
      active: true
    });
    expect(showSuccess).toHaveBeenCalledWith("Added recurring event.");
  });

  it("updates, toggles, and deletes stored recurring events", async () => {
    const event = buildEvent();
    renderHarness({ initialEvents: [event] });

    await act(async () => {
      await getApi().handleSaveRecurringEvent(
        draft({ id: event.id, title: " Updated standup ", daysOfWeek: [2], durationMinutes: 20 })
      );
    });

    expect(saveRecurringEvents).toHaveBeenCalledTimes(1);
    expect(getApi().events[0]).toMatchObject({
      id: event.id,
      title: "Updated standup",
      daysOfWeek: [2],
      durationMinutes: 20,
      active: true
    });
    expect(showSuccess).toHaveBeenCalledWith("Updated recurring event.");

    await act(async () => {
      await getApi().handleToggleRecurringEvent(event.id);
    });

    expect(saveRecurringEvents).toHaveBeenCalledTimes(2);
    expect(getApi().events[0].active).toBe(false);

    await act(async () => {
      await getApi().handleDeleteRecurringEvent(event.id);
    });

    expect(saveRecurringEvents).toHaveBeenCalledTimes(3);
    expect(getApi().events).toEqual([]);
    expect(showSuccess).toHaveBeenCalledWith("Removed recurring event.");
  });

  it("confirms a stored visible-week occurrence", async () => {
    renderHarness();

    await act(async () => {
      await expect(
        getApi().handleConfirmRecurring({
          eventId: "rec-standup",
          dateKey: thursdayDateKey,
          timeSpentSeconds: 1200,
          note: " Discussed blockers "
        })
      ).resolves.toBe(true);
    });

    expect(saveRecurringOccurrences).toHaveBeenCalledTimes(1);
    expect(saveRecurringOccurrences.mock.calls[0][0]).toBe(visibleWeekKey);
    expect(getApi().occurrences).toHaveLength(1);
    expect(getApi().occurrences[0]).toMatchObject({
      eventId: "rec-standup",
      weekKey: visibleWeekKey,
      dateKey: thursdayDateKey,
      status: "confirmed",
      timeSpentSeconds: 1200,
      note: "Discussed blockers"
    });
    expect(showSuccess).toHaveBeenCalledWith("Logged 20m to Daily Standup locally.");
  });

  it("preserves an existing occurrence createdAt when confirming again", async () => {
    const existing = buildOccurrence({
      status: "skipped",
      timeSpentSeconds: undefined,
      note: undefined,
      createdAt: "2026-06-18T07:00:00.000Z"
    });
    renderHarness({ initialOccurrences: [existing] });

    await act(async () => {
      await getApi().handleConfirmRecurring({
        eventId: "rec-standup",
        dateKey: thursdayDateKey,
        timeSpentSeconds: 900
      });
    });

    expect(getApi().occurrences[0]).toMatchObject({
      status: "confirmed",
      timeSpentSeconds: 900,
      createdAt: "2026-06-18T07:00:00.000Z"
    });
  });

  it("skips a stored occurrence outside the visible week without changing visible state", async () => {
    renderHarness();

    await act(async () => {
      await expect(getApi().handleSkipRecurring("rec-standup", "2026-06-23")).resolves.toBe(true);
    });

    expect(getRecurringOccurrences).toHaveBeenCalledWith(nextWeekKey);
    expect(saveRecurringOccurrences).toHaveBeenCalledWith(nextWeekKey, [
      expect.objectContaining({
        eventId: "rec-standup",
        weekKey: nextWeekKey,
        dateKey: "2026-06-23",
        status: "skipped"
      })
    ]);
    expect(getApi().occurrences).toEqual([]);
  });

  it("deletes a demo occurrence and restores the suggestion", async () => {
    const existing = buildOccurrence();
    renderHarness({ initialOccurrences: [existing], isDemo: true });

    await act(async () => {
      await expect(getApi().handleDeleteRecurringOccurrence("rec-standup", thursdayDateKey)).resolves.toBe(true);
    });

    expect(saveRecurringOccurrences).not.toHaveBeenCalled();
    expect(getApi().occurrences).toEqual([]);
    expect(showSuccess).toHaveBeenCalledWith("Removed Daily Standup — it's a suggestion again.");
  });

  it("resolves candidates from current events and occurrences", async () => {
    const skipped = buildEvent({ id: "rec-refine", title: "Refinement", localTime: "14:00" });
    renderHarness({
      initialEvents: [buildEvent(), skipped],
      initialOccurrences: [
        buildOccurrence(),
        buildOccurrence({ eventId: "rec-refine", status: "skipped", timeSpentSeconds: undefined })
      ]
    });

    expect(getApi().recurringCandidatesForDate(thursdayDateKey).map((event) => event.id)).toEqual(["rec-refine"]);
  });

  it("reports storage failures when saving an occurrence", async () => {
    saveRecurringOccurrences.mockRejectedValue(new Error("IndexedDB failed"));
    renderHarness();

    await act(async () => {
      await expect(
        getApi().handleConfirmRecurring({
          eventId: "rec-standup",
          dateKey: thursdayDateKey,
          timeSpentSeconds: 900
        })
      ).resolves.toBe(false);
    });

    expect(showError).toHaveBeenCalledWith("IndexedDB failed");
    expect(showSuccess).not.toHaveBeenCalled();
    expect(getApi().occurrences).toEqual([]);
  });
});

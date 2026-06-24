// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecurringEvent, RecurringOccurrence } from "../../shared/types";
import { buildDefaultRecurringEvents } from "../domain/recurring";
import { useAppRecurringState } from "./useAppRecurringState";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type AppRecurringStateApi = ReturnType<typeof useAppRecurringState>;

let container: HTMLDivElement;
let root: Root;
let api: AppRecurringStateApi | undefined;

function Harness({ isDemo }: { isDemo: boolean }) {
  api = useAppRecurringState({ isDemo });
  return null;
}

const getApi = () => {
  if (!api) {
    throw new Error("App recurring state hook was not rendered.");
  }
  return api;
};

const renderHarness = (isDemo: boolean) => {
  act(() => {
    root.render(<Harness isDemo={isDemo} />);
  });
};

const buildEvent = (overrides: Partial<RecurringEvent> = {}): RecurringEvent => ({
  id: "rec-custom",
  title: "Custom recurring",
  daysOfWeek: [1],
  localTime: "10:00",
  durationMinutes: 30,
  defaultNote: "Custom note",
  active: true,
  createdAt: "2026-06-24T08:00:00.000Z",
  updatedAt: "2026-06-24T08:00:00.000Z",
  ...overrides
});

const buildOccurrence = (overrides: Partial<RecurringOccurrence> = {}): RecurringOccurrence => ({
  eventId: "rec-custom",
  weekKey: "2026-06-22",
  dateKey: "2026-06-24",
  status: "confirmed",
  timeSpentSeconds: 1800,
  note: "Custom note",
  createdAt: "2026-06-24T08:00:00.000Z",
  updatedAt: "2026-06-24T08:00:00.000Z",
  ...overrides
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-24T08:00:00.000Z"));
  api = undefined;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useAppRecurringState", () => {
  it("starts empty outside demo mode", () => {
    renderHarness(false);

    expect(getApi().recurringEvents).toEqual([]);
    expect(getApi().recurringOccurrences).toEqual([]);
  });

  it("seeds default recurring events in demo mode", () => {
    renderHarness(true);

    expect(getApi().recurringEvents).toEqual(buildDefaultRecurringEvents("2026-06-24T08:00:00.000Z"));
    expect(getApi().recurringOccurrences).toEqual([]);
  });

  it("keeps lazy initial values stable across rerenders until setters change them", () => {
    renderHarness(true);
    const initialEvents = getApi().recurringEvents;
    const nextEvent = buildEvent();
    const nextOccurrence = buildOccurrence();

    renderHarness(false);

    expect(getApi().recurringEvents).toBe(initialEvents);
    expect(getApi().recurringOccurrences).toEqual([]);

    act(() => {
      getApi().setRecurringEvents([nextEvent]);
      getApi().setRecurringOccurrences([nextOccurrence]);
    });

    expect(getApi().recurringEvents).toEqual([nextEvent]);
    expect(getApi().recurringOccurrences).toEqual([nextOccurrence]);
  });
});

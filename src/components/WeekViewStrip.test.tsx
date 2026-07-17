// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WeekViewStrip, type WeekViewStripProps } from "./WeekViewStrip";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => undefined;

const CURRENT_WEEK_START = new Date(2026, 5, 15);

const baseProps = (): WeekViewStripProps => ({
  weekStart: CURRENT_WEEK_START,
  currentWeekStart: CURRENT_WEEK_START,
  syncState: "synced",
  syncLabel: "SYNCED 2M AGO",
  isConfigured: true,
  viewMode: "summary",
  onViewModeChange: noop,
  onSync: noop,
  onPreviousWeek: noop,
  onCurrentWeek: noop,
  onNextWeek: noop
});

let container: HTMLDivElement;
let root: Root;

const renderStrip = (props: Partial<WeekViewStripProps> = {}) => {
  act(() => {
    root.render(<WeekViewStrip {...baseProps()} {...props} />);
  });
};

const findTodayButton = () =>
  Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent === "TODAY"
  );

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("WeekViewStrip", () => {
  it("labels the visible range rather than 'THIS WEEK'", () => {
    renderStrip();

    expect(container.querySelector(".week-nav-range")?.textContent).toBe("JUN 15–21");
    expect(container.textContent).not.toContain("THIS WEEK");
  });

  it("offers TODAY only when the visible week is not the current week", () => {
    renderStrip();
    expect(findTodayButton()).toBeUndefined();

    renderStrip({ weekStart: new Date(2026, 5, 8) });
    expect(findTodayButton()).toBeDefined();
    expect(container.querySelector(".week-nav-range")?.textContent).toBe("JUN 8–14");
  });

  it("jumps back to the current week from TODAY", () => {
    const onCurrentWeek = vi.fn();
    renderStrip({ weekStart: new Date(2026, 5, 8), onCurrentWeek });

    act(() => findTodayButton()?.click());
    expect(onCurrentWeek).toHaveBeenCalledTimes(1);
  });

  it("wires the week navigation arrows", () => {
    const onPreviousWeek = vi.fn();
    const onNextWeek = vi.fn();
    renderStrip({ onPreviousWeek, onNextWeek });

    act(() => {
      container.querySelector<HTMLButtonElement>("[aria-label='Previous week']")?.click();
      container.querySelector<HTMLButtonElement>("[aria-label='Next week']")?.click();
    });

    expect(onPreviousWeek).toHaveBeenCalledTimes(1);
    expect(onNextWeek).toHaveBeenCalledTimes(1);
  });

  it("renders the given sync label and colours the dot by state", () => {
    // Label wording is resolveRelativeSyncLabel's job (see syncStatus.test.ts).
    renderStrip();
    expect(container.querySelector(".week-strip-sync")?.textContent).toBe("SYNCED 2M AGO");
    expect(container.querySelector(".sync-dot.is-synced")).not.toBeNull();

    renderStrip({ syncState: "syncing", syncLabel: "SYNCING…" });
    expect(container.querySelector(".week-strip-sync")?.textContent).toBe("SYNCING…");
    expect(container.querySelector(".sync-dot.is-syncing")).not.toBeNull();

    renderStrip({ syncState: "offline", syncLabel: "OFFLINE" });
    expect(container.querySelector(".sync-dot.is-offline")).not.toBeNull();

    renderStrip({ syncState: "stale", syncLabel: "NOT SYNCED" });
    expect(container.querySelector(".sync-dot.is-stale")).not.toBeNull();
  });

  it("force-syncs from the status text", () => {
    const onSync = vi.fn();
    renderStrip({ onSync });

    act(() => container.querySelector<HTMLButtonElement>(".week-strip-sync")?.click());
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it("blocks the status-text sync while syncing or before Jira is configured", () => {
    renderStrip({ syncState: "syncing" });
    expect(container.querySelector<HTMLButtonElement>(".week-strip-sync")?.disabled).toBe(true);

    renderStrip({ isConfigured: false });
    expect(container.querySelector<HTMLButtonElement>(".week-strip-sync")?.disabled).toBe(true);
  });

  it("switches between compact summaries and the shared timeline", () => {
    const onViewModeChange = vi.fn();
    renderStrip({ viewMode: "summary", onViewModeChange });

    const switcher = container.querySelector("[aria-label='Week view layout']");
    const summary = switcher?.querySelector<HTMLButtonElement>("button[aria-pressed='true']");
    const timeline = Array.from(switcher?.querySelectorAll("button") ?? []).find(
      (button) => button.textContent === "TIMELINE"
    );

    expect(summary?.textContent).toBe("SUMMARY");
    act(() => timeline?.click());
    expect(onViewModeChange).toHaveBeenCalledWith("timeline");
  });
});

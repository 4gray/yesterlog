// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WeekHeader, type WeekHeaderProps } from "./WeekHeader";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => undefined;

const baseProps = (): WeekHeaderProps => ({
  weekStart: new Date(2026, 5, 15),
  remainingWeekHours: 28,
  trackedWeekHours: 12,
  billableWeekHours: 8,
  weeklyTargetHours: 40,
  isConfigured: true,
  syncState: "synced",
  syncLabel: "SYNCED 2M AGO",
  onSync: noop,
  onAddTime: noop,
  onOpenCommandPalette: noop
});

let container: HTMLDivElement;
let root: Root;

const renderHeader = (props: Partial<WeekHeaderProps> = {}) => {
  act(() => {
    root.render(<WeekHeader {...baseProps()} {...props} />);
  });
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("WeekHeader", () => {
  it("renders the week range, progress, and hour totals", () => {
    renderHeader();

    expect(container.querySelector(".eyebrow")?.textContent).toBe("WEEK 25 — JUN 15–21");
    expect(container.querySelector(".ring")?.getAttribute("aria-label")).toBe("30 percent of weekly target");
    expect(container.querySelector(".ring-label")?.textContent).toBe("30%");
    // The split is a SIBLING of .week-figure, so the figure text stays exact.
    expect(container.querySelector(".week-figure")?.textContent).toBe("28h left · 12h / 40h");
  });

  it("shows the billable / to-log split under the week figure", () => {
    renderHeader();

    const split = container.querySelector(".time-split.week-split");
    expect(split).not.toBeNull();
    // 8h billable in Jira, 12 tracked − 8 billable = 4h still to log.
    expect(split?.querySelector(".ts-billable")?.textContent).toContain("8h billable");
    expect(split?.querySelector(".ts-local")?.textContent).toContain("4h to log");
  });

  it("collapses the split to all-billable when nothing is outstanding", () => {
    renderHeader({ trackedWeekHours: 8, billableWeekHours: 8 });

    const split = container.querySelector(".time-split.week-split");
    expect(split?.querySelector(".ts-billable.is-clear")).not.toBeNull();
    expect(split?.querySelector(".ts-local")).toBeNull();
  });

  it("omits the split entirely when no time is tracked", () => {
    renderHeader({ trackedWeekHours: 0, billableWeekHours: 0 });

    expect(container.querySelector(".time-split")).toBeNull();
  });

  it("wires sync, add time, and the command palette", () => {
    const onSync = vi.fn();
    const onAddTime = vi.fn();
    const onOpenCommandPalette = vi.fn();
    renderHeader({ onSync, onAddTime, onOpenCommandPalette });

    act(() => {
      container.querySelector<HTMLButtonElement>(".sync-button")?.click();
      container.querySelector<HTMLButtonElement>(".add-time-button")?.click();
      container.querySelector<HTMLButtonElement>(".command-bar")?.click();
    });

    expect(onSync).toHaveBeenCalledTimes(1);
    expect(onAddTime).toHaveBeenCalledTimes(1);
    expect(onAddTime).toHaveBeenCalledWith();
    expect(onOpenCommandPalette).toHaveBeenCalledTimes(1);
  });

  it("keeps view controls out of the actions row", () => {
    renderHeader();

    // Week nav and the layout switch live in the view strip since toolbar V3.
    expect(container.querySelector("[aria-label='Week view layout']")).toBeNull();
    expect(container.querySelector("[aria-label='Week navigation']")).toBeNull();
  });

  it("colours the sync dot by state and surfaces the elapsed label in the tooltip", () => {
    renderHeader();
    expect(container.querySelector(".sync-dot.is-synced")).not.toBeNull();
    expect(container.querySelector<HTMLButtonElement>(".sync-button")?.title).toBe("Sync now · synced 2m ago");

    renderHeader({ syncState: "offline", syncLabel: "OFFLINE" });
    expect(container.querySelector(".sync-dot.is-offline")).not.toBeNull();

    renderHeader({ syncState: "stale", syncLabel: "NOT SYNCED" });
    expect(container.querySelector(".sync-dot.is-stale")).not.toBeNull();
  });

  it("goes busy whenever syncState says syncing, not just on a Jira worklog sync", () => {
    // A Bitbucket/activity sync only shows up in syncState. Deriving from a
    // narrower flag left the icon idle while the strip below read SYNCING….
    renderHeader({ syncState: "syncing", syncLabel: "SYNCING…" });

    const button = container.querySelector<HTMLButtonElement>(".sync-button");
    expect(button?.disabled).toBe(true);
    expect(button?.querySelector(".spin")).not.toBeNull();
  });

  it("disables sync while syncing or before Jira is configured", () => {
    renderHeader({ isConfigured: false });

    const disconnectedSync = container.querySelector<HTMLButtonElement>(".sync-button");
    expect(disconnectedSync?.disabled).toBe(true);
    expect(disconnectedSync?.title).toBe("Connect Jira in settings to sync");

    renderHeader({ isConfigured: true, syncState: "syncing", syncLabel: "SYNCING…" });

    const syncingButton = container.querySelector<HTMLButtonElement>(".sync-button");
    expect(syncingButton?.disabled).toBe(true);
    expect(syncingButton?.querySelector(".spin")).not.toBeNull();
    expect(syncingButton?.querySelector(".sync-dot.is-syncing")).not.toBeNull();
  });
});

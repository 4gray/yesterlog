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
  weeklyTargetHours: 40,
  isSyncing: false,
  isConfigured: true,
  onSync: noop,
  onAddTime: noop,
  onPreviousWeek: noop,
  onCurrentWeek: noop,
  onNextWeek: noop
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
    expect(container.querySelector(".week-figure")?.textContent).toBe("28h left · 12h / 40h");
  });

  it("wires sync, add time, and week navigation actions", () => {
    const onSync = vi.fn();
    const onAddTime = vi.fn();
    const onPreviousWeek = vi.fn();
    const onCurrentWeek = vi.fn();
    const onNextWeek = vi.fn();
    renderHeader({ onSync, onAddTime, onPreviousWeek, onCurrentWeek, onNextWeek });

    act(() => {
      container.querySelector<HTMLButtonElement>(".sync-button")?.click();
      container.querySelector<HTMLButtonElement>(".add-time-button")?.click();
      container.querySelector<HTMLButtonElement>("[aria-label='Previous week']")?.click();
      Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "THIS WEEK")?.click();
      container.querySelector<HTMLButtonElement>("[aria-label='Next week']")?.click();
    });

    expect(onSync).toHaveBeenCalledTimes(1);
    expect(onAddTime).toHaveBeenCalledTimes(1);
    expect(onAddTime).toHaveBeenCalledWith();
    expect(onPreviousWeek).toHaveBeenCalledTimes(1);
    expect(onCurrentWeek).toHaveBeenCalledTimes(1);
    expect(onNextWeek).toHaveBeenCalledTimes(1);
  });

  it("disables sync while syncing or before Jira is configured", () => {
    renderHeader({ isConfigured: false });

    const disconnectedSync = container.querySelector<HTMLButtonElement>(".sync-button");
    expect(disconnectedSync?.disabled).toBe(true);
    expect(disconnectedSync?.title).toBe("Connect Jira in settings to sync");

    renderHeader({ isSyncing: true, isConfigured: true });

    const syncingButton = container.querySelector<HTMLButtonElement>(".sync-button");
    expect(syncingButton?.disabled).toBe(true);
    expect(syncingButton?.title).toBe("Sync with Jira");
    expect(syncingButton?.querySelector(".spin")).not.toBeNull();
  });
});

// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIVE_DATE_INTERVAL_MS, useLiveDate } from "./useLiveDate";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let currentDate: Date | undefined;

function Harness({ frozenDate, intervalMs }: { frozenDate?: Date; intervalMs?: number }) {
  currentDate = useLiveDate(frozenDate, intervalMs);
  return null;
}

const getCurrentDate = () => {
  if (!currentDate) {
    throw new Error("Live date hook was not rendered.");
  }
  return currentDate;
};

const renderHarness = (props: { frozenDate?: Date; intervalMs?: number } = {}) => {
  act(() => {
    root.render(<Harness {...props} />);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  currentDate = undefined;
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

describe("useLiveDate", () => {
  it("initializes with the current system time and advances on the slow tick", () => {
    vi.setSystemTime(new Date("2026-06-17T10:00:00.000Z"));
    renderHarness();

    expect(getCurrentDate().toISOString()).toBe("2026-06-17T10:00:00.000Z");

    act(() => {
      vi.advanceTimersByTime(LIVE_DATE_INTERVAL_MS);
    });

    expect(getCurrentDate().toISOString()).toBe("2026-06-17T10:01:00.000Z");
  });

  it("keeps demo mode frozen and avoids starting an interval", () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const frozenDate = new Date("2026-06-17T14:30:00.000Z");

    vi.setSystemTime(new Date("2026-06-17T10:00:00.000Z"));
    renderHarness({ frozenDate });

    expect(getCurrentDate()).toBe(frozenDate);
    expect(setIntervalSpy).not.toHaveBeenCalled();

    vi.setSystemTime(new Date("2026-06-17T10:10:00.000Z"));
    act(() => {
      vi.advanceTimersByTime(10 * LIVE_DATE_INTERVAL_MS);
    });

    expect(getCurrentDate()).toBe(frozenDate);
  });

  it("clears the live interval when unmounted", () => {
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");

    renderHarness();
    act(() => root.unmount());

    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it("supports a custom tick interval", () => {
    vi.setSystemTime(new Date("2026-06-17T10:00:00.000Z"));
    renderHarness({ intervalMs: 5_000 });

    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(getCurrentDate().toISOString()).toBe("2026-06-17T10:00:05.000Z");
  });
});

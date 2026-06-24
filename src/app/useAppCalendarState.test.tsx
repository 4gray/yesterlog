// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WeekOverride } from "../../shared/types";
import { toLocalDateKey } from "../utils/date";
import { useAppCalendarState } from "./useAppCalendarState";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type AppCalendarStateApi = ReturnType<typeof useAppCalendarState>;

interface HarnessProps {
  currentDate: Date;
  demoScenario?: {
    weekStart: Date;
    weekOverride: WeekOverride;
  };
}

let container: HTMLDivElement;
let root: Root;
let api: AppCalendarStateApi | undefined;

function Harness(props: HarnessProps) {
  api = useAppCalendarState(props);
  return null;
}

const getApi = () => {
  if (!api) {
    throw new Error("App calendar state hook was not rendered.");
  }
  return api;
};

const renderHarness = (props: HarnessProps) => {
  act(() => {
    root.render(<Harness {...props} />);
  });
};

beforeEach(() => {
  api = undefined;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useAppCalendarState", () => {
  it("initializes live calendar state from the current local week and month", () => {
    renderHarness({ currentDate: new Date(2026, 5, 24, 8) });

    expect(toLocalDateKey(getApi().weekStart)).toBe("2026-06-22");
    expect(toLocalDateKey(getApi().monthAnchor)).toBe("2026-06-01");
    expect(getApi().weekOverride).toEqual({
      weekKey: "2026-06-22",
      skippedDates: []
    });
  });

  it("keeps lazy initial values stable across rerenders until setters change them", () => {
    renderHarness({ currentDate: new Date(2026, 5, 24, 8) });

    renderHarness({ currentDate: new Date(2026, 6, 15, 8) });

    expect(toLocalDateKey(getApi().weekStart)).toBe("2026-06-22");
    expect(toLocalDateKey(getApi().monthAnchor)).toBe("2026-06-01");
    expect(getApi().weekOverride.weekKey).toBe("2026-06-22");

    act(() => {
      getApi().setWeekStart(new Date(2026, 6, 13));
      getApi().setMonthAnchor(new Date(2026, 6, 1));
      getApi().setWeekOverride({ weekKey: "2026-07-13", skippedDates: ["2026-07-17"] });
    });

    expect(toLocalDateKey(getApi().weekStart)).toBe("2026-07-13");
    expect(toLocalDateKey(getApi().monthAnchor)).toBe("2026-07-01");
    expect(getApi().weekOverride).toEqual({
      weekKey: "2026-07-13",
      skippedDates: ["2026-07-17"]
    });
  });

  it("uses demo week state while keeping the month anchor tied to the frozen current date", () => {
    const demoWeekStart = new Date(2026, 5, 15);
    const demoWeekOverride = {
      weekKey: "2026-06-15",
      skippedDates: ["2026-06-19"]
    };

    renderHarness({
      currentDate: new Date(2026, 5, 18, 14, 30),
      demoScenario: {
        weekStart: demoWeekStart,
        weekOverride: demoWeekOverride
      }
    });

    expect(getApi().weekStart).toBe(demoWeekStart);
    expect(toLocalDateKey(getApi().monthAnchor)).toBe("2026-06-01");
    expect(getApi().weekOverride).toEqual(demoWeekOverride);
    expect(getApi().weekOverride).not.toBe(demoWeekOverride);
  });
});

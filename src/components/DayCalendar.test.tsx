// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecurringEntry } from "../../shared/types";
import { DayCalendar } from "./DayCalendar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const recurringEntry: RecurringEntry = {
  eventId: "rec-daily",
  dateKey: "2026-06-18",
  title: "Daily Standup",
  localTime: "09:15",
  timeSpentSeconds: 15 * 60,
  note: "Blockers"
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("DayCalendar confirmed recurring interactions", () => {
  it("moves a confirmed event with the same snapped drag gesture as a worklog", () => {
    const onMoveRecurring = vi.fn(async () => true);
    act(() => {
      root.render(
        <DayCalendar
          date={new Date(2026, 5, 18, 12)}
          now={new Date(2026, 5, 18, 12)}
          worklogs={[]}
          notes={[]}
          recurring={[recurringEntry]}
          pending={[]}
          ghosts={[]}
          layoutOverride={{ startMin: 0, endMin: 24 * 60, pxPerHour: 60 }}
          onCreateAt={() => undefined}
          onMoveWorklog={async () => true}
          onMoveRecurring={onMoveRecurring}
          onPromoteGhost={() => undefined}
          onConfirmRecurring={() => undefined}
          onSkipRecurring={() => undefined}
          onEditWorklog={() => undefined}
          onEditPersonalNote={() => undefined}
        />
      );
    });

    const track = container.querySelector<HTMLElement>(".cal-track");
    const block = container.querySelector<HTMLElement>(".cal-block--recurring");
    expect(track).not.toBeNull();
    expect(block).not.toBeNull();
    expect(block?.classList.contains("is-draggable")).toBe(true);
    expect(block?.querySelectorAll(".cal-resize")).toHaveLength(2);

    vi.spyOn(track!, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 300,
      bottom: 1440,
      left: 0,
      width: 300,
      height: 1440,
      toJSON: () => undefined
    });

    act(() => {
      block!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientY: 560 }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, button: 0, clientY: 620 }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0, clientY: 620 }));
    });

    expect(onMoveRecurring).toHaveBeenCalledWith(recurringEntry, {
      localTime: "10:15",
      timeSpentSeconds: 15 * 60
    });
  });
});

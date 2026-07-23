// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarItem, DayLayout, Range } from "../domain/dayCalendar";
import {
  useDayCalendarInteraction,
  type CalendarMoveTarget
} from "./useDayCalendarInteraction";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const layout: DayLayout = { startMin: 0, endMin: 24 * 60, pxPerHour: 60 };
const item: CalendarItem = {
  id: "wl:1",
  kind: "worklog",
  startMin: 9 * 60,
  endMin: 10 * 60,
  colorRole: "accent",
  layer: "committed"
};

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect;

function Harness({
  resolveMoveTarget,
  canMoveAcrossTargets,
  onCommitMove
}: {
  resolveMoveTarget: (clientX: number, clientY: number) => CalendarMoveTarget | undefined;
  canMoveAcrossTargets?: (movedItem: CalendarItem) => boolean;
  onCommitMove: (movedItem: CalendarItem, range: Range, target?: CalendarMoveTarget) => void;
}) {
  const trackRef = { current: null as HTMLDivElement | null };
  const { startBlockDrag } = useDayCalendarInteraction({
    layout,
    items: [item],
    trackRef,
    onCreate: () => undefined,
    onCommitMove,
    onSelect: () => undefined,
    sourceMoveTargetId: "2026-06-16",
    resolveMoveTarget,
    canMoveAcrossTargets
  });

  return (
    <div
      ref={(node) => {
        trackRef.current = node;
        if (node) {
          node.getBoundingClientRect = () => rect(0, 0, 160, 1440);
        }
      }}
    >
      <button type="button" onPointerDown={(event) => startBlockDrag(event, item, "move")}>
        Move
      </button>
    </div>
  );
}

let container: HTMLDivElement;
let root: Root;
let targetTrack: HTMLDivElement;

const pointer = (target: EventTarget, type: string, clientX: number, clientY: number) =>
  target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX, clientY })
  );

beforeEach(() => {
  container = document.createElement("div");
  targetTrack = document.createElement("div");
  targetTrack.getBoundingClientRect = () => rect(180, 0, 160, 1440);
  document.body.append(container, targetTrack);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  targetTrack.remove();
  vi.restoreAllMocks();
});

const performMove = async () => {
  const button = container.querySelector("button")!;
  await act(async () => {
    pointer(button, "pointerdown", 20, 550);
    pointer(window, "pointermove", 220, 670);
    pointer(window, "pointerup", 220, 670);
  });
};

describe("useDayCalendarInteraction cross-day moves", () => {
  it("commits a whole-block move against the destination day and time grid", async () => {
    const onCommitMove = vi.fn();
    const target: CalendarMoveTarget = {
      id: "2026-06-17",
      date: new Date(2026, 5, 17),
      track: targetTrack,
      layout,
      items: []
    };
    await act(async () => {
      root.render(<Harness resolveMoveTarget={() => target} onCommitMove={onCommitMove} />);
    });

    await performMove();

    expect(onCommitMove).toHaveBeenCalledTimes(1);
    expect(onCommitMove).toHaveBeenCalledWith(item, { startMin: 660, endMin: 720 }, target);
  });

  it("cancels the move when the pointer is released over a protected day", async () => {
    const onCommitMove = vi.fn();
    await act(async () => {
      root.render(<Harness resolveMoveTarget={() => undefined} onCommitMove={onCommitMove} />);
    });

    await performMove();

    expect(onCommitMove).not.toHaveBeenCalled();
  });

  it("keeps non-worklog moves on their source day", async () => {
    const onCommitMove = vi.fn();
    const resolveMoveTarget = vi.fn();
    await act(async () => {
      root.render(
        <Harness
          resolveMoveTarget={resolveMoveTarget}
          canMoveAcrossTargets={() => false}
          onCommitMove={onCommitMove}
        />
      );
    });

    await performMove();

    expect(resolveMoveTarget).not.toHaveBeenCalled();
    expect(onCommitMove).toHaveBeenCalledWith(item, { startMin: 660, endMin: 720 }, undefined);
  });
});

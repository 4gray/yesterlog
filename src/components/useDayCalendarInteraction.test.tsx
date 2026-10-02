// @vitest-environment jsdom
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarItem, DayLayout, Range } from "../domain/dayCalendar";
import {
  useDayCalendarInteraction,
  type CalendarMoveTarget,
  type CommitMoveOptions
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
const noteItem: CalendarItem = {
  id: "note:1",
  kind: "note",
  startMin: 9 * 60,
  endMin: 10 * 60,
  colorRole: "meeting",
  layer: "committed"
};
const overlappingWorklog: CalendarItem = {
  id: "wl:overlap",
  kind: "worklog",
  startMin: 9 * 60 + 30,
  endMin: 10 * 60 + 30,
  colorRole: "accent",
  layer: "committed"
};

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect;

function Harness({
  resolveMoveTarget,
  canMoveAcrossTargets,
  canDuplicate,
  onCommitMove
}: {
  resolveMoveTarget: (clientX: number, clientY: number) => CalendarMoveTarget | undefined;
  canMoveAcrossTargets?: (movedItem: CalendarItem) => boolean;
  canDuplicate?: (movedItem: CalendarItem) => boolean;
  onCommitMove: (movedItem: CalendarItem, range: Range, target?: CalendarMoveTarget, options?: CommitMoveOptions) => void;
}) {
  // A real ref: the harness re-renders between gestures in multi-drag tests.
  const trackRef = useRef<HTMLDivElement | null>(null);
  const { startBlockDrag } = useDayCalendarInteraction({
    layout,
    items: [item],
    trackRef,
    onCreate: () => undefined,
    onCommitMove,
    onSelect: () => undefined,
    sourceMoveTargetId: "2026-06-16",
    resolveMoveTarget,
    canMoveAcrossTargets,
    canDuplicate
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

function ResizeHarness({ onCommitMove }: { onCommitMove: (movedItem: CalendarItem, range: Range) => void }) {
  const trackRef = { current: null as HTMLDivElement | null };
  const { startBlockDrag } = useDayCalendarInteraction({
    layout,
    items: [noteItem, overlappingWorklog],
    trackRef,
    onCreate: () => undefined,
    onCommitMove,
    onSelect: () => undefined
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
      <button type="button" onPointerDown={(event) => startBlockDrag(event, noteItem, "resize-end")}>
        Resize note
      </button>
    </div>
  );
}

let container: HTMLDivElement;
let root: Root;
let targetTrack: HTMLDivElement;

const pointer = (target: EventTarget, type: string, clientX: number, clientY: number, altKey = false) =>
  target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX, clientY, altKey })
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
    expect(onCommitMove).toHaveBeenCalledWith(item, { startMin: 660, endMin: 720 }, target, { duplicate: false });
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
    expect(onCommitMove).toHaveBeenCalledWith(item, { startMin: 660, endMin: 720 }, undefined, { duplicate: false });
  });

  it("allows a local note to resize through unrelated calendar blocks", async () => {
    const onCommitMove = vi.fn();
    await act(async () => {
      root.render(<ResizeHarness onCommitMove={onCommitMove} />);
    });

    const button = container.querySelector("button")!;
    await act(async () => {
      pointer(button, "pointerdown", 20, 600);
      pointer(window, "pointermove", 20, 660);
      pointer(window, "pointerup", 20, 660);
    });

    expect(onCommitMove).toHaveBeenCalledWith(noteItem, { startMin: 540, endMin: 660 }, undefined, { duplicate: false });
  });


  it("books a duplicate instead of moving when Option is held and the item allows it", async () => {
    const onCommitMove = vi.fn();
    const target: CalendarMoveTarget = {
      id: "2026-06-17",
      date: new Date(2026, 5, 17),
      track: targetTrack,
      layout,
      items: []
    };
    await act(async () => {
      root.render(
        <Harness resolveMoveTarget={() => target} canDuplicate={() => true} onCommitMove={onCommitMove} />
      );
    });

    const button = container.querySelector("button")!;
    await act(async () => {
      pointer(button, "pointerdown", 20, 550, true);
      pointer(window, "pointermove", 220, 670, true);
      pointer(window, "pointerup", 220, 670, true);
    });

    expect(onCommitMove).toHaveBeenCalledWith(item, { startMin: 660, endMin: 720 }, target, { duplicate: true });
    expect(document.body.classList.contains("cal-duplicating")).toBe(false);
  });

  it("ignores Option when the item cannot be duplicated and keeps the original as a blocker otherwise", async () => {
    const onCommitMove = vi.fn();
    await act(async () => {
      root.render(
        <Harness resolveMoveTarget={() => undefined} canMoveAcrossTargets={() => false} onCommitMove={onCommitMove} />
      );
    });

    const button = container.querySelector("button")!;
    await act(async () => {
      pointer(button, "pointerdown", 20, 550, true);
      pointer(window, "pointermove", 20, 580, true);
      pointer(window, "pointerup", 20, 580, true);
    });
    expect(onCommitMove).toHaveBeenLastCalledWith(item, { startMin: 570, endMin: 630 }, undefined, { duplicate: false });

    await act(async () => {
      root.render(
        <Harness
          resolveMoveTarget={() => undefined}
          canMoveAcrossTargets={() => false}
          canDuplicate={() => true}
          onCommitMove={onCommitMove}
        />
      );
    });
    onCommitMove.mockClear();
    // Still overlapping its own original (9:00–10:00): nothing to book on release.
    await act(async () => {
      pointer(button, "pointerdown", 20, 550, true);
      pointer(window, "pointermove", 20, 580, true);
      pointer(window, "pointerup", 20, 580, true);
    });
    expect(onCommitMove).not.toHaveBeenCalled();

    // Dragged clear of the original into free time: booked as a duplicate at 11:00.
    await act(async () => {
      pointer(button, "pointerdown", 20, 550, true);
      pointer(window, "pointermove", 20, 670, true);
      pointer(window, "pointerup", 20, 670, true);
    });
    expect(onCommitMove).toHaveBeenLastCalledWith(item, { startMin: 660, endMin: 720 }, undefined, { duplicate: true });
  });
});

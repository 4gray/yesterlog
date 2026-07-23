import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import {
  ceilingForStart,
  clampMinute,
  DEFAULT_DRAFT_MINUTES,
  DEFAULT_SNAP_MINUTES,
  fitMove,
  fitResizeEnd,
  fitResizeStart,
  floorForEnd,
  MIN_ITEM_MINUTES,
  MINUTES_PER_DAY,
  overlapsCommitted,
  snapMinute,
  yToMinute,
  type CalendarItem,
  type DayLayout,
  type Range
} from "../domain/dayCalendar";

export type DragKind = "create" | "move" | "resize-start" | "resize-end";

/** The in-progress gesture geometry the calendar renders as a live preview. */
export interface DragDraft {
  kind: DragKind;
  itemId?: string;
  range: Range;
}

export interface CalendarMoveTarget {
  id: string;
  date: Date;
  track: HTMLElement;
  layout: DayLayout;
  items: CalendarItem[];
}

export interface CalendarMovePreview {
  sourceId: string;
  targetId: string;
  item: CalendarItem;
  range: Range;
}

interface InternalDrag {
  kind: DragKind;
  item?: CalendarItem;
  durationMin: number;
  grabOffsetMin: number;
  anchorMin: number;
  startClientX: number;
  startClientY: number;
  moved: boolean;
  range: Range;
  moveTarget?: CalendarMoveTarget;
}

interface UseDayCalendarInteractionArgs {
  layout: DayLayout;
  items: CalendarItem[];
  trackRef: RefObject<HTMLDivElement | null>;
  snap?: number;
  onCreate: (range: Range) => void;
  onCommitMove: (item: CalendarItem, range: Range, target?: CalendarMoveTarget) => void;
  onSelect: (item: CalendarItem) => void;
  sourceMoveTargetId?: string;
  resolveMoveTarget?: (clientX: number, clientY: number) => CalendarMoveTarget | undefined;
  canMoveAcrossTargets?: (item: CalendarItem) => boolean;
  onMovePreview?: (preview?: CalendarMovePreview) => void;
}

const MOVE_THRESHOLD_PX = 4;

/**
 * Pointer state machine for the day calendar: drag empty space to size a new block,
 * drag a block to move it, drag its edges to resize. All geometry snaps to the grid and
 * clamps into free space via the pure `fit*` helpers, so the strict non-overlapping lane
 * is enforced during the gesture. A gesture that doesn't cross the movement threshold is
 * treated as a click (create-default / select-to-edit) so taps still work.
 */
export const useDayCalendarInteraction = ({
  layout,
  items,
  trackRef,
  snap = DEFAULT_SNAP_MINUTES,
  onCreate,
  onCommitMove,
  onSelect,
  sourceMoveTargetId,
  resolveMoveTarget,
  canMoveAcrossTargets,
  onMovePreview
}: UseDayCalendarInteractionArgs) => {
  const [draft, setDraft] = useState<DragDraft | null>(null);
  const dragRef = useRef<InternalDrag | null>(null);

  // Keep the latest inputs in a ref so the stable window listeners never go stale.
  const ctxRef = useRef({
    layout,
    items,
    snap,
    onCreate,
    onCommitMove,
    onSelect,
    trackRef,
    sourceMoveTargetId,
    resolveMoveTarget,
    canMoveAcrossTargets,
    onMovePreview
  });
  ctxRef.current = {
    layout,
    items,
    snap,
    onCreate,
    onCommitMove,
    onSelect,
    trackRef,
    sourceMoveTargetId,
    resolveMoveTarget,
    canMoveAcrossTargets,
    onMovePreview
  };

  const readMinute = useCallback((clientY: number, target?: CalendarMoveTarget) => {
    const { trackRef: ref, layout: sourceLayout } = ctxRef.current;
    const current = target?.layout ?? sourceLayout;
    const rect = (target?.track ?? ref.current)?.getBoundingClientRect();
    if (!rect) {
      return current.startMin;
    }
    return clampMinute(yToMinute(clientY - rect.top, current), 0, MINUTES_PER_DAY);
  }, []);

  const onWindowMove = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }
      const {
        items: sourceItems,
        snap: currentSnap,
        layout: sourceLayout,
        sourceMoveTargetId: sourceId,
        resolveMoveTarget: resolveTarget,
        canMoveAcrossTargets: canMoveAcross,
        onMovePreview: previewMove
      } = ctxRef.current;
      if (Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) > MOVE_THRESHOLD_PX) {
        drag.moved = true;
      }

      if (drag.kind === "create") {
        const pointer = readMinute(event.clientY);
        if (pointer >= drag.anchorMin) {
          const ceiling = ceilingForStart(drag.anchorMin, sourceItems, undefined, sourceLayout.endMin);
          const endMin = clampMinute(snapMinute(pointer, currentSnap), drag.anchorMin + MIN_ITEM_MINUTES, ceiling);
          drag.range = { startMin: drag.anchorMin, endMin };
        } else {
          const floor = floorForEnd(drag.anchorMin, sourceItems, undefined, sourceLayout.startMin);
          const startMin = clampMinute(snapMinute(pointer, currentSnap), floor, drag.anchorMin - MIN_ITEM_MINUTES);
          drag.range = { startMin, endMin: drag.anchorMin };
        }
      } else if (drag.kind === "move" && drag.item) {
        const usesCrossDayTargets = Boolean(resolveTarget && (canMoveAcross?.(drag.item) ?? true));
        const target = usesCrossDayTargets ? resolveTarget?.(event.clientX, event.clientY) : undefined;
        drag.moveTarget = target;
        if (usesCrossDayTargets && !target) {
          previewMove?.();
          setDraft({ kind: drag.kind, itemId: drag.item.id, range: drag.range });
          return;
        }
        const pointer = readMinute(event.clientY, target);
        const targetItems = target?.items ?? sourceItems;
        const targetLayout = target?.layout ?? sourceLayout;
        const desiredStart = snapMinute(pointer - drag.grabOffsetMin, currentSnap);
        const fit = fitMove(
          desiredStart,
          drag.durationMin,
          targetItems,
          drag.item.id,
          targetLayout.startMin,
          targetLayout.endMin
        );
        if (fit) {
          drag.range = fit;
        } else if (usesCrossDayTargets) {
          drag.moveTarget = undefined;
          previewMove?.();
          setDraft({ kind: drag.kind, itemId: drag.item.id, range: drag.range });
          return;
        }
        if (usesCrossDayTargets && drag.moved && sourceId && target) {
          previewMove?.({
            sourceId,
            targetId: target.id,
            item: drag.item,
            range: drag.range
          });
        }
      } else if (drag.kind === "resize-end" && drag.item) {
        const pointer = readMinute(event.clientY);
        drag.range = fitResizeEnd(drag.item.startMin, pointer, sourceItems, drag.item.id, currentSnap, sourceLayout.endMin);
      } else if (drag.kind === "resize-start" && drag.item) {
        const pointer = readMinute(event.clientY);
        drag.range = fitResizeStart(pointer, drag.item.endMin, sourceItems, drag.item.id, currentSnap, sourceLayout.startMin);
      }

      setDraft({ kind: drag.kind, itemId: drag.item?.id, range: drag.range });
    },
    [readMinute]
  );

  const onWindowUp = useCallback(() => {
    window.removeEventListener("pointermove", onWindowMove);
    window.removeEventListener("pointerup", onWindowUp);
    document.body.classList.remove("cal-dragging");

    const drag = dragRef.current;
    dragRef.current = null;
    setDraft(null);
    ctxRef.current.onMovePreview?.();
    if (!drag) {
      return;
    }
    const {
      items: currentItems,
      layout: currentLayout,
      onCreate: create,
      onCommitMove: commit,
      onSelect: select,
      resolveMoveTarget: resolveTarget,
      canMoveAcrossTargets: canMoveAcross
    } = ctxRef.current;

    if (drag.kind === "create") {
      let range = drag.range;
      if (!drag.moved) {
        const ceiling = ceilingForStart(drag.anchorMin, currentItems, undefined, currentLayout.endMin);
        range = { startMin: drag.anchorMin, endMin: Math.min(drag.anchorMin + DEFAULT_DRAFT_MINUTES, ceiling) };
      }
      if (range.endMin - range.startMin >= MIN_ITEM_MINUTES) {
        create(range);
      }
    } else if (drag.item) {
      if (drag.moved) {
        const requiresTarget =
          drag.kind === "move" &&
          Boolean(resolveTarget && (canMoveAcross?.(drag.item) ?? true));
        if (!requiresTarget || drag.moveTarget) {
          commit(drag.item, drag.range, drag.moveTarget);
        }
      } else {
        select(drag.item);
      }
    }
  }, [onWindowMove]);

  const begin = useCallback(
    (drag: InternalDrag) => {
      dragRef.current = drag;
      setDraft({ kind: drag.kind, itemId: drag.item?.id, range: drag.range });
      document.body.classList.add("cal-dragging");
      window.addEventListener("pointermove", onWindowMove);
      window.addEventListener("pointerup", onWindowUp);
    },
    [onWindowMove, onWindowUp]
  );

  useEffect(
    () => () => {
      window.removeEventListener("pointermove", onWindowMove);
      window.removeEventListener("pointerup", onWindowUp);
      document.body.classList.remove("cal-dragging");
      ctxRef.current.onMovePreview?.();
    },
    [onWindowMove, onWindowUp]
  );

  const startCreate = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) {
        return;
      }
      const anchor = clampMinute(snapMinute(readMinute(event.clientY), ctxRef.current.snap), layout.startMin, layout.endMin - MIN_ITEM_MINUTES);
      // Don't start a create inside/atop a committed block (e.g. a click in the thin
      // track gutter beside a worklog) — that would violate the non-overlapping lane.
      if (overlapsCommitted(anchor, anchor + MIN_ITEM_MINUTES, ctxRef.current.items)) {
        return;
      }
      begin({
        kind: "create",
        durationMin: DEFAULT_DRAFT_MINUTES,
        grabOffsetMin: 0,
        anchorMin: anchor,
        startClientX: event.clientX,
        startClientY: event.clientY,
        moved: false,
        range: { startMin: anchor, endMin: anchor + DEFAULT_DRAFT_MINUTES }
      });
    },
    [begin, layout.endMin, layout.startMin, readMinute]
  );

  const startBlockDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>, item: CalendarItem, kind: DragKind) => {
      if (event.button !== 0) {
        return;
      }
      event.stopPropagation();
      begin({
        kind,
        item,
        durationMin: item.endMin - item.startMin,
        grabOffsetMin: readMinute(event.clientY) - item.startMin,
        anchorMin: item.startMin,
        startClientX: event.clientX,
        startClientY: event.clientY,
        moved: false,
        range: { startMin: item.startMin, endMin: item.endMin }
      });
    },
    [begin, readMinute]
  );

  return { draft, startCreate, startBlockDrag };
};

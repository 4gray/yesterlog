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
  /** Option/Alt is held: the gesture books a second entry and leaves the original in place. */
  duplicate?: boolean;
  /** Cross-day moves: the column currently under the pointer, so the source column can hide its own preview. */
  targetId?: string;
}

export interface CommitMoveOptions {
  duplicate: boolean;
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
  duplicate?: boolean;
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
  duplicate: boolean;
  /** False while a same-day duplicate still overlaps its original, so release must not commit it. */
  fitValid: boolean;
}

interface UseDayCalendarInteractionArgs {
  layout: DayLayout;
  items: CalendarItem[];
  trackRef: RefObject<HTMLDivElement | null>;
  snap?: number;
  onCreate: (range: Range) => void;
  onCommitMove: (item: CalendarItem, range: Range, target?: CalendarMoveTarget, options?: CommitMoveOptions) => void;
  onSelect: (item: CalendarItem) => void;
  sourceMoveTargetId?: string;
  resolveMoveTarget?: (clientX: number, clientY: number) => CalendarMoveTarget | undefined;
  canMoveAcrossTargets?: (item: CalendarItem) => boolean;
  /** Items that may be duplicated with Option/Alt-drag instead of moved. */
  canDuplicate?: (item: CalendarItem) => boolean;
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
  canDuplicate,
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
    canDuplicate,
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
    canDuplicate,
    onMovePreview
  };

  /** Option/Alt may be pressed or released mid-gesture, so re-read it on every pointer event. */
  const syncDuplicate = (drag: InternalDrag, event: { altKey: boolean }) => {
    const allowed = drag.kind === "move" && Boolean(drag.item && ctxRef.current.canDuplicate?.(drag.item));
    drag.duplicate = allowed && event.altKey;
    document.body.classList.toggle("cal-duplicating", drag.duplicate);
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
      syncDuplicate(drag, event);
      // A duplicate must not overlap its own original, so the original stays a blocker.
      const excludeId = drag.duplicate ? undefined : drag.item?.id;

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
          setDraft({ kind: drag.kind, itemId: drag.item.id, range: drag.range, duplicate: drag.duplicate });
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
          excludeId,
          targetLayout.startMin,
          targetLayout.endMin
        );
        drag.fitValid = Boolean(fit) || !drag.duplicate;
        if (fit) {
          drag.range = fit;
        } else if (usesCrossDayTargets) {
          drag.moveTarget = undefined;
          previewMove?.();
          setDraft({ kind: drag.kind, itemId: drag.item.id, range: drag.range, duplicate: drag.duplicate });
          return;
        }
        if (usesCrossDayTargets && drag.moved && sourceId && target) {
          previewMove?.({
            sourceId,
            targetId: target.id,
            item: drag.item,
            range: drag.range,
            duplicate: drag.duplicate
          });
        }
      } else if (drag.kind === "resize-end" && drag.item) {
        const pointer = readMinute(event.clientY);
        const isLocalOverlay = drag.item.kind === "note" || drag.item.kind === "recurring";
        const blockers = isLocalOverlay ? [drag.item] : sourceItems;
        drag.range = fitResizeEnd(drag.item.startMin, pointer, blockers, drag.item.id, currentSnap, sourceLayout.endMin);
      } else if (drag.kind === "resize-start" && drag.item) {
        const pointer = readMinute(event.clientY);
        const isLocalOverlay = drag.item.kind === "note" || drag.item.kind === "recurring";
        const blockers = isLocalOverlay ? [drag.item] : sourceItems;
        drag.range = fitResizeStart(pointer, drag.item.endMin, blockers, drag.item.id, currentSnap, sourceLayout.startMin);
      }

      setDraft({
        kind: drag.kind,
        itemId: drag.item?.id,
        range: drag.range,
        duplicate: drag.duplicate,
        targetId: drag.moveTarget?.id
      });
    },
    [readMinute]
  );

  const onWindowUp = useCallback((event: PointerEvent) => {
    window.removeEventListener("pointermove", onWindowMove);
    window.removeEventListener("pointerup", onWindowUp);
    document.body.classList.remove("cal-dragging", "cal-duplicating");

    const drag = dragRef.current;
    dragRef.current = null;
    setDraft(null);
    ctxRef.current.onMovePreview?.();
    if (!drag) {
      return;
    }
    if (drag.moved && typeof event.altKey === "boolean") {
      syncDuplicate(drag, event);
      document.body.classList.remove("cal-duplicating");
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
        if ((!requiresTarget || drag.moveTarget) && drag.fitValid) {
          commit(drag.item, drag.range, drag.moveTarget, { duplicate: drag.duplicate });
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
      document.body.classList.remove("cal-dragging", "cal-duplicating");
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
        range: { startMin: anchor, endMin: anchor + DEFAULT_DRAFT_MINUTES },
        duplicate: false,
        fitValid: true
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
      const drag: InternalDrag = {
        kind,
        item,
        durationMin: item.endMin - item.startMin,
        grabOffsetMin: readMinute(event.clientY) - item.startMin,
        anchorMin: item.startMin,
        startClientX: event.clientX,
        startClientY: event.clientY,
        moved: false,
        range: { startMin: item.startMin, endMin: item.endMin },
        duplicate: false,
        fitValid: true
      };
      syncDuplicate(drag, event);
      begin(drag);
    },
    [begin, readMinute]
  );

  return { draft, startCreate, startBlockDrag };
};

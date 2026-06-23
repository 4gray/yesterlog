import { useCallback, useEffect, useRef, useState } from "react";
import type { JiraTicket } from "../../shared/types";

export interface DragHoverRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DropTarget {
  ticket: JiraTicket;
  dateKey: string;
  hours: number;
}

interface UseActiveWorkDragOptions {
  /** Returns true when a day column can accept a dropped ticket. */
  isDroppable: (dateKey: string) => boolean;
  /** Fired on a successful release over a droppable day. */
  onDrop: (target: DropTarget) => void;
}

const DRAG_THRESHOLD_PX = 4;

/**
 * Pointer-driven drag machine for the active-work dock. A card is "armed" on
 * mousedown and only promoted to a real drag once the pointer moves past a small
 * threshold, so plain clicks never start a drag. While dragging we hit-test the
 * cursor against day columns (`data-drop-day`) and hour lanes (`data-drop-hours`)
 * and surface the hovered target for the overlay UI.
 */
export const useActiveWorkDrag = ({ isDroppable, onDrop }: UseActiveWorkDragOptions) => {
  const [dragging, setDragging] = useState<JiraTicket | null>(null);
  const [hoverDay, setHoverDay] = useState<string | null>(null);
  const [hoverHours, setHoverHours] = useState<number | null>(null);
  const [hoverRect, setHoverRect] = useState<DragHoverRect | null>(null);

  const ghostRef = useRef<HTMLDivElement | null>(null);
  const armedRef = useRef<{ ticket: JiraTicket; x: number; y: number } | null>(null);
  // Mirrors of the latest state so global listeners read fresh values without
  // re-subscribing on every pointer move.
  const draggingRef = useRef<JiraTicket | null>(null);
  const hoverDayRef = useRef<string | null>(null);
  const hoverHoursRef = useRef<number | null>(null);

  const moveGhost = useCallback((x: number, y: number) => {
    const ghost = ghostRef.current;
    if (ghost) {
      ghost.style.transform = `translate(${x + 16}px, ${y + 12}px)`;
    }
  }, []);

  const endDrag = useCallback(() => {
    draggingRef.current = null;
    hoverDayRef.current = null;
    hoverHoursRef.current = null;
    setDragging(null);
    setHoverDay(null);
    setHoverHours(null);
    setHoverRect(null);
    try {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    } catch {
      /* ignore */
    }
  }, []);

  const handleDragMove = useCallback(
    (event: MouseEvent) => {
      moveGhost(event.clientX, event.clientY);
      const element = document.elementFromPoint(event.clientX, event.clientY);
      let dateKey: string | null = null;
      let hours: number | null = null;

      if (element) {
        const laneEl = element.closest<HTMLElement>("[data-drop-hours]");
        const dayEl = element.closest<HTMLElement>("[data-drop-day]");
        if (laneEl) {
          const parsed = Number.parseFloat(laneEl.getAttribute("data-drop-hours") ?? "");
          if (Number.isFinite(parsed)) {
            hours = parsed;
          }
        }
        if (dayEl) {
          dateKey = dayEl.getAttribute("data-drop-day");
          if (dateKey && hoverDayRef.current !== dateKey) {
            const box = dayEl.getBoundingClientRect();
            setHoverRect({ left: box.left, top: box.top, width: box.width, height: box.height });
          }
        }
      }

      if (!dateKey) {
        setHoverRect(null);
      }

      if (dateKey !== hoverDayRef.current) {
        hoverDayRef.current = dateKey;
        setHoverDay(dateKey);
      }
      if (hours !== hoverHoursRef.current) {
        hoverHoursRef.current = hours;
        setHoverHours(hours);
      }
    },
    [moveGhost]
  );

  const handleDragUp = useCallback(() => {
    document.removeEventListener("mousemove", handleDragMove);
    document.removeEventListener("mouseup", handleDragUp);

    const ticket = draggingRef.current;
    const dateKey = hoverDayRef.current;
    const hours = hoverHoursRef.current;
    endDrag();

    if (ticket && dateKey && isDroppable(dateKey)) {
      onDrop({ ticket, dateKey, hours: hours ?? 1 });
    }
  }, [endDrag, handleDragMove, isDroppable, onDrop]);

  const startDrag = useCallback(
    (ticket: JiraTicket, event: MouseEvent) => {
      try {
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
      } catch {
        /* ignore */
      }
      draggingRef.current = ticket;
      setDragging(ticket);
      setHoverDay(null);
      setHoverHours(null);
      setHoverRect(null);
      document.addEventListener("mousemove", handleDragMove);
      document.addEventListener("mouseup", handleDragUp);
      // Position the ghost immediately so it does not flash at the origin.
      requestAnimationFrame(() => moveGhost(event.clientX, event.clientY));
    },
    [handleDragMove, handleDragUp, moveGhost]
  );

  const handlePreMove = useCallback(
    (event: MouseEvent) => {
      const armed = armedRef.current;
      if (!armed) {
        return;
      }
      if (Math.hypot(event.clientX - armed.x, event.clientY - armed.y) > DRAG_THRESHOLD_PX) {
        armedRef.current = null;
        document.removeEventListener("mousemove", handlePreMove);
        document.removeEventListener("mouseup", handlePreUp);
        startDrag(armed.ticket, event);
      }
    },
    [startDrag]
  );

  const handlePreUp = useCallback(() => {
    armedRef.current = null;
    document.removeEventListener("mousemove", handlePreMove);
    document.removeEventListener("mouseup", handlePreUp);
  }, [handlePreMove]);

  const beginGrab = useCallback(
    (ticket: JiraTicket, event: React.MouseEvent) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      armedRef.current = { ticket, x: event.clientX, y: event.clientY };
      document.addEventListener("mousemove", handlePreMove);
      document.addEventListener("mouseup", handlePreUp);
    },
    [handlePreMove, handlePreUp]
  );

  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handlePreMove);
      document.removeEventListener("mouseup", handlePreUp);
      document.removeEventListener("mousemove", handleDragMove);
      document.removeEventListener("mouseup", handleDragUp);
      try {
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
      } catch {
        /* ignore */
      }
    };
  }, [handleDragMove, handleDragUp, handlePreMove, handlePreUp]);

  const isHoverBlocked = Boolean(hoverDay && !isDroppable(hoverDay));

  return {
    dragging,
    hoverDay,
    hoverHours,
    hoverRect,
    isHoverBlocked,
    ghostRef,
    beginGrab
  };
};

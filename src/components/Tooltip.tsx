import { useEffect, useRef, useState, type ReactNode } from "react";

export interface TooltipProps {
  text: string;
  /** Bubble side relative to the wrapped element. */
  placement?: "top" | "right";
  children: ReactNode;
  /** Delay before showing on hover (focus shows immediately). */
  delayMs?: number;
}

interface BubblePosition {
  x: number;
  y: number;
  placement: "top" | "bottom" | "right";
}

/**
 * Styled replacement for native title="" tooltips. The host span uses
 * display: contents, so wrapping an element does not change its layout;
 * the bubble is position: fixed, so it escapes overflow-hidden ancestors.
 * Don't combine with a title attribute on the child — one tooltip only.
 */
export const Tooltip = ({ text, placement = "top", children, delayMs = 350 }: TooltipProps) => {
  const hostRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<number>();
  const [pos, setPos] = useState<BubblePosition | null>(null);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const show = () => {
    const anchor = hostRef.current?.firstElementChild;
    if (!(anchor instanceof HTMLElement)) {
      return;
    }
    const rect = anchor.getBoundingClientRect();
    if (placement === "right") {
      setPos({ x: rect.right + 10, y: rect.top + rect.height / 2, placement: "right" });
    } else if (rect.top < 46) {
      setPos({ x: rect.left + rect.width / 2, y: rect.bottom + 8, placement: "bottom" });
    } else {
      setPos({ x: rect.left + rect.width / 2, y: rect.top - 8, placement: "top" });
    }
  };

  const scheduleShow = () => {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(show, delayMs);
  };

  const hide = () => {
    window.clearTimeout(timerRef.current);
    setPos(null);
  };

  return (
    <span ref={hostRef} className="tooltip-host" onMouseEnter={scheduleShow} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {pos ? (
        <span role="tooltip" className={`tooltip-bubble is-${pos.placement}`} style={{ left: pos.x, top: pos.y }}>
          {text}
        </span>
      ) : null}
    </span>
  );
};

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { CopyTarget, CopyTargetBlockedReason } from "../domain/worklogCopy";
import { formatHours } from "../utils/date";

export interface CopyPopoverAnchor {
  left: number;
  top: number;
  bottom: number;
}

interface CopyToDayPopoverProps {
  issueKey: string;
  hours: number;
  targets: CopyTarget[];
  anchor: CopyPopoverAnchor;
  accentColor: string;
  onPick: (target: CopyTarget) => void;
  onClose: () => void;
}

const CHIP_WIDTH = 62;
const CHIP_GAP = 6;
const PADDING = 28;

/** "12.3h" → "12.3" so a chip can say 12.3/8h without repeating the unit. */
const bareHours = (hours: number) => formatHours(hours).replace(/h$/, "");
const BLOCKED_LABEL: Record<CopyTargetBlockedReason, string> = {
  source: "source",
  future: "future",
  vacation: "vacation",
  "non-working": "off"
};

/**
 * Day-chip picker for "book this worklog on another day". One chip per weekday of the visible
 * week in calendar order, so a chip's position matches the column it stands for. Eligible days
 * show their logged/target hours and how much of the same issue is already there; blocked days
 * stay visible but say why. Rendered through a fixed portal (like `.wl-pop-fixed`) so it escapes
 * the scrollable log list; closes on Escape, outside click, or scroll.
 */
export const CopyToDayPopover = ({ issueKey, hours, targets, anchor, accentColor, onPick, onClose }: CopyToDayPopoverProps) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [placeAbove, setPlaceAbove] = useState(false);
  const width = Math.min(targets.length * CHIP_WIDTH + (targets.length - 1) * CHIP_GAP + PADDING, window.innerWidth - 20);
  const left = Math.min(Math.max(anchor.left - width + 32, 10), window.innerWidth - width - 10);

  useLayoutEffect(() => {
    const height = panelRef.current?.offsetHeight ?? 0;
    setPlaceAbove(anchor.bottom + 8 + height > window.innerHeight - 10 && anchor.top - 8 - height >= 10);
  }, [anchor.bottom, anchor.top]);

  useEffect(() => {
    const first = panelRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
    first?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const moveFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    const chips = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    if (chips.length === 0) {
      return;
    }
    const index = chips.findIndex((chip) => chip === document.activeElement);
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = chips[(index + step + chips.length) % chips.length];
    event.preventDefault();
    next?.focus();
  };

  const style = placeAbove
    ? { left, bottom: window.innerHeight - anchor.top + 8, width }
    : { left, top: anchor.bottom + 8, width };

  return createPortal(
    <div
      ref={panelRef}
      className={`copy-pop wl-pop-fixed${placeAbove ? " is-above" : ""}`}
      style={style}
      role="dialog"
      aria-label={`Book ${issueKey} on another day`}
      onKeyDown={moveFocus}
    >
      <div className="copy-pop-head">
        <span className="copy-pop-title">Book on another day</span>
        <span className="copy-pop-meta">
          <span style={{ color: accentColor }}>{issueKey}</span> · {formatHours(hours)}
        </span>
      </div>
      <div className="copy-pop-days" style={{ gridTemplateColumns: `repeat(${targets.length}, minmax(0, 1fr))` }}>
        {targets.map((target) => {
          const weekday = target.weekdayName.slice(0, 3);
          const reason = target.blockedReason ? BLOCKED_LABEL[target.blockedReason] : undefined;
          const title = target.enabled
            ? `${target.weekdayName} · ${target.dateLabel} · ${formatHours(target.trackedHours)} of ${formatHours(target.targetHours)} logged${
                target.sameIssueHours > 0 ? ` · ${issueKey} already has ${formatHours(target.sameIssueHours)} here` : ""
              }`
            : `${target.weekdayName} · ${target.dateLabel} · ${
                target.blockedReason === "source" ? "this is the day you are booking from" : `${reason} day`
              }`;
          return (
            <button
              key={target.dateKey}
              type="button"
              className={`copy-pop-day${target.isToday ? " is-today" : ""}${target.sameIssueHours > 0 ? " has-same-issue" : ""}`}
              disabled={!target.enabled}
              title={title}
              aria-label={`Book on ${target.weekdayName} ${target.dateLabel}`}
              onClick={() => onPick(target)}
            >
              <span className="copy-pop-day-name">{weekday}</span>
              <span className="copy-pop-day-total">
                {reason ?? `${bareHours(target.trackedHours)}/${bareHours(target.targetHours)}h`}
              </span>
              {target.enabled && target.sameIssueHours > 0 && (
                <span className="copy-pop-day-same">+{formatHours(target.sameIssueHours)}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
};

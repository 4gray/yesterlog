import { useEffect, useRef } from "react";
import { Loader2, X } from "lucide-react";
import { formatDuration } from "../utils/date";
import type { DockColor } from "./activeWork";

export interface QuickLogContext {
  ticketKey: string;
  ticketSummary: string;
  dateKey: string;
  dayLabel: string;
  hours: number;
  comment: string;
}

interface QuickLogSheetProps {
  context: QuickLogContext;
  color: DockColor;
  isLogging: boolean;
  onChangeHours: (hours: number) => void;
  onChangeComment: (comment: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

const HOUR_CHIPS: { hours: number; label: string }[] = [
  { hours: 0.5, label: "30m" },
  { hours: 1, label: "1h" },
  { hours: 2, label: "2h" },
  { hours: 4, label: "4h" }
];

export const QuickLogSheet = ({
  context,
  color,
  isLogging,
  onChangeHours,
  onChangeComment,
  onCancel,
  onConfirm
}: QuickLogSheetProps) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => textareaRef.current?.focus(), 40);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      } else if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        if (!isLogging) {
          onConfirm();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isLogging, onCancel, onConfirm]);

  return (
    <div className="quicklog-overlay" role="dialog" aria-modal="true" aria-label="Log time">
      <div className="quicklog-scrim" onClick={onCancel} />
      <div className="quicklog-sheet">
        <div className="quicklog-head">
          <div className="quicklog-title-row">
            <span className="quicklog-title">Log time</span>
            <span className="quicklog-day">{context.dayLabel}</span>
          </div>
          <button type="button" className="quicklog-close" onClick={onCancel} aria-label="Cancel">
            <X size={14} strokeWidth={2.2} />
          </button>
        </div>

        <div className="quicklog-body">
          <div className="quicklog-ticket">
            <span className="dock-card-dot" style={{ background: color.seg }} />
            <span className="quicklog-ticket-key" style={{ color: color.text }}>
              {context.ticketKey}
            </span>
            <span className="quicklog-ticket-summary">{context.ticketSummary}</span>
          </div>

          <div className="quicklog-duration-row">
            <div>
              <div className="quicklog-label">DURATION</div>
              <div className="quicklog-duration">{formatDuration(context.hours)}</div>
            </div>
            <div className="quicklog-chips">
              {HOUR_CHIPS.map((chip) => (
                <button
                  key={chip.hours}
                  type="button"
                  className={`quicklog-chip ${context.hours === chip.hours ? "active" : ""}`}
                  onClick={() => onChangeHours(chip.hours)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          <div className="quicklog-label quicklog-label-spaced">WORK DESCRIPTION</div>
          <textarea
            ref={textareaRef}
            className="quicklog-comment"
            value={context.comment}
            onChange={(event) => onChangeComment(event.target.value)}
            placeholder="Add a note… syncs to the Jira worklog comment"
          />
        </div>

        <div className="quicklog-foot">
          <span className="quicklog-hint">⌘⏎ TO ADD · ESC TO CANCEL</span>
          <div className="quicklog-actions">
            <button type="button" className="quicklog-cancel" onClick={onCancel}>
              CANCEL
            </button>
            <button type="button" className="quicklog-confirm" onClick={onConfirm} disabled={isLogging}>
              {isLogging ? <Loader2 className="spin" size={14} /> : null}
              Log {formatDuration(context.hours)} to {context.ticketKey}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

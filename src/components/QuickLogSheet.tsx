import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { JiraTicket, JiraWorklog, PersonalNote, RecurringEntry } from "../../shared/types";
import type { Range } from "../domain/dayCalendar";
import { formatDuration, jiraUnitDurationToSeconds } from "../utils/date";
import type { JiraDurationUnit } from "../utils/date";
import { AddTimeTimelineEditor } from "./AddTimeTimelineEditor";
import type { DockColor } from "./activeWork";

export interface QuickLogContext {
  ticketKey: string;
  ticketSummary: string;
  dateKey: string;
  dayLabel: string;
  hours: number;
  startedMinutes?: number;
  timelineEndMinutes?: number;
  comment: string;
}

export interface QuickLogTimelineContext {
  dateKey: string;
  time: string;
  ticket?: JiraTicket;
  worklogs?: JiraWorklog[];
  personalNotes?: PersonalNote[];
  recurringEntries?: RecurringEntry[];
}

interface QuickLogSheetProps {
  context: QuickLogContext;
  timeline?: QuickLogTimelineContext;
  color: DockColor;
  isLogging: boolean;
  validationMessage?: string;
  onChangeHours: (hours: number) => void;
  onChangeRange?: (range: Range) => void;
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

const CUSTOM_UNITS: { unit: JiraDurationUnit; label: string }[] = [
  { unit: "h", label: "H" },
  { unit: "d", label: "D" },
  { unit: "w", label: "W" }
];

const hoursFromCustom = (amount: string, unit: JiraDurationUnit) => jiraUnitDurationToSeconds(amount, unit) / 3600;

export const QuickLogSheet = ({
  context,
  timeline,
  color,
  isLogging,
  validationMessage,
  onChangeHours,
  onChangeRange,
  onChangeComment,
  onCancel,
  onConfirm
}: QuickLogSheetProps) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [customAmount, setCustomAmount] = useState(() => String(context.hours));
  const [customUnit, setCustomUnit] = useState<JiraDurationUnit>("h");

  const presetMatch = HOUR_CHIPS.some((chip) => chip.hours === context.hours);

  const openCustom = () => {
    setCustomMode(true);
    const amount = customUnit === "h" ? String(context.hours) : customAmount;
    setCustomAmount(amount);
    onChangeHours(hoursFromCustom(amount, customUnit));
  };

  const applyCustomAmount = (amount: string) => {
    setCustomAmount(amount);
    onChangeHours(hoursFromCustom(amount, customUnit));
  };

  const applyCustomUnit = (unit: JiraDurationUnit) => {
    setCustomUnit(unit);
    onChangeHours(hoursFromCustom(customAmount, unit));
  };

  const normalizeCustomAmount = () => {
    if (context.hours > 0) {
      return;
    }
    setCustomAmount("1");
    onChangeHours(hoursFromCustom("1", customUnit));
  };

  const selectPreset = (hours: number) => {
    setCustomMode(false);
    onChangeHours(hours);
  };

  const applyTimelineRange = (range: Range) => {
    if (range.endMin <= range.startMin || !onChangeRange) {
      return;
    }
    const hours = (range.endMin - range.startMin) / 60;
    setCustomMode(!HOUR_CHIPS.some((chip) => chip.hours === hours));
    setCustomAmount(String(hours));
    setCustomUnit("h");
    onChangeRange(range);
  };

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
        if (!isLogging && context.hours > 0 && !validationMessage) {
          onConfirm();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [context.hours, isLogging, onCancel, onConfirm, validationMessage]);

  return (
    <div className="quicklog-overlay" role="dialog" aria-modal="true" aria-label="Log time">
      <div className="quicklog-scrim" onClick={onCancel} />
      <div className={`quicklog-sheet${timeline ? " has-side-timeline" : ""}`}>
        <div className="quicklog-head">
          <div className="quicklog-title-row">
            <span className="quicklog-title">Log time</span>
            <span className="quicklog-day">
              {context.dayLabel}
              {timeline ? ` · ${timeline.time}` : ""}
            </span>
          </div>
          <button type="button" className="quicklog-close" onClick={onCancel} aria-label="Cancel">
            <X size={14} strokeWidth={2.2} />
          </button>
        </div>

        <div className="quicklog-content">
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
                    className={`quicklog-chip ${!customMode && context.hours === chip.hours ? "active" : ""}`}
                    onClick={() => selectPreset(chip.hours)}
                  >
                    {chip.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={`quicklog-chip ${customMode || !presetMatch ? "active" : ""}`}
                  onClick={openCustom}
                >
                  Custom
                </button>
              </div>
            </div>

            {(customMode || !presetMatch) && (
              <div className="custom-duration quicklog-custom">
                <input
                  className="custom-duration-input"
                  type="number"
                  min="0.25"
                  step="0.25"
                  inputMode="decimal"
                  value={customAmount}
                  onChange={(event) => applyCustomAmount(event.target.value)}
                  onBlur={normalizeCustomAmount}
                  aria-label="Custom duration amount"
                />
                <div className="custom-unit-toggle" aria-label="Custom duration unit">
                  {CUSTOM_UNITS.map((unit) => (
                    <button
                      type="button"
                      key={unit.unit}
                      className={customUnit === unit.unit ? "active" : ""}
                      aria-pressed={customUnit === unit.unit}
                      onClick={() => applyCustomUnit(unit.unit)}
                    >
                      {unit.label}
                    </button>
                  ))}
                </div>
                <span className="custom-duration-hint">1D = 8h · 1W = 40h</span>
              </div>
            )}

            {validationMessage && (
              <div className="quicklog-validation" role="alert">
                {validationMessage}
              </div>
            )}

            <div className="quicklog-label quicklog-label-spaced">WORK DESCRIPTION</div>
            <textarea
              ref={textareaRef}
              className="quicklog-comment"
              value={context.comment}
              onChange={(event) => onChangeComment(event.target.value)}
              placeholder="Add a note… syncs to the Jira worklog comment"
            />
          </div>

          {timeline && onChangeRange && (
            <AddTimeTimelineEditor
              dateKey={timeline.dateKey}
              time={timeline.time}
              durationSeconds={context.hours * 3600}
              ticket={timeline.ticket}
              worklogs={timeline.worklogs}
              personalNotes={timeline.personalNotes}
              recurringEntries={timeline.recurringEntries}
              onChange={applyTimelineRange}
            />
          )}
        </div>

        <div className="quicklog-foot">
          <span className="quicklog-hint">⌘⏎ TO ADD · ESC TO CANCEL</span>
          <div className="quicklog-actions">
            <button type="button" className="quicklog-cancel" onClick={onCancel}>
              CANCEL
            </button>
            <button
              type="button"
              className="quicklog-confirm"
              onClick={onConfirm}
              disabled={isLogging || context.hours <= 0 || Boolean(validationMessage)}
            >
              {isLogging ? <Loader2 className="spin" size={14} /> : null}
              Log {formatDuration(context.hours)} to {context.ticketKey}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

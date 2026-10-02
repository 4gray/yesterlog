import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { JiraTicket, JiraWorklog, PersonalNote, RecurringEntry } from "../../shared/types";
import type { Range } from "../domain/dayCalendar";
import { formatDuration, jiraUnitDurationToSeconds } from "../utils/date";
import type { JiraDurationUnit } from "../utils/date";
import { AddTimeTimelineEditor } from "./AddTimeTimelineEditor";
import { Modal } from "./Modal";
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
  /** Set when the issue is not in the active-work dock, e.g. a worklog copied from another day. */
  ticket?: JiraTicket;
  /** "copy" turns the sheet into the confirm step of "book this worklog on another day". */
  mode?: "log" | "copy";
  /** Weekday name of the destination, shown in copy-mode labels. */
  targetDayName?: string;
  /** One line explaining where the copy lands ("14:00–16:00 · same time as Monday"). */
  placementHint?: string;
  /** Booking on several days at once: the destinations, in calendar order. */
  targets?: QuickLogTarget[];
  /** Clock minutes of the source worklog, used to place each day's copy when `targets` is set. */
  sourceStartMinutes?: number;
}

export interface QuickLogTarget {
  dateKey: string;
  weekdayName: string;
  dayLabel: string;
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
  const isCopy = context.mode === "copy";
  const multi = context.targets && context.targets.length > 1 ? context.targets : undefined;
  const targetDay = multi ? `${multi.length} days` : context.targetDayName ?? context.dayLabel;
  const dayLabel = multi
    ? `${multi.map((target) => target.weekdayName.slice(0, 3).toUpperCase()).join(", ")} · ${multi.length} DAYS`
    : context.dayLabel;

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

  // Escape is handled by the Modal shell; this only owns ⌘/Ctrl+Enter confirm.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
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
    <Modal
      label={isCopy ? "Book time" : "Log time"}
      onClose={onCancel}
      panelClassName={`quicklog-sheet${timeline ? " has-side-timeline" : ""}`}
    >
        <div className="quicklog-head">
          <div className="quicklog-title-row">
            <span className="quicklog-title">{isCopy ? "Book time" : "Log time"}</span>
            <span className="quicklog-day">
              {dayLabel}
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

            {context.placementHint && !validationMessage && (
              <div className="quicklog-placement">{context.placementHint}</div>
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
          <span className="quicklog-hint">
            {isCopy
              ? timeline
                ? "⌘⏎ TO BOOK · DRAG THE DAY MAP TO ADJUST"
                : "⌘⏎ TO BOOK · ESC TO CANCEL"
              : "⌘⏎ TO ADD · ESC TO CANCEL"}
          </span>
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
              {isCopy
                ? `Book ${formatDuration(context.hours)} on ${targetDay}`
                : `Log ${formatDuration(context.hours)} to ${context.ticketKey}`}
            </button>
          </div>
        </div>
    </Modal>
  );
};

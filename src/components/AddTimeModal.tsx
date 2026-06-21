import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronDown, Clock, Loader2, Trash2, X } from "lucide-react";
import type { JiraTicket, JiraWorklog } from "../../shared/types";
import { formatClock, parseDurationToSeconds, toLocalDateKey } from "../utils/date";
import { IssueTypeBadge } from "./IssueTypeBadge";
import { TicketKeyLink } from "./TicketKeyLink";

interface LogPayload {
  issueKey: string;
  timeSpentSeconds: number;
  startedISO: string;
  comment?: string;
}

interface AddTimeModalProps {
  date: Date;
  ticketOptions: JiraTicket[];
  isConfigured: boolean;
  isLogging: boolean;
  isDeleting?: boolean;
  logError?: string;
  editingWorklog?: JiraWorklog;
  onClose: () => void;
  onLog: (payload: LogPayload) => Promise<boolean>;
  onDelete?: () => Promise<boolean>;
}

const PRESETS: Array<{ label: string; seconds: number }> = [
  { label: "30m", seconds: 30 * 60 },
  { label: "1h", seconds: 60 * 60 },
  { label: "2h", seconds: 2 * 60 * 60 },
  { label: "4h", seconds: 4 * 60 * 60 }
];

const pad = (value: number) => String(value).padStart(2, "0");

const getInitialStart = (date: Date, editingWorklog?: JiraWorklog) => {
  if (!editingWorklog) {
    return date;
  }

  const started = new Date(editingWorklog.started);
  return Number.isNaN(started.getTime()) ? date : started;
};

const dayLabel = (date: Date) =>
  `${new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date).toUpperCase()} · ${date.getDate()} ${new Intl.DateTimeFormat(
    undefined,
    { month: "short" }
  )
    .format(date)
    .toUpperCase()}`;

export const AddTimeModal = ({
  date,
  ticketOptions,
  isConfigured,
  isLogging,
  isDeleting = false,
  logError,
  editingWorklog,
  onClose,
  onLog,
  onDelete
}: AddTimeModalProps) => {
  const isEditing = Boolean(editingWorklog);
  const initialStart = getInitialStart(date, editingWorklog);
  const [activeKey, setActiveKey] = useState<string | undefined>(editingWorklog?.issueKey ?? ticketOptions[0]?.key);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(editingWorklog?.timeSpentSeconds ?? 2 * 60 * 60);
  const [durationText, setDurationText] = useState(formatClock(editingWorklog?.timeSpentSeconds ?? 2 * 60 * 60));
  const [dateStr, setDateStr] = useState(toLocalDateKey(initialStart));
  const [timeStr, setTimeStr] = useState(`${pad(initialStart.getHours())}:${pad(initialStart.getMinutes())}`);
  const [note, setNote] = useState(editingWorklog?.comment ?? "");
  const pickerRef = useRef<HTMLDivElement>(null);

  const ticketFromOptions = ticketOptions.find((ticket) => ticket.key === activeKey);
  const activeTicket = ticketFromOptions ?? (editingWorklog && activeKey === editingWorklog.issueKey
    ? {
        key: editingWorklog.issueKey,
        summary: editingWorklog.issueSummary,
        url: editingWorklog.issueUrl,
        issueType: editingWorklog.issueType
      }
    : undefined);
  const canSubmit = Boolean(isConfigured && activeTicket && durationSeconds > 0 && !isLogging && !isDeleting);

  const handleSubmit = async () => {
    if (!activeTicket || durationSeconds <= 0) {
      return;
    }
    const startedISO = new Date(`${dateStr}T${timeStr}`).toISOString();
    const ok = await onLog({
      issueKey: activeTicket.key,
      timeSpentSeconds: durationSeconds,
      startedISO,
      comment: note.trim() || undefined
    });
    if (ok) {
      onClose();
    }
  };

  const handleDelete = async () => {
    if (!editingWorklog || !onDelete || isDeleting) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${formatClock(editingWorklog.timeSpentSeconds)} from ${editingWorklog.issueKey}? This removes the Jira worklog.`
    );

    if (!confirmed) {
      return;
    }

    const ok = await onDelete();
    if (ok) {
      onClose();
    }
  };

  useEffect(() => {
    const start = getInitialStart(date, editingWorklog);
    const seconds = editingWorklog?.timeSpentSeconds ?? 2 * 60 * 60;

    setActiveKey(editingWorklog?.issueKey ?? ticketOptions[0]?.key);
    setPickerOpen(false);
    setDurationSeconds(seconds);
    setDurationText(formatClock(seconds));
    setDateStr(toLocalDateKey(start));
    setTimeStr(`${pad(start.getHours())}:${pad(start.getMinutes())}`);
    setNote(editingWorklog?.comment ?? "");
  }, [date, editingWorklog?.id]);

  useEffect(() => {
    if (!isEditing && !activeKey && ticketOptions[0]) {
      setActiveKey(ticketOptions[0].key);
    }
  }, [activeKey, isEditing, ticketOptions]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void handleSubmit();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    if (!pickerOpen) {
      return;
    }
    const onDocClick = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [pickerOpen]);

  const onDurationInput = (value: string) => {
    setDurationText(value);
    const parsed = parseDurationToSeconds(value);
    if (parsed !== null) {
      setDurationSeconds(parsed);
    }
  };

  const applyPreset = (seconds: number) => {
    setDurationSeconds(seconds);
    setDurationText(formatClock(seconds));
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={isEditing ? "Edit time entry" : "Log time"}>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-panel">
        <div className="modal-head">
          <div className="modal-title-row">
            <span className="modal-title">{isEditing ? "Edit time" : "Log time"}</span>
            <span className="modal-day">{dayLabel(date)}</span>
          </div>
          <div className="modal-head-actions">
            {isEditing && onDelete && (
              <button
                type="button"
                className="modal-delete"
                onClick={handleDelete}
                disabled={isLogging || isDeleting}
                title="Delete worklog"
                aria-label="Delete worklog"
              >
                {isDeleting ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} strokeWidth={2} />}
              </button>
            )}
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
              <X size={14} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        <div className="modal-body">
          <div className="modal-label">TICKET</div>
          <div className="modal-picker" ref={pickerRef}>
            <div className="modal-ticket-row">
              {activeTicket ? (
                <TicketKeyLink
                  issueKey={activeTicket.key}
                  url={activeTicket.url}
                  issueType={activeTicket.issueType}
                  keyClassName="composer-target-key"
                />
              ) : null}
              <button
                type="button"
                className={`modal-ticket ${isEditing ? "is-locked" : ""}`}
                onClick={() => {
                  if (!isEditing) {
                    setPickerOpen((open) => !open);
                  }
                }}
                disabled={!isEditing && ticketOptions.length === 0}
                aria-disabled={isEditing}
                title={isEditing ? "Ticket cannot be changed for an existing Jira worklog" : undefined}
              >
                {activeTicket ? (
                  <span className="modal-ticket-summary">{activeTicket.summary}</span>
                ) : (
                  <span className="modal-ticket-summary" style={{ color: "var(--dim-2)" }}>
                    {isConfigured ? "No assigned tickets" : "Connect Jira to choose a ticket"}
                  </span>
                )}
                {!isEditing && <ChevronDown size={16} color="#5d636f" />}
              </button>
            </div>
            {!isEditing && pickerOpen && ticketOptions.length > 0 && (
              <div className="ticket-picker">
                {ticketOptions.map((ticket) => (
                  <button
                    key={ticket.key}
                    type="button"
                    className={`ticket-picker-item ${ticket.key === activeKey ? "active" : ""}`}
                    onClick={() => {
                      setActiveKey(ticket.key);
                      setPickerOpen(false);
                    }}
                  >
                    <span className="composer-target-key">{ticket.key}</span>
                    <IssueTypeBadge issueType={ticket.issueType} />
                    <span className="ticket-picker-summary">{ticket.summary}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="modal-grid">
            <div className="modal-col">
              <div className="modal-label">DURATION</div>
              <input
                className="modal-duration"
                value={durationText}
                onChange={(event) => onDurationInput(event.target.value)}
                onBlur={() => setDurationText(formatClock(durationSeconds))}
                aria-label="Duration"
                spellCheck={false}
              />
              <div className="modal-presets">
                {PRESETS.map((preset) => (
                  <button
                    type="button"
                    key={preset.label}
                    className={`preset ${preset.seconds === durationSeconds ? "active" : ""}`}
                    onClick={() => applyPreset(preset.seconds)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-col">
              <div className="modal-label">STARTED</div>
              <div className="modal-started">
                <label className="input-chip">
                  <Calendar size={14} stroke="#6b7280" strokeWidth={1.7} />
                  <input type="date" value={dateStr} onChange={(event) => setDateStr(event.target.value)} />
                </label>
                <label className="input-chip">
                  <Clock size={14} stroke="#6b7280" strokeWidth={1.7} />
                  <input type="time" value={timeStr} onChange={(event) => setTimeStr(event.target.value)} />
                </label>
              </div>
            </div>
          </div>

          <div className="modal-label" style={{ marginTop: 22 }}>
            WORK DESCRIPTION
          </div>
          <textarea
            className="note-textarea"
            placeholder={isEditing ? "Update the Jira worklog comment" : "Add a note… syncs to the Jira worklog comment"}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
          />

          {logError && (
            <div className="callout error" style={{ margin: "14px 0 0" }}>
              {logError}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <span className="modal-foot-hint">⌘⏎ TO SAVE · ESC TO CANCEL</span>
          <div className="modal-foot-actions">
            <button type="button" className="modal-cancel" onClick={onClose}>
              CANCEL
            </button>
            <button type="button" className="primary-button" onClick={handleSubmit} disabled={!canSubmit}>
              {isLogging ? <Loader2 className="spin" size={15} /> : null}
              {isEditing
                ? `Save ${formatClock(durationSeconds)}`
                : activeTicket
                  ? `Log ${formatClock(durationSeconds)} to ${activeTicket.key}`
                  : "Log time"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

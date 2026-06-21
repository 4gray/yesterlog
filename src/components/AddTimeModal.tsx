import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronDown, Clock, Loader2, LockKeyhole, PenLine, X } from "lucide-react";
import type { JiraTicket } from "../../shared/types";
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
  logError?: string;
  onClose: () => void;
  onLog: (payload: LogPayload) => Promise<boolean>;
  onAddPersonalNote: (payload: { text: string; timeSpentSeconds: number; startedISO: string }) => Promise<boolean>;
}

const PRESETS: Array<{ label: string; seconds: number }> = [
  { label: "30m", seconds: 30 * 60 },
  { label: "1h", seconds: 60 * 60 },
  { label: "2h", seconds: 2 * 60 * 60 },
  { label: "4h", seconds: 4 * 60 * 60 }
];

const PERSONAL_NOTE_PRESETS: Array<{ label: string; seconds: number }> = [
  { label: "15m", seconds: 15 * 60 },
  { label: "30m", seconds: 30 * 60 },
  { label: "1h", seconds: 60 * 60 },
  { label: "2h", seconds: 2 * 60 * 60 }
];

const pad = (value: number) => String(value).padStart(2, "0");

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
  logError,
  onClose,
  onLog,
  onAddPersonalNote
}: AddTimeModalProps) => {
  const [mode, setMode] = useState<"ticket" | "note">("ticket");
  const [activeKey, setActiveKey] = useState<string | undefined>(ticketOptions[0]?.key);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(2 * 60 * 60);
  const [durationText, setDurationText] = useState("2h 00m");
  const [dateStr, setDateStr] = useState(toLocalDateKey(date));
  const [timeStr, setTimeStr] = useState(`${pad(date.getHours())}:${pad(date.getMinutes())}`);
  const [note, setNote] = useState("");
  const [personalNote, setPersonalNote] = useState("");
  const [personalNoteSeconds, setPersonalNoteSeconds] = useState(30 * 60);
  const pickerRef = useRef<HTMLDivElement>(null);

  const activeTicket = ticketOptions.find((ticket) => ticket.key === activeKey);
  const canSubmit = mode === "note"
    ? Boolean(personalNote.trim() && personalNoteSeconds > 0)
    : Boolean(isConfigured && activeTicket && durationSeconds > 0 && !isLogging);

  const handleSubmit = async () => {
    const startedISO = new Date(`${dateStr}T${timeStr}`).toISOString();

    if (mode === "note") {
      const ok = await onAddPersonalNote({
        text: personalNote,
        timeSpentSeconds: personalNoteSeconds,
        startedISO
      });
      if (ok) {
        setPersonalNote("");
        onClose();
      }
      return;
    }

    if (!activeTicket || durationSeconds <= 0) {
      return;
    }
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
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={mode === "note" ? "Personal note" : "Log time"}>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-panel">
        <div className="modal-head">
          <div className="modal-title-row">
            <span className="modal-title">{mode === "note" ? "Personal note" : "Log time"}</span>
            <span className="modal-day">{dayLabel(date)}</span>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <X size={14} strokeWidth={2.2} />
          </button>
        </div>

        <div className="modal-mode-tabs">
          <button type="button" className={mode === "ticket" ? "active" : ""} onClick={() => setMode("ticket")}>
            Log to ticket
          </button>
          <button type="button" className={mode === "note" ? "active" : ""} onClick={() => setMode("note")}>
            Personal note
          </button>
        </div>

        <div className="modal-body">
          {mode === "ticket" ? (
            <>
              <div className="modal-label">TICKET</div>
              <div className="modal-picker" ref={pickerRef}>
                <div className="modal-ticket-row">
                  {activeTicket ? (
                    <TicketKeyLink
                      issueKey={activeTicket.key}
                      url={activeTicket.url}
                      issueType={activeTicket.issueType}
                      epic={activeTicket.epic}
                      keyClassName="composer-target-key"
                    />
                  ) : null}
                  <button
                    type="button"
                    className="modal-ticket"
                    onClick={() => setPickerOpen((open) => !open)}
                    disabled={ticketOptions.length === 0}
                  >
                    {activeTicket ? (
                      <span className="modal-ticket-summary">{activeTicket.summary}</span>
                    ) : (
                      <span className="modal-ticket-summary" style={{ color: "var(--dim-2)" }}>
                        {isConfigured ? "No assigned tickets" : "Connect Jira to choose a ticket"}
                      </span>
                    )}
                    <ChevronDown size={16} color="#5d636f" />
                  </button>
                </div>
                {pickerOpen && ticketOptions.length > 0 && (
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
                placeholder="Add a note… syncs to the Jira worklog comment"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
              />
            </>
          ) : (
            <div className="personal-note-form">
              <div className="personal-note-title">
                <PenLine size={14} />
                <span>PERSONAL NOTE</span>
                <em>
                  <LockKeyhole size={9} />
                  LOCAL
                </em>
              </div>
              <textarea
                className="note-textarea"
                placeholder="What did you spend time on? e.g. interviews, planning, mentoring, ops"
                value={personalNote}
                onChange={(event) => setPersonalNote(event.target.value)}
                rows={4}
              />
              <div className="personal-note-duration">
                <div>
                  <div className="modal-label">TIME SPENT</div>
                  <div className="personal-note-time">{formatClock(personalNoteSeconds)}</div>
                </div>
                <div className="modal-presets">
                  {PERSONAL_NOTE_PRESETS.map((preset) => (
                    <button
                      type="button"
                      key={preset.label}
                      className={`preset ${preset.seconds === personalNoteSeconds ? "active" : ""}`}
                      onClick={() => setPersonalNoteSeconds(preset.seconds)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="local-note-callout">
                <LockKeyhole size={13} />
                <span>Stays on this device and is not synced to Jira.</span>
              </div>
            </div>
          )}

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
              {mode === "ticket" && isLogging ? <Loader2 className="spin" size={15} /> : null}
              {mode === "note"
                ? "Save note"
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

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronDown, Clock, Loader2, MessageSquare, PenLine } from "lucide-react";
import type { JiraTicket, JiraWorklog, PersonalNote } from "../../shared/types";
import { formatClock, formatHm24, formatHours, parseDurationToSeconds, toLocalDateKey } from "../utils/date";
import { IssueTypeBadge } from "./IssueTypeBadge";
import { TicketKeyLink } from "./TicketKeyLink";

interface LogPayload {
  issueKey: string;
  timeSpentSeconds: number;
  startedISO: string;
  comment?: string;
}

interface TodayViewProps {
  date: Date;
  selectedTicket?: JiraTicket;
  ticketOptions: JiraTicket[];
  todayWorklogs: JiraWorklog[];
  personalNotes: PersonalNote[];
  issueUrlsByKey: Record<string, string>;
  issueTypesByKey: Record<string, JiraTicket["issueType"]>;
  todayTrackedHours: number;
  dailyTargetHours: number;
  touchedNotLogged: JiraTicket[];
  reminderTime: string;
  remindersEnabled: boolean;
  isConfigured: boolean;
  isLogging: boolean;
  logError?: string;
  logMessage?: string;
  onLog: (payload: LogPayload) => Promise<boolean>;
  onSelectTicket: (ticket: JiraTicket) => void;
}

const PRESETS: Array<{ label: string; seconds: number }> = [
  { label: "15m", seconds: 15 * 60 },
  { label: "30m", seconds: 30 * 60 },
  { label: "1h", seconds: 60 * 60 },
  { label: "2h", seconds: 2 * 60 * 60 },
  { label: "4h", seconds: 4 * 60 * 60 }
];

const pad = (value: number) => String(value).padStart(2, "0");

export const TodayView = ({
  date,
  selectedTicket,
  ticketOptions,
  todayWorklogs,
  personalNotes,
  issueUrlsByKey,
  issueTypesByKey,
  todayTrackedHours,
  dailyTargetHours,
  touchedNotLogged,
  reminderTime,
  remindersEnabled,
  isConfigured,
  isLogging,
  logError,
  logMessage,
  onLog,
  onSelectTicket
}: TodayViewProps) => {
  const [activeKey, setActiveKey] = useState<string | undefined>(selectedTicket?.key ?? ticketOptions[0]?.key);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(2 * 60 * 60);
  const [durationText, setDurationText] = useState("2h 00m");
  const [dateStr, setDateStr] = useState(toLocalDateKey(date));
  const [timeStr, setTimeStr] = useState(`${pad(date.getHours())}:${pad(date.getMinutes())}`);
  const [note, setNote] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedTicket?.key) {
      setActiveKey(selectedTicket.key);
    }
  }, [selectedTicket?.key]);

  useEffect(() => {
    if (!activeKey && ticketOptions[0]) {
      setActiveKey(ticketOptions[0].key);
    }
  }, [activeKey, ticketOptions]);

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

  const activeTicket = useMemo(
    () => ticketOptions.find((ticket) => ticket.key === activeKey) ?? selectedTicket,
    [activeKey, selectedTicket, ticketOptions]
  );

  const todayDate = new Date(date);
  const remainingHours = Math.max(dailyTargetHours - todayTrackedHours, 0);
  const meterPct = dailyTargetHours > 0 ? Math.min((todayTrackedHours / dailyTargetHours) * 100, 100) : 0;
  const trackedH = Math.floor(todayTrackedHours);
  const trackedM = Math.round((todayTrackedHours - trackedH) * 60);

  const applyDuration = (seconds: number) => {
    setDurationSeconds(seconds);
    setDurationText(formatClock(seconds));
  };

  const onDurationInput = (value: string) => {
    setDurationText(value);
    const parsed = parseDurationToSeconds(value);
    if (parsed !== null) {
      setDurationSeconds(parsed);
    }
  };

  const chooseTicket = (ticket: JiraTicket) => {
    setActiveKey(ticket.key);
    onSelectTicket(ticket);
    setPickerOpen(false);
  };

  const canSubmit = Boolean(isConfigured && activeTicket && durationSeconds > 0 && !isLogging);

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
      setNote("");
    }
  };

  const sortedWorklogs = [...todayWorklogs].sort(
    (a, b) => new Date(a.started).getTime() - new Date(b.started).getTime()
  );
  const sortedPersonalNotes = [...personalNotes].sort(
    (a, b) => new Date(a.startedISO).getTime() - new Date(b.startedISO).getTime()
  );
  const entryCount = sortedWorklogs.length + sortedPersonalNotes.length;

  return (
    <div className="view view-scroll">
      <div className="today-header">
        <div className="eyebrow">
          {new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" })
            .format(todayDate)
            .toUpperCase()}
        </div>
        <div className="today-figure-row">
          <div className="big-figure">
            {trackedH}
            <span className="unit">h</span>
            {pad(trackedM)}
            <span className="unit">m</span>
          </div>
          <div className="today-meta">
            <div className="today-meta-label">LOGGED OF {formatHours(dailyTargetHours)}</div>
            <div className="meter-row">
              <div className="meter" style={{ width: 130 }}>
                <span style={{ width: `${meterPct}%` }} />
              </div>
              <span className="meter-text">{formatClock(remainingHours * 3600)} left</span>
            </div>
          </div>
        </div>
      </div>

      <div className="today-body">
        <div className="composer">
          <div className="field-label">LOGGING TO</div>
          <div className="composer-picker" ref={pickerRef}>
            <div className="composer-target-row">
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
                className="composer-target"
                onClick={() => setPickerOpen((open) => !open)}
                disabled={ticketOptions.length === 0}
              >
                {activeTicket ? (
                  <span className="composer-target-title">{activeTicket.summary}</span>
                ) : (
                  <span className="composer-target-title" style={{ color: "var(--dim-2)" }}>
                    {isConfigured ? "No assigned tickets — pick one in TICKETS" : "Connect Jira to choose a ticket"}
                  </span>
                )}
                <ChevronDown size={15} color="#5d636f" />
              </button>
            </div>
            {pickerOpen && ticketOptions.length > 0 && (
              <div className="ticket-picker">
                {ticketOptions.map((ticket) => (
                  <button
                    key={ticket.key}
                    type="button"
                    className={`ticket-picker-item ${ticket.key === activeKey ? "active" : ""}`}
                    onClick={() => chooseTicket(ticket)}
                  >
                    <span className="composer-target-key">{ticket.key}</span>
                    <IssueTypeBadge issueType={ticket.issueType} />
                    <span className="ticket-picker-summary">{ticket.summary}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="field-label composer-section">DURATION</div>
          <div className="duration-row">
            <input
              className="duration-input"
              value={durationText}
              onChange={(event) => onDurationInput(event.target.value)}
              onBlur={() => setDurationText(formatClock(durationSeconds))}
              aria-label="Duration"
              spellCheck={false}
            />
            <div className="duration-presets">
              {PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.label}
                  className={`preset ${preset.seconds === durationSeconds ? "active" : ""}`}
                  onClick={() => applyDuration(preset.seconds)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field-hint">FORMAT · 2w 4d 6h 45m</div>

          <div className="field-label composer-section">STARTED</div>
          <div className="chip-row">
            <label className="input-chip">
              <Calendar size={14} stroke="#6b7280" strokeWidth={1.7} />
              <input type="date" value={dateStr} onChange={(event) => setDateStr(event.target.value)} />
            </label>
            <label className="input-chip">
              <Clock size={14} stroke="#6b7280" strokeWidth={1.7} />
              <input type="time" value={timeStr} onChange={(event) => setTimeStr(event.target.value)} />
            </label>
          </div>

          <div className="field-label composer-section">WORK DESCRIPTION</div>
          <textarea
            className="note-textarea"
            placeholder="Add a note… @ to mention a teammate"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
          />
          <div className="field-hint tight">OPTIONAL · SYNCS TO THE JIRA WORKLOG COMMENT</div>

          <div className="composer-submit">
            <button type="button" className="submit-button" onClick={handleSubmit} disabled={!canSubmit}>
              {isLogging ? <Loader2 className="spin" size={15} /> : null}
              {activeTicket ? `Log ${formatClock(durationSeconds)} to ${activeTicket.key}` : "Log time"}
            </button>
            <span className="submit-hint">⌘⏎ · LOGS TO TODAY</span>
          </div>

          {(logError || logMessage) && (
            <div className={`callout ${logError ? "error" : "success"}`} style={{ margin: "16px 0 0" }}>
              {logError ?? logMessage}
            </div>
          )}

          <div className="entries-title">
            TODAY'S ENTRIES — {entryCount} {entryCount === 1 ? "LOG" : "LOGS"}
          </div>
          <div>
            {entryCount === 0 ? (
              <div className="empty-note" style={{ padding: "14px 0" }}>
                Nothing logged today yet.
              </div>
            ) : (
              <>
                {sortedWorklogs.map((worklog) => {
                  const start = new Date(worklog.started);
                  const end = new Date(start.getTime() + worklog.timeSpentSeconds * 1000);
                  return (
                    <div className="entry" key={worklog.id}>
                      <div className="entry-top">
                        <TicketKeyLink
                          issueKey={worklog.issueKey}
                          url={issueUrlsByKey[worklog.issueKey]}
                          issueType={worklog.issueType ?? issueTypesByKey[worklog.issueKey]}
                          epic={worklog.epic}
                          keyClassName="entry-key"
                        />
                        <span className="entry-summary">{worklog.issueSummary}</span>
                        <span className="entry-leader" />
                        <span className="entry-range">
                          {formatHm24(start)}–{formatHm24(end)}
                        </span>
                        <span className="entry-dur">{formatClock(worklog.timeSpentSeconds)}</span>
                      </div>
                      {worklog.comment && (
                        <div className="entry-note">
                          <MessageSquare size={13} stroke="#4b515c" strokeWidth={1.7} />
                          <span>{worklog.comment}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {sortedPersonalNotes.map((note) => {
                  const start = new Date(note.startedISO);
                  const end = new Date(start.getTime() + note.timeSpentSeconds * 1000);
                  return (
                    <div className="entry entry-local" key={note.id}>
                      <div className="entry-top">
                        <span className="entry-key is-local">
                          <PenLine size={12} strokeWidth={1.9} />
                          LOCAL
                        </span>
                        <span className="entry-summary">{note.text}</span>
                        <span className="entry-leader" />
                        <span className="entry-range">
                          {formatHm24(start)}–{formatHm24(end)}
                        </span>
                        <span className="entry-dur">{formatClock(note.timeSpentSeconds)}</span>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        <aside className="today-rail">
          <div className="rail-label">TOUCHED TODAY · NOT LOGGED</div>
          <div>
            {touchedNotLogged.length === 0 ? (
              <div className="empty-note" style={{ padding: "14px 0" }}>
                Everything assigned is logged.
              </div>
            ) : (
              touchedNotLogged.slice(0, 4).map((ticket) => (
                <div className="touched" key={ticket.key}>
                  <div className="touched-main">
                    <TicketKeyLink
                      issueKey={ticket.key}
                      url={ticket.url}
                      issueType={ticket.issueType}
                      epic={ticket.epic}
                      keyClassName={`touched-key ${ticket.projectKey === "FTDM" ? "" : "is-amber"}`}
                    />
                    <div className="touched-meta">{ticket.statusName}</div>
                  </div>
                  <button
                    type="button"
                    className="touched-add"
                    aria-label={`Log ${ticket.key}`}
                    onClick={() => chooseTicket(ticket)}
                  >
                    +
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="reminder-card">
            <div className="reminder-card-label">{remindersEnabled ? `REMINDER · ${reminderTime}` : "REMINDER · OFF"}</div>
            <div className="reminder-card-copy">
              {remindersEnabled
                ? "Fires only if today is still under target on a working day."
                : "Enable a daily nudge from settings."}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

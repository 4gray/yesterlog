import { useEffect, useMemo, useState } from "react";
import { Calendar, Clock, Loader2, MessageSquare, Pencil, PenLine } from "lucide-react";
import type { JiraTicket, JiraWorklog, PersonalNote } from "../../shared/types";
import { formatClock, formatDuration, formatHm24, formatHours, parseDurationToSeconds, toLocalDateKey } from "../utils/date";
import { TicketPicker, type TicketSearchHandler } from "./TicketPicker";
import { TicketKeyLink } from "./TicketKeyLink";

interface LogPayload {
  issueKey: string;
  timeSpentSeconds: number;
  startedISO: string;
  comment?: string;
}

interface PersonalNotePayload {
  text: string;
  timeSpentSeconds: number;
  startedISO: string;
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
  onLog: (payload: LogPayload) => Promise<boolean>;
  onAddPersonalNote: (payload: PersonalNotePayload) => Promise<boolean>;
  onEditWorklog: (worklog: JiraWorklog) => void;
  onEditPersonalNote: (note: PersonalNote) => void;
  onSelectTicket: (ticket: JiraTicket) => void;
  onSearchTickets?: TicketSearchHandler;
}

type ComposerMode = "worklog" | "note";

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
  onLog,
  onAddPersonalNote,
  onEditWorklog,
  onEditPersonalNote,
  onSelectTicket,
  onSearchTickets
}: TodayViewProps) => {
  const [activeKey, setActiveKey] = useState<string | undefined>(selectedTicket?.key ?? ticketOptions[0]?.key);
  const [composerMode, setComposerMode] = useState<ComposerMode>("worklog");
  const [durationSeconds, setDurationSeconds] = useState(2 * 60 * 60);
  const [durationText, setDurationText] = useState("2h 00m");
  const [dateStr, setDateStr] = useState(toLocalDateKey(date));
  const [timeStr, setTimeStr] = useState(`${pad(date.getHours())}:${pad(date.getMinutes())}`);
  const [worklogComment, setWorklogComment] = useState("");
  const [personalNoteText, setPersonalNoteText] = useState("");

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
    setComposerMode("worklog");
    setActiveKey(ticket.key);
    onSelectTicket(ticket);
  };

  const canSubmit =
    composerMode === "note"
      ? Boolean(personalNoteText.trim() && durationSeconds > 0 && !isLogging)
      : Boolean(isConfigured && activeTicket && durationSeconds > 0 && !isLogging);

  const handleSubmit = async () => {
    if (durationSeconds <= 0) {
      return;
    }
    const startedISO = new Date(`${dateStr}T${timeStr}`).toISOString();

    if (composerMode === "note") {
      const ok = await onAddPersonalNote({
        text: personalNoteText,
        timeSpentSeconds: durationSeconds,
        startedISO
      });
      if (ok) {
        setPersonalNoteText("");
      }
      return;
    }

    if (!activeTicket) {
      return;
    }
    const ok = await onLog({
      issueKey: activeTicket.key,
      timeSpentSeconds: durationSeconds,
      startedISO,
      comment: worklogComment.trim() || undefined
    });
    if (ok) {
      setWorklogComment("");
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
          <div className="today-mode-tabs" aria-label="Entry type">
            <button
              type="button"
              className={composerMode === "worklog" ? "active" : ""}
              onClick={() => setComposerMode("worklog")}
            >
              <MessageSquare size={13} strokeWidth={1.8} />
              Jira worklog
            </button>
            <button
              type="button"
              className={composerMode === "note" ? "active" : ""}
              onClick={() => {
                setComposerMode("note");
              }}
            >
              <PenLine size={13} strokeWidth={1.9} />
              Personal note
            </button>
          </div>

          {composerMode === "worklog" ? (
            <>
              <div className="field-label composer-section compact">LOGGING TO</div>
              <TicketPicker
                variant="composer"
                activeTicket={activeTicket}
                ticketOptions={ticketOptions}
                isConfigured={isConfigured}
                emptyText="Search Jira to choose a ticket"
                searchTickets={onSearchTickets}
                onSelect={chooseTicket}
              />
            </>
          ) : (
            <div className="today-local-target">
              <span>
                <PenLine size={13} strokeWidth={1.9} />
                LOCAL
              </span>
              <strong>Personal note</strong>
            </div>
          )}

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

          <div className="field-label composer-section">
            {composerMode === "note" ? "PERSONAL NOTE" : "WORK DESCRIPTION"}
          </div>
          <textarea
            className="note-textarea"
            placeholder={
              composerMode === "note"
                ? "What did you spend time on? e.g. planning, mentoring, ops"
                : "Add a note… @ to mention a teammate"
            }
            value={composerMode === "note" ? personalNoteText : worklogComment}
            onChange={(event) =>
              composerMode === "note" ? setPersonalNoteText(event.target.value) : setWorklogComment(event.target.value)
            }
            rows={composerMode === "note" ? 3 : 2}
          />
          <div className="field-hint tight">
            {composerMode === "note" ? "REQUIRED · SAVES LOCALLY ON THIS DEVICE" : "OPTIONAL · SYNCS TO THE JIRA WORKLOG COMMENT"}
          </div>

          <div className="composer-submit">
            <button type="button" className="submit-button" onClick={handleSubmit} disabled={!canSubmit}>
              {isLogging ? <Loader2 className="spin" size={15} /> : null}
              {composerMode === "note"
                ? `Save ${formatClock(durationSeconds)} local note`
                : activeTicket
                  ? `Log ${formatClock(durationSeconds)} to ${activeTicket.key}`
                  : "Log time"}
            </button>
            <span className="submit-hint">{composerMode === "note" ? "LOCAL · TODAY" : "⌘⏎ · LOGS TO TODAY"}</span>
          </div>

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
                        <span className="entry-action-slot">
                          <button
                            type="button"
                            className="entry-edit"
                            onClick={() => onEditWorklog(worklog)}
                            title="Edit worklog"
                            aria-label={`Edit worklog for ${worklog.issueKey}`}
                          >
                            <Pencil size={13} strokeWidth={2} />
                          </button>
                        </span>
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
                        <span className="entry-dur">{formatDuration(note.timeSpentSeconds / 3600)}</span>
                        <span className="entry-action-slot">
                          <button
                            type="button"
                            className="entry-edit"
                            onClick={() => onEditPersonalNote(note)}
                            title="Edit personal note"
                            aria-label="Edit personal note"
                          >
                            <Pencil size={13} strokeWidth={2} />
                          </button>
                        </span>
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

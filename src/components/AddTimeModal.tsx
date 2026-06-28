import { useEffect, useState } from "react";
import { Calendar, Clock, Loader2, LockKeyhole, PenLine, Trash2, X } from "lucide-react";
import type { JiraTicket, JiraWorklog, PersonalNote, RecurringEvent } from "../../shared/types";
import { formatClock, fromLocalDateKey, jiraUnitDurationToSeconds, toLocalDateKey } from "../utils/date";
import {
  AddTimeDurationPicker,
  type DurationMode,
  type DurationPreset,
  type DurationUnit
} from "./AddTimeDurationPicker";
import { AddTimeRecurringForm, formatRecurringMinutes } from "./AddTimeRecurringForm";
import { TicketPicker, type TicketSearchHandler } from "./TicketPicker";

export interface LogRecurringPayload {
  eventId: string;
  dateKey: string;
  timeSpentSeconds: number;
  note?: string;
}

export interface LogPayload {
  issueKey: string;
  ticket: JiraTicket;
  timeSpentSeconds: number;
  startedISO: string;
  comment?: string;
}

export interface AddTimeModalProps {
  date: Date;
  dateOptions: string[];
  ticketOptions: JiraTicket[];
  isConfigured: boolean;
  isLogging: boolean;
  isDeleting?: boolean;
  logError?: string;
  editingWorklog?: JiraWorklog;
  editingPersonalNote?: PersonalNote;
  onClose: () => void;
  onLog: (payload: LogPayload) => Promise<boolean>;
  onDelete?: () => Promise<boolean>;
  onSearchTickets?: TicketSearchHandler;
  onAddPersonalNote?: (payload: {
    title?: string;
    text: string;
    timeSpentSeconds: number;
    startedISO: string;
  }) => Promise<boolean>;
  onUpdatePersonalNote?: (payload: {
    title?: string;
    text: string;
    timeSpentSeconds: number;
    startedISO: string;
  }) => Promise<boolean>;
  /** Returns the recurring events scheduled on a day that are not yet logged. */
  getRecurringCandidates?: (dateKey: string) => RecurringEvent[];
  onLogRecurring?: (payload: LogRecurringPayload) => Promise<boolean>;
}

const PRESETS: DurationPreset[] = [
  { label: "30m", seconds: 30 * 60 },
  { label: "1h", seconds: 60 * 60 },
  { label: "2h", seconds: 2 * 60 * 60 },
  { label: "4h", seconds: 4 * 60 * 60 }
];

const PERSONAL_NOTE_PRESETS: DurationPreset[] = [
  { label: "15m", seconds: 15 * 60 },
  { label: "30m", seconds: 30 * 60 },
  { label: "1h", seconds: 60 * 60 },
  { label: "2h", seconds: 2 * 60 * 60 }
];

const pad = (value: number) => String(value).padStart(2, "0");

const getInitialStart = (date: Date, editingWorklog?: JiraWorklog, editingPersonalNote?: PersonalNote) => {
  const started = editingWorklog
    ? new Date(editingWorklog.started)
    : editingPersonalNote
      ? new Date(editingPersonalNote.startedISO)
      : date;
  return Number.isNaN(started.getTime()) ? date : started;
};

const dayLabel = (date: Date) =>
  `${new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date).toUpperCase()} · ${date.getDate()} ${new Intl.DateTimeFormat(
    undefined,
    { month: "short" }
  )
    .format(date)
    .toUpperCase()}`;

const optionLabel = (dateKey: string) => {
  const date = fromLocalDateKey(dateKey);
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date).toUpperCase();
  const month = new Intl.DateTimeFormat(undefined, { month: "short" }).format(date).toUpperCase();
  return { weekday, date: `${date.getDate()} ${month}` };
};

const chooseWorkingDateKey = (preferredDateKey: string, dateOptions: string[]) => {
  if (dateOptions.includes(preferredDateKey)) {
    return preferredDateKey;
  }

  const latestPrior = [...dateOptions].reverse().find((dateKey) => dateKey <= preferredDateKey);
  return latestPrior ?? dateOptions[0] ?? preferredDateKey;
};

const customDurationToSeconds = (amountText: string, unit: DurationUnit) => {
  return jiraUnitDurationToSeconds(amountText, unit);
};

const customHoursAmount = (seconds: number) => {
  const hours = seconds / 3600;
  return Number.isInteger(hours) ? String(hours) : String(Number(hours.toFixed(2)));
};

interface DaySelectorProps {
  dateOptions: string[];
  value: string;
  onChange: (dateKey: string) => void;
}

const DaySelector = ({ dateOptions, value, onChange }: DaySelectorProps) => {
  if (dateOptions.length === 0) {
    return <div className="modal-day-empty">No active working days this week.</div>;
  }

  return (
    <div className="modal-day-selector" role="radiogroup" aria-label="Working day">
      {dateOptions.map((dateKey) => {
        const label = optionLabel(dateKey);
        const isSelected = dateKey === value;
        return (
          <button
            key={dateKey}
            type="button"
            role="radio"
            aria-checked={isSelected}
            className={`modal-day-option ${isSelected ? "active" : ""}`}
            onClick={() => onChange(dateKey)}
          >
            <span>{label.weekday}</span>
            <strong>{label.date}</strong>
          </button>
        );
      })}
    </div>
  );
};

export const AddTimeModal = ({
  date,
  dateOptions,
  ticketOptions,
  isConfigured,
  isLogging,
  isDeleting = false,
  logError,
  editingWorklog,
  editingPersonalNote,
  onClose,
  onLog,
  onDelete,
  onSearchTickets,
  onAddPersonalNote,
  onUpdatePersonalNote,
  getRecurringCandidates,
  onLogRecurring
}: AddTimeModalProps) => {
  const isEditingWorklog = Boolean(editingWorklog);
  const isEditingPersonalNote = Boolean(editingPersonalNote);
  const isEditing = isEditingWorklog || isEditingPersonalNote;
  const initialStart = getInitialStart(date, editingWorklog, editingPersonalNote);
  const initialSeconds = editingWorklog?.timeSpentSeconds ?? 2 * 60 * 60;
  const initialPersonalSeconds = editingPersonalNote?.timeSpentSeconds ?? 30 * 60;
  const initialPreset = PRESETS.some((preset) => preset.seconds === initialSeconds);
  const initialPersonalPreset = PERSONAL_NOTE_PRESETS.some((preset) => preset.seconds === initialPersonalSeconds);
  const initialDateKey = toLocalDateKey(initialStart);
  const selectableDateOptions =
    isEditingPersonalNote && !dateOptions.includes(initialDateKey)
      ? [...dateOptions, initialDateKey].sort()
      : dateOptions;
  const preferredDateKey = isEditingPersonalNote
    ? initialDateKey
    : chooseWorkingDateKey(initialDateKey, selectableDateOptions);
  const dateOptionsKey = selectableDateOptions.join("|");
  const [mode, setMode] = useState<"ticket" | "note" | "recurring">(isEditingPersonalNote ? "note" : "ticket");
  const [recSelectedId, setRecSelectedId] = useState<string | undefined>();
  const [recMinutes, setRecMinutes] = useState(15);
  const [recNote, setRecNote] = useState("");
  const [activeKey, setActiveKey] = useState<string | undefined>(editingWorklog?.issueKey ?? ticketOptions[0]?.key);
  const [selectedTicketOverride, setSelectedTicketOverride] = useState<JiraTicket | undefined>();
  const [durationSeconds, setDurationSeconds] = useState(initialSeconds);
  const [ticketDurationMode, setTicketDurationMode] = useState<DurationMode>(initialPreset ? "preset" : "custom");
  const [ticketCustomAmount, setTicketCustomAmount] = useState(customHoursAmount(initialSeconds));
  const [ticketCustomUnit, setTicketCustomUnit] = useState<DurationUnit>("h");
  const [dateStr, setDateStr] = useState(preferredDateKey);
  const [timeStr, setTimeStr] = useState(`${pad(initialStart.getHours())}:${pad(initialStart.getMinutes())}`);
  const [note, setNote] = useState(editingWorklog?.comment ?? "");
  const [personalNoteTitle, setPersonalNoteTitle] = useState(editingPersonalNote?.title ?? "");
  const [personalNote, setPersonalNote] = useState(editingPersonalNote?.text ?? "");
  const [personalNoteSeconds, setPersonalNoteSeconds] = useState(initialPersonalSeconds);
  const [personalDurationMode, setPersonalDurationMode] = useState<DurationMode>(initialPersonalPreset ? "preset" : "custom");
  const [personalCustomAmount, setPersonalCustomAmount] = useState(customHoursAmount(initialPersonalSeconds));
  const [personalCustomUnit, setPersonalCustomUnit] = useState<DurationUnit>("h");

  const ticketFromOptions = ticketOptions.find((ticket) => ticket.key === activeKey);
  const activeTicket =
    ticketFromOptions ??
    (selectedTicketOverride?.key === activeKey ? selectedTicketOverride : undefined) ??
    (editingWorklog && activeKey === editingWorklog.issueKey
      ? {
          id: editingWorklog.issueId,
          key: editingWorklog.issueKey,
          summary: editingWorklog.issueSummary,
          projectKey: editingWorklog.issueKey.split("-")[0],
          projectName: editingWorklog.issueKey.split("-")[0],
          statusName: "Unknown",
          statusCategory: "unknown" as const,
          loggedSecondsTotal: 0,
          issueType: editingWorklog.issueType,
          epic: editingWorklog.epic,
          url: editingWorklog.issueUrl ?? ""
        }
      : undefined);
  const selectedDate = fromLocalDateKey(dateStr);
  const hasWorkingDate = selectableDateOptions.includes(dateStr);
  const recurringTabEnabled = Boolean(getRecurringCandidates && onLogRecurring && !isEditing);
  const isRecurringView = mode === "recurring" && !isEditing;
  const isTicketView = (mode === "ticket" && !isEditingPersonalNote) || isEditingWorklog;
  const isNoteMode = !isTicketView && !isRecurringView;
  const recurringCandidates = isRecurringView && getRecurringCandidates ? getRecurringCandidates(dateStr) : [];
  const recEvent = recurringCandidates.find((event) => event.id === recSelectedId) ?? recurringCandidates[0];
  const modalTitle = isEditingWorklog
    ? "Edit time"
    : isEditingPersonalNote
      ? "Edit note"
      : isRecurringView
        ? "Recurring event"
        : mode === "note"
          ? "Personal note"
          : "Log time";
  const canSubmit = isRecurringView
    ? Boolean(hasWorkingDate && recEvent && recMinutes > 0 && !isLogging)
    : isNoteMode
      ? Boolean(
          hasWorkingDate &&
            (isEditingPersonalNote ? onUpdatePersonalNote : onAddPersonalNote) &&
            personalNote.trim() &&
            personalNoteSeconds > 0 &&
            !isLogging
        )
      : Boolean(hasWorkingDate && isConfigured && activeTicket && durationSeconds > 0 && !isLogging && !isDeleting);

  const handleSubmit = async () => {
    if (!hasWorkingDate) {
      return;
    }

    const startedISO = new Date(`${dateStr}T${timeStr}`).toISOString();

    if (isRecurringView) {
      if (!recEvent || recMinutes <= 0 || !onLogRecurring) {
        return;
      }
      const ok = await onLogRecurring({
        eventId: recEvent.id,
        dateKey: dateStr,
        timeSpentSeconds: recMinutes * 60,
        note: recNote.trim() || undefined
      });
      if (ok) {
        onClose();
      }
      return;
    }

    if (isNoteMode && !isEditingWorklog) {
      const savePersonalNote = isEditingPersonalNote ? onUpdatePersonalNote : onAddPersonalNote;
      if (!savePersonalNote) {
        return;
      }
      const ok = await savePersonalNote({
        title: personalNoteTitle,
        text: personalNote,
        timeSpentSeconds: personalNoteSeconds,
        startedISO
      });
      if (ok) {
        setPersonalNoteTitle("");
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
      ticket: activeTicket,
      timeSpentSeconds: durationSeconds,
      startedISO,
      comment: note.trim() || undefined
    });
    if (ok) {
      onClose();
    }
  };

  const handleDelete = async () => {
    if (!onDelete || isDeleting) {
      return;
    }

    const confirmed = window.confirm(
      editingWorklog
        ? `Delete ${formatClock(editingWorklog.timeSpentSeconds)} from ${editingWorklog.issueKey}? This removes the Jira worklog.`
        : "Delete this local note? It will be removed from this device."
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
    const start = getInitialStart(date, editingWorklog, editingPersonalNote);
    const seconds = editingWorklog?.timeSpentSeconds ?? 2 * 60 * 60;
    const localNoteSeconds = editingPersonalNote?.timeSpentSeconds ?? 30 * 60;
    const hasPreset = PRESETS.some((preset) => preset.seconds === seconds);
    const hasPersonalPreset = PERSONAL_NOTE_PRESETS.some((preset) => preset.seconds === localNoteSeconds);

    setMode(editingPersonalNote ? "note" : "ticket");
    setActiveKey(editingPersonalNote ? undefined : editingWorklog?.issueKey ?? ticketOptions[0]?.key);
    setSelectedTicketOverride(undefined);
    setDurationSeconds(seconds);
    setTicketDurationMode(hasPreset ? "preset" : "custom");
    setTicketCustomAmount(customHoursAmount(seconds));
    setTicketCustomUnit("h");
    const startDateKey = toLocalDateKey(start);
    setDateStr(editingPersonalNote ? startDateKey : chooseWorkingDateKey(startDateKey, selectableDateOptions));
    setTimeStr(`${pad(start.getHours())}:${pad(start.getMinutes())}`);
    setNote(editingWorklog?.comment ?? "");
    setPersonalNoteTitle(editingPersonalNote?.title ?? "");
    setPersonalNote(editingPersonalNote?.text ?? "");
    setPersonalNoteSeconds(localNoteSeconds);
    setPersonalDurationMode(hasPersonalPreset ? "preset" : "custom");
    setPersonalCustomAmount(customHoursAmount(localNoteSeconds));
    setPersonalCustomUnit("h");
  }, [date, dateOptionsKey, editingPersonalNote?.id, editingWorklog?.id, ticketOptions]);

  useEffect(() => {
    if (!isEditing && !activeKey && ticketOptions[0]) {
      setActiveKey(ticketOptions[0].key);
    }
  }, [activeKey, isEditing, ticketOptions]);

  // Re-seed the recurring selection (and its default duration/note) whenever the
  // recurring tab opens or the chosen day changes, dropping selections that no
  // longer match a candidate for the day.
  useEffect(() => {
    if (mode !== "recurring" || !getRecurringCandidates) {
      return;
    }
    const candidates = getRecurringCandidates(dateStr);
    const current = candidates.find((event) => event.id === recSelectedId) ?? candidates[0];
    setRecSelectedId(current?.id);
    setRecMinutes(current ? current.durationMinutes : 15);
    setRecNote(current ? current.defaultNote : "");
    // recSelectedId intentionally omitted: manual selection is handled inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, dateStr]);

  const selectRecurring = (event: RecurringEvent) => {
    setRecSelectedId(event.id);
    setRecMinutes(event.durationMinutes);
    setRecNote(event.defaultNote);
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

  const applyTicketPreset = (seconds: number) => {
    setTicketDurationMode("preset");
    setDurationSeconds(seconds);
  };

  const applyTicketCustom = (amount: string, unit = ticketCustomUnit) => {
    setTicketDurationMode("custom");
    setTicketCustomAmount(amount);
    setDurationSeconds(customDurationToSeconds(amount, unit));
  };

  const setTicketCustomUnitAndDuration = (unit: DurationUnit) => {
    setTicketDurationMode("custom");
    setTicketCustomUnit(unit);
    setDurationSeconds(customDurationToSeconds(ticketCustomAmount, unit));
  };

  const normalizeTicketCustomAmount = () => {
    if (durationSeconds > 0) {
      return;
    }
    setTicketCustomAmount("1");
    setDurationSeconds(customDurationToSeconds("1", ticketCustomUnit));
  };

  const applyPersonalPreset = (seconds: number) => {
    setPersonalDurationMode("preset");
    setPersonalNoteSeconds(seconds);
  };

  const applyPersonalCustom = (amount: string, unit = personalCustomUnit) => {
    setPersonalDurationMode("custom");
    setPersonalCustomAmount(amount);
    setPersonalNoteSeconds(customDurationToSeconds(amount, unit));
  };

  const setPersonalCustomUnitAndDuration = (unit: DurationUnit) => {
    setPersonalDurationMode("custom");
    setPersonalCustomUnit(unit);
    setPersonalNoteSeconds(customDurationToSeconds(personalCustomAmount, unit));
  };

  const normalizePersonalCustomAmount = () => {
    if (personalNoteSeconds > 0) {
      return;
    }
    setPersonalCustomAmount("1");
    setPersonalNoteSeconds(customDurationToSeconds("1", personalCustomUnit));
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={isEditingWorklog ? "Edit time entry" : isEditingPersonalNote ? "Edit personal note" : mode === "note" ? "Personal note" : "Log time"}
    >
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-panel">
        <div className="modal-head">
          <div className="modal-title-row">
            <span className="modal-title">{modalTitle}</span>
            <span className="modal-day">{dayLabel(selectedDate)}</span>
          </div>
          <div className="modal-head-actions">
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
              <X size={14} strokeWidth={2.2} />
            </button>
          </div>
        </div>

        {!isEditing && (
          <div className="modal-mode-tabs">
            <button type="button" className={mode === "ticket" ? "active" : ""} onClick={() => setMode("ticket")}>
              Log to ticket
            </button>
            <button type="button" className={mode === "note" ? "active" : ""} onClick={() => setMode("note")}>
              Personal note
            </button>
            {recurringTabEnabled && (
              <button
                type="button"
                className={mode === "recurring" ? "active" : ""}
                onClick={() => setMode("recurring")}
              >
                Recurring
              </button>
            )}
          </div>
        )}

        <div className="modal-body">
          {isRecurringView ? (
            <AddTimeRecurringForm
              candidates={recurringCandidates}
              selectedEvent={recEvent}
              minutes={recMinutes}
              note={recNote}
              onSelect={selectRecurring}
              onMinutesChange={setRecMinutes}
              onNoteChange={setRecNote}
            />
          ) : isTicketView ? (
            <>
              <div className="modal-label">TICKET</div>
              <TicketPicker
                variant="modal"
                activeTicket={activeTicket}
                ticketOptions={ticketOptions}
                isConfigured={isConfigured}
                emptyText="Search Jira to choose a ticket"
                locked={isEditingWorklog}
                lockedTitle="Ticket cannot be changed for an existing Jira worklog"
                searchTickets={onSearchTickets}
                onSelect={(ticket) => {
                  setSelectedTicketOverride(ticket);
                  setActiveKey(ticket.key);
                }}
              />

              <div className="modal-grid">
                <div className="modal-col">
                  <div className="modal-label">DURATION</div>
                  <AddTimeDurationPicker
                    seconds={durationSeconds}
                    presets={PRESETS}
                    valueClassName="modal-duration"
                    customMode={ticketDurationMode}
                    customAmount={ticketCustomAmount}
                    customUnit={ticketCustomUnit}
                    customAmountLabel="Custom ticket duration amount"
                    onPreset={applyTicketPreset}
                    onCustomOpen={() => applyTicketCustom(ticketCustomAmount)}
                    onCustomAmountChange={(amount) => applyTicketCustom(amount)}
                    onCustomAmountBlur={normalizeTicketCustomAmount}
                    onCustomUnitChange={setTicketCustomUnitAndDuration}
                  />
                </div>
                <div className="modal-col">
                  <div className="modal-label">STARTED</div>
                  <div className="modal-started">
                    <DaySelector dateOptions={selectableDateOptions} value={dateStr} onChange={setDateStr} />
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
                placeholder={isEditingWorklog ? "Update the Jira worklog comment" : "Add a note… syncs to the Jira worklog comment"}
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
              <input
                className="note-title-input"
                type="text"
                placeholder="Title — e.g. Sprint planning, Interviews (optional)"
                value={personalNoteTitle}
                onChange={(event) => setPersonalNoteTitle(event.target.value)}
                aria-label="Personal note title"
              />
              <textarea
                className="note-textarea"
                placeholder="What did you spend time on? e.g. interviews, planning, mentoring, ops"
                value={personalNote}
                onChange={(event) => setPersonalNote(event.target.value)}
                rows={4}
              />
              <div className="personal-note-section">
                <div className="modal-label">
                  <Calendar size={13} strokeWidth={1.8} />
                  DAY
                </div>
                <DaySelector dateOptions={selectableDateOptions} value={dateStr} onChange={setDateStr} />
                <label className="input-chip personal-time-chip">
                  <Clock size={14} stroke="#6b7280" strokeWidth={1.7} />
                  <input type="time" value={timeStr} onChange={(event) => setTimeStr(event.target.value)} />
                </label>
              </div>
              <div className="personal-note-duration">
                <div className="modal-label">TIME SPENT</div>
                <AddTimeDurationPicker
                  seconds={personalNoteSeconds}
                  presets={PERSONAL_NOTE_PRESETS}
                  valueClassName="personal-note-time"
                  customMode={personalDurationMode}
                  customAmount={personalCustomAmount}
                  customUnit={personalCustomUnit}
                  customAmountLabel="Custom personal note duration amount"
                  onPreset={applyPersonalPreset}
                  onCustomOpen={() => applyPersonalCustom(personalCustomAmount)}
                  onCustomAmountChange={(amount) => applyPersonalCustom(amount)}
                  onCustomAmountBlur={normalizePersonalCustomAmount}
                  onCustomUnitChange={setPersonalCustomUnitAndDuration}
                />
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
          {(isEditingWorklog || isEditingPersonalNote) && onDelete ? (
            <button
              type="button"
              className="modal-delete-action"
              onClick={handleDelete}
              disabled={isLogging || isDeleting}
              title={isEditingPersonalNote ? "Delete note" : "Delete worklog"}
            >
              {isDeleting ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} strokeWidth={2} />}
              Delete
            </button>
          ) : (
            <span className="modal-foot-hint">⌘⏎ TO SAVE · ESC TO CANCEL</span>
          )}
          <div className="modal-foot-actions">
            <button type="button" className="modal-cancel" onClick={onClose}>
              CANCEL
            </button>
            {(!isRecurringView || recurringCandidates.length > 0) && (
              <button
                type="button"
                className={`primary-button ${isRecurringView ? "is-recurring" : ""}`}
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                {isLogging && (isTicketView || isNoteMode || isRecurringView) ? (
                  <Loader2 className="spin" size={15} />
                ) : null}
                {isEditingWorklog
                  ? `Save ${formatClock(durationSeconds)}`
                  : isEditingPersonalNote
                    ? "Save note"
                    : isRecurringView
                      ? `Log ${formatRecurringMinutes(recMinutes)} locally`
                      : mode === "note"
                        ? "Save note"
                        : activeTicket
                          ? `Log ${formatClock(durationSeconds)} to ${activeTicket.key}`
                          : "Log time"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

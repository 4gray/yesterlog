import { useEffect, useState } from "react";
import { ArrowRightLeft, Calendar, Clock, Loader2, LockKeyhole, PenLine, Trash2, X } from "lucide-react";
import type {
  JiraTicket,
  JiraWorklog,
  PersonalNote,
  PersonalNoteCategory,
  RecurringEvent,
  RecurringEntry,
  WorklogAllocationDirection,
  WorklogEstimateAdjustment
} from "../../shared/types";
import { clockTimeToMinutes, minutesToClockTime, type Range } from "../domain/dayCalendar";
import { formatClock, fromLocalDateKey, jiraUnitDurationToSeconds, toLocalDateKey } from "../utils/date";
import {
  AddTimeDurationPicker,
  type DurationMode,
  type DurationPreset,
  type DurationUnit
} from "./AddTimeDurationPicker";
import { AddTimeRecurringForm, formatRecurringMinutes } from "./AddTimeRecurringForm";
import { AddTimeTimelineEditor } from "./AddTimeTimelineEditor";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { Modal } from "./Modal";
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
  allocationDirection?: WorklogAllocationDirection;
  estimateAdjustment?: WorklogEstimateAdjustment;
}

export interface AddTimePrefill {
  ticket?: JiraTicket;
  timeSpentSeconds?: number;
  startedISO?: string;
  comment?: string;
  /** Treat the modal date as the end of a just-finished entry until its start is edited manually. */
  retrospective?: boolean;
}

export interface AddTimeModalProps {
  date: Date;
  dateOptions: string[];
  ticketOptions: JiraTicket[];
  isConfigured: boolean;
  isLogging: boolean;
  isDeleting?: boolean;
  dailyTargetHours?: number;
  logError?: string;
  prefill?: AddTimePrefill;
  editingWorklog?: JiraWorklog;
  editingPersonalNote?: PersonalNote;
  timelineWorklogs?: JiraWorklog[];
  timelinePersonalNotes?: PersonalNote[];
  timelineRecurringEntries?: RecurringEntry[];
  onClose: () => void;
  onLog: (payload: LogPayload) => Promise<boolean>;
  onDelete?: () => Promise<boolean>;
  onSearchTickets?: TicketSearchHandler;
  onAddPersonalNote?: (payload: {
    title?: string;
    text: string;
    timeSpentSeconds: number;
    startedISO: string;
    category?: PersonalNoteCategory;
  }) => Promise<boolean>;
  onUpdatePersonalNote?: (payload: {
    title?: string;
    text: string;
    timeSpentSeconds: number;
    startedISO: string;
    category?: PersonalNoteCategory;
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

const getInitialTicketSeconds = (editingWorklog?: JiraWorklog, prefill?: AddTimePrefill) =>
  editingWorklog?.timeSpentSeconds ??
  (prefill?.timeSpentSeconds && prefill.timeSpentSeconds > 0 ? Math.round(prefill.timeSpentSeconds) : undefined) ??
  2 * 60 * 60;

interface RetrospectiveStart {
  started: Date;
  timeSpentSeconds: number;
}

const getSelectableRetrospectiveStart = (
  date: Date,
  requestedSeconds: number,
  dateOptions: string[]
): RetrospectiveStart => {
  const ended = new Date(date);
  ended.setSeconds(0, 0);
  const requestedStart = new Date(ended.getTime() - requestedSeconds * 1000);

  if (dateOptions.includes(toLocalDateKey(requestedStart))) {
    return { started: requestedStart, timeSpentSeconds: requestedSeconds };
  }

  const endDateKey = toLocalDateKey(ended);
  if (!dateOptions.includes(endDateKey)) {
    return { started: requestedStart, timeSpentSeconds: requestedSeconds };
  }

  const dayStart = fromLocalDateKey(endDateKey);
  const availableSeconds = Math.max(0, Math.floor((ended.getTime() - dayStart.getTime()) / 1000));
  return {
    started: dayStart,
    timeSpentSeconds: Math.min(requestedSeconds, availableSeconds)
  };
};

const getInitialStart = (
  date: Date,
  ticketSeconds: number,
  editingWorklog?: JiraWorklog,
  editingPersonalNote?: PersonalNote,
  prefill?: AddTimePrefill
) => {
  const started = editingWorklog
    ? new Date(editingWorklog.started)
    : editingPersonalNote
      ? new Date(editingPersonalNote.startedISO)
      : prefill?.startedISO
        ? new Date(prefill.startedISO)
        : prefill?.retrospective
          ? new Date(date.getTime() - ticketSeconds * 1000)
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
  dailyTargetHours = 8,
  logError,
  prefill,
  editingWorklog,
  editingPersonalNote,
  timelineWorklogs = [],
  timelinePersonalNotes = [],
  timelineRecurringEntries = [],
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
  const activePrefill = isEditing ? undefined : prefill;
  const isRetrospectiveEntry = Boolean(activePrefill?.retrospective && !activePrefill.startedISO);
  const requestedInitialSeconds = editingPersonalNote?.timeSpentSeconds ?? getInitialTicketSeconds(editingWorklog, activePrefill);
  const dailyTargetSeconds = dailyTargetHours * 3600;
  const isInitialBulkDuration = requestedInitialSeconds > dailyTargetSeconds;
  const retrospectiveInitial = isRetrospectiveEntry && !isInitialBulkDuration
    ? getSelectableRetrospectiveStart(date, requestedInitialSeconds, dateOptions)
    : undefined;
  const initialSeconds = retrospectiveInitial?.timeSpentSeconds ?? requestedInitialSeconds;
  const initialStart =
    retrospectiveInitial?.started ??
    (isRetrospectiveEntry && isInitialBulkDuration
      ? date
      : getInitialStart(date, initialSeconds, editingWorklog, editingPersonalNote, activePrefill));
  const initialPreset = PRESETS.some((preset) => preset.seconds === initialSeconds);
  const initialDateKey = toLocalDateKey(initialStart);
  const shouldPreserveInitialDate = isEditingWorklog || isEditingPersonalNote;
  const selectableDateOptions =
    shouldPreserveInitialDate && !dateOptions.includes(initialDateKey)
      ? [...dateOptions, initialDateKey].sort()
      : dateOptions;
  const preferredDateKey = shouldPreserveInitialDate
    ? initialDateKey
    : chooseWorkingDateKey(initialDateKey, selectableDateOptions);
  const initialPrefillTicket = activePrefill?.ticket;
  const [mode, setMode] = useState<"ticket" | "note" | "recurring">(isEditingPersonalNote ? "note" : "ticket");
  // Recurring entries use their scheduled time, with independent drafts per occurrence.
  const [recSelections, setRecSelections] = useState<Record<string, string>>({});
  const [recDrafts, setRecDrafts] = useState<Record<string, { minutes: number; note: string }>>({});
  const [activeKey, setActiveKey] = useState<string | undefined>(
    editingWorklog?.issueKey ?? initialPrefillTicket?.key ?? ticketOptions[0]?.key
  );
  const [selectedTicketOverride, setSelectedTicketOverride] = useState<JiraTicket | undefined>(initialPrefillTicket);
  // Date, start, and duration describe the same slot in both ticket and note tabs.
  const [durationSeconds, setDurationSeconds] = useState(initialSeconds);
  const [allocationDirection, setAllocationDirection] = useState<WorklogAllocationDirection>(
    editingWorklog?.allocation?.direction ?? "backward"
  );
  const [isMovingWorklog, setIsMovingWorklog] = useState(false);
  const [estimateAdjustment, setEstimateAdjustment] = useState<WorklogEstimateAdjustment>("auto");
  const [durationMode, setDurationMode] = useState<DurationMode>(initialPreset ? "preset" : "custom");
  const [customAmount, setCustomAmount] = useState(customHoursAmount(initialSeconds));
  const [customUnit, setCustomUnit] = useState<DurationUnit>("h");
  const [dateStr, setDateStr] = useState(preferredDateKey);
  const [timeStr, setTimeStr] = useState(`${pad(initialStart.getHours())}:${pad(initialStart.getMinutes())}`);
  const [isStartEdited, setIsStartEdited] = useState(false);
  const [note, setNote] = useState(editingWorklog?.comment ?? activePrefill?.comment ?? "");
  const [personalNoteTitle, setPersonalNoteTitle] = useState(editingPersonalNote?.title ?? "");
  const [personalNote, setPersonalNote] = useState(editingPersonalNote?.text ?? "");
  const [personalNoteCategory, setPersonalNoteCategory] = useState<PersonalNoteCategory>(
    editingPersonalNote?.category ?? "firefighting"
  );

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
  const isMoveTargetSelected = Boolean(
    isMovingWorklog && editingWorklog && activeTicket && activeTicket.key !== editingWorklog.issueKey
  );
  const isBulkDuration = isTicketView && durationSeconds > dailyTargetHours * 3600;
  const recurringCandidates = isRecurringView && getRecurringCandidates ? getRecurringCandidates(dateStr) : [];
  const recEvent = recurringCandidates.find((event) => event.id === recSelections[dateStr]) ?? recurringCandidates[0];
  const recDraftKey = recEvent ? `${dateStr}:${recEvent.id}` : undefined;
  const recDraft = recDraftKey ? recDrafts[recDraftKey] : undefined;
  const recMinutes = recDraft?.minutes ?? recEvent?.durationMinutes ?? 15;
  const recNote = recDraft?.note ?? recEvent?.defaultNote ?? "";
  const modalTitle = isMovingWorklog
    ? "Move worklog"
    : isEditingWorklog
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
            durationSeconds > 0 &&
            !isLogging
        )
      : Boolean(
          hasWorkingDate &&
            isConfigured &&
            activeTicket &&
            durationSeconds > 0 &&
            !isLogging &&
            !isDeleting &&
            (!isMovingWorklog || isMoveTargetSelected)
        );
  const showTicketTimeline =
    isTicketView &&
    !isMovingWorklog &&
    !isBulkDuration &&
    durationSeconds > 0 &&
    durationSeconds <= 24 * 60 * 60 &&
    clockTimeToMinutes(timeStr) + durationSeconds / 60 <= 24 * 60;

  const handleSubmit = async () => {
    if (!hasWorkingDate || (isMovingWorklog && !isMoveTargetSelected)) {
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
        timeSpentSeconds: durationSeconds,
        startedISO,
        category: personalNoteCategory
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
    const ok = await onLog(
      isMovingWorklog && editingWorklog
        ? {
            issueKey: activeTicket.key,
            ticket: activeTicket,
            timeSpentSeconds: editingWorklog.timeSpentSeconds,
            startedISO: editingWorklog.started,
            comment: editingWorklog.comment,
            allocationDirection: editingWorklog.allocation?.direction,
            estimateAdjustment
          }
        : {
            issueKey: activeTicket.key,
            ticket: activeTicket,
            timeSpentSeconds: durationSeconds,
            startedISO,
            comment: note.trim() || undefined,
            allocationDirection: isBulkDuration ? allocationDirection : undefined
          }
    );
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
    const nextPrefill = editingWorklog || editingPersonalNote ? undefined : prefill;
    const requestedSeconds = editingPersonalNote?.timeSpentSeconds ?? getInitialTicketSeconds(editingWorklog, nextPrefill);
    const isBulkRequest = requestedSeconds > dailyTargetSeconds;
    const retrospectiveStart = nextPrefill?.retrospective && !nextPrefill.startedISO && !isBulkRequest
      ? getSelectableRetrospectiveStart(date, requestedSeconds, dateOptions)
      : undefined;
    const seconds = retrospectiveStart?.timeSpentSeconds ?? requestedSeconds;
    const start =
      retrospectiveStart?.started ??
      (nextPrefill?.retrospective && !nextPrefill.startedISO && isBulkRequest
        ? date
        : getInitialStart(date, seconds, editingWorklog, editingPersonalNote, nextPrefill));
    const hasPreset = PRESETS.some((preset) => preset.seconds === seconds);
    const prefillTicket = nextPrefill?.ticket;

    setMode(editingPersonalNote ? "note" : "ticket");
    setActiveKey(editingPersonalNote ? undefined : editingWorklog?.issueKey ?? prefillTicket?.key ?? ticketOptions[0]?.key);
    setSelectedTicketOverride(prefillTicket);
    setDurationSeconds(seconds);
    setDurationMode(hasPreset ? "preset" : "custom");
    setCustomAmount(customHoursAmount(seconds));
    setCustomUnit("h");
    const startDateKey = toLocalDateKey(start);
    setDateStr(editingPersonalNote || editingWorklog ? startDateKey : chooseWorkingDateKey(startDateKey, selectableDateOptions));
    setTimeStr(`${pad(start.getHours())}:${pad(start.getMinutes())}`);
    setAllocationDirection(editingWorklog?.allocation?.direction ?? "backward");
    setIsMovingWorklog(false);
    setEstimateAdjustment("auto");
    setIsStartEdited(false);
    setNote(editingWorklog?.comment ?? nextPrefill?.comment ?? "");
    setPersonalNoteTitle(editingPersonalNote?.title ?? "");
    setPersonalNote(editingPersonalNote?.text ?? "");
    setPersonalNoteCategory(editingPersonalNote?.category ?? "firefighting");
    setRecSelections({});
    setRecDrafts({});
    // Reset only for a new entry target/prefill. Refreshes of working-day options,
    // daily targets, tickets, or the live clock must not erase a session's drafts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    toLocalDateKey(date),
    editingPersonalNote?.id,
    editingWorklog?.id,
    prefill?.comment,
    prefill?.retrospective,
    prefill?.startedISO,
    prefill?.ticket?.key,
    prefill?.timeSpentSeconds
  ]);

  useEffect(() => {
    if (!isEditing && !activeKey && ticketOptions[0]) {
      setActiveKey(ticketOptions[0].key);
    }
  }, [activeKey, isEditing, ticketOptions]);

  const selectRecurring = (event: RecurringEvent) => {
    setRecSelections((selections) => ({ ...selections, [dateStr]: event.id }));
  };

  const updateRecurringDraft = (patch: Partial<{ minutes: number; note: string }>) => {
    if (!recDraftKey) return;
    setRecDrafts((drafts) => ({
      ...drafts,
      [recDraftKey]: { ...(drafts[recDraftKey] ?? { minutes: recMinutes, note: recNote }), ...patch }
    }));
  };

  // Escape is handled by the Modal shell; this only owns ⌘/Ctrl+Enter submit.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void handleSubmit();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const updateRetrospectiveStart = (seconds: number) => {
    if (!isRetrospectiveEntry || isStartEdited || seconds <= 0 || seconds > dailyTargetSeconds) {
      return seconds;
    }

    const retrospectiveStart = getSelectableRetrospectiveStart(date, seconds, selectableDateOptions);
    setDateStr(toLocalDateKey(retrospectiveStart.started));
    setTimeStr(`${pad(retrospectiveStart.started.getHours())}:${pad(retrospectiveStart.started.getMinutes())}`);
    return retrospectiveStart.timeSpentSeconds;
  };

  const selectStartedDate = (nextDateKey: string) => {
    setIsStartEdited(true);
    setDateStr(nextDateKey);
  };

  const updateDuration = (seconds: number) => {
    const nextSeconds = updateRetrospectiveStart(seconds);
    setDurationSeconds(nextSeconds);
    return nextSeconds;
  };

  const applyDurationPreset = (seconds: number) => {
    setDurationMode("preset");
    const nextSeconds = updateDuration(seconds);
    setCustomAmount(customHoursAmount(nextSeconds));
    setCustomUnit("h");
  };

  const openCustomDuration = () => {
    if (durationMode === "custom") return;
    setDurationMode("custom");
    setCustomAmount(customHoursAmount(durationSeconds));
    setCustomUnit("h");
  };

  const applyCustomDuration = (amount: string, unit = customUnit) => {
    setDurationMode("custom");
    setCustomAmount(amount);
    const requestedSeconds = customDurationToSeconds(amount, unit);
    const nextSeconds = updateDuration(requestedSeconds);
    if (nextSeconds !== requestedSeconds) {
      setCustomAmount(customHoursAmount(nextSeconds));
      setCustomUnit("h");
    }
  };

  const setCustomUnitAndDuration = (unit: DurationUnit) => {
    setDurationMode("custom");
    setCustomUnit(unit);
    const requestedSeconds = customDurationToSeconds(customAmount, unit);
    const nextSeconds = updateDuration(requestedSeconds);
    if (nextSeconds !== requestedSeconds) {
      setCustomAmount(customHoursAmount(nextSeconds));
      setCustomUnit("h");
    }
  };

  const normalizeCustomAmount = () => {
    if (durationSeconds > 0) {
      return;
    }
    setCustomAmount("1");
    updateDuration(customDurationToSeconds("1", customUnit));
  };

  const applyTimelineRange = (range: Range) => {
    const seconds = Math.max(60, Math.round((range.endMin - range.startMin) * 60));
    const hasPreset = PRESETS.some((preset) => preset.seconds === seconds);
    setIsStartEdited(true);
    setTimeStr(minutesToClockTime(range.startMin));
    setDurationSeconds(seconds);
    setDurationMode(hasPreset ? "preset" : "custom");
    setCustomAmount(customHoursAmount(seconds));
    setCustomUnit("h");
  };

  const applyPersonalExactMinutes = (minutes: number) => {
    const seconds = Math.max(5, minutes) * 60;
    const nextSeconds = updateDuration(seconds);
    setDurationMode("custom");
    setCustomAmount(customHoursAmount(nextSeconds));
    setCustomUnit("h");
  };

  return (
    <Modal
      label={isMovingWorklog ? "Move time entry" : isEditingWorklog ? "Edit time entry" : isEditingPersonalNote ? "Edit personal note" : mode === "note" ? "Personal note" : "Log time"}
      onClose={onClose}
      panelClassName="add-time-modal-panel"
    >
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

        <div className={`add-time-modal-content${showTicketTimeline ? " has-side-timeline" : ""}`}>
          <div className="add-time-modal-main">
            {!isEditing && (
              <div className="modal-mode-tabs">
                <button
                  type="button"
                  className={mode === "ticket" ? "active" : ""}
                  onClick={() => setMode("ticket")}
                >
                  Log to ticket
                </button>
                <button
                  type="button"
                  className={mode === "note" ? "active" : ""}
                  onClick={() => setMode("note")}
                >
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
              onMinutesChange={(minutes) => updateRecurringDraft({ minutes })}
              onNoteChange={(note) => updateRecurringDraft({ note })}
            />
          ) : isTicketView ? (
            <>
              <div className="modal-label-row">
                <div className="modal-label">TICKET</div>
                {isEditingWorklog && (
                  <button
                    type="button"
                    className={`move-worklog-toggle${isMovingWorklog ? " active" : ""}`}
                    onClick={() => {
                      if (isMovingWorklog) {
                        setActiveKey(editingWorklog?.issueKey);
                        setSelectedTicketOverride(undefined);
                      }
                      setIsMovingWorklog((moving) => !moving);
                    }}
                    disabled={isLogging || isDeleting}
                  >
                    <ArrowRightLeft size={12} strokeWidth={2} />
                    {isMovingWorklog ? "Back to edit" : "Move worklog"}
                  </button>
                )}
              </div>
              <TicketPicker
                variant="modal"
                activeTicket={activeTicket}
                ticketOptions={ticketOptions}
                isConfigured={isConfigured}
                emptyText="Search Jira to choose a ticket"
                locked={isEditingWorklog && !isMovingWorklog}
                lockedTitle="Use Move worklog to choose another Jira issue"
                searchTickets={onSearchTickets}
                onSelect={(ticket) => {
                  setSelectedTicketOverride(ticket);
                  setActiveKey(ticket.key);
                }}
              />

              {isMovingWorklog && editingWorklog ? (
                <div className="move-worklog-panel">
                  {!isMoveTargetSelected ? (
                    <EmptyState
                      className="move-worklog-empty"
                      icon={<ArrowRightLeft size={20} strokeWidth={1.7} />}
                      title="Choose the correct Jira issue"
                      hint="The original worklog stays unchanged until Jira accepts the move."
                    />
                  ) : (
                    <>
                      <div className="move-worklog-route" aria-label="Worklog move preview">
                        <div>
                          <span>BEFORE</span>
                          <strong>{editingWorklog.issueKey}</strong>
                          <small>{formatClock(editingWorklog.timeSpentSeconds)} currently logged</small>
                        </div>
                        <ArrowRightLeft size={18} strokeWidth={1.8} />
                        <div>
                          <span>AFTER</span>
                          <strong>{activeTicket?.key}</strong>
                          <small>Same date, time, duration, comment, and author</small>
                        </div>
                      </div>

                      <div className="move-worklog-estimates">
                        <div className="move-worklog-estimate-copy">
                          <span>REMAINING ESTIMATES</span>
                          <strong>{estimateAdjustment === "auto" ? "Adjust automatically" : "Leave unchanged"}</strong>
                          <small>
                            {estimateAdjustment === "auto"
                              ? `${editingWorklog.issueKey} gets ${formatClock(editingWorklog.timeSpentSeconds)} back; ${activeTicket?.key} deducts it when estimates exist.`
                              : "Only logged time moves; both remaining estimates stay as they are."}
                          </small>
                        </div>
                        <div className="move-worklog-estimate-toggle" role="radiogroup" aria-label="Remaining estimate adjustment">
                          <label className={estimateAdjustment === "auto" ? "active" : ""}>
                            <input
                              type="radio"
                              name="move-worklog-estimate"
                              value="auto"
                              checked={estimateAdjustment === "auto"}
                              onChange={() => setEstimateAdjustment("auto")}
                            />
                            <span>Auto</span>
                          </label>
                          <label className={estimateAdjustment === "leave" ? "active" : ""}>
                            <input
                              type="radio"
                              name="move-worklog-estimate"
                              value="leave"
                              checked={estimateAdjustment === "leave"}
                              onChange={() => setEstimateAdjustment("leave")}
                            />
                            <span>Leave</span>
                          </label>
                        </div>
                      </div>

                      <div className="move-worklog-permission-note">
                        Jira requires <strong>Work on issues</strong> and <strong>Delete all worklogs</strong> permissions for this move.
                      </div>
                    </>
                  )}
                </div>
              ) : (
              <div className="add-time-ticket-workspace">
                <div className="add-time-ticket-form">
                  <div className="modal-grid">
                    <div className="modal-col">
                      <div className="modal-label">DURATION</div>
                      <AddTimeDurationPicker
                        seconds={durationSeconds}
                        presets={PRESETS}
                        valueClassName="modal-duration"
                        customMode={durationMode === "preset" && PRESETS.some((preset) => preset.seconds === durationSeconds) ? "preset" : "custom"}
                        customAmount={customAmount}
                        customUnit={customUnit}
                        customAmountLabel="Custom ticket duration amount"
                        onPreset={applyDurationPreset}
                        onCustomOpen={openCustomDuration}
                        onCustomAmountChange={(amount) => applyCustomDuration(amount)}
                        onCustomAmountBlur={normalizeCustomAmount}
                        onCustomUnitChange={setCustomUnitAndDuration}
                      />
                    </div>
                    <div className="modal-col">
                      <div className="modal-label">STARTED</div>
                      <div className="modal-started">
                        <DaySelector dateOptions={selectableDateOptions} value={dateStr} onChange={selectStartedDate} />
                        <label className="input-chip">
                          <Clock size={14} stroke="var(--dim)" strokeWidth={1.7} />
                          <input
                            type="time"
                            value={timeStr}
                            onChange={(event) => {
                              setIsStartEdited(true);
                              setTimeStr(event.target.value);
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  {isBulkDuration && (
                    <div className="bulk-allocation-choice">
                      <div className="bulk-allocation-copy">
                        <span>BULK WORKLOG</span>
                        <strong>One Jira entry, distributed locally</strong>
                        <small>
                          {allocationDirection === "backward"
                            ? "The selected day ends the period. Future days stay untouched."
                            : "The selected day starts the period. Distribution stops at today."}
                        </small>
                      </div>
                      <div className="bulk-direction-toggle" role="radiogroup" aria-label="Bulk worklog distribution">
                        <label className={allocationDirection === "backward" ? "active" : ""}>
                          <input
                            type="radio"
                            name="bulk-worklog-distribution"
                            value="backward"
                            checked={allocationDirection === "backward"}
                            onChange={() => setAllocationDirection("backward")}
                          />
                          <span>End on date</span>
                        </label>
                        <label className={allocationDirection === "forward" ? "active" : ""}>
                          <input
                            type="radio"
                            name="bulk-worklog-distribution"
                            value="forward"
                            checked={allocationDirection === "forward"}
                            onChange={() => setAllocationDirection("forward")}
                          />
                          <span>Start on date</span>
                        </label>
                      </div>
                    </div>
                  )}

                  <div className="modal-label add-time-description-label">WORK DESCRIPTION</div>
                  <textarea
                    className="note-textarea"
                    placeholder={isEditingWorklog ? "Update the Jira worklog comment" : "Add a note… syncs to the Jira worklog comment"}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={2}
                  />
                </div>

              </div>
              )}
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
                <div className="modal-label">TYPE</div>
                <div className="note-category-tabs" role="radiogroup" aria-label="Note type">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={personalNoteCategory === "firefighting"}
                    className={`is-fire ${personalNoteCategory === "firefighting" ? "active" : ""}`}
                    onClick={() => setPersonalNoteCategory("firefighting")}
                  >
                    <span className="ring-legend-dot" style={{ background: "var(--ring-fire)" }} />
                    Firefighting
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={personalNoteCategory === "meeting"}
                    className={`is-meeting ${personalNoteCategory === "meeting" ? "active" : ""}`}
                    onClick={() => setPersonalNoteCategory("meeting")}
                  >
                    <span className="ring-legend-dot" style={{ background: "var(--ring-meeting)" }} />
                    Meeting
                  </button>
                </div>
              </div>
              <div className="personal-note-section">
                <div className="modal-label">
                  <Calendar size={13} strokeWidth={1.8} />
                  DAY
                </div>
                <DaySelector dateOptions={selectableDateOptions} value={dateStr} onChange={selectStartedDate} />
                <label className="input-chip personal-time-chip">
                  <Clock size={14} stroke="var(--dim)" strokeWidth={1.7} />
                  <input
                    type="time"
                    value={timeStr}
                    onChange={(event) => {
                      setIsStartEdited(true);
                      setTimeStr(event.target.value);
                    }}
                  />
                </label>
              </div>
              <div className="personal-note-duration">
                <div className="modal-label">TIME SPENT</div>
                <AddTimeDurationPicker
                  seconds={durationSeconds}
                  presets={PERSONAL_NOTE_PRESETS}
                  valueClassName="personal-note-time"
                  customMode={durationMode === "preset" && PERSONAL_NOTE_PRESETS.some((preset) => preset.seconds === durationSeconds) ? "preset" : "custom"}
                  customAmount={customAmount}
                  customUnit={customUnit}
                  customAmountLabel="Custom personal note duration amount"
                  exactMinutes={{
                    value: Math.max(5, Math.round(durationSeconds / 60)),
                    label: "Exact personal note duration in minutes",
                    onChange: applyPersonalExactMinutes
                  }}
                  onPreset={applyDurationPreset}
                  onCustomOpen={openCustomDuration}
                  onCustomAmountChange={(amount) => applyCustomDuration(amount)}
                  onCustomAmountBlur={normalizeCustomAmount}
                  onCustomUnitChange={setCustomUnitAndDuration}
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
          </div>

          {showTicketTimeline && (
            <AddTimeTimelineEditor
              dateKey={dateStr}
              time={timeStr}
              durationSeconds={durationSeconds}
              ticket={activeTicket}
              worklogs={timelineWorklogs}
              personalNotes={timelinePersonalNotes}
              recurringEntries={timelineRecurringEntries}
              editingWorklogId={editingWorklog?.id}
              onChange={applyTimelineRange}
            />
          )}
        </div>

        <div className="modal-foot">
          {(isEditingWorklog || isEditingPersonalNote) && onDelete && !isMovingWorklog ? (
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
            <span className="modal-foot-hint">
              {isMovingWorklog ? "SELECT A DIFFERENT TICKET · ⌘⏎ TO MOVE" : "⌘⏎ TO SAVE · ESC TO CANCEL"}
            </span>
          )}
          <div className="modal-foot-actions">
            <button type="button" className="modal-cancel" onClick={onClose}>
              CANCEL
            </button>
            {(!isRecurringView || recurringCandidates.length > 0) && (
              <Button
                variant="primary"
                className={isRecurringView ? "is-recurring" : undefined}
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                {isLogging && (isTicketView || isNoteMode || isRecurringView) ? (
                  <Loader2 className="spin" size={15} />
                ) : null}
                {isMovingWorklog
                  ? activeTicket && isMoveTargetSelected
                    ? `Move to ${activeTicket.key}`
                    : "Choose destination"
                  : isEditingWorklog
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
              </Button>
            )}
          </div>
        </div>
    </Modal>
  );
};

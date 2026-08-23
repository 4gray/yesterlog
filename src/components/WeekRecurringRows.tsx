import { useState } from "react";
import { Tooltip } from "./Tooltip";
import { Button } from "./Button";
import { Check, Pencil, Repeat2, Trash2, X } from "lucide-react";
import type { PendingRecurringOccurrence, RecurringEntry } from "../../shared/types";

const RECURRING_PRESET_MINUTES = [10, 15, 30, 45, 60] as const;

export interface RecurringConfirmPayload {
  eventId: string;
  dateKey: string;
  timeSpentSeconds: number;
  note?: string;
}

export const formatWeekRecurringMinutes = (minutes: number) => {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${String(rest).padStart(2, "0")}m`;
};

const ExactRecurringMinutes = ({ minutes, onChange }: { minutes: number; onChange: (minutes: number) => void }) => (
  <label className="rec-custom-minutes is-compact">
    <span>Exact</span>
    <input
      type="number"
      min={5}
      max={24 * 60}
      step={5}
      value={minutes}
      onChange={(event) => onChange(Math.max(5, Number(event.target.value) || 0))}
      aria-label="Exact recurring duration in minutes"
    />
    <em>min</em>
  </label>
);

interface PendingRecurringCardProps {
  pending: PendingRecurringOccurrence;
  onConfirm: (payload: RecurringConfirmPayload) => Promise<boolean> | void;
  onSkip: (eventId: string, dateKey: string) => Promise<boolean> | void;
}

export const PendingRecurringCard = ({ pending, onConfirm, onSkip }: PendingRecurringCardProps) => {
  const [editing, setEditing] = useState(false);
  const [minutes, setMinutes] = useState(pending.defaultDurationMinutes);
  const [note, setNote] = useState(pending.defaultNote);

  const confirm = () => {
    void onConfirm({
      eventId: pending.eventId,
      dateKey: pending.dateKey,
      timeSpentSeconds: minutes * 60,
      note: note.trim() || undefined
    });
  };

  const durLabel = formatWeekRecurringMinutes(minutes);

  return (
    <div className="rec-pending">
      <div className="rec-pending-head">
        <Repeat2 className="rec-pending-icon" size={12} strokeWidth={1.9} />
        <span className="rec-pending-title">{pending.title}</span>
      </div>

      {editing ? (
        <>
          <div className="rec-pending-chips">
            {RECURRING_PRESET_MINUTES.map((value) => (
              <button
                type="button"
                key={value}
                className={`rec-chip ${minutes === value ? "active" : ""}`}
                onClick={() => setMinutes(value)}
              >
                {formatWeekRecurringMinutes(value)}
              </button>
            ))}
            <ExactRecurringMinutes minutes={minutes} onChange={setMinutes} />
          </div>
          <textarea
            className="rec-pending-note"
            placeholder="Note for this entry…"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
          />
          <div className="rec-pending-bar">
            <span className="rec-pending-meta">{pending.localTime}</span>
            <span className="rec-pending-actions">
              <Button variant="icon" className="rec-icon-btn is-confirm" onClick={confirm} title={`Log ${durLabel} locally`} aria-label={`Log ${durLabel} locally`}>
                <Check size={14} strokeWidth={2.4} />
              </Button>
              <Tooltip text="Cancel"><Button variant="icon" className="rec-icon-btn" onClick={() => setEditing(false)} aria-label="Cancel editing">
                <X size={14} strokeWidth={2.2} />
              </Button></Tooltip>
            </span>
          </div>
        </>
      ) : (
        <div className="rec-pending-bar">
          <span className="rec-pending-meta">
            {pending.localTime} · {durLabel}
          </span>
          <span className="rec-pending-actions">
            <Button variant="icon" className="rec-icon-btn is-confirm" onClick={confirm} title={`Log ${durLabel} locally`} aria-label={`Log ${durLabel} locally`}>
              <Check size={14} strokeWidth={2.4} />
            </Button>
            <Tooltip text="Adjust duration & note"><Button variant="icon" className="rec-icon-btn" onClick={() => setEditing(true)} aria-label="Adjust duration and note">
              <Pencil size={13} strokeWidth={1.9} />
            </Button></Tooltip>
            <Tooltip text="Skip today"><Button variant="icon" className="rec-icon-btn" onClick={() => void onSkip(pending.eventId, pending.dateKey)} aria-label="Skip today">
              <X size={14} strokeWidth={2.2} />
            </Button></Tooltip>
          </span>
        </div>
      )}
    </div>
  );
};

interface RecurringEntryRowProps {
  entry: RecurringEntry;
  onSave?: (payload: RecurringConfirmPayload) => Promise<boolean> | void;
  onDelete?: (eventId: string, dateKey: string) => Promise<boolean> | void;
}

export const RecurringEntryRow = ({ entry, onSave, onDelete }: RecurringEntryRowProps) => {
  const initialMinutes = Math.round(entry.timeSpentSeconds / 60);
  const [editing, setEditing] = useState(false);
  const [minutes, setMinutes] = useState(initialMinutes);
  const [note, setNote] = useState(entry.note ?? "");

  const cancel = () => {
    setMinutes(initialMinutes);
    setNote(entry.note ?? "");
    setEditing(false);
  };

  const save = () => {
    void onSave?.({
      eventId: entry.eventId,
      dateKey: entry.dateKey,
      timeSpentSeconds: minutes * 60,
      note: note.trim() || undefined
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="day-note-row day-rec-entry is-editing">
        <div className="day-log-head">
          <Repeat2 size={12} stroke="var(--dim)" strokeWidth={1.9} />
          <span className="local-note-label">EVENT</span>
        </div>
        <div className="rec-pending-chips">
          {RECURRING_PRESET_MINUTES.map((value) => (
            <button
              type="button"
              key={value}
              className={`rec-chip ${minutes === value ? "active" : ""}`}
              onClick={() => setMinutes(value)}
            >
              {formatWeekRecurringMinutes(value)}
            </button>
          ))}
          <ExactRecurringMinutes minutes={minutes} onChange={setMinutes} />
        </div>
        <textarea
          className="rec-pending-note"
          placeholder="Note for this entry…"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
        />
        <div className="rec-pending-bar">
          {onDelete && (
            <Tooltip text="Delete this entry"><Button variant="icon" className="rec-icon-btn is-danger" onClick={() => void onDelete(entry.eventId, entry.dateKey)} aria-label={`Delete ${entry.title}`}>
              <Trash2 size={14} strokeWidth={2} />
            </Button></Tooltip>
          )}
          <span className="rec-pending-actions">
            <Button variant="icon" className="rec-icon-btn is-confirm" onClick={save} title={`Save ${formatWeekRecurringMinutes(minutes)}`} aria-label={`Save ${formatWeekRecurringMinutes(minutes)}`}>
              <Check size={14} strokeWidth={2.4} />
            </Button>
            <Tooltip text="Cancel"><Button variant="icon" className="rec-icon-btn" onClick={cancel} aria-label="Cancel editing">
              <X size={14} strokeWidth={2.2} />
            </Button></Tooltip>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="day-note-row day-rec-entry">
      <div className="day-log-head">
        <Repeat2 size={12} stroke="var(--dim)" strokeWidth={1.9} />
        <span className="local-note-label">EVENT</span>
        <span className="day-log-spacer" />
        <span className="day-log-dur">{formatWeekRecurringMinutes(initialMinutes)}</span>
        <span className="day-log-action-slot">
          {onSave && (
            <Tooltip text="Adjust duration & note"><button type="button" className="day-log-edit" onClick={() => setEditing(true)} aria-label={`Edit ${entry.title}`}>
              <Pencil size={12} strokeWidth={2} />
            </button></Tooltip>
          )}
        </span>
      </div>
      <div className="day-note-title">{entry.title}</div>
      {entry.note?.trim() && <div className="day-note-text">{entry.note}</div>}
    </div>
  );
};

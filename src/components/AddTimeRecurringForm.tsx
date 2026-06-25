import { LockKeyhole, Repeat2 } from "lucide-react";
import type { RecurringEvent } from "../../shared/types";

const RECURRING_PRESET_MINUTES = [10, 15, 30, 45, 60] as const;

export const formatRecurringMinutes = (minutes: number) => {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${String(rest).padStart(2, "0")}m`;
};

export interface AddTimeRecurringFormProps {
  candidates: RecurringEvent[];
  selectedEvent?: RecurringEvent;
  minutes: number;
  note: string;
  onSelect: (event: RecurringEvent) => void;
  onMinutesChange: (minutes: number) => void;
  onNoteChange: (note: string) => void;
}

export const AddTimeRecurringForm = ({
  candidates,
  selectedEvent,
  minutes,
  note,
  onSelect,
  onMinutesChange,
  onNoteChange
}: AddTimeRecurringFormProps) => (
  <div className="recurring-form">
    <div className="personal-note-title recurring-title">
      <Repeat2 size={14} />
      <span>RECURRING EVENT</span>
      <em className="is-purple">
        <LockKeyhole size={9} />
        LOCAL
      </em>
    </div>

    {candidates.length > 0 ? (
      <>
        <div className="modal-label">SCHEDULED THIS DAY — NOT YET LOGGED</div>
        <div className="recurring-picker" role="radiogroup" aria-label="Recurring event">
          {candidates.map((event) => {
            const isSelected = event.id === selectedEvent?.id;
            return (
              <button
                key={event.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`recurring-option ${isSelected ? "active" : ""}`}
                onClick={() => onSelect(event)}
              >
                <span className="recurring-radio">{isSelected && <span />}</span>
                <span className="recurring-option-title">{event.title}</span>
                <span className="recurring-option-time">{event.localTime}</span>
                <span className="recurring-option-dur">{formatRecurringMinutes(event.durationMinutes)}</span>
              </button>
            );
          })}
        </div>

        <div className="personal-note-duration">
          <div className="modal-label">TIME SPENT</div>
          <div className="duration-picker">
            <div className="personal-note-time">{formatRecurringMinutes(minutes)}</div>
            <div className="modal-presets">
              {RECURRING_PRESET_MINUTES.map((value) => (
                <button
                  type="button"
                  key={value}
                  className={`preset ${minutes === value ? "active" : ""}`}
                  onClick={() => onMinutesChange(value)}
                >
                  {formatRecurringMinutes(value)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-label" style={{ marginTop: 18 }}>
          NOTE
        </div>
        <textarea
          className="note-textarea"
          placeholder="Note for this entry…"
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          rows={2}
        />

        <div className="local-note-callout">
          <LockKeyhole size={13} />
          <span>One per event per day · stays on this device and is not synced to Jira.</span>
        </div>
      </>
    ) : (
      <div className="recurring-empty">
        <p>No recurring events scheduled for this day — or all are already logged.</p>
        <small>Manage recurring events in Settings.</small>
      </div>
    )}
  </div>
);

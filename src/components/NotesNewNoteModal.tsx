import { type KeyboardEvent, type MouseEvent } from "react";
import { ListTodo, LoaderCircle, LockKeyhole, Search, X } from "lucide-react";
import { GENERAL_NOTES_CONTAINER_ID } from "../domain/ticketNotes";
import type { TargetOption } from "./notesWorkspaceShared";

export interface NotesNewNoteModalProps {
  text: string;
  todo: boolean;
  search: string;
  searchLoading: boolean;
  targetOptions: TargetOption[];
  selectedTarget: TargetOption;
  onClose: () => void;
  onSave: () => void;
  onTextChange: (value: string) => void;
  onToggleTodo: () => void;
  onSearchChange: (value: string) => void;
  onPickTarget: (target: TargetOption) => void;
  onResetTarget: () => void;
}

/** The "New note" dialog: free text + attach-to picker over notebooks and Jira search. */
export const NotesNewNoteModal = ({
  text,
  todo,
  search,
  searchLoading,
  targetOptions,
  selectedTarget,
  onClose,
  onSave,
  onTextChange,
  onToggleTodo,
  onSearchChange,
  onPickTarget,
  onResetTarget
}: NotesNewNoteModalProps) => (
  <div
    className="notes-modal-backdrop"
    onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) onClose();
    }}
  >
    <section
      className="notes-new-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-note-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header>
        <h2 id="new-note-title">New note</h2>
        <button type="button" onClick={onClose} aria-label="Close new note">
          <X size={14} />
        </button>
      </header>
      <div className="notes-modal-composer">
        <button
          type="button"
          className={todo ? "is-active" : ""}
          onClick={onToggleTodo}
          aria-label={todo ? "Save as plain note" : "Save as to-do"}
          aria-pressed={todo}
        >
          <ListTodo size={15} />
        </button>
        <input
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") onSave();
          }}
          placeholder={todo ? "Write a to-do…" : "Write a note…  ( [] makes it a to-do )"}
          autoFocus
        />
      </div>
      <span className="notes-modal-label">Attach to</span>
      <div className={`notes-target-chip${selectedTarget.containerId !== GENERAL_NOTES_CONTAINER_ID ? " is-picked" : ""}`}>
        <i style={{ background: selectedTarget.color }} />
        <span>{selectedTarget.label}</span>
        {selectedTarget.containerId !== GENERAL_NOTES_CONTAINER_ID ? (
          <button type="button" onClick={onResetTarget} aria-label="Reset target to General notes">
            <X size={11} />
          </button>
        ) : (
          <em>or pick anything from Jira below</em>
        )}
      </div>
      <div className="notes-modal-search">
        <Search size={14} />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search tickets, epics, sub-tasks…"
        />
        {searchLoading ? <LoaderCircle className="notes-spinner" size={13} /> : null}
      </div>
      <div className="notes-search-results" aria-label="Attach targets">
        {targetOptions.map((target) => (
          <button type="button" key={target.containerId} onClick={() => onPickTarget(target)}>
            <span className="notes-type-badge">{target.typeLabel}</span>
            <i style={{ background: target.color }} />
            <span>{target.label}</span>
          </button>
        ))}
        {!targetOptions.length && !searchLoading ? <p>No matching Jira tickets or notebooks.</p> : null}
      </div>
      <footer>
        <span>
          <LockKeyhole size={11} /> Stored locally · never synced to Jira
        </span>
        <button type="button" onClick={onSave} disabled={!text.trim()}>
          Save note
        </button>
      </footer>
    </section>
  </div>
);

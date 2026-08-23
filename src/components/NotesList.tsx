import { Archive, FileText, Check, MoveUpRight, NotebookPen, Trash2 } from "lucide-react";
import type { WorkspaceNote, WorkspaceNoteFilter } from "../domain/ticketNotes";
import { formatNoteDate } from "./notesWorkspaceShared";

export interface NotesListProps {
  notes: WorkspaceNote[];
  /** True when the type filter is hiding notes that do exist. */
  hasFilteredOut: boolean;
  typeFilter: WorkspaceNoteFilter;
  showArchive: boolean;
  /** Short container name for the empty-state copy. */
  nick: string;
  canMoveToGeneral: boolean;
  editingNoteId?: string;
  editingText: string;
  currentDate: Date;
  onToggleDone: (note: WorkspaceNote) => void;
  onArchive: (note: WorkspaceNote) => void;
  onMoveToGeneral: (note: WorkspaceNote) => void;
  onDelete: (note: WorkspaceNote) => void;
  onStartEdit: (note: WorkspaceNote) => void;
  onEditingTextChange: (value: string) => void;
  onCommitEdit: (noteId: string) => void;
  onCancelEdit: () => void;
}

/** The note/to-do rows for the selected container, with inline editing and row actions. */
export const NotesList = ({
  notes,
  hasFilteredOut,
  typeFilter,
  showArchive,
  nick,
  canMoveToGeneral,
  editingNoteId,
  editingText,
  currentDate,
  onToggleDone,
  onArchive,
  onMoveToGeneral,
  onDelete,
  onStartEdit,
  onEditingTextChange,
  onCommitEdit,
  onCancelEdit
}: NotesListProps) => {
  if (!notes.length) {
    return (
      <div className="notes-empty">
        <span>
          <NotebookPen size={20} />
        </span>
        <strong>
          {hasFilteredOut
            ? `No ${typeFilter === "todo" ? "to-dos" : "plain notes"} here`
            : showArchive
              ? `No archived notes on ${nick}`
              : `No notes on ${nick} yet`}
        </strong>
        <p>
          {hasFilteredOut
            ? "Switch the filter to see the other items."
            : showArchive
              ? "Archive a note with the box icon — it moves here, out of the way."
              : "Jot anything below — a gotcha, a reminder, a link."}
        </p>
      </div>
    );
  }

  return (
    <div className="notes-list" aria-label={showArchive ? "Archived notes" : "Notes"}>
      {notes.map((note) => (
        <article className={`notes-row${note.done ? " is-done" : ""}`} key={note.id}>
          {note.type === "todo" ? (
            <button
              type="button"
              className="notes-checkbox"
              aria-label={note.done ? "Mark to-do open" : "Mark to-do done"}
              aria-pressed={note.done}
              onClick={() => onToggleDone(note)}
            >
              {note.done ? <Check size={12} /> : null}
            </button>
          ) : (
            <FileText className="notes-text-icon" size={15} />
          )}
          <div className="notes-row-copy">
            {editingNoteId === note.id ? (
              <input
                className="notes-inline-edit"
                value={editingText}
                onChange={(event) => onEditingTextChange(event.target.value)}
                onBlur={() => onCommitEdit(note.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onCommitEdit(note.id);
                  if (event.key === "Escape") {
                    event.preventDefault();
                    onCancelEdit();
                  }
                }}
                autoFocus
              />
            ) : (
              <button type="button" className="notes-row-text" onClick={() => onStartEdit(note)}>
                {note.text}
              </button>
            )}
            <time dateTime={note.createdAt}>{formatNoteDate(note.createdAt, currentDate)}</time>
          </div>
          <div className="notes-row-actions">
            <button
              type="button"
              onClick={() => onArchive(note)}
              aria-label={showArchive ? "Restore from archive" : "Archive note"}
              title={showArchive ? "Restore from archive" : "Archive note"}
            >
              <Archive size={13} />
            </button>
            {canMoveToGeneral ? (
              <button
                type="button"
                onClick={() => onMoveToGeneral(note)}
                aria-label="Move to General notes"
                title="Move to General notes"
              >
                <MoveUpRight size={13} />
              </button>
            ) : null}
            <button type="button" onClick={() => onDelete(note)} aria-label="Delete note" title="Delete note">
              <Trash2 size={13} />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
};

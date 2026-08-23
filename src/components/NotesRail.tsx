import type { CSSProperties } from "react";
import { BookOpen, CheckCircle2, ChevronsLeft, Lightbulb, LockKeyhole, NotebookPen, Plus } from "lucide-react";
import {
  GENERAL_NOTES_CONTAINER_ID,
  countOpenWorkspaceTodos,
  notebookContainerId,
  type NoteNotebook,
  type NoteTicketActivity,
  type NoteTicketScope,
  type WorkspaceNoteBucket
} from "../domain/ticketNotes";
import { accentForKey, formatRecency, issueTypeLabel, type BucketMap } from "./notesWorkspaceShared";

export interface NotesRailProps {
  open: boolean;
  notebooks: NoteNotebook[];
  buckets: BucketMap;
  scopedTickets: NoteTicketActivity[];
  linkedBuckets: WorkspaceNoteBucket[];
  selectedContainer: string;
  scope: NoteTicketScope;
  notebookAdding: boolean;
  notebookName: string;
  currentDate: Date;
  onChooseContainer: (containerId: string) => void;
  onScopeChange: (scope: NoteTicketScope) => void;
  onOpenNewNote: () => void;
  onClose: () => void;
  onStartNotebookAdd: () => void;
  onNotebookNameChange: (value: string) => void;
  onCancelNotebookAdd: () => void;
  onCreateNotebook: () => void;
}

/** Left rail: notebooks, scoped ticket activity and search-linked buckets. */
export const NotesRail = ({
  open,
  notebooks,
  buckets,
  scopedTickets,
  linkedBuckets,
  selectedContainer,
  scope,
  notebookAdding,
  notebookName,
  currentDate,
  onChooseContainer,
  onScopeChange,
  onOpenNewNote,
  onClose,
  onStartNotebookAdd,
  onNotebookNameChange,
  onCancelNotebookAdd,
  onCreateNotebook
}: NotesRailProps) => {
  const renderTicket = (ticket: NoteTicketActivity | WorkspaceNoteBucket, linked = false) => {
    const jira = "lastWorkedAt" in ticket ? ticket : ticket.jira!;
    const key = jira.key.toUpperCase();
    const openCount = countOpenWorkspaceTodos(buckets[key]?.notes ?? []);
    const selected = selectedContainer === key;
    const done = jira.statusCategory === "done";
    const color = accentForKey(key);
    return (
      <button
        type="button"
        key={key}
        className={`notes-ticket-row${selected ? " is-selected" : ""}${done ? " is-done" : ""}`}
        onClick={() => onChooseContainer(key)}
        style={{ "--ticket-color": color } as CSSProperties}
      >
        <span className="notes-ticket-bar" />
        <span className="notes-ticket-copy">
          <span className="notes-ticket-key">
            {key}
            {done ? <CheckCircle2 size={12} aria-label="Done" /> : null}
          </span>
          <span className="notes-ticket-title">{jira.summary}</span>
        </span>
        {linked ? <span className="notes-type-badge">{issueTypeLabel(jira)}</span> : null}
        <span className="notes-ticket-tail">
          {openCount ? <span className="notes-open-count">{openCount} open</span> : null}
          {"lastWorkedAt" in ticket ? (
            <span className="notes-recency">{formatRecency(ticket.lastWorkedAt, currentDate)}</span>
          ) : null}
        </span>
      </button>
    );
  };

  const generalOpenCount = countOpenWorkspaceTodos(buckets[GENERAL_NOTES_CONTAINER_ID]?.notes ?? []);

  return (
    <>
      {!open ? null : (
        <button type="button" className="notes-rail-scrim" aria-label="Close notes sidebar" onClick={onClose} />
      )}
      <aside className={`notes-rail${open ? " is-open" : ""}`} aria-label="Notes">
        <div className="notes-rail-header">
          <span className="notes-rail-icon">
            <NotebookPen size={15} />
          </span>
          <strong>Notes</strong>
          <button type="button" className="notes-icon-button" onClick={onOpenNewNote} aria-label="New note">
            <Plus size={15} />
          </button>
          <button type="button" className="notes-icon-button" onClick={onClose} aria-label="Collapse notes sidebar">
            <ChevronsLeft size={15} />
          </button>
        </div>

        <div className="notes-scope" aria-label="Ticket activity range">
          {(["today", "week", "all"] as const).map((value) => (
            <button
              type="button"
              key={value}
              className={scope === value ? "is-active" : ""}
              onClick={() => onScopeChange(value)}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>

        <div className="notes-rail-scroll">
          <section className="notes-rail-section">
            <div className="notes-section-heading">
              <span>Notebooks</span>
              <i />
              <button type="button" onClick={onStartNotebookAdd} aria-label="Create notebook">
                <Plus size={12} />
              </button>
            </div>
            <button
              type="button"
              className={`notes-notebook-row${selectedContainer === GENERAL_NOTES_CONTAINER_ID ? " is-selected" : ""}`}
              onClick={() => onChooseContainer(GENERAL_NOTES_CONTAINER_ID)}
            >
              <span className="notes-notebook-icon">
                <Lightbulb size={12} />
              </span>
              <span>General notes</span>
              {generalOpenCount ? <em>{generalOpenCount} open</em> : null}
            </button>
            {notebooks.map((notebook) => {
              const containerId = notebookContainerId(notebook.id);
              const openCount = countOpenWorkspaceTodos(buckets[containerId]?.notes ?? []);
              return (
                <button
                  type="button"
                  className={`notes-notebook-row${selectedContainer === containerId ? " is-selected" : ""}`}
                  onClick={() => onChooseContainer(containerId)}
                  key={notebook.id}
                >
                  <span className="notes-notebook-icon">
                    <BookOpen size={12} />
                  </span>
                  <span>{notebook.title}</span>
                  {openCount ? <em>{openCount} open</em> : null}
                </button>
              );
            })}
            {notebookAdding ? (
              <input
                className="notes-notebook-input"
                value={notebookName}
                onChange={(event) => onNotebookNameChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onCreateNotebook();
                  if (event.key === "Escape") onCancelNotebookAdd();
                }}
                placeholder="Notebook name… (Enter)"
                autoFocus
              />
            ) : null}
          </section>

          <section className="notes-rail-section">
            <div className="notes-section-heading notes-ticket-heading">
              <span>
                {scopedTickets.length} {scopedTickets.length === 1 ? "ticket" : "tickets"} ·{" "}
                {scope === "today" ? "worked today" : scope === "week" ? "worked this week" : "all time"}
              </span>
              <i />
            </div>
            <div className="notes-ticket-list">
              {scopedTickets.map((ticket) => renderTicket(ticket))}
              {!scopedTickets.length ? (
                <p className="notes-scope-empty">Nothing tracked in this range. Switch to All…</p>
              ) : null}
            </div>
          </section>

          {linkedBuckets.length ? (
            <section className="notes-rail-section">
              <div className="notes-section-heading">
                <span>Linked via search</span>
                <i />
              </div>
              <div className="notes-ticket-list">{linkedBuckets.map((bucket) => renderTicket(bucket, true))}</div>
            </section>
          ) : null}
        </div>

        <footer className="notes-rail-footer">
          <LockKeyhole size={11} />
          <span>Local only · never synced to Jira</span>
        </footer>
      </aside>
    </>
  );
};

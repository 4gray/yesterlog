import {
  Archive,
  ChevronsRight,
  FileText,
  GitPullRequest,
  ListTodo,
  LoaderCircle,
  LockKeyhole,
  Sparkles
} from "lucide-react";
import {
  GENERAL_NOTES_CONTAINER_ID,
  deleteWorkspaceNote,
  markAllWorkspaceTodosDone,
  setWorkspaceNoteArchived,
  setWorkspaceNoteDone
} from "../domain/ticketNotes";
import { NotesAiPanel } from "./NotesAiPanel";
import { NotesList } from "./NotesList";
import { NotesNewNoteModal } from "./NotesNewNoteModal";
import { NotesPrPanel } from "./NotesPrPanel";
import { NotesRail } from "./NotesRail";
import { ScratchpadEditor } from "./ScratchpadEditor";
import { pullRequestTargetId } from "./notesWorkspaceShared";
import { useNotesWorkspace, type NotesWorkspaceProps } from "./useNotesWorkspace";

export type { NotesWorkspaceProps } from "./useNotesWorkspace";

/**
 * Ticket Notes view. All state and behavior live in useNotesWorkspace; this
 * component only composes the rail, editor surfaces, panels and modal.
 */
export const NotesWorkspace = (props: NotesWorkspaceProps) => {
  const { settings, currentDate, isDemo } = props;
  const {
    addNoteToContainer,
    baseVisibleNotes,
    buckets,
    chooseContainer,
    commitEdit,
    composerText,
    composerTodo,
    counts,
    createNotebook,
    currentBriefing,
    editingNoteId,
    editingText,
    editorStyle,
    flushScratchpad,
    generalSurface,
    hasTodoText,
    isBriefingOpen,
    isPrOpen,
    linkedBuckets,
    linkedPullRequest,
    loadError,
    moveNoteToGeneral,
    mutateBucket,
    newNoteOpen,
    newNoteSearch,
    newNoteText,
    newNoteTodo,
    notebookAdding,
    notebookName,
    notebooks,
    openBriefing,
    openNewNote,
    pendingPrTasks,
    prAvailable,
    progress,
    retryLoad,
    saveNewNote,
    scheduleScratchpadSave,
    scope,
    scopedTickets,
    scratchpadEditorState,
    scratchpadError,
    scratchpadLineCount,
    scratchpadSaveState,
    scratchpadText,
    scratchpadWordCount,
    searchLoading,
    selectedContainer,
    selectedJiraKey,
    selectedMeta,
    selectedPr,
    selectedPrAllClear,
    selectedPrEntry,
    selectedPrOpenItemCount,
    selectedPrTasksForPanel,
    selectedTarget,
    setBriefingOpen,
    setComposerText,
    setComposerTodo,
    setEditingNoteId,
    setEditingText,
    setGeneralSurface,
    setNewNoteOpen,
    setNewNoteSearch,
    setNewNoteTarget,
    setNewNoteTargetOption,
    setNewNoteText,
    setNewNoteTodo,
    setNotebookAdding,
    setNotebookName,
    setPrCache,
    setPrOpen,
    setScope,
    setScratchpadPlainText,
    setShowArchive,
    setSidebarOpen,
    setTypeFilter,
    showArchive,
    showLoading,
    showScratchpad,
    sidebarOpen,
    targetOptions,
    togglePrTask,
    typeFilter,
    visibleNotes
  } = useNotesWorkspace(props);

  if (showLoading) {
    return (
      <section className="notes-workspace notes-workspace-loading" aria-label="Notes workspace">
        <LoaderCircle className="notes-spinner" size={18} />
        <span>Loading local notes…</span>
      </section>
    );
  }

  if (loadError) {
    return (
      <section
        className="notes-workspace notes-workspace-loading is-error"
        aria-label="Notes workspace"
        aria-live="polite"
      >
        <span>Local notes could not be opened.</span>
        <button type="button" onClick={retryLoad}>
          Retry
        </button>
      </section>
    );
  }

  return (
    <section className="notes-workspace" aria-label="Notes workspace" style={editorStyle}>
      <header className="notes-titlebar">Yesterlog — Notes</header>
      <div className="notes-workspace-body">
        <NotesRail
          open={sidebarOpen}
          notebooks={notebooks}
          buckets={buckets}
          scopedTickets={scopedTickets}
          linkedBuckets={linkedBuckets}
          selectedContainer={selectedContainer}
          scope={scope}
          notebookAdding={notebookAdding}
          notebookName={notebookName}
          currentDate={currentDate}
          onChooseContainer={chooseContainer}
          onScopeChange={setScope}
          onOpenNewNote={openNewNote}
          onClose={() => setSidebarOpen(false)}
          onStartNotebookAdd={() => {
            setNotebookAdding(true);
            setNotebookName("");
          }}
          onNotebookNameChange={setNotebookName}
          onCancelNotebookAdd={() => {
            setNotebookAdding(false);
            setNotebookName("");
          }}
          onCreateNotebook={createNotebook}
        />

        <main className="notes-editor">
          <header className="notes-editor-header">
            <div className="notes-editor-context">
              {!sidebarOpen ? (
                <button
                  type="button"
                  className="notes-expand-button"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Expand notes sidebar"
                >
                  <ChevronsRight size={15} />
                </button>
              ) : null}
              {selectedMeta.idLabel ? (
                <span className="notes-editor-key">{selectedMeta.idLabel}</span>
              ) : null}
              <span className={`notes-status-pill is-${selectedMeta.statusKind}`}>
                {selectedMeta.statusLabel}
              </span>
              <span className="notes-editor-meta">{selectedMeta.metaLine}</span>
            </div>
            <h1>{selectedMeta.title}</h1>
            <div
              className={`notes-toolbar${selectedMeta.isGeneral ? " is-general" : ""}`}
            >
              {selectedMeta.isGeneral ? (
                <div
                  className="notes-surface-tabs"
                  role="tablist"
                  aria-label="General notes view"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={generalSurface === "scratchpad"}
                    aria-controls="general-scratchpad-panel"
                    className={generalSurface === "scratchpad" ? "is-active" : ""}
                    onClick={() => {
                      setShowArchive(false);
                      setGeneralSurface("scratchpad");
                    }}
                  >
                    <FileText size={12} />
                    Scratchpad
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={generalSurface === "items"}
                    aria-controls="general-items-panel"
                    className={generalSurface === "items" ? "is-active" : ""}
                    onClick={() => {
                      flushScratchpad();
                      setGeneralSurface("items");
                    }}
                  >
                    <ListTodo size={12} />
                    Notes &amp; to-dos
                    {counts.total ? <span>{counts.total}</span> : null}
                  </button>
                </div>
              ) : null}

              {showScratchpad ? (
                <span
                  className={`notes-scratchpad-save is-${scratchpadSaveState}`}
                  role={scratchpadSaveState === "error" ? "alert" : "status"}
                >
                  {scratchpadSaveState === "saving"
                    ? "Saving…"
                    : scratchpadSaveState === "error"
                      ? "Could not save"
                      : "Saved locally"}
                </span>
              ) : (
                <>
                  <div className="notes-filter-chips" role="group" aria-label="Note type">
                    {([
                      ["all", "All"],
                      ["todo", "To-dos"],
                      ["text", "Notes"]
                    ] as const).map(([value, label]) => (
                      <button
                        type="button"
                        className={typeFilter === value ? "is-active" : ""}
                        onClick={() => setTypeFilter(value)}
                        key={value}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <span className="notes-progress">
                    {progress.total
                      ? `${progress.done} of ${progress.total} done`
                      : counts.total
                        ? `${counts.total} ${counts.total === 1 ? "note" : "notes"}`
                        : ""}
                  </span>
                  {prAvailable && !showArchive ? (
                    <button
                      type="button"
                      className={`notes-tool-button is-pr${isPrOpen ? " is-open" : ""}`}
                      onClick={() =>
                        selectedJiraKey &&
                        setPrOpen((current) => ({
                          ...current,
                          [selectedJiraKey]: !current[selectedJiraKey]
                        }))
                      }
                    >
                      <GitPullRequest size={11} />
                      PR #{selectedPr?.pullRequestId ?? linkedPullRequest?.pullRequestId ?? 472}
                      {selectedPrOpenItemCount > 0 ? (
                        <i aria-label="Open pull request items" />
                      ) : null}
                    </button>
                  ) : null}
                  {selectedMeta.jira && !showArchive ? (
                    <button
                      type="button"
                      className={`notes-tool-button is-ai${isBriefingOpen ? " is-open" : ""}`}
                      onClick={() => void openBriefing()}
                      title={
                        settings.aiEnabled || isDemo
                          ? "AI briefing — risks and questions from ticket data"
                          : "Enable an AI provider in Settings"
                      }
                    >
                      {currentBriefing?.status === "loading" ? (
                        <LoaderCircle className="notes-spinner" size={11} />
                      ) : (
                        <Sparkles size={11} />
                      )}
                      {currentBriefing?.status === "loading" ? "Analyzing…" : "AI briefing"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={`notes-tool-button${showArchive ? " is-archive-open" : ""}`}
                    onClick={() => setShowArchive((current) => !current)}
                  >
                    <Archive size={11} />
                    Archive · {counts.archived}
                  </button>
                </>
              )}
            </div>
          </header>

          {selectedMeta.jira?.statusCategory === "done" && progress.open > 0 && !showArchive ? (
            <div className="notes-mark-all">
              <span>
                Ticket is done, but <strong>{progress.open} {progress.open === 1 ? "item is" : "items are"}</strong> unchecked.
              </span>
              <button
                type="button"
                onClick={() =>
                  mutateBucket(selectedContainer, selectedMeta.jira, (bucket) =>
                    markAllWorkspaceTodosDone(bucket, new Date().toISOString())
                  )
                }
              >
                Mark all done
              </button>
            </div>
          ) : null}

          {showScratchpad ? (
            <div
              className="notes-editor-scroll notes-scratchpad-scroll"
              id="general-scratchpad-panel"
              role="tabpanel"
              aria-label="General scratchpad"
            >
              <div className="notes-editor-column notes-scratchpad-column">
                <section className="notes-scratchpad-sheet">
                  <ScratchpadEditor
                    initialText={scratchpadText}
                    initialEditorState={scratchpadEditorState}
                    onChange={scheduleScratchpadSave}
                    onPlainTextChange={setScratchpadPlainText}
                    onBlur={flushScratchpad}
                    onError={scratchpadError}
                  />
                  <footer>
                    <span>
                      <LockKeyhole size={11} />
                      Local only · never included in Jira or AI briefings
                    </span>
                    <span>
                      {scratchpadWordCount} {scratchpadWordCount === 1 ? "word" : "words"}
                      {scratchpadLineCount
                        ? ` · ${scratchpadLineCount} ${scratchpadLineCount === 1 ? "line" : "lines"}`
                        : ""}
                    </span>
                  </footer>
                </section>
              </div>
            </div>
          ) : (
            <div
              className="notes-editor-scroll"
              id={selectedMeta.isGeneral ? "general-items-panel" : undefined}
              role={selectedMeta.isGeneral ? "tabpanel" : undefined}
              aria-label={
                selectedMeta.isGeneral ? "General notes and to-dos" : undefined
              }
            >
              <div className="notes-editor-column">
              {isPrOpen && prAvailable && !showArchive ? (
                <NotesPrPanel
                  pr={selectedPr}
                  isLoading={selectedPrEntry?.status === "loading"}
                  fallbackId={linkedPullRequest?.pullRequestId}
                  fallbackTitle={linkedPullRequest?.title}
                  tasksForPanel={selectedPrTasksForPanel}
                  allClear={selectedPrAllClear}
                  isTaskPending={(taskId) =>
                    Boolean(selectedPr && pendingPrTasks.has(`${pullRequestTargetId(selectedPr)}/${taskId}`))
                  }
                  hasTodoText={hasTodoText}
                  onToggleTask={(taskId) => void togglePrTask(taskId)}
                  onAddTodo={(text) =>
                    addNoteToContainer(selectedContainer, text, "todo", selectedMeta.jira)
                  }
                  onClose={() =>
                    selectedJiraKey &&
                    setPrOpen((current) => ({ ...current, [selectedJiraKey]: false }))
                  }
                  onRetry={() =>
                    selectedJiraKey &&
                    setPrCache((current) => {
                      const next = { ...current };
                      delete next[selectedJiraKey];
                      return next;
                    })
                  }
                />
              ) : null}

              {isBriefingOpen && currentBriefing && !showArchive ? (
                <NotesAiPanel
                  briefing={currentBriefing}
                  hasTodoText={hasTodoText}
                  onAddTodo={(text) =>
                    addNoteToContainer(selectedContainer, text, "todo", selectedMeta.jira)
                  }
                  onClose={() =>
                    selectedJiraKey &&
                    setBriefingOpen((current) => ({ ...current, [selectedJiraKey]: false }))
                  }
                />
              ) : null}

              <NotesList
                notes={visibleNotes}
                hasFilteredOut={typeFilter !== "all" && baseVisibleNotes.length > 0}
                typeFilter={typeFilter}
                showArchive={showArchive}
                nick={selectedMeta.nick}
                canMoveToGeneral={!showArchive && !selectedMeta.isGeneral && !selectedMeta.isNotebook}
                editingNoteId={editingNoteId}
                editingText={editingText}
                currentDate={currentDate}
                onToggleDone={(note) =>
                  mutateBucket(selectedContainer, selectedMeta.jira, (bucket) =>
                    setWorkspaceNoteDone(bucket, note.id, !note.done, new Date().toISOString())
                  )
                }
                onArchive={(note) =>
                  mutateBucket(selectedContainer, selectedMeta.jira, (bucket) =>
                    setWorkspaceNoteArchived(bucket, note.id, !showArchive, new Date().toISOString())
                  )
                }
                onMoveToGeneral={moveNoteToGeneral}
                onDelete={(note) =>
                  mutateBucket(selectedContainer, selectedMeta.jira, (bucket) =>
                    deleteWorkspaceNote(bucket, note.id)
                  )
                }
                onStartEdit={(note) => {
                  setEditingNoteId(note.id);
                  setEditingText(note.text);
                }}
                onEditingTextChange={setEditingText}
                onCommitEdit={commitEdit}
                onCancelEdit={() => {
                  setEditingNoteId(undefined);
                  setEditingText("");
                }}
              />
              </div>
            </div>
          )}

          {!showScratchpad ? (
            <footer className="notes-composer-shell">
              <div className="notes-editor-column">
                {!showArchive ? (
                  <div className="notes-composer">
                  <button
                    type="button"
                    className={composerTodo ? "is-active" : ""}
                    onClick={() => setComposerTodo((current) => !current)}
                    aria-label={composerTodo ? "Add as plain note" : "Add as to-do"}
                    aria-pressed={composerTodo}
                  >
                    <ListTodo size={15} />
                  </button>
                  <input
                    value={composerText}
                    onChange={(event) => setComposerText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        const added = addNoteToContainer(
                          selectedContainer,
                          composerText,
                          composerTodo ? "todo" : "text",
                          selectedMeta.jira
                        );
                        if (added) setComposerText("");
                      }
                    }}
                    placeholder={`Add a ${composerTodo ? "to-do" : "note"} to ${selectedMeta.nick}…`}
                  />
                  <button
                    type="button"
                    className="notes-add-button"
                    onClick={() => {
                      const added = addNoteToContainer(
                        selectedContainer,
                        composerText,
                        composerTodo ? "todo" : "text",
                        selectedMeta.jira
                      );
                      if (added) setComposerText("");
                    }}
                    disabled={!composerText.trim()}
                  >
                    Add
                  </button>
                  </div>
                ) : (
                  <p className="notes-archive-caption">
                    Viewing archived notes — restore one to bring it back.
                  </p>
                )}
              </div>
            </footer>
          ) : null}
        </main>
      </div>

      {newNoteOpen ? (
        <NotesNewNoteModal
          text={newNoteText}
          todo={newNoteTodo}
          search={newNoteSearch}
          searchLoading={searchLoading}
          targetOptions={targetOptions}
          selectedTarget={selectedTarget}
          onClose={() => setNewNoteOpen(false)}
          onSave={saveNewNote}
          onTextChange={setNewNoteText}
          onToggleTodo={() => setNewNoteTodo((current) => !current)}
          onSearchChange={setNewNoteSearch}
          onPickTarget={(target) => {
            setNewNoteTarget(target.containerId);
            setNewNoteTargetOption(target);
          }}
          onResetTarget={() => {
            setNewNoteTarget(GENERAL_NOTES_CONTAINER_ID);
            setNewNoteTargetOption(undefined);
          }}
        />
      ) : null}
    </section>
  );
};

import { Button } from "./Button";
import { Modal } from "./Modal";
import type { useAppDataTransfer } from "../app/useAppDataTransfer";

const labels: Record<string, string> = {
  settings: "Settings and account context", weekOverrides: "Calendar overrides", syncResults: "Jira weekly history",
  jiraActivityResults: "Jira activity", favorites: "Favorites", personalNotes: "Personal notes",
  bitbucketReviewResults: "Bitbucket activity weeks", prAnalytics: "Saved PR analytics", recurringEvents: "Recurring events",
  recurringOccurrences: "Recurring dates", reconstructDrafts: "Reconstruction drafts",
  reconstructAiDrafts: "AI drafts", recapDrafts: "Recap drafts", savedRecaps: "Saved recaps",
  worklogAllocationPreferences: "Worklog allocations", jiraWorklogs: "Jira worklogs",
  workspaceNotes: "Note documents", noteNotebooks: "Notebooks"
};

const nestedEntries: Record<string, string> = {
  favorites: "keys", personalNotes: "notes", recurringEvents: "events",
  recurringOccurrences: "occurrences", noteNotebooks: "notebooks"
};
const countEntries = (name: string, rows: Record<string, unknown>[]) => nestedEntries[name]
  ? rows.reduce((sum, row) => sum + (row[nestedEntries[name]] as unknown[]).length, 0)
  : rows.length;

export const DataTransferDialog = ({ transfer, isDirty }: {
  transfer: ReturnType<typeof useAppDataTransfer>;
  isDirty: boolean;
}) => (
  <>
    <input ref={transfer.inputRef} type="file" accept=".json,application/json" hidden aria-label="Yesterlog backup file"
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (file) void transfer.readBackup(file);
      }} />
    {transfer.isOpen && (
      <Modal label={transfer.backup ? "Restore backup" : "Data transfer"} onClose={transfer.close}
        closeOnEscape={!transfer.progress} panelClassName="data-transfer-dialog">
        <h2>{transfer.backup ? "Restore backup" : "Data transfer"}</h2>
        {transfer.progress ? <p role="status">{transfer.progress}</p> : transfer.backup && (
          <>
            <p>Created {new Date(transfer.backup.exportedAt).toLocaleString()} · Yesterlog {transfer.backup.appVersion}</p>
            <dl className="backup-counts">
              {Object.entries(transfer.backup.stores).map(([name, rows]) => (
                <div key={name}><dt>{labels[name]}</dt><dd>{countEntries(name, rows)}</dd></div>
              ))}
            </dl>
            <p>This replaces all data on this computer. Export a current backup first if you want to keep it.</p>
            <p>API tokens are not included. Reconnect Jira after restoring; configure Bitbucket and AI separately.</p>
            {isDirty && <label className="backup-discard">
              <input type="checkbox" checked={transfer.discardDraft}
                onChange={(event) => transfer.setDiscardDraft(event.currentTarget.checked)} />
              Discard my unsaved settings changes when restoring
            </label>}
            <div className="backup-actions">
              <Button onClick={transfer.close}>Cancel</Button>
              <Button onClick={() => void transfer.exportBackup()} disabled={isDirty}>Export current data</Button>
              <Button variant="primary" onClick={() => void transfer.restore()} disabled={isDirty && !transfer.discardDraft}>
                Replace all data and restore
              </Button>
            </div>
          </>
        )}
      </Modal>
    )}
  </>
);

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type {
  AddWorklogRequest,
  AddWorklogResult,
  AppSettings,
  DeleteWorklogRequest,
  DeleteWorklogResult,
  JiraTicket,
  JiraWorklog,
  SyncResult,
  UpdateWorklogRequest,
  UpdateWorklogResult,
  WorklogAllocationDirection,
  WorklogAllocationPreference
} from "../../shared/types";
import { nativeApi } from "../api/native";
import { mergeCreatedWorklogIntoSyncResult, mergeUpdatedWorklogIntoSyncResult } from "../domain/syncResult";
import {
  deleteWorklogAllocationPreference as deleteWorklogAllocationPreferenceFromStorage,
  saveSyncResult as saveSyncResultToStorage,
  saveWorklogAllocationPreference as saveWorklogAllocationPreferenceToStorage
} from "../storage/db";
import { formatDuration } from "../utils/date";
import { normalizeJiraSiteInput } from "./appHelpers";

export interface JiraWorklogsClient {
  addWorklog(request: AddWorklogRequest): Promise<AddWorklogResult>;
  updateWorklog(request: UpdateWorklogRequest): Promise<UpdateWorklogResult>;
  deleteWorklog(request: DeleteWorklogRequest): Promise<DeleteWorklogResult>;
}

export interface JiraWorklogPayload {
  issueKey: string;
  ticket: JiraTicket;
  timeSpentSeconds: number;
  startedISO: string;
  comment?: string;
  allocationDirection?: WorklogAllocationDirection;
}

interface UseJiraWorklogsOptions {
  settings: AppSettings;
  syncResult?: SyncResult;
  editingWorklog?: JiraWorklog;
  isDemo: boolean;
  client?: JiraWorklogsClient;
  saveSyncResult?: (result: SyncResult) => Promise<void>;
  saveWorklogAllocationPreference?: (preference: WorklogAllocationPreference) => Promise<void>;
  deleteWorklogAllocationPreference?: (preferenceKey: string) => Promise<void>;
  onWorklogAllocationPreference?: (preference: WorklogAllocationPreference) => void;
  onWorklogAllocationPreferenceRemoved?: (preferenceKey: string) => void;
  runSync: (
    settingsForSync?: AppSettings,
    options?: { queueAfterCurrent?: boolean }
  ) => Promise<SyncResult | undefined>;
  loadTickets: (settingsForLoad?: AppSettings) => Promise<unknown>;
  onSyncResult: (result: SyncResult) => void;
  setEditingWorklog: Dispatch<SetStateAction<JiraWorklog | undefined>>;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

export const useJiraWorklogs = ({
  settings,
  syncResult,
  editingWorklog,
  isDemo,
  client = nativeApi,
  saveSyncResult = saveSyncResultToStorage,
  saveWorklogAllocationPreference = saveWorklogAllocationPreferenceToStorage,
  deleteWorklogAllocationPreference = deleteWorklogAllocationPreferenceFromStorage,
  onWorklogAllocationPreference,
  onWorklogAllocationPreferenceRemoved,
  runSync,
  loadTickets,
  onSyncResult,
  setEditingWorklog,
  showSuccess,
  showError
}: UseJiraWorklogsOptions) => {
  const [isLogging, setIsLogging] = useState(false);
  const [isDeletingWorklog, setIsDeletingWorklog] = useState(false);
  const [logError, setLogError] = useState<string | undefined>();

  const rememberAllocationPreference = useCallback(
    async (
      worklogId: string,
      direction: WorklogAllocationDirection | undefined,
      context: SyncResult | undefined,
      fallbackAuthorAccountId?: string
    ) => {
      if (!direction) {
        return true;
      }
      const jiraSite = normalizeJiraSiteInput(settings.jiraBaseUrl);
      const authorAccountId =
        context?.jiraSite === jiraSite ? context.accountId : fallbackAuthorAccountId;
      if (!jiraSite || !authorAccountId) {
        return false;
      }
      const timestamp = new Date().toISOString();
      const preference: WorklogAllocationPreference = {
        preferenceKey: JSON.stringify([jiraSite, authorAccountId, worklogId]),
        jiraSite,
        authorAccountId,
        worklogId,
        direction,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      try {
        await saveWorklogAllocationPreference(preference);
        onWorklogAllocationPreference?.(preference);
        return true;
      } catch (error) {
        // Jira has already accepted the write at this point. Treat the local
        // direction as best-effort so an IndexedDB failure cannot make the user
        // retry and accidentally create a duplicate Jira worklog.
        console.error("Unable to save the local bulk-worklog direction.", error);
        return true;
      }
    },
    [
      onWorklogAllocationPreference,
      saveWorklogAllocationPreference,
      settings.jiraBaseUrl
    ]
  );

  const forgetAllocationPreference = useCallback(
    async (
      worklogId: string,
      context: SyncResult | undefined,
      fallbackAuthorAccountId?: string
    ) => {
      const jiraSite = normalizeJiraSiteInput(settings.jiraBaseUrl);
      const authorAccountId =
        context?.jiraSite === jiraSite ? context.accountId : fallbackAuthorAccountId;
      if (!jiraSite || !authorAccountId) {
        return;
      }
      const preferenceKey = JSON.stringify([jiraSite, authorAccountId, worklogId]);
      try {
        await deleteWorklogAllocationPreference(preferenceKey);
        onWorklogAllocationPreferenceRemoved?.(preferenceKey);
      } catch (error) {
        // Jira has already accepted the update/delete. Keep local cleanup
        // best-effort so retrying cannot duplicate or overwrite a Jira write.
        console.error("Unable to remove the local bulk-worklog direction.", error);
      }
    },
    [
      deleteWorklogAllocationPreference,
      onWorklogAllocationPreferenceRemoved,
      settings.jiraBaseUrl
    ]
  );

  const handleAddWorklog = useCallback(
    async (payload: JiraWorklogPayload) => {
      setIsLogging(true);
      setLogError(undefined);

      try {
        if (isDemo) {
          showSuccess(`Demo logged ${formatDuration(payload.timeSpentSeconds / 3600)} to ${payload.issueKey}.`);
          return true;
        }

        const { ticket, allocationDirection, ...worklogPayload } = payload;
        const result = await client.addWorklog({ settings, ...worklogPayload });
        const preferenceHandled = await rememberAllocationPreference(
          result.worklogId,
          allocationDirection,
          syncResult
        );
        showSuccess(`Logged ${formatDuration(result.timeSpentSeconds / 3600)} to ${result.issueKey}.`);
        const syncedResult = await runSync(settings, { queueAfterCurrent: true });
        if (!preferenceHandled) {
          await rememberAllocationPreference(result.worklogId, allocationDirection, syncedResult);
        }
        const mergedSyncResult = mergeCreatedWorklogIntoSyncResult(syncedResult ?? syncResult, {
          ticket,
          worklogId: result.worklogId,
          startedISO: payload.startedISO,
          timeSpentSeconds: result.timeSpentSeconds,
          comment: payload.comment,
          syncedAtISO: new Date().toISOString()
        });

        if (mergedSyncResult && mergedSyncResult !== syncedResult && mergedSyncResult !== syncResult) {
          await saveSyncResult(mergedSyncResult);
          onSyncResult(mergedSyncResult);
        }
        await loadTickets();
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to log time to Jira.";
        setLogError(message);
        showError(message);
        return false;
      } finally {
        setIsLogging(false);
      }
    },
    [client, isDemo, loadTickets, onSyncResult, rememberAllocationPreference, runSync, saveSyncResult, settings, showError, showSuccess, syncResult]
  );

  const handleUpdateWorklog = useCallback(
    async (payload: JiraWorklogPayload) => {
      if (!editingWorklog) {
        return false;
      }

      setIsLogging(true);
      setLogError(undefined);

      try {
        if (isDemo) {
          showSuccess(`Demo updated ${formatDuration(payload.timeSpentSeconds / 3600)} on ${editingWorklog.issueKey}.`);
          return true;
        }

        const result = await client.updateWorklog({
          settings,
          issueKey: editingWorklog.issueKey,
          worklogId: editingWorklog.id,
          timeSpentSeconds: payload.timeSpentSeconds,
          startedISO: payload.startedISO,
          comment: payload.comment
        });
        if (payload.allocationDirection) {
          await rememberAllocationPreference(
            result.worklogId,
            payload.allocationDirection,
            syncResult,
            editingWorklog.authorAccountId
          );
        } else {
          await forgetAllocationPreference(
            result.worklogId,
            syncResult,
            editingWorklog.authorAccountId
          );
        }
        showSuccess(`Updated ${formatDuration(result.timeSpentSeconds / 3600)} on ${result.issueKey}.`);
        await runSync(settings, { queueAfterCurrent: true });
        await loadTickets();
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to update Jira worklog.";
        setLogError(message);
        showError(message);
        return false;
      } finally {
        setIsLogging(false);
      }
    },
    [client, editingWorklog, forgetAllocationPreference, isDemo, loadTickets, rememberAllocationPreference, runSync, settings, showError, showSuccess, syncResult]
  );

  // Drag move/resize from the calendar: apply the geometry optimistically to the
  // cached result, persist it, then fire a single Jira update — NO full re-sync, which
  // would flash the whole view on every drop. Roll back the cache on failure.
  const handleMoveWorklog = useCallback(
    async (worklog: JiraWorklog, patch: { startedISO: string; timeSpentSeconds: number }) => {
      const optimistic = mergeUpdatedWorklogIntoSyncResult(syncResult, {
        worklogId: worklog.id,
        startedISO: patch.startedISO,
        timeSpentSeconds: patch.timeSpentSeconds,
        comment: worklog.comment,
        syncedAtISO: syncResult?.syncedAt
      });

      if (isDemo) {
        if (optimistic && optimistic !== syncResult) {
          onSyncResult(optimistic);
        }
        return true;
      }

      if (optimistic && optimistic !== syncResult) {
        onSyncResult(optimistic);
        await saveSyncResult(optimistic);
      }

      try {
        await client.updateWorklog({
          settings,
          issueKey: worklog.issueKey,
          worklogId: worklog.id,
          timeSpentSeconds: patch.timeSpentSeconds,
          startedISO: patch.startedISO,
          comment: worklog.comment
        });
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to update Jira worklog.";
        setLogError(message);
        showError(message);
        // Reconcile from the server rather than restoring a snapshot captured at call
        // time — a concurrent drag may have applied newer optimistic state that a stale
        // snapshot would clobber. If the reconcile also fails, the next sync corrects it.
        try {
          const fresh = await runSync(settings, { queueAfterCurrent: true });
          if (fresh) {
            onSyncResult(fresh);
            await saveSyncResult(fresh);
          }
        } catch {
          /* leave optimistic state in place */
        }
        return false;
      }
    },
    [client, isDemo, onSyncResult, runSync, saveSyncResult, setLogError, settings, showError, syncResult]
  );

  const handleDeleteWorklog = useCallback(async () => {
    if (!editingWorklog) {
      return false;
    }

    setIsDeletingWorklog(true);
    setLogError(undefined);

    try {
      if (isDemo) {
        showSuccess(`Demo deleted worklog from ${editingWorklog.issueKey}.`);
        setEditingWorklog(undefined);
        return true;
      }

      const result = await client.deleteWorklog({
        settings,
        issueKey: editingWorklog.issueKey,
        worklogId: editingWorklog.id
      });
      await forgetAllocationPreference(
        editingWorklog.id,
        syncResult,
        editingWorklog.authorAccountId
      );
      showSuccess(`Deleted worklog from ${result.issueKey}.`);
      await runSync(settings, { queueAfterCurrent: true });
      await loadTickets();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete Jira worklog.";
      setLogError(message);
      showError(message);
      return false;
    } finally {
      setIsDeletingWorklog(false);
    }
  }, [client, editingWorklog, forgetAllocationPreference, isDemo, loadTickets, runSync, setEditingWorklog, settings, showError, showSuccess, syncResult]);

  return {
    isLogging,
    isDeletingWorklog,
    logError,
    setIsLogging,
    setLogError,
    handleAddWorklog,
    handleUpdateWorklog,
    handleMoveWorklog,
    handleDeleteWorklog
  };
};

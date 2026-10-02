import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type {
  AddWorklogRequest,
  AddWorklogResult,
  AppSettings,
  DeleteWorklogRequest,
  DeleteWorklogResult,
  JiraTicket,
  JiraWorklog,
  MoveWorklogRequest,
  MoveWorklogResult,
  SyncResult,
  UpdateWorklogRequest,
  UpdateWorklogResult,
  WorklogAllocationDirection,
  WorklogAllocationPreference,
  WorklogEstimateAdjustment
} from "../../shared/types";
import { nativeApi } from "../api/native";
import {
  mergeCreatedWorklogIntoSyncResult,
  mergeMovedWorklogIntoSyncResult,
  mergeUpdatedWorklogIntoSyncResult,
  removeWorklogFromSyncResult
} from "../domain/syncResult";
import {
  deleteWorklogAllocationPreference as deleteWorklogAllocationPreferenceFromStorage,
  saveSyncResult as saveSyncResultToStorage,
  saveWorklogAllocationPreference as saveWorklogAllocationPreferenceToStorage
} from "../storage/db";
import { formatDuration } from "../utils/date";
import { normalizeJiraSiteInput } from "./appHelpers";
import {
  queueBackgroundJiraRefresh,
  runBackgroundTask,
  type RunJiraSync
} from "./backgroundJiraRefresh";

export interface JiraWorklogsClient {
  addWorklog(request: AddWorklogRequest): Promise<AddWorklogResult>;
  updateWorklog(request: UpdateWorklogRequest): Promise<UpdateWorklogResult>;
  deleteWorklog(request: DeleteWorklogRequest): Promise<DeleteWorklogResult>;
  moveWorklog(request: MoveWorklogRequest): Promise<MoveWorklogResult>;
}

/** Outcome of booking one worklog on several days in sequence. */
export interface BatchWorklogResult {
  created: number;
  total: number;
  error?: string;
}

export interface JiraWorklogPayload {
  issueKey: string;
  ticket: JiraTicket;
  timeSpentSeconds: number;
  startedISO: string;
  comment?: string;
  allocationDirection?: WorklogAllocationDirection;
  estimateAdjustment?: WorklogEstimateAdjustment;
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
  runSync: RunJiraSync;
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
        const preferenceHandled = rememberAllocationPreference(
          result.worklogId,
          allocationDirection,
          syncResult
        );
        const createdWorklog = {
          ticket,
          worklogId: result.worklogId,
          startedISO: payload.startedISO,
          timeSpentSeconds: result.timeSpentSeconds,
          comment: payload.comment,
          syncedAtISO: new Date().toISOString()
        };
        const optimistic = mergeCreatedWorklogIntoSyncResult(syncResult, createdWorklog);
        if (optimistic && optimistic !== syncResult) {
          onSyncResult(optimistic);
          runBackgroundTask("cache the newly created Jira worklog", () => saveSyncResult(optimistic));
        }
        runBackgroundTask("save the new worklog allocation preference", async () => {
          await preferenceHandled;
        });
        showSuccess(`Logged ${formatDuration(result.timeSpentSeconds / 3600)} to ${result.issueKey}.`);
        queueBackgroundJiraRefresh({
          settings,
          runSync,
          loadTickets,
          context: "creating a worklog",
          reconcile: async (syncedResult) => {
            if (!(await preferenceHandled)) {
              await rememberAllocationPreference(result.worklogId, allocationDirection, syncedResult);
            }
            return mergeCreatedWorklogIntoSyncResult(syncedResult, createdWorklog) ?? syncedResult;
          }
        });
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

  /**
   * "Book on several days": one ordinary POST per day, in calendar order, stopping at the first
   * Jira error so a transient failure cannot leave gaps in the middle of the batch. Optimistic
   * merges accumulate into one cache update, one summary snackbar, one background reconcile.
   */
  const handleAddWorklogs = useCallback(
    async (payloads: JiraWorklogPayload[]): Promise<BatchWorklogResult> => {
      const total = payloads.length;
      if (total === 0) {
        return { created: 0, total: 0 };
      }
      const issueKey = payloads[0].issueKey;
      const duration = formatDuration(payloads[0].timeSpentSeconds / 3600);
      const dayNames = payloads.map((payload) =>
        new Date(payload.startedISO).toLocaleDateString(undefined, { weekday: "long" })
      );
      setIsLogging(true);
      setLogError(undefined);

      try {
        if (isDemo) {
          showSuccess(`Demo booked ${duration} to ${issueKey} on ${dayNames.join(", ")}.`);
          return { created: total, total };
        }

        type Created = Parameters<typeof mergeCreatedWorklogIntoSyncResult>[1];
        const created: Created[] = [];
        let current = syncResult;
        let error: string | undefined;
        for (const payload of payloads) {
          try {
            const { ticket, allocationDirection: _direction, ...worklogPayload } = payload;
            const result = await client.addWorklog({ settings, ...worklogPayload });
            const createdWorklog: Created = {
              ticket,
              worklogId: result.worklogId,
              startedISO: payload.startedISO,
              timeSpentSeconds: result.timeSpentSeconds,
              comment: payload.comment,
              syncedAtISO: new Date().toISOString()
            };
            created.push(createdWorklog);
            current = mergeCreatedWorklogIntoSyncResult(current, createdWorklog) ?? current;
          } catch (caught) {
            error = caught instanceof Error ? caught.message : "Unable to log time to Jira.";
            break;
          }
        }

        if (current && current !== syncResult) {
          const optimistic = current;
          onSyncResult(optimistic);
          runBackgroundTask("cache the newly booked Jira worklogs", () => saveSyncResult(optimistic));
        }
        if (created.length > 0) {
          queueBackgroundJiraRefresh({
            settings,
            runSync,
            loadTickets,
            context: "booking worklogs on several days",
            reconcile: async (syncedResult) =>
              created.reduce<SyncResult>(
                (accumulated, worklog) => mergeCreatedWorklogIntoSyncResult(accumulated, worklog) ?? accumulated,
                syncedResult
              )
          });
        }

        if (error) {
          const message =
            created.length === 0
              ? error
              : `Booked ${duration} to ${issueKey} on ${created.length} of ${total} days. ${dayNames[created.length]} failed: ${error}`;
          setLogError(message);
          showError(message);
        } else {
          showSuccess(`Booked ${duration} to ${issueKey} on ${dayNames.join(", ")}.`);
        }
        return { created: created.length, total, error };
      } finally {
        setIsLogging(false);
      }
    },
    [client, isDemo, loadTickets, onSyncResult, runSync, saveSyncResult, settings, showError, showSuccess, syncResult]
  );

  const handleUpdateWorklog = useCallback(
    async (payload: JiraWorklogPayload) => {
      if (!editingWorklog) {
        return false;
      }

      setIsLogging(true);
      setLogError(undefined);

      try {
        if (payload.issueKey !== editingWorklog.issueKey) {
          if (isDemo) {
            showSuccess(`Demo moved worklog from ${editingWorklog.issueKey} to ${payload.issueKey}.`);
            return true;
          }

          const result = await client.moveWorklog({
            settings,
            sourceIssueKey: editingWorklog.issueKey,
            targetIssueKey: payload.issueKey,
            worklogId: editingWorklog.id,
            adjustEstimate: payload.estimateAdjustment ?? "auto"
          });
          const optimistic = mergeMovedWorklogIntoSyncResult(syncResult, {
            worklogId: result.worklogId,
            targetTicket: payload.ticket,
            syncedAtISO: new Date().toISOString()
          });
          if (optimistic && optimistic !== syncResult) {
            onSyncResult(optimistic);
            runBackgroundTask("cache the moved Jira worklog", () => saveSyncResult(optimistic));
          }
          showSuccess(`Moved worklog from ${result.sourceIssueKey} to ${result.targetIssueKey}.`);
          queueBackgroundJiraRefresh({
            settings,
            runSync,
            loadTickets,
            context: "moving a worklog",
            reconcile: async (syncedResult) => {
              return mergeMovedWorklogIntoSyncResult(syncedResult, {
                worklogId: result.worklogId,
                targetTicket: payload.ticket,
                syncedAtISO: new Date().toISOString()
              }) ?? syncedResult;
            }
          });
          return true;
        }

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
        const preferenceTask = payload.allocationDirection
          ? rememberAllocationPreference(
            result.worklogId,
            payload.allocationDirection,
            syncResult,
            editingWorklog.authorAccountId
          )
          : forgetAllocationPreference(
            result.worklogId,
            syncResult,
            editingWorklog.authorAccountId
          );
        runBackgroundTask("update the worklog allocation preference", async () => {
          await preferenceTask;
        });
        const updatedWorklog = {
          worklogId: result.worklogId,
          startedISO: payload.startedISO,
          timeSpentSeconds: result.timeSpentSeconds,
          comment: payload.comment ?? "",
          syncedAtISO: new Date().toISOString()
        };
        const optimistic = mergeUpdatedWorklogIntoSyncResult(syncResult, updatedWorklog);
        if (optimistic && optimistic !== syncResult) {
          onSyncResult(optimistic);
          runBackgroundTask("cache the updated Jira worklog", () => saveSyncResult(optimistic));
        }
        showSuccess(`Updated ${formatDuration(result.timeSpentSeconds / 3600)} on ${result.issueKey}.`);
        queueBackgroundJiraRefresh({
          settings,
          runSync,
          loadTickets,
          context: "updating a worklog",
          reconcile: async (syncedResult) => {
            return mergeUpdatedWorklogIntoSyncResult(syncedResult, updatedWorklog) ?? syncedResult;
          }
        });
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
    [client, editingWorklog, forgetAllocationPreference, isDemo, loadTickets, onSyncResult, rememberAllocationPreference, runSync, saveSyncResult, settings, showError, showSuccess, syncResult]
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
          const fresh = await runSync(settings, { queueAfterCurrent: true, mode: "full" });
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
      const preferenceTask = forgetAllocationPreference(
        editingWorklog.id,
        syncResult,
        editingWorklog.authorAccountId
      );
      runBackgroundTask("remove the deleted worklog allocation preference", async () => {
        await preferenceTask;
      });
      const deletedWorklog = {
        worklogId: result.worklogId,
        syncedAtISO: new Date().toISOString()
      };
      const optimistic = removeWorklogFromSyncResult(syncResult, deletedWorklog);
      if (optimistic && optimistic !== syncResult) {
        onSyncResult(optimistic);
        runBackgroundTask("cache the deleted Jira worklog", () => saveSyncResult(optimistic));
      }
      showSuccess(`Deleted worklog from ${result.issueKey}.`);
      queueBackgroundJiraRefresh({
        settings,
        runSync,
        loadTickets,
        context: "deleting a worklog",
        reconcile: async (syncedResult) => {
          return removeWorklogFromSyncResult(syncedResult, deletedWorklog) ?? syncedResult;
        }
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete Jira worklog.";
      setLogError(message);
      showError(message);
      return false;
    } finally {
      setIsDeletingWorklog(false);
    }
  }, [client, editingWorklog, forgetAllocationPreference, isDemo, loadTickets, onSyncResult, runSync, saveSyncResult, setEditingWorklog, settings, showError, showSuccess, syncResult]);

  return {
    isLogging,
    isDeletingWorklog,
    logError,
    setIsLogging,
    setLogError,
    handleAddWorklog,
    handleAddWorklogs,
    handleUpdateWorklog,
    handleMoveWorklog,
    handleDeleteWorklog
  };
};

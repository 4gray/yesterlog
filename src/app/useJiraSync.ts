import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AppSettings,
  JiraWorklogSyncBaseline,
  JiraWorklogSyncMode,
  SyncRequest,
  SyncResult
} from "../../shared/types";
import { nativeApi } from "../api/native";
import { isJiraConfigured } from "./appHelpers";
import { saveSyncResult as saveSyncResultToStorage } from "../storage/db";

export interface JiraSyncClient {
  syncJiraWorklogs(request: SyncRequest): Promise<SyncResult>;
}

interface UseJiraSyncOptions {
  settings: AppSettings;
  weekKey: string;
  weekStartISO: string;
  weekEndExclusiveISO: string;
  syncResult?: SyncResult;
  demoSyncResult?: SyncResult;
  client?: JiraSyncClient;
  saveSyncResult?: (result: SyncResult) => Promise<void>;
  onSyncResult: (result: SyncResult) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

export interface RunJiraSyncOptions {
  queueAfterCurrent?: boolean;
  mode?: JiraWorklogSyncMode | "auto";
  reconcile?: JiraSyncReconciler;
}

export type JiraSyncReconciler = (
  result: SyncResult
) => SyncResult | Promise<SyncResult>;

interface QueuedSync {
  settings: AppSettings;
  mode: NonNullable<RunJiraSyncOptions["mode"]>;
  promise: Promise<SyncResult | undefined>;
  resolve: (result: SyncResult | undefined) => void;
  reconcilers: JiraSyncReconciler[];
}

const syncModePriority = (mode: NonNullable<RunJiraSyncOptions["mode"]>) =>
  mode === "full" ? 2 : mode === "delta" ? 1 : 0;

const worklogBaseline = (result?: SyncResult): JiraWorklogSyncBaseline | undefined => {
  if (!result) return undefined;
  const scanStart = result.scanStartISO ? new Date(result.scanStartISO) : undefined;
  const scanEnd = result.scanEndExclusiveISO ? new Date(result.scanEndExclusiveISO) : undefined;
  const sourceWorklogs = result.sourceWorklogs?.filter((worklog) => {
    if (!scanStart || !scanEnd) return true;
    const started = new Date(worklog.started);
    return !Number.isNaN(started.getTime()) && started >= scanStart && started < scanEnd;
  });

  return {
    weekKey: result.weekKey,
    weekStartISO: result.weekStartISO,
    weekEndExclusiveISO: result.weekEndExclusiveISO,
    accountId: result.accountId,
    jiraSite: result.jiraSite,
    sourceWorklogs,
    scanStartISO: result.scanStartISO,
    scanEndExclusiveISO: result.scanEndExclusiveISO,
    worklogSyncCursorMs: result.worklogSyncCursorMs
  };
};

export const useJiraSync = ({
  settings,
  weekKey,
  weekStartISO,
  weekEndExclusiveISO,
  syncResult,
  demoSyncResult,
  client = nativeApi,
  saveSyncResult = saveSyncResultToStorage,
  onSyncResult,
  showSuccess,
  showError
}: UseJiraSyncOptions) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const syncInFlightRef = useRef<Promise<SyncResult | undefined> | undefined>();
  const queuedSyncRef = useRef<QueuedSync | undefined>();
  const currentResultRef = useRef(syncResult);
  const beginSyncRef = useRef<(
    settingsForSync: AppSettings,
    mode: NonNullable<RunJiraSyncOptions["mode"]>,
    reconcilers: JiraSyncReconciler[]
  ) => Promise<SyncResult | undefined>>();

  useEffect(() => {
    currentResultRef.current = syncResult;
  }, [syncResult]);

  const executeSync = useCallback(
    async (
      settingsForSync: AppSettings,
      requestedMode: NonNullable<RunJiraSyncOptions["mode"]>,
      reconcilers: JiraSyncReconciler[]
    ): Promise<SyncResult | undefined> => {
      const baseline = worklogBaseline(currentResultRef.current);
      const mode: JiraWorklogSyncMode =
        requestedMode === "auto"
          ? baseline?.sourceWorklogs !== undefined && Number.isFinite(baseline.worklogSyncCursorMs)
            ? "delta"
            : "full"
          : requestedMode;

      try {
        let result = await client.syncJiraWorklogs({
          settings: settingsForSync,
          weekKey,
          weekStartISO,
          weekEndExclusiveISO,
          mode,
          ...(mode === "delta" && baseline ? { baseline } : {})
        });
        for (const reconcile of reconcilers) {
          result = await reconcile(result);
        }
        await saveSyncResult(result);
        currentResultRef.current = result;
        onSyncResult(result);
        showSuccess(`Synced ${result.worklogCount} worklogs across ${result.issueCount} candidate issues.`);
        return result;
      } catch (error) {
        showError(error instanceof Error ? error.message : "Unable to sync Jira worklogs.");
        return undefined;
      }
    },
    [client, onSyncResult, saveSyncResult, showError, showSuccess, weekEndExclusiveISO, weekKey, weekStartISO]
  );

  const beginSync = useCallback(
    (
      settingsForSync: AppSettings,
      mode: NonNullable<RunJiraSyncOptions["mode"]>,
      reconcilers: JiraSyncReconciler[]
    ): Promise<SyncResult | undefined> => {
      setIsSyncing(true);
      let managedTask!: Promise<SyncResult | undefined>;
      managedTask = (async () => {
        try {
          return await executeSync(settingsForSync, mode, reconcilers);
        } finally {
          if (syncInFlightRef.current !== managedTask) return;
          syncInFlightRef.current = undefined;
          const queued = queuedSyncRef.current;
          queuedSyncRef.current = undefined;
          if (queued) {
            const next = beginSyncRef.current!(queued.settings, queued.mode, queued.reconcilers);
            void next.then(queued.resolve);
          } else {
            setIsSyncing(false);
          }
        }
      })();
      syncInFlightRef.current = managedTask;
      return managedTask;
    },
    [executeSync]
  );

  beginSyncRef.current = beginSync;

  const runSync = useCallback(
    async (
      settingsForSync: AppSettings = settings,
      options: RunJiraSyncOptions = {}
    ): Promise<SyncResult | undefined> => {
      if (demoSyncResult) {
        currentResultRef.current = demoSyncResult;
        onSyncResult(demoSyncResult);
        showSuccess("Demo data refreshed from seeded fixtures.");
        return demoSyncResult;
      }

      if (!isJiraConfigured(settingsForSync)) {
        showError("Connect Jira in Settings before syncing.");
        return undefined;
      }

      const mode = options.mode ?? "auto";
      const reconcilers = options.reconcile ? [options.reconcile] : [];
      const currentSync = syncInFlightRef.current;
      if (!currentSync) {
        return beginSync(settingsForSync, mode, reconcilers);
      }

      if (!options.queueAfterCurrent) {
        return currentSync;
      }

      const queued = queuedSyncRef.current;
      if (queued) {
        queued.settings = settingsForSync;
        if (syncModePriority(mode) > syncModePriority(queued.mode)) {
          queued.mode = mode;
        }
        queued.reconcilers.push(...reconcilers);
        return queued.promise;
      }

      let resolve!: (result: SyncResult | undefined) => void;
      const promise = new Promise<SyncResult | undefined>((promiseResolve) => {
        resolve = promiseResolve;
      });
      queuedSyncRef.current = { settings: settingsForSync, mode, promise, resolve, reconcilers };
      return promise;
    },
    [
      beginSync,
      demoSyncResult,
      onSyncResult,
      settings,
      showError,
      showSuccess
    ]
  );

  return {
    isSyncing,
    runSync
  };
};

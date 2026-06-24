import { useCallback, useRef, useState } from "react";
import type { AppSettings, SyncRequest, SyncResult } from "../../shared/types";
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
  demoSyncResult?: SyncResult;
  client?: JiraSyncClient;
  saveSyncResult?: (result: SyncResult) => Promise<void>;
  onSyncResult: (result: SyncResult) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

export interface RunJiraSyncOptions {
  queueAfterCurrent?: boolean;
}

export const useJiraSync = ({
  settings,
  weekKey,
  weekStartISO,
  weekEndExclusiveISO,
  demoSyncResult,
  client = nativeApi,
  saveSyncResult = saveSyncResultToStorage,
  onSyncResult,
  showSuccess,
  showError
}: UseJiraSyncOptions) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const syncInFlightRef = useRef<Promise<SyncResult | undefined> | undefined>();

  const runSync = useCallback(
    async (
      settingsForSync: AppSettings = settings,
      options: RunJiraSyncOptions = {}
    ): Promise<SyncResult | undefined> => {
      if (demoSyncResult) {
        onSyncResult(demoSyncResult);
        showSuccess("Demo data refreshed from seeded fixtures.");
        return demoSyncResult;
      }

      while (syncInFlightRef.current) {
        const currentSync = syncInFlightRef.current;
        if (!options.queueAfterCurrent) {
          return currentSync;
        }
        await currentSync;
      }

      if (!isJiraConfigured(settingsForSync)) {
        showError("Connect Jira in Settings before syncing.");
        return undefined;
      }

      setIsSyncing(true);

      const syncTask = (async () => {
        try {
          const result = await client.syncJiraWorklogs({
            settings: settingsForSync,
            weekKey,
            weekStartISO,
            weekEndExclusiveISO
          });
          await saveSyncResult(result);
          onSyncResult(result);
          showSuccess(`Synced ${result.worklogCount} worklogs across ${result.issueCount} candidate issues.`);
          return result;
        } catch (error) {
          showError(error instanceof Error ? error.message : "Unable to sync Jira worklogs.");
          return undefined;
        }
      })();

      syncInFlightRef.current = syncTask;

      try {
        return await syncTask;
      } finally {
        if (syncInFlightRef.current === syncTask) {
          syncInFlightRef.current = undefined;
          setIsSyncing(false);
        }
      }
    },
    [
      client,
      demoSyncResult,
      onSyncResult,
      saveSyncResult,
      settings,
      showError,
      showSuccess,
      weekEndExclusiveISO,
      weekKey,
      weekStartISO
    ]
  );

  return {
    isSyncing,
    runSync
  };
};

import { useCallback } from "react";
import type { AppSettings, SyncResult } from "../../shared/types";
import { isBitbucketConfigured } from "../domain/bitbucketReview";
import { formatSyncTime } from "./appHelpers";

export type AppSyncState = "synced" | "stale" | "syncing";

interface UseSyncControlsOptions {
  settings: AppSettings;
  syncResult?: SyncResult;
  isSyncing: boolean;
  isSyncingReviews: boolean;
  runSync: () => Promise<unknown>;
  runReviewSync: (settings?: AppSettings) => Promise<unknown>;
}

export const useSyncControls = ({
  settings,
  syncResult,
  isSyncing,
  isSyncingReviews,
  runSync,
  runReviewSync
}: UseSyncControlsOptions) => {
  const isAnySyncing = isSyncing || isSyncingReviews;
  const syncState: AppSyncState = isAnySyncing ? "syncing" : syncResult ? "synced" : "stale";
  const syncLabel = isAnySyncing ? "SYNCING…" : formatSyncTime(syncResult);

  const handleSync = useCallback(async () => {
    await runSync();
    if (isBitbucketConfigured(settings)) {
      await runReviewSync(settings);
    }
  }, [runReviewSync, runSync, settings]);

  return {
    handleSync,
    syncLabel,
    syncState
  };
};

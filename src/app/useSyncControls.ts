import { useCallback } from "react";
import type { AppSettings, SyncResult } from "../../shared/types";
import { isBitbucketConfigured } from "../domain/bitbucketReview";
import { formatSyncTime } from "./appHelpers";
import { OFFLINE_LABEL, SYNCING_LABEL, type AppSyncState } from "./syncStatus";

export type { AppSyncState };

interface UseSyncControlsOptions {
  settings: AppSettings;
  syncResult?: SyncResult;
  isSyncing: boolean;
  isSyncingJiraActivity: boolean;
  isSyncingReviews: boolean;
  /** Browser connectivity; offline outranks every state except an in-flight sync. */
  isOnline?: boolean;
  runSync: () => Promise<unknown>;
  runJiraActivitySync: (settings?: AppSettings) => Promise<unknown>;
  runReviewSync: (settings?: AppSettings) => Promise<unknown>;
}

/**
 * `stale` (nothing synced yet) outranks `offline` on purpose: it describes
 * absent data, not connectivity, and callers branch on it to offer a first
 * sync. `offline` therefore only means "we have data but cannot refresh it".
 */
const resolveSyncState = (isAnySyncing: boolean, isOnline: boolean, syncResult?: SyncResult): AppSyncState => {
  if (isAnySyncing) {
    return "syncing";
  }
  if (!syncResult) {
    return "stale";
  }
  return isOnline ? "synced" : "offline";
};

export const useSyncControls = ({
  settings,
  syncResult,
  isSyncing,
  isSyncingJiraActivity,
  isSyncingReviews,
  isOnline = true,
  runSync,
  runJiraActivitySync,
  runReviewSync
}: UseSyncControlsOptions) => {
  const isAnySyncing = isSyncing || isSyncingJiraActivity || isSyncingReviews;
  const syncState = resolveSyncState(isAnySyncing, isOnline, syncResult);
  // Wall-clock variant, for the sidebar and Reconstruct; the week toolbar shows
  // the elapsed variant via `resolveRelativeSyncLabel`.
  const syncLabel =
    syncState === "syncing" ? SYNCING_LABEL : syncState === "offline" ? OFFLINE_LABEL : formatSyncTime(syncResult);

  const handleSync = useCallback(async () => {
    await runSync();
    await runJiraActivitySync(settings);
    if (isBitbucketConfigured(settings)) {
      await runReviewSync(settings);
    }
  }, [runJiraActivitySync, runReviewSync, runSync, settings]);

  return {
    handleSync,
    syncLabel,
    syncState
  };
};

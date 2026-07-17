import type { SyncResult } from "../../shared/types";
import { formatRelativeSyncTime } from "./appHelpers";

export type AppSyncState = "synced" | "stale" | "syncing" | "offline";

export const SYNCING_LABEL = "SYNCING…";
export const OFFLINE_LABEL = "OFFLINE";

/** Modifier class for the 6px status dot. Shared so a new state can't miss a surface. */
export const SYNC_DOT_STATE: Record<AppSyncState, string> = {
  synced: "is-synced",
  syncing: "is-syncing",
  stale: "is-stale",
  offline: "is-offline"
};

/**
 * Elapsed-time sync label for the week toolbar — "SYNCED 2M AGO". The sidebar
 * shows the wall-clock variant (`useSyncControls`' `syncLabel`) instead; both
 * share the two static strings above so their wording cannot drift.
 */
export const resolveRelativeSyncLabel = (syncState: AppSyncState, now: Date, syncResult?: SyncResult) => {
  if (syncState === "syncing") {
    return SYNCING_LABEL;
  }
  if (syncState === "offline") {
    return OFFLINE_LABEL;
  }
  return formatRelativeSyncTime(syncResult, now);
};

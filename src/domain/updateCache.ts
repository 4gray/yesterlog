import type { AppUpdateInfo } from "../../shared/types";

export const UPDATE_INFO_CACHE_KEY = "timebro-update-info";
export const AUTO_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * How often a long-running app re-checks GitHub for a new release while it stays
 * open. Without this a session that is never restarted (and never opens Settings)
 * would only ever learn about updates from the single check at launch. The poll
 * forces a real fetch, so it is deliberately less frequent than a quick manual
 * check but frequent enough to surface a release within a working day.
 */
export const AUTO_UPDATE_POLL_INTERVAL_MS = 3 * 60 * 60 * 1000;

/** A cached check is reusable only while it is younger than the auto-check window. */
export const isRecentUpdateInfo = (info: AppUpdateInfo, now = Date.now()) => {
  const checkedAt = Date.parse(info.checkedAt);
  return Number.isFinite(checkedAt) && now - checkedAt < AUTO_UPDATE_CHECK_INTERVAL_MS;
};

/**
 * Read the last update check from local storage.
 *
 * `currentAppVersion` is the version the app is running right now. A cache
 * written by a *different* version is discarded: after an in-place update the
 * previous build's cache still looks "recent", so without this guard the new
 * build would keep showing the old `currentVersion` (and a phantom "update
 * available") until the cache aged out of the 6h window.
 */
export const readCachedUpdateInfo = (currentAppVersion: string): AppUpdateInfo | undefined => {
  try {
    const raw = localStorage.getItem(UPDATE_INFO_CACHE_KEY);
    if (!raw) {
      return undefined;
    }

    const parsed = JSON.parse(raw) as AppUpdateInfo;
    return parsed.currentVersion &&
      parsed.currentVersion === currentAppVersion &&
      parsed.releasePageUrl &&
      parsed.checkedAt &&
      !parsed.error
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
};

export const writeCachedUpdateInfo = (info: AppUpdateInfo) => {
  if (info.error) {
    return;
  }

  try {
    localStorage.setItem(UPDATE_INFO_CACHE_KEY, JSON.stringify(info));
  } catch {
    /* Ignore storage failures; update checking still works without a cache. */
  }
};

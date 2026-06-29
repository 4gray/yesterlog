import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AppAutoUpdateActionResult,
  AppAutoUpdateState,
  AppReleaseHistoryResult,
  AppReleaseInfo,
  AppUpdateInfo,
  OpenReleasePageResult
} from "../../shared/types";
import { GITHUB_RELEASES_URL, isNewerReleaseVersion, normalizeReleaseVersion } from "../../shared/releases";
import { nativeApi } from "../api/native";
import {
  AUTO_UPDATE_POLL_INTERVAL_MS,
  isRecentUpdateInfo,
  readCachedUpdateInfo,
  writeCachedUpdateInfo
} from "../domain/updateCache";
import { createDemoReleaseHistory, createDemoUpdateInfo, formatReleaseVersion } from "./appHelpers";
import type { SnackbarOptions } from "./useSnackbars";

export interface ReleaseUpdateClient {
  getUpdateInfo(): Promise<AppUpdateInfo>;
  getReleaseHistory(): Promise<AppReleaseHistoryResult>;
  downloadUpdate(): Promise<AppAutoUpdateActionResult>;
  installUpdate(): Promise<AppAutoUpdateActionResult>;
  onAutoUpdateState?: (callback: (state: AppAutoUpdateState) => void) => () => void;
  openReleasePage(url?: string): Promise<OpenReleasePageResult>;
}

const sameReleaseVersion = (left?: string, right?: string) =>
  Boolean(left && right && normalizeReleaseVersion(left) === normalizeReleaseVersion(right));

const releaseFromUpdateInfo = (info: AppUpdateInfo): AppReleaseInfo | undefined => {
  if (!info.latestVersion) {
    return undefined;
  }

  return {
    version: info.latestVersion,
    releaseName: info.releaseName,
    releaseNotes: info.releaseNotes,
    releasePageUrl: info.releasePageUrl,
    downloadUrl: info.downloadUrl,
    downloadName: info.downloadName,
    downloadPlatform: info.downloadPlatform,
    publishedAt: info.publishedAt
  };
};

const mergeReleases = (primary: AppReleaseInfo | undefined, releases: AppReleaseInfo[]) => {
  if (!primary?.version) {
    return releases;
  }

  const primaryKey = normalizeReleaseVersion(primary.version);
  const hasPrimary = releases.some((release) => normalizeReleaseVersion(release.version) === primaryKey);

  return hasPrimary ? releases : [primary, ...releases];
};

export interface CheckForUpdatesOptions {
  force?: boolean;
  notifyWhenCurrent?: boolean;
}

interface UseReleaseUpdatesOptions {
  appVersion: string;
  isDemo?: boolean;
  demoUpdateAvailable?: boolean;
  autoCheck?: boolean;
  client?: ReleaseUpdateClient;
  showSnackbar: (kind: "info", message: string, options?: SnackbarOptions) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

export const useReleaseUpdates = ({
  appVersion,
  isDemo = false,
  demoUpdateAvailable = false,
  autoCheck = true,
  client = nativeApi,
  showSnackbar,
  showSuccess,
  showError
}: UseReleaseUpdatesOptions) => {
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | undefined>(() =>
    isDemo ? createDemoUpdateInfo(demoUpdateAvailable) : undefined
  );
  const [autoUpdateState, setAutoUpdateState] = useState<AppAutoUpdateState | undefined>(() => updateInfo?.autoUpdate);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [releaseNotesDialogInfo, setReleaseNotesDialogInfo] = useState<AppUpdateInfo | undefined>();
  const [releaseHistory, setReleaseHistory] = useState<AppReleaseInfo[]>(() =>
    isDemo ? createDemoReleaseHistory(demoUpdateAvailable) : []
  );
  const [isLoadingReleaseHistory, setIsLoadingReleaseHistory] = useState(false);
  const [releaseHistoryError, setReleaseHistoryError] = useState<string | undefined>();
  const updateInfoRef = useRef(updateInfo);
  const autoUpdateStateRef = useRef(autoUpdateState);
  const releaseHistoryRef = useRef(releaseHistory);
  const releaseHistoryCheckedAtRef = useRef<string | undefined>(undefined);
  const updateSnackbarShownForRef = useRef<string | undefined>();

  const storeUpdateInfo = useCallback((next: AppUpdateInfo | undefined) => {
    updateInfoRef.current = next;
    autoUpdateStateRef.current = next?.autoUpdate;
    setUpdateInfo(next);
    setAutoUpdateState(next?.autoUpdate);
  }, []);

  const updateStoredInfo = useCallback((updater: (current?: AppUpdateInfo) => AppUpdateInfo | undefined) => {
    const next = updater(updateInfoRef.current);
    updateInfoRef.current = next;
    autoUpdateStateRef.current = next?.autoUpdate;
    setUpdateInfo(next);
    setAutoUpdateState(next?.autoUpdate);
  }, []);

  const storeReleaseHistory = useCallback((releases: AppReleaseInfo[], checkedAt?: string, error?: string) => {
    releaseHistoryRef.current = releases;
    releaseHistoryCheckedAtRef.current = checkedAt;
    setReleaseHistory(releases);
    setReleaseHistoryError(error);
  }, []);

  const storeAutoUpdateState = useCallback(
    (state: AppAutoUpdateState) => {
      autoUpdateStateRef.current = state;
      setAutoUpdateState(state);
      setUpdateInfo((current) => {
        if (!current) {
          return current;
        }

        const next = {
          ...current,
          autoUpdate: state
        };
        updateInfoRef.current = next;
        return next;
      });
    },
    []
  );

  const makeUpdateInfoFromRelease = useCallback(
    (release: AppReleaseInfo): AppUpdateInfo => {
      const currentVersion = updateInfoRef.current?.currentVersion ?? appVersion;
      const selectedVersion = normalizeReleaseVersion(release.version);
      const latestVersion = normalizeReleaseVersion(updateInfoRef.current?.latestVersion ?? "");
      const updateAvailable = isNewerReleaseVersion(release.version, currentVersion);
      const selectedIsLatestKnownUpdate = Boolean(updateAvailable && latestVersion && selectedVersion === latestVersion);

      return {
        currentVersion,
        latestVersion: release.version,
        releaseName: release.releaseName,
        releaseNotes: release.releaseNotes,
        releasePageUrl: release.releasePageUrl,
        downloadUrl: release.downloadUrl,
        downloadName: release.downloadName,
        downloadPlatform: release.downloadPlatform,
        publishedAt: release.publishedAt,
        checkedAt: releaseHistoryCheckedAtRef.current ?? new Date().toISOString(),
        updateAvailable,
        autoUpdate: selectedIsLatestKnownUpdate ? autoUpdateStateRef.current : undefined
      };
    },
    [appVersion]
  );

  const makeCurrentReleasePlaceholder = useCallback((): AppUpdateInfo => {
    const currentVersion = updateInfoRef.current?.currentVersion ?? appVersion;

    return {
      currentVersion,
      latestVersion: currentVersion,
      releaseName: `TimeBro ${formatReleaseVersion(currentVersion)}`,
      releasePageUrl: GITHUB_RELEASES_URL,
      checkedAt: new Date().toISOString(),
      updateAvailable: false
    };
  }, [appVersion]);

  const loadReleaseHistory = useCallback(
    async (force = false) => {
      if (!force && releaseHistoryRef.current.length > 0) {
        return releaseHistoryRef.current;
      }

      if (isDemo) {
        const demoHistory = createDemoReleaseHistory(demoUpdateAvailable);
        storeReleaseHistory(demoHistory, new Date().toISOString());
        return demoHistory;
      }

      setIsLoadingReleaseHistory(true);

      try {
        const result = await client.getReleaseHistory();
        storeReleaseHistory(result.releases, result.checkedAt, result.error);
        return result.releases;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to fetch GitHub release history.";
        storeReleaseHistory(releaseHistoryRef.current, releaseHistoryCheckedAtRef.current, message);
        return releaseHistoryRef.current;
      } finally {
        setIsLoadingReleaseHistory(false);
      }
    },
    [client, demoUpdateAvailable, isDemo, storeReleaseHistory]
  );

  const selectReleaseNotesVersion = useCallback(
    (release: AppReleaseInfo) => {
      setReleaseNotesDialogInfo(makeUpdateInfoFromRelease(release));
    },
    [makeUpdateInfoFromRelease]
  );

  const openReleasePage = useCallback(
    (url?: string) => {
      void client.openReleasePage(url ?? GITHUB_RELEASES_URL).catch((error) => {
        showError(error instanceof Error ? error.message : "Unable to open GitHub Releases.");
      });
    },
    [client, showError]
  );

  const openReleaseNotes = useCallback(
    (info?: AppUpdateInfo) => {
      const releaseInfo = info ?? updateInfoRef.current;
      if (!releaseInfo?.latestVersion) {
        showError("No GitHub release notes are available yet.");
        return;
      }

      setReleaseNotesDialogInfo(releaseInfo);
      void loadReleaseHistory();
    },
    [loadReleaseHistory, showError]
  );

  const closeReleaseNotes = useCallback(() => {
    setReleaseNotesDialogInfo(undefined);
  }, []);

  const openUpdateDownload = useCallback(
    (info?: AppUpdateInfo) => {
      const downloadUrl = info?.downloadUrl ?? updateInfoRef.current?.downloadUrl;
      if (!downloadUrl) {
        showError("No installer download is available for this platform.");
        return;
      }

      void client.openReleasePage(downloadUrl).catch((error) => {
        showError(error instanceof Error ? error.message : "Unable to open the release download.");
      });
    },
    [client, showError]
  );

  const applyAutoUpdateResult = useCallback(
    (result: AppAutoUpdateActionResult) => {
      if (result.updateInfo) {
        storeUpdateInfo(result.updateInfo);
        return;
      }

      storeAutoUpdateState(result.state);
    },
    [storeAutoUpdateState, storeUpdateInfo]
  );

  const installDownloadedUpdate = useCallback(() => {
    void client
      .installUpdate()
      .then((result) => {
        applyAutoUpdateResult(result);

        if (!result.ok) {
          showError(result.message);
        }
      })
      .catch((error) => {
        showError(error instanceof Error ? error.message : "Unable to restart and install the update.");
      });
  }, [applyAutoUpdateResult, client, showError]);

  const downloadCurrentUpdate = useCallback(
    (info?: AppUpdateInfo) => {
      const targetInfo = info ?? updateInfoRef.current;

      if (!targetInfo?.updateAvailable) {
        showError("No update is available to download.");
        return;
      }

      if (!targetInfo.autoUpdate?.supported) {
        openUpdateDownload(targetInfo);
        return;
      }

      if (targetInfo.autoUpdate.phase === "downloaded") {
        installDownloadedUpdate();
        return;
      }

      void client
        .downloadUpdate()
        .then((result) => {
          applyAutoUpdateResult(result);

          if (result.ok) {
            showSuccess(result.message);
          } else {
            showError(result.message);
          }
        })
        .catch((error) => {
          showError(error instanceof Error ? error.message : "Unable to download the update.");
        });
    },
    [applyAutoUpdateResult, client, installDownloadedUpdate, openUpdateDownload, showError, showSuccess]
  );

  const showUpdateAvailable = useCallback(
    (info: AppUpdateInfo) => {
      if (!info.updateAvailable || !info.latestVersion) {
        return;
      }

      if (updateSnackbarShownForRef.current === info.latestVersion) {
        return;
      }

      updateSnackbarShownForRef.current = info.latestVersion;
      showSnackbar(
        "info",
        `TimeBro ${formatReleaseVersion(info.latestVersion)} is available. Current version: ${formatReleaseVersion(
          info.currentVersion
        )}.`,
        {
          actions: [
            {
              label: "Release notes",
              icon: "notes",
              onAction: () => openReleaseNotes(info)
            },
            ...(info.autoUpdate?.supported
              ? [
                  info.autoUpdate.phase === "downloaded"
                    ? {
                        label: "Restart",
                        icon: "restart" as const,
                        onAction: () => installDownloadedUpdate()
                      }
                    : {
                        label: "Download update",
                        icon: "download" as const,
                        onAction: () => downloadCurrentUpdate(info)
                      }
                ]
              : info.downloadUrl
              ? [
                  {
                    label: "Download",
                    icon: "download" as const,
                    onAction: () => openUpdateDownload(info)
                  }
                ]
              : [
                  {
                    label: "GitHub",
                    icon: "external" as const,
                    onAction: () => openReleasePage(info.releasePageUrl)
                  }
                ])
          ],
          autoDismiss: false
        }
      );
    },
    [downloadCurrentUpdate, installDownloadedUpdate, openReleaseNotes, openReleasePage, openUpdateDownload, showSnackbar]
  );

  const checkForUpdates = useCallback(
    async (options: CheckForUpdatesOptions = {}) => {
      if (isDemo) {
        const demoUpdateInfo = createDemoUpdateInfo(demoUpdateAvailable);
        const demoHistory = createDemoReleaseHistory(demoUpdateAvailable);
        storeUpdateInfo(demoUpdateInfo);
        storeReleaseHistory(demoHistory, new Date().toISOString());

        if (demoUpdateInfo.updateAvailable) {
          showUpdateAvailable(demoUpdateInfo);
        } else if (options.notifyWhenCurrent) {
          showSuccess("TimeBro is up to date.");
        }

        return demoUpdateInfo;
      }

      if (!options.force) {
        const cachedUpdateInfo = readCachedUpdateInfo(appVersion);
        if (cachedUpdateInfo && isRecentUpdateInfo(cachedUpdateInfo)) {
          storeUpdateInfo(cachedUpdateInfo);
          if (cachedUpdateInfo.updateAvailable) {
            showUpdateAvailable(cachedUpdateInfo);
          }
          return cachedUpdateInfo;
        }
      }

      setIsCheckingUpdates(true);

      try {
        const result = await client.getUpdateInfo();

        if (result.updateAvailable) {
          showUpdateAvailable(result);
        } else if (options.notifyWhenCurrent) {
          if (result.error) {
            showError(result.error);
          } else {
            showSuccess("TimeBro is up to date.");
          }
        }

        // A failed check — e.g. a transient network/GitHub error during a
        // background poll — must not erase a previously known-good result.
        // Otherwise an available update surfaced at launch would silently
        // vanish from Settings until the next successful check. Keep the last
        // good info as the persisted state; the error is still surfaced to a
        // user-initiated check above via notifyWhenCurrent.
        const previous = updateInfoRef.current;
        const persisted = result.error && previous && !previous.error ? previous : result;

        storeUpdateInfo(persisted);
        writeCachedUpdateInfo(result);

        return persisted;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to check GitHub Releases.";
        updateStoredInfo((current) => ({
          currentVersion: current?.currentVersion ?? "unknown",
          releasePageUrl: current?.releasePageUrl ?? GITHUB_RELEASES_URL,
          checkedAt: new Date().toISOString(),
          updateAvailable: false,
          error: message
        }));

        if (options.notifyWhenCurrent) {
          showError(message);
        }

        return undefined;
      } finally {
        setIsCheckingUpdates(false);
      }
    },
    [
      appVersion,
      client,
      demoUpdateAvailable,
      isDemo,
      showError,
      showSuccess,
      showUpdateAvailable,
      storeReleaseHistory,
      storeUpdateInfo,
      updateStoredInfo
    ]
  );

  useEffect(() => {
    if (!autoCheck || isDemo) {
      return;
    }

    void checkForUpdates();
  }, [autoCheck, checkForUpdates, isDemo]);

  // Keep the latest checkForUpdates accessible to the polling timer without
  // tearing down and recreating the interval whenever its identity changes.
  const checkForUpdatesRef = useRef(checkForUpdates);
  useEffect(() => {
    checkForUpdatesRef.current = checkForUpdates;
  }, [checkForUpdates]);

  // While the app stays open, re-check GitHub on a slow interval so a session
  // that is never restarted still discovers new releases. The poll forces a
  // real fetch (bypassing the cache window); the snackbar is deduplicated per
  // version, so repeated checks never re-notify about a release already shown.
  useEffect(() => {
    if (!autoCheck || isDemo) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void checkForUpdatesRef.current({ force: true });
    }, AUTO_UPDATE_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [autoCheck, isDemo]);

  useEffect(() => {
    if (isDemo || !client.onAutoUpdateState) {
      return undefined;
    }

    return client.onAutoUpdateState((state) => {
      storeAutoUpdateState(state);
    });
  }, [client, isDemo, storeAutoUpdateState]);

  const checkForUpdatesFromSettings = useCallback(() => {
    void checkForUpdates({ force: true, notifyWhenCurrent: true });
  }, [checkForUpdates]);

  const openCurrentReleaseNotes = useCallback(() => {
    const currentVersion = updateInfoRef.current?.currentVersion ?? appVersion;
    const knownCurrentRelease = releaseHistoryRef.current.find((release) =>
      sameReleaseVersion(release.version, currentVersion)
    );

    setReleaseNotesDialogInfo(
      knownCurrentRelease ? makeUpdateInfoFromRelease(knownCurrentRelease) : makeCurrentReleasePlaceholder()
    );

    void loadReleaseHistory().then((releases) => {
      const currentRelease = releases.find((release) => sameReleaseVersion(release.version, currentVersion));
      if (currentRelease) {
        setReleaseNotesDialogInfo(makeUpdateInfoFromRelease(currentRelease));
      }
    });
  }, [appVersion, loadReleaseHistory, makeCurrentReleasePlaceholder, makeUpdateInfoFromRelease]);

  const downloadCurrentUpdateFromSettings = useCallback(() => {
    downloadCurrentUpdate(updateInfoRef.current);
  }, [downloadCurrentUpdate]);

  const installDownloadedUpdateFromSettings = useCallback(() => {
    installDownloadedUpdate();
  }, [installDownloadedUpdate]);

  const refreshReleaseHistory = useCallback(() => {
    void loadReleaseHistory(true);
  }, [loadReleaseHistory]);

  return {
    updateInfo,
    autoUpdateState,
    isCheckingUpdates,
    releaseNotesDialogInfo,
    releaseHistory: mergeReleases(releaseNotesDialogInfo ? releaseFromUpdateInfo(releaseNotesDialogInfo) : undefined, releaseHistory),
    isLoadingReleaseHistory,
    releaseHistoryError,
    checkForUpdates,
    checkForUpdatesFromSettings,
    openReleasePage,
    openReleaseNotes,
    openCurrentReleaseNotes,
    selectReleaseNotesVersion,
    refreshReleaseHistory,
    closeReleaseNotes,
    openUpdateDownload,
    downloadCurrentUpdate: downloadCurrentUpdateFromSettings,
    installDownloadedUpdate: installDownloadedUpdateFromSettings
  };
};

import {
  GITHUB_REPOSITORY_NAME,
  GITHUB_REPOSITORY_OWNER,
  GITHUB_LATEST_RELEASE_API_URL,
  GITHUB_RELEASES_API_URL,
  GITHUB_RELEASES_URL,
  getSafeReleaseAssetUrl,
  getSafeReleaseUrl,
  isNewerReleaseVersion,
  normalizeReleaseVersion
} from "../shared/releases";
import type {
  AppAutoUpdateActionResult,
  AppAutoUpdatePhase,
  AppAutoUpdateProgress,
  AppAutoUpdateState,
  AppReleaseHistoryResult,
  AppReleaseInfo,
  AppUpdateInfo
} from "../shared/types";

interface GitHubReleaseResponse {
  tag_name?: string;
  name?: string | null;
  html_url?: string;
  body?: string | null;
  published_at?: string | null;
  assets?: GitHubReleaseAssetResponse[];
  draft?: boolean;
  prerelease?: boolean;
}

interface GitHubReleaseAssetResponse {
  name?: string;
  browser_download_url?: string;
}

interface ReleaseDownloadAsset {
  name: string;
  url: string;
  platform: NonNullable<AppUpdateInfo["downloadPlatform"]>;
}

interface AutoUpdaterCheckResult {
  isUpdateAvailable: boolean;
}

export interface AppAutoUpdaterAdapter {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  logger: { info(message?: unknown): void; warn(message?: unknown): void; error(message?: unknown): void } | null;
  setFeedURL?: (options: { provider: "github"; owner: string; repo: string; releaseType: "release" }) => void;
  checkForUpdates: () => Promise<AutoUpdaterCheckResult | null>;
  downloadUpdate: () => Promise<string[]>;
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => unknown;
}

export interface AppAutoUpdaterService {
  getState: () => AppAutoUpdateState;
  decorateUpdateInfo: (info: AppUpdateInfo) => AppUpdateInfo;
  downloadUpdate: () => Promise<AppAutoUpdateActionResult>;
  installUpdate: () => AppAutoUpdateActionResult;
}

const parseGitHubError = async (response: Response) => {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message?.trim() || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
};

const unavailableUpdateInfo = (currentVersion: string, checkedAt: string, error: string): AppUpdateInfo => ({
  currentVersion,
  releasePageUrl: GITHUB_RELEASES_URL,
  checkedAt,
  updateAvailable: false,
  error
});

const unavailableReleaseHistory = (
  currentVersion: string,
  checkedAt: string,
  error: string
): AppReleaseHistoryResult => ({
  currentVersion,
  checkedAt,
  releases: [],
  error
});

const matchesExtension = (assetName: string, extension: string) =>
  assetName.toLowerCase().endsWith(extension.toLowerCase());

const findAsset = (
  assets: GitHubReleaseAssetResponse[] | undefined,
  predicate: (assetName: string) => boolean
) => {
  return assets?.find((asset) => {
    const assetName = asset.name?.trim();
    return Boolean(assetName && asset.browser_download_url && predicate(assetName));
  });
};

const selectPlatformDownloadAsset = (
  assets: GitHubReleaseAssetResponse[] | undefined,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): ReleaseDownloadAsset | undefined => {
  const linuxAsset = env.APPIMAGE
    ? findAsset(assets, (assetName) => matchesExtension(assetName, ".AppImage")) ??
      findAsset(assets, (assetName) => matchesExtension(assetName, ".deb"))
    : findAsset(assets, (assetName) => matchesExtension(assetName, ".deb")) ??
      findAsset(assets, (assetName) => matchesExtension(assetName, ".AppImage"));

  const platformAsset =
    platform === "linux"
      ? {
          platform: "linux" as const,
          asset: linuxAsset
        }
      : platform === "darwin"
        ? {
            platform: "macos" as const,
            asset:
              findAsset(
                assets,
                (assetName) =>
                  matchesExtension(assetName, ".dmg") && /(arm64|aarch64|apple[-_ ]?silicon|universal)/i.test(assetName)
              )
          }
        : platform === "win32"
          ? {
              platform: "windows" as const,
              asset: findAsset(assets, (assetName) => matchesExtension(assetName, ".exe"))
            }
          : undefined;

  if (!platformAsset?.asset?.name || !platformAsset.asset.browser_download_url) {
    return undefined;
  }

  const safeUrl = getSafeReleaseAssetUrl(platformAsset.asset.browser_download_url);
  if (!safeUrl) {
    return undefined;
  }

  return {
    name: platformAsset.asset.name,
    url: safeUrl,
    platform: platformAsset.platform
  };
};

const toAppReleaseInfo = (
  release: GitHubReleaseResponse,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): AppReleaseInfo | undefined => {
  if (release.draft || release.prerelease) {
    return undefined;
  }

  const version = normalizeReleaseVersion(release.tag_name || release.name || "");
  if (!version) {
    return undefined;
  }

  const downloadAsset = selectPlatformDownloadAsset(release.assets, platform, env);

  return {
    version,
    releaseName: release.name?.trim() || release.tag_name,
    releaseNotes: release.body?.trim() || undefined,
    releasePageUrl: getSafeReleaseUrl(release.html_url),
    downloadUrl: downloadAsset?.url,
    downloadName: downloadAsset?.name,
    downloadPlatform: downloadAsset?.platform,
    publishedAt: release.published_at ?? undefined
  };
};

export const getAutoUpdateCapability = (
  platform: NodeJS.Platform = process.platform,
  isPackaged = false,
  env: NodeJS.ProcessEnv = process.env
): AppAutoUpdateState => {
  if (!isPackaged) {
    return {
      supported: false,
      phase: "unsupported",
      reason: "Automatic installation is available in packaged TimeBro builds only."
    };
  }

  if (platform === "darwin") {
    return {
      supported: true,
      phase: "idle",
      platform: "macos"
    };
  }

  if (platform === "linux") {
    if (env.APPIMAGE) {
      return {
        supported: true,
        phase: "idle",
        platform: "linux-appimage"
      };
    }

    return {
      supported: false,
      phase: "unsupported",
      reason: "Automatic installation is available for the Linux AppImage build. Use the GitHub installer download for this package."
    };
  }

  if (platform === "win32") {
    return {
      supported: false,
      phase: "unsupported",
      reason: "Windows automatic installation is not enabled yet. Use the GitHub installer download for now."
    };
  }

  return {
    supported: false,
    phase: "unsupported",
    reason: "Automatic installation is not available on this platform."
  };
};

export const checkForAppUpdate = async (
  currentVersion: string,
  fetchImpl: typeof fetch = fetch,
  platform: NodeJS.Platform = process.platform,
  autoUpdate: AppAutoUpdateState = getAutoUpdateCapability(platform),
  env: NodeJS.ProcessEnv = process.env
): Promise<AppUpdateInfo> => {
  const checkedAt = new Date().toISOString();

  try {
    const response = await fetchImpl(GITHUB_LATEST_RELEASE_API_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "TimeBro"
      }
    });

    if (response.status === 404) {
      return {
        ...unavailableUpdateInfo(currentVersion, checkedAt, "No published GitHub releases found."),
        autoUpdate
      };
    }

    if (!response.ok) {
      const message = await parseGitHubError(response);
      return {
        ...unavailableUpdateInfo(currentVersion, checkedAt, `GitHub release check failed: ${message}`),
        autoUpdate
      };
    }

    const release = (await response.json()) as GitHubReleaseResponse;
    const releaseVersion = normalizeReleaseVersion(release.tag_name || release.name || "");
    const downloadAsset = selectPlatformDownloadAsset(release.assets, platform, env);

    if (!releaseVersion) {
      return {
        ...unavailableUpdateInfo(currentVersion, checkedAt, "Latest GitHub release did not include a version tag."),
        autoUpdate
      };
    }

    return {
      currentVersion,
      latestVersion: releaseVersion,
      releaseName: release.name?.trim() || release.tag_name,
      releaseNotes: release.body?.trim() || undefined,
      releasePageUrl: getSafeReleaseUrl(release.html_url),
      downloadUrl: downloadAsset?.url,
      downloadName: downloadAsset?.name,
      downloadPlatform: downloadAsset?.platform,
      publishedAt: release.published_at ?? undefined,
      checkedAt,
      updateAvailable: isNewerReleaseVersion(releaseVersion, currentVersion),
      autoUpdate
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to check GitHub releases.";
    return {
      ...unavailableUpdateInfo(currentVersion, checkedAt, message),
      autoUpdate
    };
  }
};

export const fetchAppReleaseHistory = async (
  currentVersion: string,
  fetchImpl: typeof fetch = fetch,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): Promise<AppReleaseHistoryResult> => {
  const checkedAt = new Date().toISOString();

  try {
    const response = await fetchImpl(GITHUB_RELEASES_API_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "TimeBro"
      }
    });

    if (response.status === 404) {
      return unavailableReleaseHistory(currentVersion, checkedAt, "No published GitHub releases found.");
    }

    if (!response.ok) {
      const message = await parseGitHubError(response);
      return unavailableReleaseHistory(currentVersion, checkedAt, `GitHub release history failed: ${message}`);
    }

    const releases = (await response.json()) as GitHubReleaseResponse[];
    return {
      currentVersion,
      checkedAt,
      releases: releases.flatMap((release) => {
        const appRelease = toAppReleaseInfo(release, platform, env);
        return appRelease ? [appRelease] : [];
      })
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch GitHub release history.";
    return unavailableReleaseHistory(currentVersion, checkedAt, message);
  }
};

const formatAutoUpdateError = (error: unknown) => {
  return error instanceof Error ? error.message : "Unable to install the update automatically.";
};

export const createAppAutoUpdater = (
  updater: AppAutoUpdaterAdapter,
  capability: AppAutoUpdateState,
  onStateChange?: (state: AppAutoUpdateState) => void
): AppAutoUpdaterService => {
  let state = capability;
  let lastUpdateInfo: AppUpdateInfo | undefined;

  const setState = (phase: AppAutoUpdatePhase, changes: Partial<AppAutoUpdateState> = {}) => {
    state = {
      ...state,
      ...changes,
      phase
    };
    onStateChange?.(state);
    return state;
  };

  const decorateUpdateInfo = (info: AppUpdateInfo): AppUpdateInfo => {
    lastUpdateInfo = {
      ...info,
      autoUpdate: state
    };
    return lastUpdateInfo;
  };

  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.logger = null;

  if (capability.supported) {
    updater.setFeedURL?.({
      provider: "github",
      owner: GITHUB_REPOSITORY_OWNER,
      repo: GITHUB_REPOSITORY_NAME,
      releaseType: "release"
    });
  }

  updater.on("checking-for-update", () => {
    setState("checking", { error: undefined, progress: undefined });
  });

  updater.on("update-available", () => {
    setState("available", { error: undefined, progress: undefined });
  });

  updater.on("update-not-available", () => {
    setState("not-available", { error: undefined, progress: undefined });
  });

  updater.on("download-progress", (progress) => {
    const nextProgress = progress as AppAutoUpdateProgress;
    setState("downloading", {
      error: undefined,
      progress: nextProgress
    });
  });

  updater.on("update-downloaded", () => {
    setState("downloaded", {
      error: undefined,
      progress: {
        percent: 100
      }
    });
  });

  updater.on("error", (error) => {
    setState("error", {
      error: formatAutoUpdateError(error),
      progress: undefined
    });
  });

  const unsupportedResult = (): AppAutoUpdateActionResult => ({
    ok: false,
    message: capability.reason ?? "Automatic installation is not available for this build.",
    state,
    updateInfo: lastUpdateInfo ? decorateUpdateInfo(lastUpdateInfo) : undefined
  });

  const downloadUpdate = async (): Promise<AppAutoUpdateActionResult> => {
    if (!capability.supported) {
      return unsupportedResult();
    }

    try {
      setState("checking", { error: undefined, progress: undefined });
      const result = await updater.checkForUpdates();

      if (!result?.isUpdateAvailable) {
        setState("not-available", { error: undefined, progress: undefined });
        return {
          ok: false,
          message: "TimeBro is up to date.",
          state,
          updateInfo: lastUpdateInfo ? decorateUpdateInfo(lastUpdateInfo) : undefined
        };
      }

      setState("downloading", {
        error: undefined,
        progress: {
          percent: 0
        }
      });

      await updater.downloadUpdate();

      setState("downloaded", {
        error: undefined,
        progress: {
          percent: 100
        }
      });

      return {
        ok: true,
        message: "Update downloaded. Restart TimeBro to install it.",
        state,
        updateInfo: lastUpdateInfo ? decorateUpdateInfo(lastUpdateInfo) : undefined
      };
    } catch (error) {
      const message = formatAutoUpdateError(error);
      setState("error", { error: message, progress: undefined });

      return {
        ok: false,
        message,
        state,
        updateInfo: lastUpdateInfo ? decorateUpdateInfo(lastUpdateInfo) : undefined
      };
    }
  };

  const installUpdate = (): AppAutoUpdateActionResult => {
    if (!capability.supported) {
      return unsupportedResult();
    }

    if (state.phase !== "downloaded") {
      return {
        ok: false,
        message: "Download the update before restarting to install it.",
        state,
        updateInfo: lastUpdateInfo ? decorateUpdateInfo(lastUpdateInfo) : undefined
      };
    }

    try {
      updater.quitAndInstall(false, true);
      return {
        ok: true,
        message: "Restarting TimeBro to install the update.",
        state,
        updateInfo: lastUpdateInfo ? decorateUpdateInfo(lastUpdateInfo) : undefined
      };
    } catch (error) {
      const message = formatAutoUpdateError(error);
      setState("error", { error: message, progress: undefined });

      return {
        ok: false,
        message,
        state,
        updateInfo: lastUpdateInfo ? decorateUpdateInfo(lastUpdateInfo) : undefined
      };
    }
  };

  return {
    getState: () => state,
    decorateUpdateInfo,
    downloadUpdate,
    installUpdate
  };
};

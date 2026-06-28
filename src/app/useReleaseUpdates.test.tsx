// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUpdateInfo, OpenReleasePageResult } from "../../shared/types";
import { GITHUB_RELEASES_URL } from "../../shared/releases";
import { AUTO_UPDATE_POLL_INTERVAL_MS, UPDATE_INFO_CACHE_KEY } from "../domain/updateCache";
import type { SnackbarOptions } from "./useSnackbars";
import type { ReleaseUpdateClient } from "./useReleaseUpdates";
import { useReleaseUpdates } from "./useReleaseUpdates";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const APP_VERSION = "1.3.2";

const makeInfo = (overrides: Partial<AppUpdateInfo> = {}): AppUpdateInfo => ({
  currentVersion: APP_VERSION,
  latestVersion: APP_VERSION,
  releasePageUrl: GITHUB_RELEASES_URL,
  checkedAt: new Date().toISOString(),
  updateAvailable: false,
  ...overrides
});

type ReleaseUpdatesApi = ReturnType<typeof useReleaseUpdates>;

let container: HTMLDivElement;
let root: Root;
let api: ReleaseUpdatesApi | undefined;
let getUpdateInfo: ReturnType<typeof vi.fn<() => Promise<AppUpdateInfo>>>;
let downloadUpdate: ReturnType<typeof vi.fn<ReleaseUpdateClient["downloadUpdate"]>>;
let installUpdate: ReturnType<typeof vi.fn<ReleaseUpdateClient["installUpdate"]>>;
let openReleasePage: ReturnType<typeof vi.fn<(url?: string) => Promise<OpenReleasePageResult>>>;
let client: ReleaseUpdateClient;
let showSnackbar: ReturnType<typeof vi.fn<(kind: "info", message: string, options?: SnackbarOptions) => void>>;
let showSuccess: ReturnType<typeof vi.fn<(message: string) => void>>;
let showError: ReturnType<typeof vi.fn<(message: string) => void>>;

function Harness({
  isDemo = false,
  demoUpdateAvailable = false,
  autoCheck = false
}: {
  isDemo?: boolean;
  demoUpdateAvailable?: boolean;
  autoCheck?: boolean;
}) {
  api = useReleaseUpdates({
    appVersion: APP_VERSION,
    isDemo,
    demoUpdateAvailable,
    autoCheck,
    client,
    showSnackbar,
    showSuccess,
    showError
  });
  return null;
}

const getApi = () => {
  if (!api) {
    throw new Error("Release updates hook was not rendered.");
  }
  return api;
};

const renderHarness = (props: { isDemo?: boolean; demoUpdateAvailable?: boolean; autoCheck?: boolean } = {}) => {
  act(() => {
    root.render(<Harness {...props} />);
  });
};

const flushAsync = async () => {
  for (let index = 0; index < 4; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

beforeEach(() => {
  api = undefined;
  localStorage.clear();
  getUpdateInfo = vi.fn();
  downloadUpdate = vi.fn(async () => ({
    ok: true,
    message: "Update downloaded. Restart TimeBro to install it.",
    state: {
      supported: true,
      phase: "downloaded",
      platform: "macos"
    }
  }));
  installUpdate = vi.fn(async () => ({
    ok: true,
    message: "Restarting TimeBro to install the update.",
    state: {
      supported: true,
      phase: "downloaded",
      platform: "macos"
    }
  }));
  openReleasePage = vi.fn(async (url?: string) => ({
    ok: true,
    url: url ?? GITHUB_RELEASES_URL
  }));
  client = { getUpdateInfo, downloadUpdate, installUpdate, openReleasePage };
  showSnackbar = vi.fn();
  showSuccess = vi.fn();
  showError = vi.fn();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("useReleaseUpdates", () => {
  it("initializes demo update info and deduplicates the update snackbar", async () => {
    renderHarness({ isDemo: true, demoUpdateAvailable: true });

    expect(getApi().updateInfo).toMatchObject({
      currentVersion: "1.0.0",
      latestVersion: "1.3.0",
      updateAvailable: true
    });

    await act(async () => {
      await getApi().checkForUpdates();
      await getApi().checkForUpdates();
    });

    expect(showSnackbar).toHaveBeenCalledTimes(1);
    expect(showSnackbar.mock.calls[0][1]).toContain("TimeBro v1.3.0 is available");

    const snackbarOptions = showSnackbar.mock.calls[0][2];
    expect(snackbarOptions?.actions).toHaveLength(2);
    const releaseNotesAction = snackbarOptions?.actions?.[0];
    if (!releaseNotesAction) {
      throw new Error("Expected the update snackbar to include a release notes action.");
    }
    act(() => releaseNotesAction.onAction());
    expect(getApi().releaseNotesDialogInfo).toMatchObject({ latestVersion: "1.3.0" });
  });

  it("notifies when a demo check is current and notifications are requested", async () => {
    renderHarness({ isDemo: true, demoUpdateAvailable: false });

    await act(async () => {
      await getApi().checkForUpdates({ notifyWhenCurrent: true });
    });

    expect(showSuccess).toHaveBeenCalledWith("TimeBro is up to date.");
    expect(showSnackbar).not.toHaveBeenCalled();
  });

  it("uses a recent cached update check before calling the native client", async () => {
    const cachedInfo = makeInfo({
      latestVersion: "1.4.0",
      updateAvailable: true,
      checkedAt: new Date().toISOString()
    });
    localStorage.setItem(UPDATE_INFO_CACHE_KEY, JSON.stringify(cachedInfo));
    renderHarness();

    await act(async () => {
      await getApi().checkForUpdates();
    });

    expect(getUpdateInfo).not.toHaveBeenCalled();
    expect(getApi().updateInfo).toMatchObject({ latestVersion: "1.4.0", updateAvailable: true });
    expect(showSnackbar).toHaveBeenCalledTimes(1);
  });

  it("forces a native check, writes the cache, and notifies when current", async () => {
    getUpdateInfo.mockResolvedValue(makeInfo({ updateAvailable: false }));
    renderHarness();

    await act(async () => {
      await getApi().checkForUpdates({ force: true, notifyWhenCurrent: true });
    });

    expect(getUpdateInfo).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(UPDATE_INFO_CACHE_KEY)).toContain(APP_VERSION);
    expect(showSuccess).toHaveBeenCalledWith("TimeBro is up to date.");
    expect(getApi().isCheckingUpdates).toBe(false);
  });

  it("stores an error result and notifies when a native check fails", async () => {
    getUpdateInfo.mockRejectedValue(new Error("GitHub is offline"));
    renderHarness();

    await act(async () => {
      await getApi().checkForUpdates({ force: true, notifyWhenCurrent: true });
    });

    expect(getApi().updateInfo).toMatchObject({
      currentVersion: "unknown",
      releasePageUrl: GITHUB_RELEASES_URL,
      updateAvailable: false,
      error: "GitHub is offline"
    });
    expect(localStorage.getItem(UPDATE_INFO_CACHE_KEY)).toBeNull();
    expect(showError).toHaveBeenCalledWith("GitHub is offline");
    expect(getApi().isCheckingUpdates).toBe(false);
  });

  it("opens release pages, release notes, and downloads through the native client", async () => {
    const update = makeInfo({
      latestVersion: "1.4.0",
      downloadUrl: "https://github.com/4gray/time-bro/releases/download/v1.4.0/TimeBro.dmg",
      updateAvailable: true
    });
    getUpdateInfo.mockResolvedValue(update);
    renderHarness();

    act(() => getApi().openReleaseNotes());
    expect(showError).toHaveBeenCalledWith("No GitHub release notes are available yet.");

    act(() => getApi().openReleasePage());
    expect(openReleasePage).toHaveBeenCalledWith(GITHUB_RELEASES_URL);

    await act(async () => {
      await getApi().checkForUpdates({ force: true });
    });

    act(() => getApi().openReleaseNotes());
    expect(getApi().releaseNotesDialogInfo).toMatchObject({ latestVersion: "1.4.0" });

    act(() => getApi().openUpdateDownload());
    expect(openReleasePage).toHaveBeenCalledWith(update.downloadUrl);
  });

  it("downloads and installs automatic updates through the native client", async () => {
    const update = makeInfo({
      latestVersion: "1.4.0",
      downloadUrl: "https://github.com/4gray/time-bro/releases/download/v1.4.0/TimeBro.dmg",
      updateAvailable: true,
      autoUpdate: {
        supported: true,
        phase: "idle",
        platform: "macos"
      }
    });
    getUpdateInfo.mockResolvedValue(update);
    renderHarness();

    await act(async () => {
      await getApi().checkForUpdates({ force: true });
    });

    const snackbarAction = showSnackbar.mock.calls[0][2]?.actions?.[1];
    expect(snackbarAction?.label).toBe("Download update");

    await act(async () => {
      snackbarAction?.onAction();
      await Promise.resolve();
    });
    await flushAsync();

    expect(downloadUpdate).toHaveBeenCalledTimes(1);
    expect(showSuccess).toHaveBeenCalledWith("Update downloaded. Restart TimeBro to install it.");
    expect(getApi().autoUpdateState).toMatchObject({
      phase: "downloaded"
    });

    await act(async () => {
      getApi().downloadCurrentUpdate();
      await Promise.resolve();
    });
    await flushAsync();

    expect(installUpdate).toHaveBeenCalledTimes(1);
  });

  it("subscribes to automatic update state changes", async () => {
    let listener: ((state: NonNullable<AppUpdateInfo["autoUpdate"]>) => void) | undefined;
    const unsubscribe = vi.fn();
    client.onAutoUpdateState = vi.fn((callback) => {
      listener = callback;
      return unsubscribe;
    });
    renderHarness();
    await flushAsync();

    act(() => {
      listener?.({
        supported: true,
        phase: "downloading",
        platform: "macos",
        progress: {
          percent: 35
        }
      });
    });

    expect(getApi().autoUpdateState).toMatchObject({
      phase: "downloading",
      progress: {
        percent: 35
      }
    });

    act(() => {
      root.render(<></>);
    });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("re-checks for updates on the polling interval while the app stays open", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      getUpdateInfo.mockResolvedValue(makeInfo({ updateAvailable: false }));
      renderHarness({ autoCheck: true });
      await flushAsync();

      // The check at launch.
      expect(getUpdateInfo).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(AUTO_UPDATE_POLL_INTERVAL_MS);
      });
      await flushAsync();
      expect(getUpdateInfo).toHaveBeenCalledTimes(2);

      await act(async () => {
        vi.advanceTimersByTime(AUTO_UPDATE_POLL_INTERVAL_MS);
      });
      await flushAsync();
      expect(getUpdateInfo).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops polling for updates after unmount", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      getUpdateInfo.mockResolvedValue(makeInfo({ updateAvailable: false }));
      renderHarness({ autoCheck: true });
      await flushAsync();
      expect(getUpdateInfo).toHaveBeenCalledTimes(1);

      act(() => {
        root.render(<></>);
      });

      await act(async () => {
        vi.advanceTimersByTime(AUTO_UPDATE_POLL_INTERVAL_MS * 3);
      });
      await flushAsync();

      expect(getUpdateInfo).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a known available update when a later background poll fails", async () => {
    const available = makeInfo({
      latestVersion: "1.6.0",
      downloadUrl: "https://github.com/4gray/time-bro/releases/download/v1.6.0/TimeBro.dmg",
      updateAvailable: true
    });
    const failedCheck = makeInfo({
      latestVersion: undefined,
      updateAvailable: false,
      error: "GitHub is offline"
    });
    getUpdateInfo.mockResolvedValueOnce(available).mockResolvedValueOnce(failedCheck);
    renderHarness();

    await act(async () => {
      await getApi().checkForUpdates({ force: true });
    });
    expect(getApi().updateInfo).toMatchObject({ latestVersion: "1.6.0", updateAvailable: true });

    // A background poll (no notifyWhenCurrent) that errors must not erase the
    // known-good update or surface a phantom error in its place.
    await act(async () => {
      await getApi().checkForUpdates({ force: true });
    });

    expect(getUpdateInfo).toHaveBeenCalledTimes(2);
    expect(getApi().updateInfo).toMatchObject({ latestVersion: "1.6.0", updateAvailable: true });
    expect(getApi().updateInfo?.error).toBeUndefined();
    expect(showError).not.toHaveBeenCalled();
  });

  it("exposes Settings callbacks that use the current update info", async () => {
    const update = makeInfo({
      latestVersion: "1.4.0",
      downloadUrl: "https://github.com/4gray/time-bro/releases/download/v1.4.0/TimeBro.dmg",
      updateAvailable: true
    });
    getUpdateInfo.mockResolvedValue(update);
    renderHarness();

    act(() => getApi().checkForUpdatesFromSettings());
    await flushAsync();

    expect(getUpdateInfo).toHaveBeenCalledTimes(1);
    expect(getApi().updateInfo).toMatchObject({ latestVersion: "1.4.0", updateAvailable: true });
    expect(getApi().isCheckingUpdates).toBe(false);

    act(() => getApi().openCurrentReleaseNotes());
    expect(getApi().releaseNotesDialogInfo).toMatchObject({ latestVersion: "1.4.0" });

    act(() => getApi().downloadCurrentUpdate());
    expect(openReleasePage).toHaveBeenCalledWith(update.downloadUrl);
  });
});

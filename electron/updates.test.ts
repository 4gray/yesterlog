import { describe, expect, it, vi } from "vitest";
import { GITHUB_RELEASES_URL } from "../shared/releases";
import {
  checkForAppUpdate,
  createAppAutoUpdater,
  fetchAppReleaseHistory,
  getAutoUpdateCapability,
  type AppAutoUpdaterAdapter
} from "./updates";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });

describe("checkForAppUpdate", () => {
  it("marks a newer GitHub release as available", async () => {
    const result = await checkForAppUpdate(
      "1.0.0",
      async () =>
        jsonResponse({
          tag_name: "v1.1.0",
          name: "TimeBro v1.1.0",
          html_url: "https://github.com/4gray/time-bro/releases/tag/v1.1.0",
          body: "## Changed\n\n- Added direct downloads.",
          published_at: "2026-06-22T12:00:00Z",
          assets: [
            {
              name: "TimeBro-1.1.0-arm64.dmg",
              browser_download_url: "https://github.com/4gray/time-bro/releases/download/v1.1.0/TimeBro-1.1.0-arm64.dmg"
            },
            {
              name: "TimeBro-1.1.0.deb",
              browser_download_url: "https://github.com/4gray/time-bro/releases/download/v1.1.0/TimeBro-1.1.0.deb"
            }
          ]
        }),
      "darwin"
    );

    expect(result.currentVersion).toBe("1.0.0");
    expect(result.latestVersion).toBe("1.1.0");
    expect(result.releaseName).toBe("TimeBro v1.1.0");
    expect(result.releaseNotes).toContain("Added direct downloads.");
    expect(result.releasePageUrl).toBe("https://github.com/4gray/time-bro/releases/tag/v1.1.0");
    expect(result.downloadName).toBe("TimeBro-1.1.0-arm64.dmg");
    expect(result.downloadUrl).toBe(
      "https://github.com/4gray/time-bro/releases/download/v1.1.0/TimeBro-1.1.0-arm64.dmg"
    );
    expect(result.downloadPlatform).toBe("macos");
    expect(result.updateAvailable).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("selects a deb asset on Linux", async () => {
    const result = await checkForAppUpdate(
      "1.0.0",
      async () =>
        jsonResponse({
          tag_name: "v1.1.0",
          html_url: "https://github.com/4gray/time-bro/releases/tag/v1.1.0",
          assets: [
            {
              name: "TimeBro-1.1.0.exe",
              browser_download_url: "https://github.com/4gray/time-bro/releases/download/v1.1.0/TimeBro-1.1.0.exe"
            },
            {
              name: "TimeBro-1.1.0.deb",
              browser_download_url: "https://github.com/4gray/time-bro/releases/download/v1.1.0/TimeBro-1.1.0.deb"
            }
          ]
        }),
      "linux"
    );

    expect(result.downloadName).toBe("TimeBro-1.1.0.deb");
    expect(result.downloadPlatform).toBe("linux");
  });

  it("selects an AppImage asset when running from a Linux AppImage", async () => {
    const result = await checkForAppUpdate(
      "1.0.0",
      async () =>
        jsonResponse({
          tag_name: "v1.1.0",
          html_url: "https://github.com/4gray/time-bro/releases/tag/v1.1.0",
          assets: [
            {
              name: "TimeBro-1.1.0.AppImage",
              browser_download_url: "https://github.com/4gray/time-bro/releases/download/v1.1.0/TimeBro-1.1.0.AppImage"
            },
            {
              name: "TimeBro-1.1.0.deb",
              browser_download_url: "https://github.com/4gray/time-bro/releases/download/v1.1.0/TimeBro-1.1.0.deb"
            }
          ]
        }),
      "linux",
      getAutoUpdateCapability("linux", true, { APPIMAGE: "/Applications/TimeBro.AppImage" }),
      { APPIMAGE: "/Applications/TimeBro.AppImage" }
    );

    expect(result.downloadName).toBe("TimeBro-1.1.0.AppImage");
    expect(result.downloadPlatform).toBe("linux");
    expect(result.autoUpdate).toMatchObject({
      supported: true,
      platform: "linux-appimage"
    });
  });

  it("does not advertise GitHub installers as Snap updates", async () => {
    const env = {
      SNAP: "/snap/timebro/current",
      SNAP_NAME: "timebro"
    };
    const result = await checkForAppUpdate(
      "1.0.0",
      async () =>
        jsonResponse({
          tag_name: "v1.1.0",
          html_url: "https://github.com/4gray/time-bro/releases/tag/v1.1.0",
          assets: [
            {
              name: "TimeBro-1.1.0.deb",
              browser_download_url: "https://github.com/4gray/time-bro/releases/download/v1.1.0/TimeBro-1.1.0.deb"
            }
          ]
        }),
      "linux",
      getAutoUpdateCapability("linux", true, env),
      env
    );

    expect(result.latestVersion).toBe("1.1.0");
    expect(result.updateAvailable).toBe(false);
    expect(result.downloadUrl).toBeUndefined();
    expect(result.downloadName).toBeUndefined();
    expect(result.autoUpdate).toMatchObject({
      supported: false,
      phase: "unsupported",
      platform: "linux-snap",
      reason: expect.stringContaining("snap refresh timebro")
    });
  });

  it("selects an exe asset on Windows", async () => {
    const result = await checkForAppUpdate(
      "1.0.0",
      async () =>
        jsonResponse({
          tag_name: "v1.1.0",
          html_url: "https://github.com/4gray/time-bro/releases/tag/v1.1.0",
          assets: [
            {
              name: "TimeBro-1.1.0-arm64.dmg",
              browser_download_url: "https://github.com/4gray/time-bro/releases/download/v1.1.0/TimeBro-1.1.0-arm64.dmg"
            },
            {
              name: "TimeBro-1.1.0.exe",
              browser_download_url: "https://github.com/4gray/time-bro/releases/download/v1.1.0/TimeBro-1.1.0.exe"
            }
          ]
        }),
      "win32"
    );

    expect(result.downloadName).toBe("TimeBro-1.1.0.exe");
    expect(result.downloadPlatform).toBe("windows");
  });

  it("returns an unavailable result for GitHub errors", async () => {
    const result = await checkForAppUpdate("1.0.0", async () =>
      jsonResponse(
        {
          message: "rate limit"
        },
        403
      )
    );

    expect(result.currentVersion).toBe("1.0.0");
    expect(result.releasePageUrl).toBe(GITHUB_RELEASES_URL);
    expect(result.updateAvailable).toBe(false);
    expect(result.error).toContain("rate limit");
  });
});

describe("fetchAppReleaseHistory", () => {
  it("returns published release notes and safe platform assets", async () => {
    const result = await fetchAppReleaseHistory(
      "1.3.2",
      async () =>
        jsonResponse([
          {
            tag_name: "v1.4.0",
            name: "TimeBro v1.4.0",
            html_url: "https://github.com/4gray/time-bro/releases/tag/v1.4.0",
            body: "## Added\n\n![Week](screenshots/v1.4.0/dark-week.png)",
            published_at: "2026-06-24T12:00:00Z",
            assets: [
              {
                name: "TimeBro-1.4.0-arm64.dmg",
                browser_download_url: "https://github.com/4gray/time-bro/releases/download/v1.4.0/TimeBro-1.4.0-arm64.dmg"
              }
            ]
          },
          {
            tag_name: "v1.5.0-beta.1",
            prerelease: true,
            html_url: "https://github.com/4gray/time-bro/releases/tag/v1.5.0-beta.1"
          },
          {
            tag_name: "v1.3.2",
            draft: true,
            html_url: "https://github.com/4gray/time-bro/releases/tag/v1.3.2"
          }
        ]),
      "darwin"
    );

    expect(result.currentVersion).toBe("1.3.2");
    expect(result.releases).toHaveLength(1);
    expect(result.releases[0]).toMatchObject({
      version: "1.4.0",
      releaseName: "TimeBro v1.4.0",
      releaseNotes: expect.stringContaining("dark-week.png"),
      releasePageUrl: "https://github.com/4gray/time-bro/releases/tag/v1.4.0",
      downloadName: "TimeBro-1.4.0-arm64.dmg",
      downloadPlatform: "macos"
    });
  });
});

describe("getAutoUpdateCapability", () => {
  it("enables automatic installation for packaged macOS and Linux AppImage builds", () => {
    expect(getAutoUpdateCapability("darwin", true)).toMatchObject({
      supported: true,
      phase: "idle",
      platform: "macos"
    });
    expect(getAutoUpdateCapability("linux", true, { APPIMAGE: "/tmp/TimeBro.AppImage" })).toMatchObject({
      supported: true,
      phase: "idle",
      platform: "linux-appimage"
    });
  });

  it("keeps development, Linux package-manager builds, and Windows on manual downloads", () => {
    expect(getAutoUpdateCapability("darwin", false)).toMatchObject({
      supported: false,
      phase: "unsupported"
    });
    expect(getAutoUpdateCapability("linux", true, {})).toMatchObject({
      supported: false,
      phase: "unsupported"
    });
    expect(getAutoUpdateCapability("win32", true)).toMatchObject({
      supported: false,
      phase: "unsupported"
    });
  });

  it("delegates packaged Snap updates to Snap", () => {
    expect(
      getAutoUpdateCapability("linux", true, {
        SNAP: "/snap/timebro/current",
        SNAP_NAME: "timebro"
      })
    ).toMatchObject({
      supported: false,
      phase: "unsupported",
      platform: "linux-snap",
      reason: expect.stringContaining("Snap installs updates automatically")
    });
  });
});

describe("createAppAutoUpdater", () => {
  it("downloads an update and restarts through the updater adapter", async () => {
    const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
    const emit = (event: string, ...args: unknown[]) => {
      listeners.get(event)?.forEach((listener) => listener(...args));
    };
    const states: string[] = [];
    const adapter: AppAutoUpdaterAdapter = {
      autoDownload: true,
      autoInstallOnAppQuit: true,
      allowPrerelease: true,
      logger: console,
      setFeedURL: vi.fn(),
      checkForUpdates: vi.fn(async () => {
        emit("update-available");
        return {
          isUpdateAvailable: true
        };
      }),
      downloadUpdate: vi.fn(async () => {
        emit("download-progress", {
          percent: 42
        });
        emit("update-downloaded");
        return ["/tmp/TimeBro.zip"];
      }),
      quitAndInstall: vi.fn(),
      on: (event, listener) => {
        listeners.set(event, [...(listeners.get(event) ?? []), listener]);
        return adapter;
      }
    };

    const service = createAppAutoUpdater(adapter, getAutoUpdateCapability("darwin", true), (state) => {
      states.push(state.phase);
    });
    service.decorateUpdateInfo({
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      releasePageUrl: GITHUB_RELEASES_URL,
      checkedAt: new Date().toISOString(),
      updateAvailable: true
    });

    const downloadResult = await service.downloadUpdate();
    const installResult = service.installUpdate();

    expect(adapter.autoDownload).toBe(false);
    expect(adapter.autoInstallOnAppQuit).toBe(false);
    expect(adapter.allowPrerelease).toBe(false);
    expect(adapter.setFeedURL).toHaveBeenCalledWith({
      provider: "github",
      owner: "4gray",
      repo: "time-bro",
      releaseType: "release"
    });
    expect(downloadResult).toMatchObject({
      ok: true,
      state: {
        phase: "downloaded"
      }
    });
    expect(states).toEqual(["checking", "available", "downloading", "downloading", "downloaded", "downloaded"]);
    expect(installResult.ok).toBe(true);
    expect(adapter.quitAndInstall).toHaveBeenCalledWith(false, true);
  });
});

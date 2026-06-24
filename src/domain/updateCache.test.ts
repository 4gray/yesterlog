// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { AppUpdateInfo } from "../../shared/types";
import {
  AUTO_UPDATE_CHECK_INTERVAL_MS,
  UPDATE_INFO_CACHE_KEY,
  isRecentUpdateInfo,
  readCachedUpdateInfo,
  writeCachedUpdateInfo
} from "./updateCache";

const makeInfo = (over: Partial<AppUpdateInfo> = {}): AppUpdateInfo => ({
  currentVersion: "1.3.1",
  latestVersion: "1.3.1",
  releasePageUrl: "https://github.com/4gray/time-bro/releases",
  checkedAt: "2026-06-24T12:00:00.000Z",
  updateAvailable: false,
  ...over
});

afterEach(() => {
  localStorage.clear();
});

describe("readCachedUpdateInfo", () => {
  it("returns the cached check when it was written by the running version", () => {
    writeCachedUpdateInfo(makeInfo({ currentVersion: "1.3.1" }));
    expect(readCachedUpdateInfo("1.3.1")?.currentVersion).toBe("1.3.1");
  });

  // Regression: after an in-place update the previous build's cache still looks
  // valid/recent. Trusting its currentVersion left the new build showing the old
  // version and a phantom "update available". A version mismatch must invalidate it.
  it("discards a cache written by a different app version", () => {
    writeCachedUpdateInfo(makeInfo({ currentVersion: "1.3.0", latestVersion: "1.3.1", updateAvailable: true }));
    expect(readCachedUpdateInfo("1.3.1")).toBeUndefined();
  });

  it("returns undefined when there is no cache", () => {
    expect(readCachedUpdateInfo("1.3.1")).toBeUndefined();
  });

  it("ignores malformed JSON", () => {
    localStorage.setItem(UPDATE_INFO_CACHE_KEY, "{not json");
    expect(readCachedUpdateInfo("1.3.1")).toBeUndefined();
  });

  it("ignores a cached error result", () => {
    localStorage.setItem(
      UPDATE_INFO_CACHE_KEY,
      JSON.stringify(makeInfo({ error: "GitHub release check failed" }))
    );
    expect(readCachedUpdateInfo("1.3.1")).toBeUndefined();
  });
});

describe("writeCachedUpdateInfo", () => {
  it("persists a successful check", () => {
    writeCachedUpdateInfo(makeInfo());
    expect(localStorage.getItem(UPDATE_INFO_CACHE_KEY)).toContain("1.3.1");
  });

  it("does not cache error results", () => {
    writeCachedUpdateInfo(makeInfo({ error: "offline" }));
    expect(localStorage.getItem(UPDATE_INFO_CACHE_KEY)).toBeNull();
  });
});

describe("isRecentUpdateInfo", () => {
  const checkedAt = "2026-06-24T12:00:00.000Z";
  const base = Date.parse(checkedAt);

  it("is recent within the auto-check window", () => {
    expect(isRecentUpdateInfo(makeInfo({ checkedAt }), base + AUTO_UPDATE_CHECK_INTERVAL_MS - 1)).toBe(true);
  });

  it("is stale past the auto-check window", () => {
    expect(isRecentUpdateInfo(makeInfo({ checkedAt }), base + AUTO_UPDATE_CHECK_INTERVAL_MS + 1)).toBe(false);
  });

  it("is not recent when checkedAt is unparseable", () => {
    expect(isRecentUpdateInfo(makeInfo({ checkedAt: "nonsense" }), base)).toBe(false);
  });
});

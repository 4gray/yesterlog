import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS } from "../domain/week";
import type { BitbucketReviewSyncRequest, BitbucketReviewSyncResult } from "../../shared/types";
import { nativeApi } from "./native";

type NativeApiBridge = NonNullable<Window["timeBro"]>;

const originalWindow = globalThis.window;

const request: BitbucketReviewSyncRequest = {
  settings: {
    ...DEFAULT_SETTINGS,
    bitbucketEmail: "dev@example.com",
    bitbucketApiToken: "bb-token",
    bitbucketWorkspace: "team",
    bitbucketRepositories: "explorer-web"
  },
  weekKey: "2026-06-22",
  weekStartISO: "2026-06-22T00:00:00.000Z",
  weekEndExclusiveISO: "2026-06-29T00:00:00.000Z"
};

const syncResult: BitbucketReviewSyncResult = {
  weekKey: request.weekKey,
  weekStartISO: request.weekStartISO,
  weekEndExclusiveISO: request.weekEndExclusiveISO,
  syncedAt: "2026-06-24T00:00:00.000Z",
  accountId: "bb-user",
  displayName: "Bitbucket User",
  workspace: "team",
  repositoryCount: 1,
  pullRequestCount: 0,
  sessionCount: 0,
  sessions: []
};

const setNativeWindow = (bridges: {
  jiraWeekTracker?: Partial<NativeApiBridge>;
  timeBro?: Partial<NativeApiBridge>;
}) => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: bridges
  });
};

describe("nativeApi Bitbucket bridge", () => {
  afterEach(() => {
    vi.restoreAllMocks();

    if (originalWindow) {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow
      });
      return;
    }

    Reflect.deleteProperty(globalThis, "window");
  });

  it("uses the bridge namespace that exposes Bitbucket review sync", async () => {
    const syncBitbucketReviews = vi.fn().mockResolvedValue(syncResult);

    setNativeWindow({
      timeBro: {
        testBitbucketConnection: vi.fn()
      },
      jiraWeekTracker: {
        syncBitbucketReviews
      }
    });

    await expect(nativeApi.syncBitbucketReviews(request)).resolves.toBe(syncResult);
    expect(syncBitbucketReviews).toHaveBeenCalledWith(request);
  });

  it("reports a stale native bridge instead of throwing a raw TypeError", async () => {
    setNativeWindow({
      timeBro: {
        testBitbucketConnection: vi.fn()
      }
    });

    await expect(nativeApi.syncBitbucketReviews(request)).rejects.toThrow(
      "Restart TimeBro to finish enabling Bitbucket review sync"
    );
  });
});

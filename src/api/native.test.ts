import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS } from "../domain/week";
import type {
  BitbucketPullRequestDetailsRequest,
  BitbucketPullRequestDetailsResult,
  BitbucketReviewSyncRequest,
  BitbucketReviewSyncResult,
  ResolveBitbucketPullRequestTaskRequest,
  ResolveBitbucketPullRequestTaskResult
} from "../../shared/types";
import { nativeApi } from "./native";

type NativeApiBridge = NonNullable<Window["yesterlog"]>;

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

const detailsRequest: BitbucketPullRequestDetailsRequest = {
  settings: request.settings,
  workspace: "team",
  repositorySlug: "explorer-web",
  pullRequestId: 214
};

const detailsResult: BitbucketPullRequestDetailsResult = {
  workspace: "team",
  repositorySlug: "explorer-web",
  repositoryName: "Explorer Web",
  pullRequestId: 214,
  title: "YLOG-328 Active interrupt handling",
  state: "OPEN",
  url: "https://bitbucket.org/team/explorer-web/pull-requests/214",
  approvalCount: 2,
  commentCount: 14,
  tasks: [],
  comments: []
};

const taskRequest: ResolveBitbucketPullRequestTaskRequest = {
  ...detailsRequest,
  taskId: 9,
  content: "Add a regression test.",
  resolved: true
};

const taskResult: ResolveBitbucketPullRequestTaskResult = {
  ok: true,
  task: {
    id: 9,
    content: "Add a regression test.",
    state: "RESOLVED",
    resolved: true,
    authorDisplayName: "Anna K.",
    authorInitials: "AK"
  }
};

const setNativeWindow = (bridges: { yesterlog?: Partial<NativeApiBridge> }) => {
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

  it("uses the Yesterlog bridge namespace for Bitbucket review sync", async () => {
    const syncBitbucketReviews = vi.fn().mockResolvedValue(syncResult);

    setNativeWindow({
      yesterlog: {
        testBitbucketConnection: vi.fn(),
        syncBitbucketReviews
      }
    });

    await expect(nativeApi.syncBitbucketReviews(request)).resolves.toBe(syncResult);
    expect(syncBitbucketReviews).toHaveBeenCalledWith(request);
  });

  it("reports a stale native bridge instead of throwing a raw TypeError", async () => {
    setNativeWindow({
      yesterlog: {
        testBitbucketConnection: vi.fn()
      }
    });

    await expect(nativeApi.syncBitbucketReviews(request)).rejects.toThrow(
      "Restart Yesterlog to finish enabling Bitbucket review sync"
    );
  });

  it("forwards pull request detail reads through the native bridge", async () => {
    const fetchBitbucketPullRequestDetails = vi.fn().mockResolvedValue(detailsResult);

    setNativeWindow({
      yesterlog: {
        fetchBitbucketPullRequestDetails
      }
    });

    await expect(nativeApi.fetchBitbucketPullRequestDetails(detailsRequest)).resolves.toBe(detailsResult);
    expect(fetchBitbucketPullRequestDetails).toHaveBeenCalledWith(detailsRequest);
  });

  it("forwards explicit task writes and explains stale bridges", async () => {
    const setBitbucketPullRequestTaskState = vi.fn().mockResolvedValue(taskResult);

    setNativeWindow({
      yesterlog: {
        setBitbucketPullRequestTaskState
      }
    });

    await expect(nativeApi.setBitbucketPullRequestTaskState(taskRequest)).resolves.toBe(taskResult);
    expect(setBitbucketPullRequestTaskState).toHaveBeenCalledWith(taskRequest);

    setNativeWindow({
      yesterlog: {
        testBitbucketConnection: vi.fn()
      }
    });

    await expect(nativeApi.setBitbucketPullRequestTaskState(taskRequest)).rejects.toThrow(
      "Restart Yesterlog to finish enabling Bitbucket task updates"
    );
  });
});

// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePrAnalytics, prAnalyticsCacheKey } from "./usePrAnalytics";
import { nativeApi } from "../api/native";
import { getPrAnalyticsCache, savePrAnalyticsRepository } from "../storage/db";
import { DEFAULT_SETTINGS } from "../domain/week";
import type { AppSettings } from "../../shared/types";
import type { PrAnalyticsRepository } from "../../shared/prAnalytics";
vi.mock("../api/native", () => ({
  nativeApi: {
    syncPrAnalytics: vi.fn(),
    cancelPrAnalytics: vi.fn().mockResolvedValue(undefined),
    onPrAnalyticsProgress: vi.fn(() => () => undefined)
  }
}));
vi.mock("../storage/db", () => ({
  getPrAnalyticsCache: vi.fn(),
  savePrAnalyticsRepository: vi.fn()
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const settings = {
  ...DEFAULT_SETTINGS,
  bitbucketWorkspace: "team",
  bitbucketRepositories: "a,b",
  bitbucketEmail: "me@example.test",
  bitbucketApiToken: "token"
};
const range = { start: new Date("2026-06-01"), end: new Date("2026-07-01") };
const result = (repository = "a"): PrAnalyticsRepository => ({
  repository,
  workspace: "team",
  user: { accountId: "me" },
  rangeStart: range.start.toISOString(),
  rangeEnd: range.end.toISOString(),
  syncedAt: "2026-07-01",
  listComplete: true,
  complete: true,
  warnings: [],
  pullRequests: []
});
let root: Root, host: HTMLDivElement, hook: ReturnType<typeof usePrAnalytics>;
function Harness({ value, demo = false }: { value: AppSettings; demo?: boolean }) {
  hook = usePrAnalytics(value, range, demo);
  return <span>{hook.results.length}</span>;
}
async function render(value = settings, demo = false) {
  await act(async () => {
    root.render(<Harness value={value} demo={demo} />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.clearAllMocks();
  vi.mocked(getPrAnalyticsCache).mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
describe("PR analytics orchestration", () => {
  it("loads offline cache and does not fetch automatically", async () => {
    vi.mocked(getPrAnalyticsCache).mockResolvedValue({
      cacheKey: "key",
      accountKey: "me",
      repositories: [result()]
    });
    await render();
    expect(hook.results).toHaveLength(1);
    expect(hook.loadingCache).toBe(false);
    expect(nativeApi.syncPrAnalytics).not.toHaveBeenCalled();
  });
  it("drops stale results after changing credentials and cancels old work", async () => {
    let resolve!: (value: PrAnalyticsRepository) => void;
    vi.mocked(nativeApi.syncPrAnalytics).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    await render();
    let run!: Promise<void>;
    await act(async () => {
      run = hook.refresh("a");
      await new Promise((r) => setTimeout(r, 10));
    });
    await render({ ...settings, bitbucketApiToken: "new-token" });
    await act(async () => {
      resolve(result());
      await run;
    });
    expect(hook.results).toHaveLength(0);
    expect(nativeApi.cancelPrAnalytics).toHaveBeenCalled();
    expect(savePrAnalyticsRepository).not.toHaveBeenCalled();
  });
  it("continues other repositories after a failure and saves successful results", async () => {
    vi.mocked(nativeApi.syncPrAnalytics)
      .mockRejectedValueOnce(new Error("No access"))
      .mockResolvedValueOnce(result("b"));
    await render();
    await act(async () => {
      await hook.refresh("*");
    });
    expect(hook.errors.a).toBe("No access");
    expect(hook.results.map((r) => r.repository)).toEqual(["b"]);
    expect(savePrAnalyticsRepository).toHaveBeenCalledTimes(1);
  });
  it("preserves partial results when cancelled and stops before the next repo", async () => {
    let resolve!: (value: PrAnalyticsRepository) => void;
    vi.mocked(nativeApi.syncPrAnalytics).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    await render();
    let run!: Promise<void>;
    await act(async () => {
      run = hook.refresh("*");
      await new Promise((r) => setTimeout(r, 10));
    });
    await act(async () => {
      hook.cancel();
      resolve({ ...result(), complete: false });
      await run;
    });
    expect(hook.results[0].complete).toBe(false);
    expect(nativeApi.syncPrAnalytics).toHaveBeenCalledTimes(1);
    expect(hook.syncing).toBe(false);
  });
  it("never reads or writes real analytics caches in demo mode", async () => {
    await render(settings, true);
    await act(async () => {
      await hook.refresh("*");
    });
    expect(hook.results.length).toBe(2);
    expect(getPrAnalyticsCache).not.toHaveBeenCalled();
    expect(nativeApi.syncPrAnalytics).not.toHaveBeenCalled();
    expect(savePrAnalyticsRepository).not.toHaveBeenCalled();
  });
  it("uses distinct cache scopes for token rotations, emails and workspaces without storing raw tokens", async () => {
    const key = await prAnalyticsCacheKey(settings);
    expect(key).not.toContain('"token"');
    expect(key).not.toBe(await prAnalyticsCacheKey({ ...settings, bitbucketApiToken: "token2" }));
    expect(key).not.toBe(await prAnalyticsCacheKey({ ...settings, bitbucketWorkspace: "other" }));
  });
});

it("refreshes only the compared repositories and explicitly requested history window", async () => {
  vi.mocked(nativeApi.syncPrAnalytics).mockImplementation(async request => ({ ...result(request.repository), rangeStart: request.rangeStart, rangeEnd: request.rangeEnd }));
  await render({ ...settings, bitbucketRepositories: "a,b,c" });
  const wider = { start: new Date("2026-05-01"), end: range.end };
  await act(async () => { await hook.refresh(["a", "c"], wider); });
  expect(vi.mocked(nativeApi.syncPrAnalytics).mock.calls.map(([r]) => r.repository)).toEqual(["a", "c"]);
  expect(vi.mocked(nativeApi.syncPrAnalytics).mock.calls.every(([r]) => r.rangeStart === wider.start.toISOString() && r.rangeEnd === wider.end.toISOString())).toBe(true);
});

it("retains a wider comparison checkpoint on ordinary refresh", async () => {
  const wider = { ...result(), rangeStart: "2026-05-01T00:00:00.000Z", complete: false };
  vi.mocked(getPrAnalyticsCache).mockResolvedValue({ cacheKey: "key", accountKey: "me", repositories: [wider] });
  vi.mocked(nativeApi.syncPrAnalytics).mockResolvedValue(wider);
  await render();
  await act(async () => { await hook.refresh("a"); });
  expect(nativeApi.syncPrAnalytics).toHaveBeenCalledWith(expect.objectContaining({ rangeStart: wider.rangeStart, previous: wider }));
});

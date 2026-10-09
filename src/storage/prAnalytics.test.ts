// @vitest-environment node
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { getPrAnalyticsCache, savePrAnalyticsRepository } from "./db";
import type { PrAnalyticsRepository } from "../../shared/prAnalytics";
const result = (repository: string, accountId = "me"): PrAnalyticsRepository => ({
  workspace: "workspace",
  repository,
  user: { accountId },
  rangeStart: "2026-01-01",
  rangeEnd: "2026-02-01",
  syncedAt: "2026-02-01",
  complete: true,
  listComplete: true,
  pullRequests: [],
  warnings: []
});
describe("PR analytics cache", () => {
  it("merges concurrent repository writes atomically", async () => {
    await Promise.all([
      savePrAnalyticsRepository("connection", result("a")),
      savePrAnalyticsRepository("connection", result("b"))
    ]);
    expect((await getPrAnalyticsCache("connection"))?.repositories.map((r) => r.repository).sort()).toEqual([
      "a",
      "b"
    ]);
  });
  it("replaces history for one repository and isolates authenticated account changes", async () => {
    await savePrAnalyticsRepository("accounts", result("a"));
    await savePrAnalyticsRepository("accounts", result("b"));
    await savePrAnalyticsRepository("accounts", {
      ...result("a"),
      warnings: ["partial"],
      complete: false
    });
    expect((await getPrAnalyticsCache("accounts"))?.repositories).toHaveLength(2);
    await savePrAnalyticsRepository("accounts", result("a", "someone-else"));
    const cache = await getPrAnalyticsCache("accounts");
    expect(cache?.accountKey).toBe("someone-else");
    expect(cache?.repositories.map((r) => r.repository)).toEqual(["a"]);
  });
  it("keeps separate connections isolated and stores no settings or tokens", async () => {
    await savePrAnalyticsRepository("first", result("a"));
    expect(await getPrAnalyticsCache("second")).toBeUndefined();
    expect(Object.keys((await getPrAnalyticsCache("first"))!)).toEqual([
      "cacheKey",
      "accountKey",
      "repositories"
    ]);
  });
});

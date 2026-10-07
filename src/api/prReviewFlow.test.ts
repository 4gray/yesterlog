import { describe, expect, it, vi } from "vitest";
import { analyzePrReviewFlow } from "./prReviewFlow";
import { nativeApi } from "./native";
import { DEFAULT_SETTINGS } from "../domain/week";
import { reviewFlowEvidence } from "../domain/prReviewFlow";
import { buildPrAnalytics } from "../domain/prAnalytics";
import { demoPrAnalytics } from "../demo/prAnalytics";
import { previousAnalyticsRange } from "../domain/prAnalyticsPeriods";
vi.mock("./native", () => ({ nativeApi: { generateWithAi: vi.fn() } }));
const settings = {
  ...DEFAULT_SETTINGS,
  aiEnabled: true,
  bitbucketRepositories: "private-repo",
  bitbucketWorkspace: "private-team"
};
const range = { start: new Date(2026, 8, 1), end: new Date(2026, 9, 1) },
  previous = previousAnalyticsRange(range);
const report = (r: typeof range) =>
  buildPrAnalytics(demoPrAnalytics(settings, r), ["private-repo"], "*", "me", r, "week");
const evidence = reviewFlowEvidence(report(range), report(previous), range, previous, new Date(2026, 9, 7));
describe("optional review analysis", () => {
  it("does not call a provider when disabled or evidence is incomplete", async () => {
    vi.clearAllMocks();
    expect(await analyzePrReviewFlow({ ...settings, aiEnabled: false }, evidence)).toBeUndefined();
    expect(await analyzePrReviewFlow(settings, { ...evidence, blocked: "Partial" })).toBeUndefined();
    expect(nativeApi.generateWithAi).not.toHaveBeenCalled();
  });
  it.each(["ollama", "claude-cli", "codex-cli"] as const)(
    "uses aggregate-only main-process IPC for %s and degrades on failure",
    async (provider) => {
      vi.mocked(nativeApi.generateWithAi).mockResolvedValue({
        ok: false,
        message: "Private provider failure"
      });
      expect(await analyzePrReviewFlow({ ...settings, aiProvider: provider }, evidence)).toBeUndefined();
      const request = vi.mocked(nativeApi.generateWithAi).mock.calls.at(-1)![0];
      expect(request.provider).toBe(provider);
      expect(request.prompt).not.toMatch(/private-team|private-repo|bitbucket.org|Alex/);
      expect(JSON.parse(request.prompt).current.merge.n).toBeGreaterThan(4);
    }
  );
});

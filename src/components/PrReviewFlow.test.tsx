// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrReviewFlow } from "./PrReviewFlow";
import { analyzePrReviewFlow } from "../api/prReviewFlow";
import { reviewFlowEvidence, type ReviewFlowExplanation } from "../domain/prReviewFlow";
import { DEFAULT_SETTINGS } from "../domain/week";
import { buildPrAnalytics } from "../domain/prAnalytics";
import { previousAnalyticsRange } from "../domain/prAnalyticsPeriods";
import { demoPrAnalytics } from "../demo/prAnalytics";
vi.mock("../api/prReviewFlow", () => ({ analyzePrReviewFlow: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const settings = {
  ...DEFAULT_SETTINGS,
  aiEnabled: true,
  aiProvider: "codex-cli" as const,
  bitbucketRepositories: "sample"
};
const range = { start: new Date(2026, 8, 1), end: new Date(2026, 9, 1) },
  previousRange = previousAnalyticsRange(range);
const report = (r: typeof range) =>
  buildPrAnalytics(demoPrAnalytics(settings, r), ["sample"], "sample", "me", r, "week");
const evidence = reviewFlowEvidence(
  report(range),
  report(previousRange),
  range,
  previousRange,
  new Date(2026, 9, 7)
);
const explanation: ReviewFlowExplanation = {
  headline: "Measured changes",
  observations: [{ metric: "merge", text: "Consider sample size." }],
  suggestion: "Inspect release holds."
};
let host: HTMLDivElement, root: Root;
const props = {
  settings,
  evidence,
  range,
  previousRange,
  repository: "sample",
  author: "me",
  isDemo: false,
  previousComplete: true,
  syncing: false,
  onLoadHistory: vi.fn()
};
const render = async (key = "first", extra = {}) => {
  await act(async () => root.render(<PrReviewFlow key={key} {...props} {...extra} />));
};
const button = (text: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(text))!;
beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("inline review explanation", () => {
  it("requires an explicit action, discloses the provider and supports collapse and local PR evidence", async () => {
    vi.mocked(analyzePrReviewFlow).mockResolvedValue(explanation);
    await render();
    expect(analyzePrReviewFlow).not.toHaveBeenCalled();
    expect(host.textContent).toContain("OpenAI");
    await act(async () => button("Analyze review flow").click());
    expect(host.textContent).toContain(explanation.headline);
    await act(async () => button("supporting PRs").click());
    expect(host.querySelector(".pa-ai-evidence a")?.getAttribute("href")).toContain("bitbucket.org");
    await act(async () => button("Collapse").click());
    expect(host.querySelector(".pa-ai-result")).toBeNull();
    await act(async () => button("Show analysis").click());
    expect(host.querySelector(".pa-ai-result")).not.toBeNull();
  });
  it("ignores late completions after the analysis scope changes", async () => {
    let resolve!: (value: ReviewFlowExplanation) => void;
    vi.mocked(analyzePrReviewFlow).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    await render();
    await act(async () => button("Analyze review flow").click());
    await render("changed");
    await act(async () => resolve(explanation));
    expect(host.querySelector(".pa-ai-result")).toBeNull();
    expect(button("Analyze review flow").disabled).toBe(false);
  });
  it("never sends demo data to a provider and leaves failures retryable", async () => {
    await render("demo", { isDemo: true });
    await act(async () => button("Analyze review flow").click());
    expect(analyzePrReviewFlow).not.toHaveBeenCalled();
    expect(host.querySelector(".pa-ai-result")).not.toBeNull();
    await render("real");
    vi.mocked(analyzePrReviewFlow).mockResolvedValue(undefined);
    await act(async () => button("Analyze review flow").click());
    expect(host.textContent).toContain("Analysis unavailable");
    expect(button("Analyze review flow").disabled).toBe(false);
  });
});

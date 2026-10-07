import { describe, expect, it } from "vitest";
import { demoPrAnalytics } from "../demo/prAnalytics";
import { DEFAULT_SETTINGS } from "./week";
import { buildPrAnalytics } from "./prAnalytics";
import { previousAnalyticsRange } from "./prAnalyticsPeriods";
import { parseReviewFlow, reviewFlowEvidence, reviewFlowPrompt } from "./prReviewFlow";
const settings = {
  ...DEFAULT_SETTINGS,
  bitbucketWorkspace: "private-workspace",
  bitbucketRepositories: "private-repo"
};
const range = { start: new Date(2026, 8, 1), end: new Date(2026, 9, 1) };
const previousRange = previousAnalyticsRange(range);
const report = (r = range) =>
  buildPrAnalytics(demoPrAnalytics(settings, r), ["private-repo"], "private-repo", "me", r, "week");
export const evidenceFixture = () =>
  reviewFlowEvidence(report(), report(previousRange), range, previousRange, new Date(2026, 9, 7));
describe("review flow evidence", () => {
  it("keeps identities and free text out of every provider's prompt but retains local evidence links", () => {
    const evidence = evidenceFixture();
    expect(evidence.blocked).toBeUndefined();
    const prompt = reviewFlowPrompt(evidence);
    for (const privateText of [
      "private-workspace",
      "private-repo",
      "Alex",
      "Morgan",
      "bitbucket.org",
      "demo-me",
      "Cache recent activity",
      "https:"
    ])
      expect(prompt).not.toContain(privateText);
    expect(evidence.references.merge.length).toBeGreaterThan(0);
    expect(evidence.references.merge[0].url).toContain("private-workspace");
    expect(JSON.parse(prompt).calendarDays).toBe(30);
  });
  it("requires both complete periods and sufficient merge samples", () => {
    const current = report(),
      previous = report(previousRange);
    expect(
      reviewFlowEvidence({ ...current, complete: false }, previous, range, previousRange, new Date()).blocked
    ).toContain("Complete");
    expect(
      reviewFlowEvidence(current, { ...previous, complete: false }, range, previousRange, new Date()).blocked
    ).toContain("previous");
    expect(
      reviewFlowEvidence({ ...current, merge: { n: 4 } }, previous, range, previousRange, new Date()).blocked
    ).toContain("At least 5");
  });
  it("marks the current day provisional and resolves only current-period evidence", () => {
    const current = report(),
      previous = report(previousRange);
    const evidence = reviewFlowEvidence(current, previous, range, previousRange, new Date(2026, 8, 30));
    expect(evidence.payload.includesToday).toBe(true);
    expect(
      evidence.references.merge.every(
        (p) => +new Date(p.mergedAt!) >= +range.start && +new Date(p.mergedAt!) < +range.end
      )
    ).toBe(true);
  });
  it("rejects malformed, oversized or invented metric references", () => {
    const good = {
      headline: "Measured change",
      observations: [{ metric: "merge", text: "Inspect the measurements." }],
      suggestion: "Check release holds."
    };
    expect(parseReviewFlow(JSON.stringify(good))?.headline).toBe(good.headline);
    for (const value of [
      "broken",
      "null",
      JSON.stringify({ ...good, observations: [{ metric: "secret-url", text: "Invented" }] }),
      JSON.stringify({ ...good, observations: [] }),
      JSON.stringify({ ...good, headline: "x".repeat(241) })
    ])
      expect(parseReviewFlow(value)).toBeUndefined();
  });
});

// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrAnalyticsView } from "./PrAnalyticsView";
import { usePrAnalytics } from "../app/usePrAnalytics";
import { DEFAULT_SETTINGS } from "../domain/week";
import { analyticsRange } from "../domain/prAnalytics";
import { demoPrAnalytics } from "../demo/prAnalytics";
vi.mock("../app/usePrAnalytics", () => ({ usePrAnalytics: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const settings = {
  ...DEFAULT_SETTINGS,
  bitbucketWorkspace: "team",
  bitbucketRepositories: "a,b",
  bitbucketEmail: "me@example.test"
};
const today = new Date(2026, 9, 7);
let host: HTMLDivElement, root: Root;
const source = (
  overrides: Partial<ReturnType<typeof usePrAnalytics>> = {}
): ReturnType<typeof usePrAnalytics> => ({
  results: demoPrAnalytics(settings, analyticsRange(today, "12w")),
  repositories: ["a", "b"],
  loadingCache: false,
  syncing: false,
  progress: undefined,
  errors: {},
  refresh: vi.fn(),
  cancel: vi.fn(),
  ...overrides
});
const render = async () => {
  await act(async () => root.render(<PrAnalyticsView settings={settings} currentDate={today} />));
};
beforeEach(() => {
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.mocked(usePrAnalytics).mockReturnValue(source());
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
describe("PR analytics view", () => {
  it("starts with Me, filters every metric and drills into chart periods", async () => {
    await render();
    const created = () => Number(host.querySelector(".pa-kpis strong")?.textContent);
    const mine = created();
    const all = [...host.querySelectorAll("button")].find((b) => b.textContent === "All")!;
    await act(async () => all.click());
    expect(created()).toBeGreaterThan(mine);
    const bar = host.querySelector<HTMLButtonElement>(".pa-bars button")!;
    const bucketCount = Number(bar.getAttribute("aria-label")!.match(/(\d+) created/)![1]);
    await act(async () => bar.click());
    expect(Number(host.querySelector(".pa-register h2 .pa-badge")?.textContent)).toBe(bucketCount);
    await act(async () => host.querySelector<HTMLButtonElement>(".pa-pr-title")!.click());
    expect(host.querySelector(".pa-detail")?.textContent).toContain("First peer response");
    expect(host.querySelector("a")?.getAttribute("href")).toMatch(/^https:\/\/bitbucket.org\//);
  });
  it("does not display zero metrics before data is loaded and exposes connection errors", async () => {
    const empty = source({ results: [], errors: { a: "Access denied" } });
    vi.mocked(usePrAnalytics).mockReturnValue(empty);
    await render();
    expect(host.querySelector(".pa-kpis")).toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Access denied");
    const load = [...host.querySelectorAll("button")].find((b) => b.textContent === "Load analytics")!;
    await act(async () => load.click());
    expect(empty.refresh).toHaveBeenCalledWith("*");
  });
  it("makes incomplete repository coverage visible alongside every count", async () => {
    const partial = source();
    partial.results = partial.results.slice(0, 1);
    vi.mocked(usePrAnalytics).mockReturnValue(partial);
    await render();
    expect(host.textContent).toContain("Partial coverage");
    expect(host.querySelector(".pa-coverage summary")?.textContent).toContain("1 / 2");
    expect(host.querySelector(".pa-kpis strong")?.textContent).toMatch(/^≥/);
  });
  it("keeps sync cancellation available", async () => {
    const syncing = source({
      syncing: true,
      progress: { requestId: "id", repository: "a", requests: 15, scanned: 20, enriched: 6 }
    });
    vi.mocked(usePrAnalytics).mockReturnValue(syncing);
    await render();
    expect(host.querySelector('[role="status"]')?.textContent).toContain("20 PRs found");
    await act(async () =>
      [...host.querySelectorAll("button")].find((b) => b.textContent === "Stop sync")!.click()
    );
    expect(syncing.cancel).toHaveBeenCalledTimes(1);
  });
});

it("compares independent repositories, applies the shared author filter and exposes missing coverage", async () => {
  const selected = source();
  selected.results = selected.results.slice(0, 1);
  vi.mocked(usePrAnalytics).mockReturnValue(selected);
  await render();
  const repository = host.querySelector<HTMLSelectElement>(".pa-filters select")!;
  await act(async () => { repository.value = "a"; repository.dispatchEvent(new Event("change", { bubbles: true })); });
  const compare = host.querySelector<HTMLSelectElement>('select[aria-label="Compare with"]')!;
  await act(async () => { compare.value = "b"; compare.dispatchEvent(new Event("change", { bubbles: true })); });
  const table = host.querySelector(".pa-comparison")!;
  expect(table.textContent).toContain("Not loaded · Refresh");
  const createdRow = table.querySelectorAll("tbody tr")[1];
  const before = Number(createdRow.querySelectorAll("td")[0].textContent);
  expect(createdRow.querySelectorAll("td")[1].textContent).toBe("—");
  const all = [...host.querySelectorAll("button")].find(b => b.textContent === "All")!;
  await act(async () => all.click());
  expect(Number(table.querySelectorAll("tbody tr")[1].querySelectorAll("td")[0].textContent)).toBeGreaterThan(before);
  expect([...compare.options].some(o => o.value === "a")).toBe(false);
});

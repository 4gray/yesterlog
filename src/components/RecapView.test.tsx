// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecapDraftRecord, SavedRecap } from "../../shared/types";
import { buildDeterministicRecap, recapIntervalForDate, type RecapEvidenceInput } from "../domain/recapWorkspace";
import { RecapView } from "./RecapView";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Workspace = ComponentProps<typeof RecapView>["workspace"];

const draft = buildDeterministicRecap({
  interval: recapIntervalForDate("week", new Date(2026, 5, 17)),
  syncResults: [], reviewResults: [], activityResults: [], recurringEntries: [], reconstructDrafts: {},
  personalNotes: [{
    id: "review", weekKey: "2026-06-15", dateKey: "2026-06-17", title: "Architecture review",
    text: "Reviewed the navigation architecture", timeSpentSeconds: 3600, startedISO: "2026-06-17T10:00:00Z",
    createdAt: "2026-06-17T10:00:00Z", updatedAt: "2026-06-17T10:00:00Z", category: "meeting"
  }]
} satisfies RecapEvidenceInput, 1, new Date("2026-06-18T12:00:00Z"));

const methods = () => ({
  setPeriod: vi.fn(), setFormat: vi.fn(), setDetail: vi.fn(), stepInterval: vi.fn(), refreshActivity: vi.fn(), rewriteWithAi: vi.fn(),
  updateTheme: vi.fn(), updateNarrative: vi.fn(), setActiveVersion: vi.fn(), saveCurrent: vi.fn(), duplicateSaved: vi.fn(),
  selectSaved: vi.fn(), closeSaved: vi.fn()
});

const workspace = (savedSnapshot?: SavedRecap, liveFormat: Workspace["format"] = "perf") => {
  const actions = methods();
  const record: RecapDraftRecord = { intervalKey: draft.interval.key, activeVersion: 1, versions: [draft] };
  return {
    ...actions,
    period: "week", format: savedSnapshot?.format ?? liveFormat, detail: savedSnapshot?.detail ?? "detailed",
    interval: draft.interval, record, activeDraft: draft, displayedDraft: savedSnapshot?.version ?? draft,
    selectedSaved: savedSnapshot, saved: savedSnapshot ? [savedSnapshot] : [], isLoading: false, isGenerating: false,
    isRefreshing: false, isRewriting: false, newEvidenceCount: 0, canEnhanceWithAi: true, canStepNext: false
  } as unknown as Workspace;
};

let container: HTMLDivElement;
let root: Root;

const render = (ws: Workspace) => act(() => root.render(<RecapView workspace={ws} onOpenCalendar={vi.fn()} />));
const button = (label: string) => Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes(label));
const click = (element?: Element) => act(() => element?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("RecapView", () => {
  it("renders one narrative report, opens a keyboard-dismissable evidence drawer, and persists report edits", () => {
    const ws = workspace();
    render(ws);

    const range = container.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(range.value).toBe("2");
    expect(container.querySelectorAll(".recap-report")).toHaveLength(1);
    expect(container.querySelectorAll(".recap-theme")).toHaveLength(0);
    expect(container.querySelectorAll(".recap-report-body p").length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain("Standup digest");
    click(button("Standard"));
    expect(ws.setDetail).toHaveBeenCalledWith("balanced");
    click(button("Review sources"));
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    click(container.querySelector('button[aria-label="Edit report"]') ?? undefined);
    expect(container.querySelector(".recap-report-lede-input")).not.toBeNull();
    click(button("Apply edits"));
    expect(ws.updateNarrative).toHaveBeenCalledOnce();
  });

  it("saves live drafts and gives read-only snapshots explicit return and duplication actions", () => {
    const live = workspace();
    render(live);
    click(button("Save to brag doc"));
    expect(live.saveCurrent).toHaveBeenCalledOnce();

    const snapshot: SavedRecap = { id: "saved", savedAt: "2026-06-18T12:00:00Z", format: "manager", detail: "balanced", version: draft };
    const readOnly = workspace(snapshot);
    render(readOnly);
    expect(container.querySelector('button[aria-label^="Edit"]')).toBeNull();
    expect(container.querySelectorAll(".recap-controls button:disabled").length).toBeGreaterThan(0);
    click(button("Back to draft"));
    expect(readOnly.closeSaved).toHaveBeenCalledOnce();
    click(button("Current draft"));
    expect(readOnly.closeSaved).toHaveBeenCalledTimes(2);
    click(button("Duplicate as draft"));
    expect(readOnly.duplicateSaved).toHaveBeenCalledOnce();
  });

  it("renders an older saved narrative as one report even before report-level copy existed", () => {
    const legacy = structuredClone(draft);
    delete legacy.narratives;
    const snapshot: SavedRecap = {
      id: "legacy-saved",
      savedAt: "2026-06-18T12:00:00Z",
      format: "perf",
      detail: "detailed",
      version: legacy
    };

    render(workspace(snapshot));

    expect(container.querySelectorAll(".recap-report")).toHaveLength(1);
    expect(container.querySelectorAll(".recap-theme")).toHaveLength(0);
    expect(container.querySelector(".recap-report-body")?.textContent).toContain("Architecture review");
  });

  it("keeps refresh and AI rewrite as separate actions", () => {
    const ws = workspace();
    render(ws);

    click(button("Refresh activity"));
    click(button("Rewrite with AI"));

    expect(ws.refreshActivity).toHaveBeenCalledOnce();
    expect(ws.rewriteWithAi).toHaveBeenCalledOnce();
  });

  it("collects a user-provided CV outcome through the guided editor", () => {
    const ws = workspace(undefined, "cv");
    render(ws);
    click(button("Sources"));
    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Meetings & collaboration evidence");
    click(container.querySelector('button[aria-label="Close sources"]') ?? undefined);
    click(button("Add outcome"));

    const editor = container.querySelector<HTMLTextAreaElement>(".recap-impact-editor textarea")!;
    expect(container.querySelector(".recap-impact-editor label")?.textContent).toContain("What changed");
    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      valueSetter?.call(editor, "Unblocked the release review for the platform team");
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    });
    click(button("Save outcome"));

    expect(ws.updateTheme).toHaveBeenCalledOnce();
    const updated = vi.mocked(ws.updateTheme).mock.calls[0][1](draft.themes[0]);
    expect(updated.copy.cv.lines[0]).toMatchObject({
      needsImpact: false,
      userImpact: "Unblocked the release review for the platform team"
    });
  });

  it("removes a saved CV outcome and marks the candidate as needing impact again", () => {
    const withImpact = structuredClone(draft);
    withImpact.themes[0].copy.cv.lines[0] = {
      ...withImpact.themes[0].copy.cv.lines[0],
      needsImpact: false,
      userImpact: "Reduced the weekly release review by one hour"
    };
    const ws = workspace(undefined, "cv");
    ws.record = { intervalKey: withImpact.interval.key, activeVersion: 1, versions: [withImpact] };
    ws.activeDraft = withImpact;
    ws.displayedDraft = withImpact;
    render(ws);

    click(button("Edit outcome"));
    click(button("Remove outcome"));

    expect(ws.updateTheme).toHaveBeenCalledOnce();
    const updated = vi.mocked(ws.updateTheme).mock.calls[0][1](withImpact.themes[0]);
    expect(updated.copy.cv.lines[0]).toMatchObject({ needsImpact: true });
    expect(updated.copy.cv.lines[0].userImpact).toBeUndefined();
  });
});

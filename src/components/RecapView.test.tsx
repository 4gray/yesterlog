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
  setPeriod: vi.fn(), setFormat: vi.fn(), setDetail: vi.fn(), stepInterval: vi.fn(), regenerate: vi.fn(),
  updateTheme: vi.fn(), setActiveVersion: vi.fn(), saveCurrent: vi.fn(), duplicateSaved: vi.fn(),
  selectSaved: vi.fn(), closeSaved: vi.fn()
});

const workspace = (savedSnapshot?: SavedRecap) => {
  const actions = methods();
  const record: RecapDraftRecord = { intervalKey: draft.interval.key, activeVersion: 1, versions: [draft] };
  return {
    ...actions,
    period: "week", format: savedSnapshot?.format ?? "perf", detail: savedSnapshot?.detail ?? "detailed",
    interval: draft.interval, record, activeDraft: draft, displayedDraft: savedSnapshot?.version ?? draft,
    selectedSaved: savedSnapshot, saved: savedSnapshot ? [savedSnapshot] : [], isLoading: false, isGenerating: false,
    canStepNext: false
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
  it("mirrors detail controls, opens a keyboard-dismissable source drawer, and persists inline edits", () => {
    const ws = workspace();
    render(ws);

    const range = container.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(range.value).toBe("2");
    click(button("balanced"));
    expect(ws.setDetail).toHaveBeenCalledWith("balanced");
    click(button("Sources"));
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    click(container.querySelector('button[aria-label^="Edit"]') ?? undefined);
    expect(container.querySelector(".recap-edit-name")).not.toBeNull();
    click(button("Apply edits"));
    expect(ws.updateTheme).toHaveBeenCalledOnce();
  });

  it("saves live drafts and keeps saved snapshots read-only with duplication", () => {
    const live = workspace();
    render(live);
    click(button("Save to brag doc"));
    expect(live.saveCurrent).toHaveBeenCalledOnce();

    const snapshot: SavedRecap = { id: "saved", savedAt: "2026-06-18T12:00:00Z", format: "manager", detail: "balanced", version: draft };
    const readOnly = workspace(snapshot);
    render(readOnly);
    expect(container.querySelector('button[aria-label^="Edit"]')).toBeNull();
    click(button("Duplicate as draft"));
    expect(readOnly.duplicateSaved).toHaveBeenCalledOnce();
  });
});

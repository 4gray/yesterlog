// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PersonalNote, SyncResult } from "../../shared/types";
import { useAppWeekDataState } from "./useAppWeekDataState";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type AppWeekDataStateApi = ReturnType<typeof useAppWeekDataState>;

const buildSyncResult = (overrides: Partial<SyncResult> = {}): SyncResult => ({
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-15T00:00:00.000Z",
  weekEndExclusiveISO: "2026-06-22T00:00:00.000Z",
  syncedAt: "2026-06-18T09:00:00.000Z",
  accountId: "account-1",
  displayName: "Ada Lovelace",
  trackedSeconds: 7200,
  issueCount: 1,
  worklogCount: 1,
  daySummaries: {},
  ...overrides
});

const note: PersonalNote = {
  id: "note-1",
  weekKey: "2026-06-15",
  dateKey: "2026-06-18",
  text: "Local planning",
  timeSpentSeconds: 1800,
  startedISO: "2026-06-18T10:00:00.000Z",
  createdAt: "2026-06-18T10:00:00.000Z",
  updatedAt: "2026-06-18T10:00:00.000Z"
};

let container: HTMLDivElement;
let root: Root;
let api: AppWeekDataStateApi | undefined;

function Harness({ demoSyncResult }: { demoSyncResult?: SyncResult }) {
  api = useAppWeekDataState({ demoSyncResult });
  return null;
}

const getApi = () => {
  if (!api) {
    throw new Error("App week data state hook was not rendered.");
  }
  return api;
};

const renderHarness = (demoSyncResult?: SyncResult) => {
  act(() => {
    root.render(<Harness demoSyncResult={demoSyncResult} />);
  });
};

beforeEach(() => {
  api = undefined;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useAppWeekDataState", () => {
  it("starts with optional demo sync result and no personal notes", () => {
    const demoSyncResult = buildSyncResult();
    renderHarness(demoSyncResult);

    expect(getApi().syncResult).toBe(demoSyncResult);
    expect(getApi().personalNotes).toEqual([]);
  });

  it("keeps lazy sync initialization stable across rerenders until setters change values", () => {
    const demoSyncResult = buildSyncResult();
    const nextSyncResult = buildSyncResult({ syncedAt: "2026-06-18T11:00:00.000Z", worklogCount: 2 });
    renderHarness(demoSyncResult);

    renderHarness(nextSyncResult);

    expect(getApi().syncResult).toBe(demoSyncResult);
    expect(getApi().personalNotes).toEqual([]);

    act(() => {
      getApi().setSyncResult(nextSyncResult);
      getApi().setPersonalNotes([note]);
    });

    expect(getApi().syncResult).toBe(nextSyncResult);
    expect(getApi().personalNotes).toEqual([note]);
  });
});

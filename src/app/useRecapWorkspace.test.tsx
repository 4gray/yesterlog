// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, RecapDraftVersion } from "../../shared/types";
import * as aiApi from "../api/ollama";
import type { RecapEvidenceInput } from "../domain/recapWorkspace";
import { DEFAULT_SETTINGS } from "../domain/week";
import { useRecapWorkspace } from "./useRecapWorkspace";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const settings: AppSettings = { ...DEFAULT_SETTINGS, aiEnabled: true };
const currentDate = new Date(2026, 5, 17, 12);
const recurringEvents: [] = [];
const demoEvidence: Pick<RecapEvidenceInput, "syncResults" | "reviewResults" | "activityResults" | "personalNotes"> = {
  syncResults: [],
  reviewResults: [],
  activityResults: [],
  personalNotes: [{
    id: "recap-note",
    weekKey: "2026-06-15",
    dateKey: "2026-06-17",
    title: "Design review",
    text: "Reviewed the flow",
    timeSpentSeconds: 3600,
    startedISO: "2026-06-17T10:00:00.000Z",
    createdAt: "2026-06-17T10:00:00.000Z",
    updatedAt: "2026-06-17T10:00:00.000Z"
  }]
};

type Workspace = ReturnType<typeof useRecapWorkspace>;
let container: HTMLDivElement;
let root: Root;
let workspace: Workspace | undefined;
const onSuccess = vi.fn();
const onError = vi.fn();

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

function Harness() {
  workspace = useRecapWorkspace({
    currentDate,
    settings,
    recurringEvents,
    isDemo: true,
    onSuccess,
    onError,
    demoEvidence
  });
  return null;
}

const getWorkspace = () => {
  if (!workspace) throw new Error("Recap workspace was not rendered.");
  return workspace;
};

beforeEach(() => {
  workspace = undefined;
  window.location.hash = "#/recap?period=quarter&interval=2026-Q2";
  window.localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("useRecapWorkspace generation", () => {
  it("exposes deterministic version one immediately, then completes it with AI", async () => {
    const pending = deferred<RecapDraftVersion>();
    let deterministic: RecapDraftVersion | undefined;
    vi.spyOn(aiApi, "enhanceRecapWorkspace").mockImplementation(async (draft) => {
      deterministic = draft;
      return pending.promise;
    });

    act(() => root.render(<Harness />));
    await flush();

    expect(getWorkspace().isLoading).toBe(false);
    expect(getWorkspace().isGenerating).toBe(true);
    expect(getWorkspace().activeDraft).toMatchObject({ version: 1, generator: "deterministic" });

    await act(async () => {
      pending.resolve({ ...deterministic!, generator: "ai" });
      await pending.promise;
    });

    expect(getWorkspace().isGenerating).toBe(false);
    expect(getWorkspace().activeDraft).toMatchObject({ version: 1, generator: "ai" });
    expect(getWorkspace().record?.versions).toHaveLength(1);
  });

  it("creates the next version synchronously and ignores a stale enhancement after an interval change", async () => {
    const enhance = vi.spyOn(aiApi, "enhanceRecapWorkspace").mockImplementation(async (draft) => ({ ...draft, generator: "ai" }));
    act(() => root.render(<Harness />));
    await flush();
    expect(getWorkspace().activeDraft?.generator).toBe("ai");

    const pending = deferred<RecapDraftVersion>();
    let versionTwo: RecapDraftVersion | undefined;
    enhance.mockImplementation(async (draft) => {
      versionTwo = draft;
      return pending.promise;
    });
    let regenerate!: Promise<void>;
    act(() => { regenerate = getWorkspace().regenerate(); });

    expect(getWorkspace().activeDraft).toMatchObject({ version: 2, generator: "deterministic" });
    expect(getWorkspace().record?.versions.map((version) => version.version)).toEqual([1, 2]);

    act(() => getWorkspace().stepInterval(-1));
    await flush();
    expect(getWorkspace().record?.intervalKey).toBe("quarter:2026-Q1");
    expect(getWorkspace().activeDraft?.version).toBe(1);

    await act(async () => {
      pending.resolve({ ...versionTwo!, generator: "ai" });
      await regenerate;
    });

    expect(getWorkspace().record?.intervalKey).toBe("quarter:2026-Q1");
    expect(getWorkspace().activeDraft?.version).toBe(1);
  });
});

// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, RecapDraftVersion, SavedRecap } from "../../shared/types";
import * as aiApi from "../api/ollama";
import { buildDeterministicRecap, recapIntervalForDate, type RecapEvidenceInput } from "../domain/recapWorkspace";
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

function Harness({ seedSavedRecaps }: { seedSavedRecaps?: SavedRecap[] }) {
  workspace = useRecapWorkspace({
    currentDate,
    settings,
    recurringEvents,
    isDemo: true,
    onSuccess,
    onError,
    demoEvidence,
    seedSavedRecaps
  });
  return null;
}

const savedRecapFor = (id: string, date: Date): SavedRecap => {
  const interval = recapIntervalForDate("quarter", date);
  const dateKey = interval.startDateKey;
  const version = buildDeterministicRecap({
    interval,
    ...demoEvidence,
    personalNotes: demoEvidence.personalNotes.map((note) => ({
      ...note,
      weekKey: dateKey,
      dateKey,
      startedISO: `${dateKey}T10:00:00.000Z`
    })),
    recurringEntries: [],
    reconstructDrafts: {}
  }, 1, currentDate);
  return {
    id,
    savedAt: `${dateKey}T17:00:00.000Z`,
    format: "manager",
    detail: "balanced",
    version
  };
};

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
  it("falls back to Performance review when a legacy Standup preference or link is opened", async () => {
    window.localStorage.setItem("yesterlog-recap-preferences", JSON.stringify({
      format: "standup",
      detail: "detailed"
    }));
    window.location.hash = "#/recap?period=week&interval=2026-06-15&format=standup";

    act(() => root.render(<Harness />));
    await flush();

    expect(getWorkspace().format).toBe("perf");
    expect(window.location.hash).toContain("format=perf");
  });

  it("opens with a local draft and creates a separate AI version only on request", async () => {
    const pending = deferred<RecapDraftVersion>();
    let candidate: RecapDraftVersion | undefined;
    vi.spyOn(aiApi, "enhanceRecapWorkspace").mockImplementation(async (draft) => {
      candidate = draft;
      return pending.promise;
    });

    act(() => root.render(<Harness />));
    await flush();

    expect(getWorkspace().isLoading).toBe(false);
    expect(getWorkspace().isGenerating).toBe(false);
    expect(getWorkspace().activeDraft).toMatchObject({ version: 1, generator: "deterministic" });
    expect(aiApi.enhanceRecapWorkspace).not.toHaveBeenCalled();

    const firstTheme = getWorkspace().activeDraft!.themes[0];
    act(() => getWorkspace().updateTheme(firstTheme.id, (theme) => ({ ...theme, name: "Hand-edited focus" })));

    let rewrite!: Promise<void>;
    act(() => { rewrite = getWorkspace().rewriteWithAi(); });
    expect(getWorkspace().isRewriting).toBe(true);
    expect(getWorkspace().activeDraft).toMatchObject({ version: 1, generator: "deterministic" });
    expect(getWorkspace().record?.versions).toHaveLength(1);

    await act(async () => {
      pending.resolve({ ...candidate!, generator: "ai", aiFormats: ["perf"] });
      await rewrite;
    });

    expect(getWorkspace().isGenerating).toBe(false);
    expect(getWorkspace().activeDraft).toMatchObject({ version: 2, generator: "ai" });
    expect(getWorkspace().record?.versions.map((version) => [version.version, version.generator])).toEqual([
      [1, "deterministic"], [2, "ai"]
    ]);
    expect(getWorkspace().record?.versions[0].themes[0].name).toBe("Hand-edited focus");
    expect(getWorkspace().record?.versions[0].editedAt).toBeTruthy();
  });

  it("returns from a saved snapshot to the period and interval of the originating draft", async () => {
    const saved = savedRecapFor("saved-q1", new Date(2026, 0, 15));
    act(() => root.render(<Harness seedSavedRecaps={[saved]} />));
    await flush();
    expect(getWorkspace().interval.key).toBe("quarter:2026-Q2");

    act(() => getWorkspace().selectSaved(saved.id));
    await flush();
    expect(getWorkspace().selectedSaved?.id).toBe(saved.id);
    expect(getWorkspace().interval.key).toBe("quarter:2026-Q1");
    expect(window.location.hash).toContain(`saved=${saved.id}`);

    act(() => getWorkspace().closeSaved());
    await flush();
    expect(getWorkspace().selectedSaved).toBeUndefined();
    expect(getWorkspace().period).toBe("quarter");
    expect(getWorkspace().interval.key).toBe("quarter:2026-Q2");
    expect(window.location.hash).not.toContain("saved=");
  });

  it("leaves a deep-linked saved snapshot on an editable draft for that saved interval", async () => {
    const saved = savedRecapFor("saved-q1", new Date(2026, 0, 15));
    window.location.hash = `#/recap?period=quarter&interval=2026-Q1&format=manager&detail=balanced&saved=${saved.id}`;
    act(() => root.render(<Harness seedSavedRecaps={[saved]} />));
    await flush();

    expect(getWorkspace().selectedSaved?.id).toBe(saved.id);
    expect(getWorkspace().interval.key).toBe("quarter:2026-Q1");

    act(() => getWorkspace().closeSaved());
    await flush();
    expect(getWorkspace().selectedSaved).toBeUndefined();
    expect(getWorkspace().interval.key).toBe("quarter:2026-Q1");
    expect(window.location.hash).not.toContain("saved=");
  });

  it("duplicates a saved snapshot on its own interval without restoring the earlier draft", async () => {
    const saved = savedRecapFor("saved-q1", new Date(2026, 0, 15));
    act(() => root.render(<Harness seedSavedRecaps={[saved]} />));
    await flush();
    act(() => getWorkspace().selectSaved(saved.id));
    await flush();

    act(() => getWorkspace().duplicateSaved());
    await flush();
    expect(getWorkspace().selectedSaved).toBeUndefined();
    expect(getWorkspace().interval.key).toBe("quarter:2026-Q1");
    expect(getWorkspace().record?.intervalKey).toBe("quarter:2026-Q1");
    expect(getWorkspace().activeDraft?.version).toBe(2);

    act(() => getWorkspace().closeSaved());
    await flush();
    expect(getWorkspace().interval.key).toBe("quarter:2026-Q1");
  });

  it("keeps the current interval when a stale AI response returns", async () => {
    act(() => root.render(<Harness />));
    await flush();
    expect(getWorkspace().activeDraft?.generator).toBe("deterministic");

    const pending = deferred<RecapDraftVersion>();
    let versionTwo: RecapDraftVersion | undefined;
    vi.spyOn(aiApi, "enhanceRecapWorkspace").mockImplementation(async (draft) => {
      versionTwo = draft;
      return pending.promise;
    });
    let rewrite!: Promise<void>;
    act(() => { rewrite = getWorkspace().rewriteWithAi(); });

    expect(getWorkspace().activeDraft).toMatchObject({ version: 1, generator: "deterministic" });
    expect(getWorkspace().isRewriting).toBe(true);

    act(() => getWorkspace().stepInterval(-1));
    await flush();
    expect(getWorkspace().record?.intervalKey).toBe("quarter:2026-Q1");
    expect(getWorkspace().activeDraft?.version).toBe(1);

    await act(async () => {
      pending.resolve({ ...versionTwo!, generator: "ai", aiFormats: ["perf"] });
      await rewrite;
    });

    expect(getWorkspace().record?.intervalKey).toBe("quarter:2026-Q1");
    expect(getWorkspace().activeDraft?.version).toBe(1);
  });

  it("preserves edits and version selection made while an AI rewrite is pending", async () => {
    act(() => root.render(<Harness />));
    await flush();
    await act(async () => { await getWorkspace().refreshActivity(); });
    expect(getWorkspace().activeDraft?.version).toBe(2);

    const pending = deferred<RecapDraftVersion>();
    let candidate: RecapDraftVersion | undefined;
    vi.spyOn(aiApi, "enhanceRecapWorkspace").mockImplementation(async (draft) => {
      candidate = draft;
      return pending.promise;
    });
    let rewrite!: Promise<void>;
    act(() => { rewrite = getWorkspace().rewriteWithAi(); });

    const theme = getWorkspace().activeDraft!.themes[0];
    act(() => getWorkspace().updateTheme(theme.id, (current) => ({ ...current, name: "Edited while AI was writing" })));
    await flush();
    act(() => getWorkspace().setActiveVersion(1));
    await flush();

    await act(async () => {
      pending.resolve({ ...candidate!, generator: "ai", aiFormats: ["perf"] });
      await rewrite;
    });

    expect(getWorkspace().record?.activeVersion).toBe(1);
    expect(getWorkspace().record?.versions).toHaveLength(3);
    expect(getWorkspace().record?.versions.find((version) => version.version === 2)?.themes[0].name)
      .toBe("Edited while AI was writing");
    expect(getWorkspace().record?.versions.find((version) => version.version === 3)).toMatchObject({ generator: "ai" });
  });

  it("refreshes into a new local version and carries user-provided CV impact", async () => {
    act(() => root.render(<Harness />));
    await flush();
    const theme = getWorkspace().activeDraft!.themes[0];
    const line = theme.copy.cv.lines[0];

    act(() => getWorkspace().updateTheme(theme.id, (current) => ({
      ...current,
      copy: { ...current.copy, cv: { ...current.copy.cv, lines: current.copy.cv.lines.map((candidate) => candidate.id === line.id
        ? { ...candidate, needsImpact: false, userImpact: "Unblocked the release review" }
        : candidate) } }
    })));

    await act(async () => { await getWorkspace().refreshActivity(); });

    expect(getWorkspace().activeDraft?.version).toBe(2);
    expect(getWorkspace().activeDraft?.generator).toBe("deterministic");
    expect(getWorkspace().activeDraft?.themes[0].copy.cv.lines[0]).toMatchObject({
      needsImpact: false,
      userImpact: "Unblocked the release review"
    });
  });

  it("preserves an edit made while activity refresh is loading", async () => {
    act(() => root.render(<Harness />));
    await flush();
    const theme = getWorkspace().activeDraft!.themes[0];

    let refresh!: Promise<void>;
    act(() => {
      refresh = getWorkspace().refreshActivity();
      getWorkspace().updateTheme(theme.id, (current) => ({ ...current, name: "Edited while refresh was loading" }));
    });
    await act(async () => { await refresh; });

    expect(getWorkspace().record?.versions).toHaveLength(2);
    expect(getWorkspace().record?.activeVersion).toBe(1);
    expect(getWorkspace().record?.versions[0].themes[0].name).toBe("Edited while refresh was loading");
    expect(getWorkspace().record?.versions[1]).toMatchObject({ version: 2, generator: "deterministic" });
  });
});

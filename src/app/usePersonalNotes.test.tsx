// @vitest-environment jsdom
import { useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonalNote } from "../../shared/types";
import { usePersonalNotes } from "./usePersonalNotes";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const visibleWeekKey = "2026-06-15";
const nextWeekKey = "2026-06-22";

const buildNote = (overrides: Partial<PersonalNote> = {}): PersonalNote => ({
  id: "note-1",
  weekKey: visibleWeekKey,
  dateKey: "2026-06-18",
  title: "Focus",
  text: "Deep work",
  timeSpentSeconds: 1800,
  startedISO: "2026-06-18T10:00:00.000Z",
  createdAt: "2026-06-18T09:00:00.000Z",
  updatedAt: "2026-06-18T09:00:00.000Z",
  ...overrides
});

type PersonalNotesApi = ReturnType<typeof usePersonalNotes> & { notes: PersonalNote[] };

let container: HTMLDivElement;
let root: Root;
let api: PersonalNotesApi | undefined;
let storedNotes: Map<string, PersonalNote[]>;
let getPersonalNotes: ReturnType<typeof vi.fn<(weekKey: string) => Promise<PersonalNote[]>>>;
let savePersonalNotes: ReturnType<typeof vi.fn<(weekKey: string, notes: PersonalNote[]) => Promise<void>>>;
let setIsLogging: ReturnType<typeof vi.fn<(isLogging: boolean) => void>>;
let setLogError: ReturnType<typeof vi.fn<(message: string | undefined) => void>>;
let showInfo: ReturnType<typeof vi.fn<(message: string) => void>>;
let showSuccess: ReturnType<typeof vi.fn<(message: string) => void>>;
let showError: ReturnType<typeof vi.fn<(message: string) => void>>;

function Harness({
  initialNotes = [],
  isDemo = false
}: {
  initialNotes?: PersonalNote[];
  isDemo?: boolean;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const hook = usePersonalNotes({
    personalNotes: notes,
    setPersonalNotes: setNotes,
    visibleWeekKey,
    isDemo,
    getPersonalNotes,
    savePersonalNotes,
    setIsLogging,
    setLogError,
    showInfo,
    showSuccess,
    showError
  });
  api = { ...hook, notes };
  return null;
}

const getApi = () => {
  if (!api) {
    throw new Error("Personal notes hook was not rendered.");
  }
  return api;
};

const renderHarness = (props: Parameters<typeof Harness>[0] = {}) => {
  act(() => {
    root.render(<Harness {...props} />);
  });
};

const csvFile = (body: string, name = "notes.csv") => new File([body], name, { type: "text/csv" });

beforeEach(() => {
  api = undefined;
  storedNotes = new Map();
  getPersonalNotes = vi.fn(async (weekKey) => storedNotes.get(weekKey) ?? []);
  savePersonalNotes = vi.fn(async (weekKey, notes) => {
    storedNotes.set(weekKey, notes);
  });
  setIsLogging = vi.fn();
  setLogError = vi.fn();
  showInfo = vi.fn();
  showSuccess = vi.fn();
  showError = vi.fn();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("usePersonalNotes", () => {
  it("validates local note text and duration before saving", async () => {
    renderHarness();

    await expect(
      getApi().handleAddPersonalNote({
        title: " ",
        text: " ",
        timeSpentSeconds: 0,
        startedISO: "2026-06-18T10:00:00.000Z"
      })
    ).resolves.toBe(false);

    expect(setLogError).toHaveBeenCalledWith("Add a note and a duration before saving.");
    expect(showError).toHaveBeenCalledWith("Add a note and a duration before saving.");
    expect(savePersonalNotes).not.toHaveBeenCalled();
  });

  it("adds a demo local note without storage", async () => {
    renderHarness({ isDemo: true });

    await act(async () => {
      await expect(
        getApi().handleAddPersonalNote({
          title: " Planning ",
          text: " Sketch release checklist ",
          timeSpentSeconds: 2700,
          startedISO: "2026-06-18T08:00:00.000Z"
        })
      ).resolves.toBe(true);
    });

    expect(savePersonalNotes).not.toHaveBeenCalled();
    expect(getApi().notes).toHaveLength(1);
    expect(getApi().notes[0]).toMatchObject({
      weekKey: visibleWeekKey,
      dateKey: "2026-06-18",
      title: "Planning",
      text: "Sketch release checklist",
      timeSpentSeconds: 2700
    });
    expect(setLogError).toHaveBeenCalledWith(undefined);
    expect(showSuccess).toHaveBeenCalledWith("Demo saved 0h 45m as a local note.");
  });

  it("adds and sorts a stored note in the visible week", async () => {
    const later = buildNote({ id: "note-later", startedISO: "2026-06-18T12:00:00.000Z" });
    renderHarness({ initialNotes: [later] });

    await act(async () => {
      await expect(
        getApi().handleAddPersonalNote({
          text: "Earlier note",
          timeSpentSeconds: 900,
          startedISO: "2026-06-18T08:00:00.000Z"
        })
      ).resolves.toBe(true);
    });

    expect(savePersonalNotes).toHaveBeenCalledTimes(1);
    expect(savePersonalNotes.mock.calls[0][0]).toBe(visibleWeekKey);
    expect(savePersonalNotes.mock.calls[0][1].map((note) => note.text)).toEqual(["Earlier note", "Deep work"]);
    expect(getApi().notes.map((note) => note.text)).toEqual(["Earlier note", "Deep work"]);
    expect(showSuccess).toHaveBeenCalledWith("Saved 0h 15m as a local note.");
  });

  it("updates a demo note in the visible list", async () => {
    const original = buildNote();
    renderHarness({ initialNotes: [original], isDemo: true });

    act(() => getApi().setEditingPersonalNote(original));
    await act(async () => {
      await expect(
        getApi().handleUpdatePersonalNote({
          text: "Updated demo note",
          timeSpentSeconds: 3600,
          startedISO: "2026-06-18T11:00:00.000Z"
        })
      ).resolves.toBe(true);
    });

    expect(savePersonalNotes).not.toHaveBeenCalled();
    expect(getApi().notes).toHaveLength(1);
    expect(getApi().notes[0]).toMatchObject({
      id: "note-1",
      text: "Updated demo note",
      timeSpentSeconds: 3600
    });
    expect(setIsLogging).toHaveBeenNthCalledWith(1, true);
    expect(setIsLogging).toHaveBeenLastCalledWith(false);
    expect(showSuccess).toHaveBeenCalledWith("Demo updated 1h local note.");
  });

  it("moves an edited stored note between weeks", async () => {
    const original = buildNote();
    const existingNext = buildNote({
      id: "note-next",
      weekKey: nextWeekKey,
      dateKey: "2026-06-23",
      text: "Existing next week",
      startedISO: "2026-06-23T12:00:00.000Z"
    });
    storedNotes.set(nextWeekKey, [existingNext]);
    renderHarness({ initialNotes: [original] });

    act(() => getApi().setEditingPersonalNote(original));
    await act(async () => {
      await expect(
        getApi().handleUpdatePersonalNote({
          title: "Moved",
          text: "Moved to next week",
          timeSpentSeconds: 5400,
          startedISO: "2026-06-23T09:00:00.000Z"
        })
      ).resolves.toBe(true);
    });

    expect(savePersonalNotes).toHaveBeenNthCalledWith(1, visibleWeekKey, []);
    expect(savePersonalNotes.mock.calls[1][0]).toBe(nextWeekKey);
    expect(savePersonalNotes.mock.calls[1][1].map((note) => note.text)).toEqual([
      "Moved to next week",
      "Existing next week"
    ]);
    expect(getApi().notes).toEqual([]);
    expect(showSuccess).toHaveBeenCalledWith("Updated 1h 30m local note.");
  });

  it("deletes a stored visible note", async () => {
    const original = buildNote();
    const other = buildNote({ id: "note-2", text: "Keep me", startedISO: "2026-06-18T12:00:00.000Z" });
    renderHarness({ initialNotes: [original, other] });

    act(() => getApi().setEditingPersonalNote(original));
    await act(async () => {
      await expect(getApi().handleDeletePersonalNote()).resolves.toBe(true);
    });

    expect(savePersonalNotes).toHaveBeenCalledWith(visibleWeekKey, [other]);
    expect(getApi().notes).toEqual([other]);
    expect(showSuccess).toHaveBeenCalledWith("Deleted the local note.");
  });

  it("imports demo notes only for the visible week", async () => {
    renderHarness({ isDemo: true });

    await act(async () => {
      await getApi().handleImportPersonalNotes(
        csvFile(
          [
            "Date,Weekday,Issue,Summary,Hours,Title",
            "2026-06-18,Thu,LOCAL-NOTE,Visible import,1,Focus",
            "2026-06-23,Tue,LOCAL-NOTE,Next import,0.5,Later"
          ].join("\n")
        )
      );
    });

    expect(savePersonalNotes).not.toHaveBeenCalled();
    expect(getApi().notes.map((note) => note.text)).toEqual(["Visible import"]);
    expect(showSuccess).toHaveBeenCalledWith("Imported 1 personal note into this demo week.");
  });

  it("imports stored notes across weeks and refreshes the visible week", async () => {
    const existingNext = buildNote({
      id: "note-next",
      weekKey: nextWeekKey,
      dateKey: "2026-06-23",
      text: "Existing next week",
      timeSpentSeconds: 1800,
      startedISO: "2026-06-23T12:00:00.000Z"
    });
    storedNotes.set(nextWeekKey, [existingNext]);
    renderHarness();

    await act(async () => {
      await getApi().handleImportPersonalNotes(
        csvFile(
          [
            "Date,Weekday,Issue,Summary,Hours,Title",
            "2026-06-18,Thu,LOCAL-NOTE,Visible import,1,Focus",
            "2026-06-23,Tue,LOCAL,Next import,0.5,Later"
          ].join("\n"),
          "week-export.csv"
        )
      );
    });

    expect(savePersonalNotes).toHaveBeenCalledTimes(2);
    expect(savePersonalNotes.mock.calls.map(([weekKey]) => weekKey)).toEqual([visibleWeekKey, nextWeekKey]);
    expect(getApi().notes.map((note) => note.text)).toEqual(["Visible import"]);
    expect(storedNotes.get(nextWeekKey)?.map((note) => note.text)).toEqual(["Next import", "Existing next week"]);
    expect(showSuccess).toHaveBeenCalledWith("Imported 2 personal notes from week-export.csv.");
  });

  it("reports CSV files without personal notes", async () => {
    renderHarness();

    await act(async () => {
      await getApi().handleImportPersonalNotes(
        csvFile(["Date,Weekday,Issue,Summary,Hours", "2026-06-18,Thu,TB-1,Jira work,1"].join("\n"))
      );
    });

    expect(showError).toHaveBeenCalledWith(
      "No personal notes found. Import reads LOCAL-NOTE rows from exported weekly CSV files."
    );
    expect(savePersonalNotes).not.toHaveBeenCalled();
    expect(getApi().isImportingPersonalNotes).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  GENERAL_NOTES_CONTAINER_ID,
  addWorkspaceNote,
  countOpenWorkspaceTodos,
  deleteWorkspaceNote,
  getScopedNoteTicketActivity,
  getVisibleWorkspaceNotes,
  getWorkspaceNoteCounts,
  getWorkspaceNoteProgress,
  isNotebookContainerId,
  markAllWorkspaceTodosDone,
  moveWorkspaceNote,
  notebookContainerId,
  parseWorkspaceNoteInput,
  removeWorkspaceNoteBucket,
  setWorkspaceNoteArchived,
  setWorkspaceNoteDone,
  updateWorkspaceNoteText,
  upsertWorkspaceNoteBucket,
  type NoteTicketActivity,
  type WorkspaceNote,
  type WorkspaceNoteBucket
} from "./ticketNotes";

const now = "2026-07-24T12:00:00.000Z";

const note = (
  id: string,
  overrides: Partial<WorkspaceNote> = {}
): WorkspaceNote => ({
  id,
  type: "text",
  done: false,
  text: `Note ${id}`,
  createdAt: now,
  updatedAt: now,
  ...overrides
});

const bucket = (
  containerId = GENERAL_NOTES_CONTAINER_ID,
  notes: WorkspaceNote[] = []
): WorkspaceNoteBucket => ({ containerId, notes });

describe("ticket-note input and containers", () => {
  it("parses [] and [ ] composer prefixes as to-dos and trims stored text", () => {
    expect(parseWorkspaceNoteInput("  []   Follow up with Anna  ")).toEqual({
      type: "todo",
      text: "Follow up with Anna"
    });
    expect(parseWorkspaceNoteInput("[ ] Check the release")).toEqual({
      type: "todo",
      text: "Check the release"
    });
    expect(parseWorkspaceNoteInput("A plain note")).toEqual({
      type: "text",
      text: "A plain note"
    });
    expect(parseWorkspaceNoteInput("Ship this", "todo")).toEqual({
      type: "todo",
      text: "Ship this"
    });
  });

  it("does not treat a bracket pair without the required trailing space as a prefix", () => {
    expect(parseWorkspaceNoteInput("[]not a prefix")).toEqual({
      type: "text",
      text: "[]not a prefix"
    });
  });

  it("namespaces notebook containers without double-prefixing", () => {
    expect(notebookContainerId("planning")).toBe("notebook:planning");
    expect(notebookContainerId("notebook:planning")).toBe("notebook:planning");
    expect(isNotebookContainerId("notebook:planning")).toBe(true);
    expect(isNotebookContainerId(GENERAL_NOTES_CONTAINER_ID)).toBe(false);
  });
});

describe("ticket-note visibility and counts", () => {
  const notes = [
    note("text"),
    note("open", { type: "todo" }),
    note("done", { type: "todo", done: true }),
    note("archived-open", {
      type: "todo",
      archivedAt: "2026-07-24T13:00:00.000Z"
    })
  ];

  it("filters active and archived notes independently by type", () => {
    expect(getVisibleWorkspaceNotes(notes).map((item) => item.id)).toEqual([
      "text",
      "open",
      "done"
    ]);
    expect(
      getVisibleWorkspaceNotes(notes, { filter: "todo" }).map((item) => item.id)
    ).toEqual(["open", "done"]);
    expect(
      getVisibleWorkspaceNotes(notes, { archived: true }).map((item) => item.id)
    ).toEqual(["archived-open"]);
  });

  it("excludes archived notes from open counts and progress", () => {
    expect(getWorkspaceNoteCounts(notes)).toEqual({
      total: 3,
      todos: 2,
      texts: 1,
      done: 1,
      open: 1,
      archived: 1
    });
    expect(getWorkspaceNoteProgress(notes)).toEqual({
      done: 1,
      total: 2,
      open: 1
    });
    expect(countOpenWorkspaceTodos(notes)).toBe(1);
  });
});

describe("ticket activity scopes", () => {
  const localIso = (year: number, month: number, day: number, hour = 10) =>
    new Date(year, month - 1, day, hour).toISOString();
  const activity = (
    key: string,
    lastWorkedAt: string,
    loggedSeconds = 3600
  ): NoteTicketActivity => ({
    key,
    summary: key,
    lastWorkedAt,
    loggedSeconds
  });
  const current = new Date(2026, 6, 24, 12);
  const items = [
    activity("TB-OLD", localIso(2026, 7, 17)),
    activity("TB-WEEK", localIso(2026, 7, 18)),
    activity("TB-TODAY-EARLY", localIso(2026, 7, 24, 8)),
    activity("TB-TODAY-LATE", localIso(2026, 7, 24, 11))
  ];

  it("uses local today and an inclusive rolling seven-day week", () => {
    expect(
      getScopedNoteTicketActivity(items, "today", current).map((item) => item.key)
    ).toEqual(["TB-TODAY-LATE", "TB-TODAY-EARLY"]);
    expect(
      getScopedNoteTicketActivity(items, "week", current).map((item) => item.key)
    ).toEqual(["TB-TODAY-LATE", "TB-TODAY-EARLY", "TB-WEEK"]);
  });

  it("keeps all-time activity and sorts invalid timestamps last", () => {
    const invalid = activity("TB-INVALID", "not-a-date");
    expect(
      getScopedNoteTicketActivity([...items, invalid], "all", current).map(
        (item) => item.key
      )
    ).toEqual([
      "TB-TODAY-LATE",
      "TB-TODAY-EARLY",
      "TB-WEEK",
      "TB-OLD",
      "TB-INVALID"
    ]);
  });
});

describe("immutable ticket-note CRUD", () => {
  it("adds, edits, checks, archives, restores and deletes without mutating input", () => {
    const originalNote = note("todo", { type: "todo", text: " Original " });
    const original = bucket("TB-1", [originalNote]);

    const added = addWorkspaceNote(original, note("text"));
    expect(original.notes).toEqual([originalNote]);
    expect(added.notes.map((item) => item.id)).toEqual(["todo", "text"]);

    const edited = updateWorkspaceNoteText(
      added,
      "todo",
      "  Edited text  ",
      "2026-07-24T13:00:00.000Z"
    );
    expect(edited.notes[0]).toMatchObject({
      text: "Edited text",
      updatedAt: "2026-07-24T13:00:00.000Z"
    });
    expect(
      updateWorkspaceNoteText(edited, "todo", "   ", "later")
    ).toBe(edited);

    const checked = setWorkspaceNoteDone(edited, "todo", true, "checked");
    expect(checked.notes[0]).toMatchObject({ done: true, updatedAt: "checked" });
    expect(setWorkspaceNoteDone(checked, "text", true, "ignored").notes[1].done).toBe(
      false
    );

    const archived = setWorkspaceNoteArchived(checked, "todo", true, "archived");
    expect(archived.notes[0]).toMatchObject({
      archivedAt: "archived",
      updatedAt: "archived"
    });
    const restored = setWorkspaceNoteArchived(
      archived,
      "todo",
      false,
      "restored"
    );
    expect(restored.notes[0].archivedAt).toBeUndefined();
    expect(restored.notes[0].updatedAt).toBe("restored");

    expect(deleteWorkspaceNote(restored, "todo").notes.map((item) => item.id)).toEqual([
      "text"
    ]);
  });

  it("moves a note between flat buckets and updates its timestamp", () => {
    const source = bucket("TB-1", [note("move", { type: "todo" })]);
    const target = bucket(GENERAL_NOTES_CONTAINER_ID, [note("existing")]);
    const moved = moveWorkspaceNote(source, target, "move", "moved-at");

    expect(source.notes).toHaveLength(1);
    expect(target.notes).toHaveLength(1);
    expect(moved.source.notes).toEqual([]);
    expect(moved.target.notes.map((item) => item.id)).toEqual(["existing", "move"]);
    expect(moved.target.notes[1].updatedAt).toBe("moved-at");
  });

  it("marks only active unchecked to-dos done", () => {
    const original = bucket("TB-1", [
      note("open", { type: "todo" }),
      note("done", { type: "todo", done: true }),
      note("archived", { type: "todo", archivedAt: "earlier" }),
      note("text")
    ]);

    const next = markAllWorkspaceTodosDone(original, "completed");
    expect(next.notes.map((item) => [item.id, item.done, item.updatedAt])).toEqual([
      ["open", true, "completed"],
      ["done", true, now],
      ["archived", false, now],
      ["text", false, now]
    ]);
  });

  it("upserts and removes buckets without mutating the bucket list", () => {
    const general = bucket();
    const first = [general];
    const ticket = bucket("TB-1", [note("ticket")]);
    const added = upsertWorkspaceNoteBucket(first, ticket);
    const replaced = upsertWorkspaceNoteBucket(added, {
      ...ticket,
      notes: [note("replacement")]
    });

    expect(first).toEqual([general]);
    expect(added.map((item) => item.containerId)).toEqual(["GENERAL", "TB-1"]);
    expect(
      replaced.find((item) => item.containerId === "TB-1")?.notes[0].id
    ).toBe("replacement");
    expect(removeWorkspaceNoteBucket(replaced, "TB-1")).toEqual([general]);
  });
});

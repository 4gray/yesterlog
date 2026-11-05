import { describe, expect, it } from "vitest";
import { parsePersonalNotesCsv } from "./personalNotesCsv";

describe("personal notes CSV", () => {
  it("imports only local personal note rows from Yesterlog CSV", () => {
    const csv = [
      "Date,Weekday,Issue,Summary,Hours",
      "2026-06-18,Thursday,TB-12,Ignored Jira work,2.00",
      '2026-06-18,Thursday,LOCAL-NOTE,"Personal, note",1.50',
      '2026-06-19,Friday,LOCAL,"Second ""note""",0.25'
    ].join("\n");

    const result = parsePersonalNotesCsv(csv, {
      importedAtISO: "2026-06-23T10:00:00.000Z",
      idPrefix: "note-import-test"
    });

    expect(result.ignoredRows).toBe(1);
    expect(result.notes).toHaveLength(2);
    expect(result.notes[0]).toMatchObject({
      id: "note-import-test-3",
      weekKey: "2026-06-15",
      dateKey: "2026-06-18",
      text: "Personal, note",
      timeSpentSeconds: 5400,
      createdAt: "2026-06-23T10:00:00.000Z",
      updatedAt: "2026-06-23T10:00:00.000Z"
    });
    expect(result.notes[1]).toMatchObject({
      id: "note-import-test-4",
      weekKey: "2026-06-15",
      dateKey: "2026-06-19",
      text: 'Second "note"',
      timeSpentSeconds: 900
    });
  });

  it("imports personal note titles from older exports", () => {
    const csv = [
      "Date,Weekday,Issue,Summary,Hours,Title",
      '2026-06-18,Thursday,LOCAL-NOTE,"Planning, notes",1.25,Sprint planning'
    ].join("\n");
    const result = parsePersonalNotesCsv(csv, { idPrefix: "note-roundtrip" });
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toMatchObject({ title: "Sprint planning", text: "Planning, notes" });
  });

  it("imports notes without a Title column (title stays undefined)", () => {
    const csv = ["Date,Weekday,Issue,Summary,Hours", "2026-06-18,Thursday,LOCAL-NOTE,Planning,1.00"].join("\n");
    const result = parsePersonalNotesCsv(csv, { idPrefix: "note-legacy" });
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].title).toBeUndefined();
    expect(result.notes[0].text).toBe("Planning");
  });

  it("rejects CSV files without the expected report columns", () => {
    expect(() => parsePersonalNotesCsv("Date,Summary\n2026-06-18,Planning")).toThrow(
      "CSV must include Date, Issue, Summary, and Hours columns."
    );
  });
});

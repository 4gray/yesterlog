import { describe, expect, it } from "vitest";
import {
  buildNotesBriefingPrompt,
  parseNotesBriefing,
  type NotesBriefingInput
} from "./notesBriefing";

const input: NotesBriefingInput = {
  ticket: {
    key: "ylog-352",
    summary: "Move sessions to Redis",
    description: "Replace the in-memory store and keep the fallback path.",
    comments: ["Confirm the rollback plan.", "Add metrics for connection failures."]
  },
  pullRequest: {
    id: 472,
    title: "YLOG-352 Redis session store",
    diffstatSummary: "3 files changed, +51 -12."
  }
};

describe("buildNotesBriefingPrompt", () => {
  it("serializes only Jira ticket comments and optional PR diffstat evidence", () => {
    const prompt = buildNotesBriefingPrompt({
      ...input,
      // Deliberately prove unknown caller data cannot leak into the explicit evidence shape.
      localNotes: ["private workspace note"]
    } as NotesBriefingInput & { localNotes: string[] });

    expect(prompt).toContain('"key":"YLOG-352"');
    expect(prompt).toContain("Confirm the rollback plan.");
    expect(prompt).toContain('"id":472');
    expect(prompt).toContain("3 files changed, +51 -12.");
    expect(prompt).not.toContain("private workspace note");
  });
});

describe("parseNotesBriefing", () => {
  it("normalizes a fenced response and filters unsupported, empty, and duplicate suggestions", () => {
    const result = parseNotesBriefing(
      [
        "```json",
        JSON.stringify({
          suggestions: [
            { kind: "RISK", text: "  The fallback may mask connection failures.  " },
            { kind: "question", text: "Is rollback behavior covered?" },
            { kind: "CHECK", text: "Verify metrics in staging." },
            { kind: "fact", text: "Unsupported." },
            { kind: "risk", text: "" },
            { kind: "risk", text: "The fallback may mask connection failures." }
          ]
        }),
        "```"
      ].join("\n")
    );

    expect(result).toEqual([
      {
        id: "briefing-1",
        kind: "risk",
        text: "The fallback may mask connection failures."
      },
      {
        id: "briefing-2",
        kind: "question",
        text: "Is rollback behavior covered?"
      },
      {
        id: "briefing-3",
        kind: "check",
        text: "Verify metrics in staging."
      }
    ]);
  });

  it("returns an empty briefing for malformed or schema-invalid output", () => {
    expect(parseNotesBriefing("not json")).toEqual([]);
    expect(parseNotesBriefing('{"items":[]}')).toEqual([]);
    expect(parseNotesBriefing('{"suggestions":"nope"}')).toEqual([]);
  });
});

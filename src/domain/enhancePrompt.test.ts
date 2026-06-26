import { describe, expect, it } from "vitest";
import { buildEnhancePrompt, parseEnhanceResponse } from "./enhancePrompt";
import type { ReconstructDay, TimelineRow } from "./reconstruct";

const row = (overrides: Partial<TimelineRow> & Pick<TimelineRow, "hour" | "kind">): TimelineRow => ({
  key: "",
  title: "",
  sub: "",
  durationMinutes: 0,
  naiveDescription: "",
  ...overrides
});

const day = (): ReconstructDay => ({
  dateKey: "2026-06-15",
  kind: "past",
  isToday: false,
  signals: [],
  rows: [
    row({ hour: "09:00", kind: "filled", key: "FTDM-328", title: "Auth middleware", naiveDescription: "fix npe; wip", durationMinutes: 60 }),
    row({ hour: "10:00", kind: "empty", gapText: "Gap — no signals.", gapCta: "Add 30m" }),
    row({ hour: "11:00", kind: "locked", key: "FTDM-9", title: "Standup", durationMinutes: 30 })
  ],
  targetMinutes: 480,
  accountableMinutes: 480,
  reconstructedMinutes: 60,
  loggedMinutes: 30,
  gapMinutes: 390,
  sendCount: 1,
  placements: {},
  unplacedSignalIds: []
});

describe("buildEnhancePrompt", () => {
  it("includes the day, the filled entries and the gaps", () => {
    const prompt = buildEnhancePrompt(day());
    expect(prompt).toContain("2026-06-15");
    expect(prompt).toContain("fix npe; wip");
    expect(prompt).toContain('"hour":"10:00"');
  });
});

describe("parseEnhanceResponse", () => {
  it("overlays drafts and gap inferences onto matching rows", () => {
    const response = JSON.stringify({
      entries: [{ hour: "09:00", draft: "Implemented auth middleware and fixed a null-pointer regression." }],
      gaps: [{ hour: "10:00", text: "Likely continued on FTDM-328." }]
    });
    const enhanced = parseEnhanceResponse(day(), response);

    expect(enhanced.rows[0].aiDraft).toBe("Implemented auth middleware and fixed a null-pointer regression.");
    expect(enhanced.rows[1].gapText).toBe("Likely continued on FTDM-328.");
    // locked rows are never touched
    expect(enhanced.rows[2].aiDraft).toBeUndefined();
  });

  it("tolerates code fences / surrounding prose", () => {
    const response = 'Here you go:\n```json\n{"entries":[{"hour":"09:00","draft":"Cleaned up auth."}]}\n```';
    const enhanced = parseEnhanceResponse(day(), response);
    expect(enhanced.rows[0].aiDraft).toBe("Cleaned up auth.");
  });

  it("returns the input unchanged on malformed output", () => {
    const base = day();
    expect(parseEnhanceResponse(base, "not json at all")).toBe(base);
    expect(parseEnhanceResponse(base, "{ broken json")).toBe(base);
    expect(parseEnhanceResponse(base, JSON.stringify({ entries: [], gaps: [] }))).toBe(base);
  });

  it("ignores entries that do not match a filled row", () => {
    const enhanced = parseEnhanceResponse(day(), JSON.stringify({ entries: [{ hour: "23:00", draft: "x" }] }));
    expect(enhanced.rows.every((r) => r.aiDraft === undefined)).toBe(true);
  });
});

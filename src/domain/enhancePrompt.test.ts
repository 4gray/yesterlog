import { describe, expect, it } from "vitest";
import { applyAiDrafts, buildEnhancePrompt, parseAiDrafts } from "./enhancePrompt";
import type { ReconstructDay, ReconstructSignal, TimelineRow } from "./reconstruct";

const signal = (overrides: Partial<ReconstructSignal>): ReconstructSignal => ({
  id: "sig-1",
  kind: "commit",
  key: "FTDM-328",
  title: "Auth middleware",
  sub: "web-app · 5 commits",
  durationMinutes: 60,
  isMarker: false,
  confidence: "high",
  startHour: 9,
  naiveDescription: "fix npe; wip",
  ...overrides
});

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
  signals: [signal({ id: "sig-1" })],
  rows: [
    row({ hour: "09:00", kind: "filled", signalId: "sig-1", key: "FTDM-328", title: "Auth middleware", durationMinutes: 60 }),
    row({ hour: "10:00", kind: "empty", gapText: "Gap.", gapCta: "Add" }),
    row({ hour: "11:00", kind: "locked", key: "FTDM-9", title: "Standup", durationMinutes: 30 })
  ],
  targetMinutes: 480,
  accountableMinutes: 480,
  reconstructedMinutes: 60,
  loggedMinutes: 30,
  gapMinutes: 390,
  sendCount: 1,
  placements: { "sig-1": 9 },
  unplacedSignalIds: []
});

describe("buildEnhancePrompt", () => {
  it("includes the day, signal ids and the gaps", () => {
    const prompt = buildEnhancePrompt(day());
    expect(prompt).toContain("2026-06-15");
    expect(prompt).toContain('"id":"sig-1"');
    expect(prompt).toContain("fix npe; wip");
    expect(prompt).toContain('"hour":"10:00"');
  });
});

describe("parseAiDrafts", () => {
  it("parses signal-keyed entries and hour-keyed gaps", () => {
    const drafts = parseAiDrafts(
      JSON.stringify({
        entries: [{ id: "sig-1", draft: "Implemented auth middleware." }],
        gaps: [{ hour: "10:00", text: "Likely continued FTDM-328." }]
      })
    );
    expect(drafts.entries["sig-1"]).toBe("Implemented auth middleware.");
    expect(drafts.gaps["10:00"]).toBe("Likely continued FTDM-328.");
  });

  it("tolerates code fences / surrounding prose", () => {
    const drafts = parseAiDrafts('```json\n{"entries":[{"id":"sig-1","draft":"Cleaned up auth."}]}\n```');
    expect(drafts.entries["sig-1"]).toBe("Cleaned up auth.");
  });

  it("returns empty maps on malformed output", () => {
    expect(parseAiDrafts("not json").entries).toEqual({});
    expect(parseAiDrafts("{ broken").gaps).toEqual({});
  });
});

describe("applyAiDrafts", () => {
  it("overlays drafts by signal id (survives re-positioning) and gaps by hour", () => {
    const base = day();
    const enhanced = applyAiDrafts(base, {
      entries: { "sig-1": "Implemented auth middleware." },
      gaps: { "10:00": "Likely continued FTDM-328." }
    });
    expect(enhanced.rows[0].aiDraft).toBe("Implemented auth middleware.");
    expect(enhanced.rows[1].gapText).toBe("Likely continued FTDM-328.");
    expect(enhanced.rows[2].aiDraft).toBeUndefined(); // locked rows untouched
  });

  it("matches a draft to its signal even after the row moved to another hour", () => {
    const moved = day();
    moved.rows[0] = { ...moved.rows[0], hour: "15:00" }; // same signalId, different hour
    const enhanced = applyAiDrafts(moved, { entries: { "sig-1": "Polished prose." }, gaps: {} });
    expect(enhanced.rows.find((r) => r.hour === "15:00")?.aiDraft).toBe("Polished prose.");
  });

  it("returns the input unchanged when there are no drafts", () => {
    const base = day();
    expect(applyAiDrafts(base, { entries: {}, gaps: {} })).toBe(base);
  });
});

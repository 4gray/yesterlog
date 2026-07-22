import { describe, expect, it } from "vitest";
import type { RecapDetail, RecapFormat } from "../../shared/types";
import { buildDeterministicRecap, recapIntervalForDate, type RecapEvidenceInput } from "./recapWorkspace";
import { buildRecapWorkspacePrompt, parseRecapWorkspaceDraft } from "./recapWorkspacePrompt";

const fallback = () => {
  const input: RecapEvidenceInput = {
    interval: recapIntervalForDate("week", new Date(2026, 5, 17)),
    syncResults: [], reviewResults: [], activityResults: [], recurringEntries: [], reconstructDrafts: {},
    personalNotes: [{ id: "fact", weekKey: "2026-06-15", dateKey: "2026-06-17", title: "Design review", text: "Reviewed the flow", timeSpentSeconds: 3600, startedISO: "2026-06-17T10:00:00Z", createdAt: "2026-06-17T10:00:00Z", updatedAt: "2026-06-17T10:00:00Z" }]
  };
  return buildDeterministicRecap(input, 1, new Date(2026, 5, 17));
};

const responseFor = (
  draft: ReturnType<typeof fallback>,
  format: RecapFormat,
  mutate?: (copy: Record<string, unknown>) => void
) => JSON.stringify({
  format,
  themes: draft.themes.map((theme) => {
    const copy: Record<string, unknown> = {
      lead: "Grounded update.",
      version: format === "changelog" ? "Grounded release." : undefined,
      paragraphs: format === "perf" || format === "manager"
        ? [{ id: `${format}-paragraph`, text: "The available history records grounded work from the cited evidence.", refs: ["note:fact"] }]
        : [],
      lines: [{
        id: `${format}-line`,
        short: "Completed grounded work.",
        long: "Completed grounded work from the cited evidence.",
        refs: ["note:fact"],
        needsImpact: format === "cv"
      }]
    };
    mutate?.(copy);
    return { id: theme.id, name: theme.name, copy };
  })
});

describe("Recap AI grounding", () => {
  it("prompts for one audience and includes rich source and coverage context", () => {
    const draft = fallback();
    const prompt = buildRecapWorkspacePrompt(draft, "perf", "detailed");
    expect(prompt).toContain("Write only the perf format at detailed detail");
    expect(prompt).toContain("note:fact");
    expect(prompt).toContain('"coverage"');
    expect(prompt).toContain('"notes":["Reviewed the flow"]');
  });

  it.each<[RecapFormat, RecapDetail]>([
    ["perf", "detailed"], ["manager", "balanced"], ["cv", "detailed"], ["standup", "headline"], ["changelog", "balanced"]
  ])("accepts grounded %s copy without changing other format drafts", (format, detail) => {
    const draft = fallback();
    const parsed = parseRecapWorkspaceDraft(responseFor(draft, format), draft, format, detail);
    expect(parsed?.generator).toBe("ai");
    expect(parsed?.aiFormats).toContain(format);
    expect(parsed?.themes[0].copy[format].lines[0].refs).toEqual(["note:fact"]);
  });

  it("rejects unknown references, unsupported numbers, unexpected paragraphs, and invalid tags", () => {
    const draft = fallback();
    expect(parseRecapWorkspaceDraft(responseFor(draft, "perf", (copy) => {
      (copy.paragraphs as Array<Record<string, unknown>>)[0].refs = ["unknown"];
    }), draft, "perf", "detailed")).toBeUndefined();
    expect(parseRecapWorkspaceDraft(responseFor(draft, "manager", (copy) => {
      (copy.lines as Array<Record<string, unknown>>)[0].long = "Improved output by 99 percent.";
    }), draft, "manager", "detailed")).toBeUndefined();
    expect(parseRecapWorkspaceDraft(responseFor(draft, "cv", (copy) => {
      copy.paragraphs = [{ text: "Unexpected narrative.", refs: ["note:fact"] }];
    }), draft, "cv", "detailed")).toBeUndefined();
    expect(parseRecapWorkspaceDraft(responseFor(draft, "changelog", (copy) => {
      (copy.lines as Array<Record<string, unknown>>)[0].tag = "Removed";
    }), draft, "changelog", "detailed")).toBeUndefined();
  });

  it("passes user claims as trusted evidence and preserves them across an AI rewrite", () => {
    const draft = fallback();
    draft.themes[0].copy.cv.lines[0].userImpact = "Unblocked the release review for the platform team";
    draft.themes[0].copy.cv.lines[0].needsImpact = false;

    expect(buildRecapWorkspacePrompt(draft, "cv", "detailed")).toContain(
      '"userImpact":"Unblocked the release review for the platform team"'
    );
    const parsed = parseRecapWorkspaceDraft(responseFor(draft, "cv"), draft, "cv", "detailed");
    expect(parsed?.themes[0].copy.cv.lines[0]).toMatchObject({
      needsImpact: false,
      userImpact: "Unblocked the release review for the platform team"
    });
  });

  it("assigns one user outcome to only one line when AI splits a CV candidate", () => {
    const draft = fallback();
    const theme = draft.themes[0];
    draft.sources.push({ ...draft.sources[0], id: "note:other", title: "Second grounded task" });
    theme.sourceIds.push("note:other");
    theme.copy.cv.lines[0].refs = ["note:fact", "note:other"];
    theme.copy.cv.lines[0].userImpact = "Unblocked the release review for the platform team";
    theme.copy.cv.lines[0].needsImpact = false;

    const parsed = parseRecapWorkspaceDraft(responseFor(draft, "cv", (copy) => {
      copy.lines = [
        { id: "split-a", short: "Reviewed the first grounded task.", long: "Reviewed the first grounded task.", refs: ["note:fact"], needsImpact: true },
        { id: "split-b", short: "Reviewed the second grounded task.", long: "Reviewed the second grounded task.", refs: ["note:other"], needsImpact: true }
      ];
    }), draft, "cv", "detailed");
    const lines = parsed!.themes[0].copy.cv.lines;

    expect(lines.filter((line) => line.userImpact)).toHaveLength(1);
    expect(lines.filter((line) => line.needsImpact)).toHaveLength(1);
    expect(lines.find((line) => line.userImpact)?.userImpact).toBe(
      "Unblocked the release review for the platform team"
    );
  });

  it("rejects responses with no visible copy for the requested detail", () => {
    const draft = fallback();
    expect(parseRecapWorkspaceDraft(responseFor(draft, "cv", (copy) => {
      copy.lines = [];
    }), draft, "cv", "detailed")).toBeUndefined();
    expect(parseRecapWorkspaceDraft(responseFor(draft, "standup", (copy) => {
      copy.lead = undefined;
      copy.lines = [];
    }), draft, "standup", "headline")).toBeUndefined();
  });

  it("preserves richer fallback content when applying a headline rewrite", () => {
    const draft = fallback();
    const original = structuredClone(draft.themes[0].copy.perf);
    const parsed = parseRecapWorkspaceDraft(responseFor(draft, "perf", (copy) => {
      copy.lead = "AI brief.";
      copy.paragraphs = [];
      copy.lines = [];
    }), draft, "perf", "headline");

    expect(parsed?.themes[0].copy.perf.lead).toBe("AI brief.");
    expect(parsed?.themes[0].copy.perf.paragraphs).toEqual(original.paragraphs);
    expect(parsed?.themes[0].copy.perf.lines).toEqual(original.lines);
  });
});

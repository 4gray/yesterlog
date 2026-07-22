import { describe, expect, it } from "vitest";
import { buildDeterministicRecap, recapIntervalForDate, type RecapEvidenceInput } from "./recapWorkspace";
import { buildRecapWorkspacePrompt, parseRecapWorkspaceDraft } from "./recapWorkspacePrompt";

const fallback = () => {
  const input: RecapEvidenceInput = {
    interval: recapIntervalForDate("week", new Date(2026, 5, 17)),
    syncResults: [], reviewResults: [], activityResults: [], recurringEntries: [], reconstructDrafts: {},
    personalNotes: [{ id: "fact", weekKey: "2026-06-15", dateKey: "2026-06-17", title: "Design review", text: "Reviewed the flow", timeSpentSeconds: 3600, startedISO: "2026-06-17T10:00:00Z", createdAt: "2026-06-17T10:00:00Z", updatedAt: "2026-06-17T10:00:00Z" }]
  };
  return buildDeterministicRecap(input);
};

const responseFor = (draft: ReturnType<typeof fallback>, mutate?: (line: Record<string, unknown>, format: string) => void) => JSON.stringify({
  themes: draft.themes.map((theme) => ({
    id: theme.id,
    name: theme.name,
    copy: Object.fromEntries((["perf", "manager", "cv", "standup", "changelog"] as const).map((format) => {
      const line: Record<string, unknown> = { id: `${format}-line`, short: "Completed grounded work.", long: "Completed grounded work from the cited evidence.", refs: ["note:fact"] };
      if (format === "changelog") line.tag = "Added";
      mutate?.(line, format);
      return [format, { lead: "Grounded update.", version: format === "changelog" ? "Grounded release." : undefined, lines: [line] }];
    }))
  }))
});

describe("Recap AI grounding", () => {
  it("prompts with allowed facts and accepts a fully grounded all-format response", () => {
    const draft = fallback();
    expect(buildRecapWorkspacePrompt(draft)).toContain("note:fact");
    expect(parseRecapWorkspaceDraft(responseFor(draft), draft)?.generator).toBe("ai");
  });

  it("rejects unknown references, unsupported numbers, and invalid changelog tags", () => {
    const draft = fallback();
    expect(parseRecapWorkspaceDraft(responseFor(draft, (line, format) => { if (format === "perf") line.refs = ["unknown"]; }), draft)).toBeUndefined();
    expect(parseRecapWorkspaceDraft(responseFor(draft, (line, format) => { if (format === "manager") line.long = "Improved output by 99 percent."; }), draft)).toBeUndefined();
    expect(parseRecapWorkspaceDraft(responseFor(draft, (line, format) => { if (format === "changelog") line.tag = "Removed"; }), draft)).toBeUndefined();
  });
});

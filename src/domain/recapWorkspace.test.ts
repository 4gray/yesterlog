import { describe, expect, it } from "vitest";
import type { PersonalNote, RecapSourceItem } from "../../shared/types";
import {
  buildDeterministicRecap,
  buildRecapSources,
  buildRecapThemes,
  recapIntervalForDate,
  recapToMarkdown,
  recapToPlainText,
  type RecapEvidenceInput
} from "./recapWorkspace";

const note = (id: string, dateKey: string, hours: number, category?: PersonalNote["category"]): PersonalNote => ({
  id,
  weekKey: "2026-06-01",
  dateKey,
  title: `Work ${id}`,
  text: `Factual evidence ${id}`,
  timeSpentSeconds: hours * 3600,
  startedISO: `${dateKey}T10:00:00.000Z`,
  category,
  createdAt: `${dateKey}T10:00:00.000Z`,
  updatedAt: `${dateKey}T10:00:00.000Z`
});

const evidence = (period: "week" | "month" | "quarter" = "week"): RecapEvidenceInput => ({
  interval: recapIntervalForDate(period, new Date(2026, 5, 17)),
  syncResults: [],
  reviewResults: [],
  activityResults: [],
  personalNotes: [],
  recurringEntries: [],
  reconstructDrafts: {}
});

describe("Recap intervals", () => {
  it("uses Monday-local, calendar-month, and Gregorian-quarter boundaries", () => {
    expect(recapIntervalForDate("week", new Date(2026, 5, 17))).toMatchObject({
      key: "week:2026-06-15",
      startDateKey: "2026-06-15",
      endDateKeyExclusive: "2026-06-22"
    });
    expect(recapIntervalForDate("month", new Date(2024, 1, 29))).toMatchObject({
      key: "month:2024-02",
      startDateKey: "2024-02-01",
      endDateKeyExclusive: "2024-03-01"
    });
    expect(recapIntervalForDate("quarter", new Date(2026, 4, 2))).toMatchObject({
      key: "quarter:2026-Q2",
      startDateKey: "2026-04-01",
      endDateKeyExclusive: "2026-07-01"
    });
  });
});

describe("Recap evidence", () => {
  it("filters exact interval bounds and honors reconstruction placement and duration overrides", () => {
    const input = evidence();
    input.personalNotes = [note("inside", "2026-06-15", 1), note("exclusive-end", "2026-06-22", 4)];
    input.reviewResults = [{
      weekKey: "2026-06-15",
      sessions: [],
      commitGroups: [
        { id: "kept", dateKey: "2026-06-16", estimatedSeconds: 7200, commitCount: 3, primaryMessage: "Kept work", repositorySlug: "web", repositoryName: "web", workspace: "acme", firstCommitISO: "2026-06-16T09:00:00Z", lastCommitISO: "2026-06-16T11:00:00Z", confidence: "high" },
        { id: "unplaced", dateKey: "2026-06-16", estimatedSeconds: 3600, commitCount: 1, primaryMessage: "Unplaced work", repositorySlug: "api", repositoryName: "api", workspace: "acme", firstCommitISO: "2026-06-16T12:00:00Z", lastCommitISO: "2026-06-16T13:00:00Z", confidence: "high" }
      ]
    } as unknown as RecapEvidenceInput["reviewResults"][number]];
    input.reconstructDrafts["2026-06-16"] = { placements: { kept: 10 }, durations: { kept: 45 } };

    const sources = buildRecapSources(input);
    expect(sources.map((source) => source.id)).toEqual(expect.arrayContaining(["note:inside", "commit:kept"]));
    expect(sources.map((source) => source.id)).not.toContain("note:exclusive-end");
    expect(sources.map((source) => source.id)).not.toContain("commit:unplaced");
    expect(sources.find((source) => source.id === "commit:kept")?.timeSpentSeconds).toBe(45 * 60);

    delete input.reconstructDrafts["2026-06-16"];
    const defaults = buildRecapSources(input);
    expect(defaults.find((source) => source.id === "commit:unplaced")?.timeSpentSeconds).toBe(3600);
  });

  it("caps clusters without dropping evidence and keeps exact theme totals", () => {
    const sources: RecapSourceItem[] = [1, 2, 3, 4].map((hours) => ({
      id: `source-${hours}`,
      kind: "local",
      dateKey: "2026-06-17",
      title: `Cluster ${hours}`,
      timeSpentSeconds: hours * 3600,
      clusterKey: `cluster-${hours}`
    }));
    const themes = buildRecapThemes(sources, "quarter");
    expect(themes).toHaveLength(3);
    expect(new Set(themes.flatMap((theme) => theme.sourceIds))).toEqual(new Set(sources.map((source) => source.id)));
    expect(themes.reduce((sum, theme) => sum + theme.hours, 0)).toBe(10);
  });

  it("serializes every format/detail combination and has a deterministic empty state", () => {
    const input = evidence("month");
    input.personalNotes = [note("collab", "2026-06-17", 1.5, "meeting"), note("ops", "2026-06-18", 2)];
    const draft = buildDeterministicRecap(input, 1, new Date("2026-06-30T12:00:00Z"));
    for (const format of ["perf", "manager", "cv", "standup", "changelog"] as const) {
      for (const detail of ["headline", "balanced", "detailed"] as const) {
        expect(recapToPlainText(draft, format, detail)).toContain(draft.interval.label);
        expect(recapToMarkdown(draft, format, detail)).toMatch(/^# /);
      }
    }
    expect(buildDeterministicRecap(evidence()).themes).toEqual([]);
  });
});

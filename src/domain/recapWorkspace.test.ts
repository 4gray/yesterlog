import { describe, expect, it } from "vitest";
import type { PersonalNote, RecapDraftVersion, RecapSourceItem } from "../../shared/types";
import {
  buildDeterministicRecap,
  buildRecapSources,
  buildRecapThemes,
  carryRecapUserImpacts,
  recapRecordHasCurrentSchema,
  recapCoverageNote,
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

describe("Recap schema migration", () => {
  it("treats a record as migrated even when its selected version is legacy", () => {
    const current = buildDeterministicRecap(evidence(), 2, new Date("2026-06-18T12:00:00.000Z"));
    const legacy = { ...structuredClone(current), schemaVersion: 2, version: 1 };

    expect(recapRecordHasCurrentSchema({
      intervalKey: current.interval.key,
      activeVersion: legacy.version,
      versions: [legacy, current]
    })).toBe(true);
    expect(recapRecordHasCurrentSchema({
      intervalKey: current.interval.key,
      activeVersion: legacy.version,
      versions: [legacy]
    })).toBe(false);
  });
});

describe("Recap evidence", () => {
  it("preserves repeated ticket notes and groups the ticket under its product context", () => {
    const input = evidence();
    const worklog = (id: string, started: string, comment: string) => ({
      id, issueId: "100", issueKey: "TBRO-204", issueSummary: "Weekly progress model",
      projectKey: "TBRO", projectName: "TimeBro", authorAccountId: "me", started,
      timeSpentSeconds: 3600, comment
    });
    input.syncResults = [{
      weekKey: "2026-06-15",
      daySummaries: {
        "2026-06-15": { trackedSeconds: 3600, issues: [], worklogs: [worklog("one", "2026-06-15T09:00:00Z", "Built the model")] },
        "2026-06-16": { trackedSeconds: 3600, issues: [], worklogs: [worklog("two", "2026-06-16T09:00:00Z", "Validated skipped days")] }
      }
    } as unknown as RecapEvidenceInput["syncResults"][number]];

    const sources = buildRecapSources(input);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ projectName: "TimeBro", details: ["Built the model", "Validated skipped days"] });
    expect(buildRecapThemes(sources, "week")[0].name).toBe("TimeBro");
  });

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

  it("keeps useful workstreams and only folds a long tail without dropping evidence", () => {
    const sources: RecapSourceItem[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((hours) => ({
      id: `source-${hours}`,
      kind: "local",
      dateKey: "2026-06-17",
      title: `Cluster ${hours}`,
      timeSpentSeconds: hours * 3600,
      clusterKey: `cluster-${hours}`
    }));
    const themes = buildRecapThemes(sources, "quarter");
    expect(themes).toHaveLength(8);
    expect(new Set(themes.flatMap((theme) => theme.sourceIds))).toEqual(new Set(sources.map((source) => source.id)));
    expect(themes.reduce((sum, theme) => sum + theme.hours, 0)).toBe(55);
    expect(themes.at(-1)?.name).toBe("Additional contributions");
  });

  it("builds narrative review copy, honest CV candidates, and explicit partial coverage", () => {
    const input = evidence("month");
    input.personalNotes = [note("collab", "2026-06-17", 1.5, "meeting"), note("ops", "2026-06-18", 2)];
    const draft = buildDeterministicRecap(input, 1, new Date("2026-06-30T12:00:00Z"));
    const performance = recapToPlainText(draft, "perf", "detailed");
    expect(performance).toContain("Work on");
    expect(performance).toContain("The supporting notes include");
    const cv = recapToPlainText(draft, "cv", "detailed");
    expect(cv).toMatch(/Supported|Contributed to/);
    expect(cv).not.toContain("Delivered");
    expect(recapCoverageNote(draft)).toContain("Partial recap");
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

  it("keeps a user-provided CV outcome separate from generated copy and includes it in exports", () => {
    const input = evidence();
    input.personalNotes = [note("impact", "2026-06-17", 2)];
    const draft = buildDeterministicRecap(input, 1, new Date("2026-06-18T12:00:00Z"));
    const line = draft.themes[0].copy.cv.lines[0];
    line.userImpact = "Unblocked the release review for the platform team";
    line.needsImpact = false;

    expect(recapToPlainText(draft, "cv", "detailed")).toContain(
      "Unblocked the release review for the platform team."
    );
    expect(recapToMarkdown(draft, "cv", "detailed")).toContain(
      "Unblocked the release review for the platform team."
    );
  });

  it("carries CV outcomes by stable source identity when repositories reuse a PR number", () => {
    const sources: RecapSourceItem[] = ["repo-a", "repo-b"].map((repository) => ({
      id: `pr:workspace:${repository}:42`,
      kind: "pull-request",
      dateKey: "2026-06-17",
      title: `Review ${repository}`,
      timeSpentSeconds: 3600,
      repository,
      pullRequestId: 42,
      role: "reviewed",
      clusterKey: `repo:${repository}`
    }));
    const makeDraft = (version: number): RecapDraftVersion => ({
      version,
      generatedAt: `2026-06-1${version}T12:00:00.000Z`,
      generator: "deterministic",
      interval: evidence().interval,
      sources: structuredClone(sources),
      themes: buildRecapThemes(structuredClone(sources), "week"),
      coverage: { requestedWeeks: 1, elapsedWeeks: 1, jiraWeeks: 0, bitbucketWeeks: 1, ticketCount: 0, pullRequestCount: 2, commitCount: 0 }
    });
    const current = makeDraft(1);
    const repoA = current.themes.find((theme) => theme.sourceIds.includes("pr:workspace:repo-a:42"))!;
    repoA.copy.cv.lines[0].userImpact = "Helped repo A adopt the review flow";
    repoA.copy.cv.lines[0].needsImpact = false;

    const carried = carryRecapUserImpacts(current, makeDraft(2));
    const nextA = carried.themes.find((theme) => theme.sourceIds.includes("pr:workspace:repo-a:42"))!;
    const nextB = carried.themes.find((theme) => theme.sourceIds.includes("pr:workspace:repo-b:42"))!;

    expect(nextA.copy.cv.lines[0]).toMatchObject({
      refs: ["repo-a#42"],
      needsImpact: false,
      userImpact: "Helped repo A adopt the review flow"
    });
    expect(nextB.copy.cv.lines[0]).toMatchObject({ refs: ["repo-b#42"], needsImpact: true });
    expect(nextB.copy.cv.lines[0].userImpact).toBeUndefined();
  });

  it("carries one CV outcome to only one theme when a combined workstream splits", () => {
    const combinedSources: RecapSourceItem[] = ["repo-a", "repo-b"].map((repository) => ({
      id: `pr:workspace:${repository}:42`,
      kind: "pull-request",
      dateKey: "2026-06-17",
      title: `Review ${repository}`,
      timeSpentSeconds: 3600,
      repository,
      pullRequestId: 42,
      role: "reviewed",
      clusterKey: "repo:combined"
    }));
    const makeDraft = (version: number, sources: RecapSourceItem[]): RecapDraftVersion => ({
      version,
      generatedAt: `2026-06-1${version}T12:00:00.000Z`,
      generator: "deterministic",
      interval: evidence().interval,
      sources: structuredClone(sources),
      themes: buildRecapThemes(structuredClone(sources), "week"),
      coverage: { requestedWeeks: 1, elapsedWeeks: 1, jiraWeeks: 0, bitbucketWeeks: 1, ticketCount: 0, pullRequestCount: 2, commitCount: 0 }
    });
    const current = makeDraft(1, combinedSources);
    current.themes[0].copy.cv.lines[0].userImpact = "Unblocked the shared release review";
    current.themes[0].copy.cv.lines[0].needsImpact = false;
    const splitSources = combinedSources.map((source) => ({ ...source, clusterKey: `repo:${source.repository}` }));

    const carried = carryRecapUserImpacts(current, makeDraft(2, splitSources));
    const lines = carried.themes.flatMap((theme) => theme.copy.cv.lines);

    expect(lines.filter((line) => line.userImpact)).toHaveLength(1);
    expect(lines.filter((line) => line.needsImpact)).toHaveLength(1);
  });
});

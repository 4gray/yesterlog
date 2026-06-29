import { describe, expect, it } from "vitest";
import {
  autoDistribute,
  buildCommitSignals,
  buildReconstructDay,
  buildSignals,
  formatReconDuration,
  getReconstructSummary,
  type ReconstructCommitGroup,
  type ReconstructInput,
  type ReconstructLocalEntry,
  type ReconstructReviewSession,
  type ReconstructWorklog
} from "./reconstruct";

const commit = (overrides: Partial<ReconstructCommitGroup> = {}): ReconstructCommitGroup => ({
  id: "team/web#220:commits:2026-06-15",
  jiraIssueKey: "FTDM-328",
  pullRequestId: 220,
  branch: "feature/FTDM-328-auth",
  repositoryName: "web-app",
  primaryMessage: "Add auth middleware",
  commitCount: 5,
  firstCommitISO: "2026-06-15T09:12:00",
  lastCommitISO: "2026-06-15T11:05:00",
  estimatedSeconds: 110 * 60,
  confidence: "high",
  ...overrides
});

const review = (overrides: Partial<ReconstructReviewSession> = {}): ReconstructReviewSession => ({
  id: "team/web#511:2026-06-15",
  jiraIssueKey: "ftdm-395",
  pullRequestId: 511,
  pullRequestTitle: "schema migration",
  repositoryName: "web-app",
  startedISO: "2026-06-15T11:00:00",
  endedISO: "2026-06-15T11:40:00",
  estimatedSeconds: 40 * 60,
  commentCount: 9,
  confidence: "high",
  ...overrides
});

const worklog = (overrides: Partial<ReconstructWorklog> = {}): ReconstructWorklog => ({
  issueKey: "FTDM-100",
  issueSummary: "Daily standup",
  startedISO: "2026-06-15T13:00:00",
  timeSpentSeconds: 75 * 60,
  ...overrides
});

const localEntry = (overrides: Partial<ReconstructLocalEntry> = {}): ReconstructLocalEntry => ({
  id: "note-1",
  source: "personal-note",
  title: "Private planning",
  startedISO: "2026-06-15T10:00:00",
  timeSpentSeconds: 45 * 60,
  note: "Planning without a Jira ticket",
  ...overrides
});

const input = (overrides: Partial<ReconstructInput> = {}): ReconstructInput => ({
  dateKey: "2026-06-15",
  weekdayIso: 1,
  isToday: false,
  workingDays: [1, 2, 3, 4, 5],
  targetMinutes: 480,
  worklogs: [],
  reviewSessions: [],
  ...overrides
});

describe("formatReconDuration", () => {
  it("formats hours and minutes", () => {
    expect(formatReconDuration(150)).toBe("2h 30m");
    expect(formatReconDuration(60)).toBe("1h");
    expect(formatReconDuration(40)).toBe("40m");
    expect(formatReconDuration(0)).toBe("0m");
  });

  it("supports an estimate prefix", () => {
    expect(formatReconDuration(110, { estimate: true })).toBe("~1h 50m");
  });
});

describe("buildSignals", () => {
  it("maps unlogged review sessions, sorts by start, normalises confidence and key", () => {
    const signals = buildSignals([
      review({ id: "b", startedISO: "2026-06-15T14:00:00", confidence: "medium" }),
      review({ id: "a", startedISO: "2026-06-15T09:00:00", confidence: "high" })
    ]);

    expect(signals.map((s) => s.id)).toEqual(["a", "b"]);
    expect(signals[0]).toMatchObject({ kind: "pr", key: "FTDM-395", confidence: "high", startHour: 9 });
    expect(signals[1].confidence).toBe("med");
    expect(signals[0].title).toBe("Review: schema migration");
  });

  it("excludes already-logged sessions (never offered twice)", () => {
    const signals = buildSignals([review({ id: "logged", logged: true }), review({ id: "open" })]);
    expect(signals.map((s) => s.id)).toEqual(["open"]);
  });

  it("maps commit runs to blue 'commit' work signals attributed to the ticket", () => {
    const [sig] = buildCommitSignals([commit()]);
    expect(sig.kind).toBe("commit");
    expect(sig.key).toBe("FTDM-328");
    expect(sig.title).toBe("Add auth middleware");
    expect(sig.durationMinutes).toBe(110);
    expect(sig.sub).toContain("5 commits");
    expect(sig.naiveDescription).toContain("Add auth middleware");
    expect(sig.naiveDescription).toContain("on feature/FTDM-328-auth");
  });

  it("reclassifies activity on your own PR as low-confidence work, not a review", () => {
    const [own] = buildSignals([review({ isPullRequestAuthor: true, confidence: "high" })]);
    expect(own.title).toBe("On your PR: schema migration");
    expect(own.title).not.toContain("Review");
    expect(own.confidence).toBe("low"); // own-PR comments are a weak signal of work time
    expect(own.key).toBe("FTDM-395"); // still attributed to the PR's ticket
  });

  it("keeps a real review of someone else's PR as a review", () => {
    const [other] = buildSignals([review({ isPullRequestAuthor: false, confidence: "high" })]);
    expect(other.title).toBe("Review: schema migration");
    expect(other.confidence).toBe("high");
  });
});

describe("buildReconstructDay", () => {
  it("returns a calm rest state for a non-working day with no activity", () => {
    const day = buildReconstructDay(input({ weekdayIso: 6 }));
    expect(day.kind).toBe("weekend");
    expect(day.signals).toHaveLength(0);
    expect(day.rows).toHaveLength(0);
    expect(getReconstructSummary(day)).toMatchObject({ bigLabel: "Weekend", bigWord: "rest day" });
  });

  it("renders a weekend that has real signals as a normal day", () => {
    const day = buildReconstructDay(input({ weekdayIso: 7, reviewSessions: [review()] }));
    expect(day.kind).toBe("past");
    expect(day.signals).toHaveLength(1);
  });

  it("reconstructs an active day from signals + already-logged worklogs", () => {
    const day = buildReconstructDay(
      input({
        reviewSessions: [
          review({ id: "open-1", startedISO: "2026-06-15T09:00:00", estimatedSeconds: 110 * 60, confidence: "high" }),
          review({ id: "open-2", startedISO: "2026-06-15T11:00:00", estimatedSeconds: 40 * 60, confidence: "medium" }),
          review({ id: "done", logged: true })
        ],
        worklogs: [worklog()]
      })
    );

    expect(day.kind).toBe("past");
    expect(day.signals).toHaveLength(2); // logged session excluded
    expect(day.reconstructedMinutes).toBe(150);
    expect(day.loggedMinutes).toBe(75);
    expect(day.gapMinutes).toBe(255);
    expect(day.sendCount).toBe(2);

    const nine = day.rows.find((row) => row.hour === "09:00");
    expect(nine).toMatchObject({ kind: "filled", durationMinutes: 110 });
    expect(nine?.naiveDescription).toContain("pull request #");

    const standup = day.rows.find((row) => row.kind === "locked");
    expect(standup).toMatchObject({ hour: "13:00", durationMinutes: 75, sub: "already in Jira · 1h 15m" });

    expect(day.rows.some((row) => row.kind === "empty")).toBe(true);

    const summary = getReconstructSummary(day);
    expect(summary).toMatchObject({
      bigLabel: "2h 30m",
      bigWord: "reconstructed",
      sub: "· 3h 45m of 8h accounted",
      gapLabel: "4h 15m",
      sendBtnLabel: "Log 2 entries in Jira",
      dayTag: "PAST DAY"
    });
  });

  it("reconstructs an active day from your own commits", () => {
    const day = buildReconstructDay(
      input({ worklogs: [], reviewSessions: [], commits: [commit({ estimatedSeconds: 95 * 60 })] })
    );
    expect(day.kind).toBe("past");
    expect(day.signals.map((s) => s.kind)).toContain("commit");
    const row = day.rows.find((r) => r.kind === "filled" && r.signalKind === "commit");
    expect(row?.key).toBe("FTDM-328");
    expect(row?.naiveDescription).toContain("Add auth middleware");
    expect(day.reconstructedMinutes).toBe(95);
  });

  it("counts private notes and confirmed local events as locked local time", () => {
    const day = buildReconstructDay(
      input({
        worklogs: [worklog()],
        reviewSessions: [review()],
        localEntries: [
          localEntry(),
          localEntry({
            id: "recurring:standup:2026-06-15",
            source: "recurring",
            title: "Daily Standup",
            startedISO: "2026-06-15T11:00:00",
            timeSpentSeconds: 30 * 60,
            note: "Team sync"
          })
        ]
      })
    );

    expect(day.loggedMinutes).toBe(75);
    expect(day.localMinutes).toBe(75);
    expect(day.reconstructedMinutes).toBe(40);
    expect(day.gapMinutes).toBe(290);
    expect(day.sendCount).toBe(1);
    expect(day.rows.filter((row) => row.lockedSource === "personal-note")).toHaveLength(1);
    expect(day.rows.filter((row) => row.lockedSource === "recurring")).toHaveLength(1);
    expect(getReconstructSummary(day)).toMatchObject({
      sub: "· 3h 10m of 8h accounted",
      gapLabel: "4h 50m",
      sendBtnLabel: "Log 1 entry in Jira"
    });
  });

  it("combines commits and reviews into one signal list", () => {
    const day = buildReconstructDay(
      input({ worklogs: [], reviewSessions: [review()], commits: [commit()] })
    );
    const kinds = day.signals.map((s) => s.kind).sort();
    expect(kinds).toEqual(["commit", "pr"]);
  });

  it("respects an explicit placement map (drag/drop draft), leaving the rest unplaced", () => {
    const args = input({
      worklogs: [],
      reviewSessions: [review({ id: "rev", startedISO: "2026-06-17T11:00:00" })],
      commits: [commit({ id: "com" })]
    });

    // default: everything auto-placed onto the timeline
    expect(buildReconstructDay(args).unplacedSignalIds).toHaveLength(0);

    // draft: only the commit is placed (at 16:00); the review returns to the rail
    const draft = buildReconstructDay(args, { com: 16 });
    expect(draft.unplacedSignalIds).toEqual(["rev"]);
    expect(draft.placements).toMatchObject({ com: 16 });
    const placed = draft.rows.find((row) => row.signalId === "com");
    expect(placed).toMatchObject({ kind: "filled", hour: "16:00" });
    expect(draft.rows.some((row) => row.signalId === "rev")).toBe(false);
    expect(draft.reconstructedMinutes).toBe(110); // only the placed commit counts
  });

  it("applies per-signal duration overrides to the row and totals", () => {
    const args = input({ worklogs: [], reviewSessions: [], commits: [commit({ id: "com", estimatedSeconds: 110 * 60 })] });
    const day = buildReconstructDay(args, { com: 10 }, { com: 60 }); // override 1h 50m → 1h
    const row = day.rows.find((r) => r.signalId === "com");
    expect(row?.durationMinutes).toBe(60);
    expect(day.reconstructedMinutes).toBe(60);
  });

  it("describes own-PR work without calling it a review", () => {
    const day = buildReconstructDay(
      input({ worklogs: [], reviewSessions: [review({ isPullRequestAuthor: true })] })
    );
    const row = day.rows.find((r) => r.kind === "filled");
    expect(row?.naiveDescription).toContain("Worked on your pull request");
    expect(row?.naiveDescription).not.toContain("Reviewed");
  });

  it("marks today", () => {
    const day = buildReconstructDay(input({ isToday: true, reviewSessions: [review()] }));
    expect(day.kind).toBe("today");
    expect(getReconstructSummary(day).dayTag).toBe("TODAY");
  });

  it("does not show future gap rows or count future time on today", () => {
    // ~14:00 today → no empty rows past 14:00; accountable = elapsed (09:00–14:00 = 5h)
    const day = buildReconstructDay(input({ isToday: true, worklogs: [], reviewSessions: [], nowMinutes: 14 * 60 }));
    const emptyHours = day.rows.filter((r) => r.kind === "empty").map((r) => r.hour);
    expect(emptyHours).not.toContain("15:00");
    expect(emptyHours).not.toContain("16:00");
    expect(emptyHours).not.toContain("17:00");
    expect(emptyHours).toContain("14:00");
    expect(day.accountableMinutes).toBe(300); // 5h elapsed, not the full 8h
    expect(getReconstructSummary(day).footerTail).toBe("unaccounted so far");
  });

  it("still renders the full 09–18 grid for a finished past day", () => {
    const day = buildReconstructDay(input({ isToday: false, worklogs: [], reviewSessions: [] }));
    const emptyHours = day.rows.filter((r) => r.kind === "empty").map((r) => r.hour);
    expect(emptyHours).toContain("17:00");
    expect(day.accountableMinutes).toBe(480);
  });

  it("auto-distributes only against elapsed time on today (no future fill)", () => {
    const base = buildReconstructDay(
      input({ isToday: true, worklogs: [], reviewSessions: [review({ estimatedSeconds: 60 * 60 })], nowMinutes: 13 * 60 })
    );
    const distributed = autoDistribute(base);
    // every filled row sits at or before 13:00 — nothing fabricated in the future
    const filledHours = distributed.rows.filter((r) => r.kind === "filled").map((r) => r.hour);
    expect(filledHours.every((h) => h <= "13:00")).toBe(true);
    expect(distributed.reconstructedMinutes).toBeLessThanOrEqual(base.accountableMinutes);
  });

  it("treats a fully-logged day as complete with no gap rows", () => {
    const day = buildReconstructDay(
      input({
        worklogs: [
          worklog({ issueKey: "A", startedISO: "2026-06-15T09:00:00", timeSpentSeconds: 240 * 60 }),
          worklog({ issueKey: "B", startedISO: "2026-06-15T14:00:00", timeSpentSeconds: 240 * 60 })
        ]
      })
    );

    expect(day.kind).toBe("complete");
    expect(day.loggedMinutes).toBe(480);
    expect(day.rows.every((row) => row.kind === "locked")).toBe(true);
    expect(getReconstructSummary(day)).toMatchObject({ bigLabel: "8h", bigWord: "logged", sendBtnLabel: "Everything is logged" });
  });

  it("treats a fully accounted local-only day as complete without saying it was Jira-logged", () => {
    const day = buildReconstructDay(
      input({
        localEntries: [localEntry({ timeSpentSeconds: 480 * 60 })]
      })
    );

    expect(day.kind).toBe("complete");
    expect(day.loggedMinutes).toBe(0);
    expect(day.localMinutes).toBe(480);
    expect(day.rows.every((row) => row.lockedSource === "personal-note")).toBe(true);
    expect(getReconstructSummary(day)).toMatchObject({
      bigLabel: "8h",
      bigWord: "accounted",
      sendBtnLabel: "Everything is accounted"
    });
  });

  it("labels a fully-logged current day as TODAY, not PAST DAY", () => {
    const day = buildReconstructDay(
      input({
        isToday: true,
        worklogs: [worklog({ startedISO: "2026-06-15T09:00:00", timeSpentSeconds: 480 * 60 })]
      })
    );
    expect(day.kind).toBe("complete");
    expect(getReconstructSummary(day).dayTag).toBe("TODAY");
  });

  it("never drops rows on a very busy day, and totals match what is rendered", () => {
    const reviewSessions = Array.from({ length: 12 }, (_, index) =>
      review({ id: `s${index}`, startedISO: "2026-06-15T09:00:00", estimatedSeconds: 30 * 60, confidence: "low" })
    );
    const day = buildReconstructDay(input({ worklogs: [], reviewSessions }));

    const filled = day.rows.filter((row) => row.kind === "filled");
    expect(filled).toHaveLength(12); // all rendered, none silently dropped
    expect(day.sendCount).toBe(12);
    expect(day.reconstructedMinutes).toBe(360);
  });
});

describe("autoDistribute", () => {
  it("fills empty gap rows toward the daily target without a model", () => {
    const base = buildReconstructDay(
      input({ worklogs: [worklog()], reviewSessions: [review({ estimatedSeconds: 60 * 60 })] })
    );
    expect(base.gapMinutes).toBeGreaterThan(0);
    const emptyBefore = base.rows.filter((row) => row.kind === "empty").length;
    expect(emptyBefore).toBeGreaterThan(0);

    const distributed = autoDistribute(base);
    expect(distributed.rows.filter((row) => row.kind === "empty").length).toBeLessThan(emptyBefore);
    expect(distributed.reconstructedMinutes).toBeGreaterThan(base.reconstructedMinutes);
    expect(distributed.gapMinutes).toBeLessThanOrEqual(base.gapMinutes);
  });

  it("is a no-op for a complete day", () => {
    const complete = buildReconstructDay(
      input({ worklogs: [worklog({ startedISO: "2026-06-15T09:00:00", timeSpentSeconds: 480 * 60 })] })
    );
    expect(autoDistribute(complete)).toBe(complete);
  });
});

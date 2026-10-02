import { describe, expect, it } from "vitest";
import type { DayTrackingSummary, JiraWorklog } from "../../shared/types";
import { buildCommittedItems } from "./dayCalendar";
import {
  buildCopyTargets,
  canCopyWorklogs,
  copyDraftFromWorklogs,
  copyStartMinutes,
  ticketFromWorklog
} from "./worklogCopy";

const worklog = (overrides: Partial<JiraWorklog> = {}): JiraWorklog => ({
  id: "wl-1",
  issueId: "10001",
  issueKey: "YLOG-397",
  issueSummary: "Restructure the access domain",
  issueUrl: "https://example.atlassian.net/browse/YLOG-397",
  projectKey: "YLOG",
  projectName: "Yesterlog",
  authorAccountId: "me",
  started: "2026-06-15T14:00:00.000+02:00",
  timeSpentSeconds: 2 * 3600,
  comment: "Investigated redirect loop",
  ...overrides
});

const localStart = (dateKey: string, hours: number, minutes = 0) => {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
};

const day = (overrides: Partial<DayTrackingSummary>): DayTrackingSummary => ({
  dateKey: "2026-06-16",
  dateLabel: "Jun 16",
  weekdayName: "Tuesday",
  isToday: false,
  isConfiguredWorkingDay: true,
  isSkipped: false,
  targetHours: 8,
  trackedHours: 0,
  missingHours: 8,
  issues: [],
  personalNotes: [],
  recurringEntries: [],
  pendingRecurring: [],
  ...overrides
});

describe("ticketFromWorklog", () => {
  it("maps the worklog's issue into a ticket the Add Time flows accept", () => {
    const ticket = ticketFromWorklog(worklog({ issueType: { name: "Bug", hierarchyLevel: 0 } }));
    expect(ticket).toMatchObject({
      id: "10001",
      key: "YLOG-397",
      summary: "Restructure the access domain",
      projectKey: "YLOG",
      projectName: "Yesterlog",
      statusCategory: "unknown",
      loggedSecondsTotal: 0,
      url: "https://example.atlassian.net/browse/YLOG-397",
      issueType: { name: "Bug", hierarchyLevel: 0 }
    });
  });

  it("derives the project key from the issue key when Jira did not send one", () => {
    const ticket = ticketFromWorklog(worklog({ projectKey: undefined, projectName: undefined, issueUrl: undefined }));
    expect(ticket.projectKey).toBe("YLOG");
    expect(ticket.projectName).toBe("");
    expect(ticket.url).toBe("");
  });
});

describe("canCopyWorklogs", () => {
  it("rejects empty rows and projected bulk slices", () => {
    expect(canCopyWorklogs([])).toBe(false);
    expect(canCopyWorklogs([worklog()])).toBe(true);
    expect(
      canCopyWorklogs([
        worklog(),
        worklog({
          id: "wl-2",
          allocation: {
            dateKey: "2026-06-16",
            started: "2026-06-16T09:00:00.000Z",
            timeSpentSeconds: 3600,
            partIndex: 1,
            partCount: 2,
            isApproximate: true,
            direction: "backward"
          }
        })
      ])
    ).toBe(false);
  });
});

describe("copyStartMinutes", () => {
  const committedAt = (ranges: [number, number][]) =>
    buildCommittedItems(
      ranges.map(([start, end], index) =>
        worklog({
          id: `busy-${index}`,
          started: localStart("2026-06-16", Math.floor(start / 60), start % 60),
          timeSpentSeconds: (end - start) * 60
        })
      ),
      []
    );

  it("keeps the source clock time when that interval is free", () => {
    expect(
      copyStartMinutes({ sourceStartMinutes: 14 * 60, durationMinutes: 120, committed: committedAt([[9 * 60, 11 * 60]]) })
    ).toEqual({ startMinutes: 14 * 60, placement: "same-time" });
  });

  it("falls back to the first free slot after the day's last entry", () => {
    expect(
      copyStartMinutes({
        sourceStartMinutes: 9 * 60,
        durationMinutes: 120,
        committed: committedAt([
          [9 * 60, 10 * 60],
          [13 * 60, 15 * 60]
        ])
      })
    ).toEqual({ startMinutes: 15 * 60, placement: "after-last" });
  });

  it("uses the first gap inside the window when nothing fits after the last entry", () => {
    expect(
      copyStartMinutes({
        sourceStartMinutes: 9 * 60,
        durationMinutes: 120,
        committed: committedAt([
          [9 * 60, 10 * 60],
          [17 * 60, 18 * 60]
        ]),
        windowStartMin: 8 * 60,
        windowEndMin: 18 * 60
      })
    ).toEqual({ startMinutes: 10 * 60, placement: "first-gap" });
  });

  it("returns undefined when the day has no room", () => {
    expect(
      copyStartMinutes({
        sourceStartMinutes: 9 * 60,
        durationMinutes: 240,
        committed: committedAt([[8 * 60, 17 * 60]]),
        windowStartMin: 8 * 60,
        windowEndMin: 18 * 60
      })
    ).toBeUndefined();
  });

  it("never lets the same-time placement spill past midnight", () => {
    expect(copyStartMinutes({ sourceStartMinutes: 23 * 60, durationMinutes: 120, committed: [] })).toEqual({
      startMinutes: 0,
      placement: "first-gap"
    });
  });
});

describe("buildCopyTargets", () => {
  const days = [
    day({ dateKey: "2026-06-15", weekdayName: "Monday", dateLabel: "Jun 15", trackedHours: 2 }),
    day({
      dateKey: "2026-06-16",
      trackedHours: 6,
      issues: [{ id: "10001", key: "YLOG-397", summary: "x", loggedSeconds: 2 * 3600 }]
    }),
    day({ dateKey: "2026-06-17", weekdayName: "Wednesday", dateLabel: "Jun 17", isSkipped: true }),
    day({ dateKey: "2026-06-18", weekdayName: "Thursday", dateLabel: "Jun 18", isToday: true }),
    day({ dateKey: "2026-06-19", weekdayName: "Friday", dateLabel: "Jun 19" }),
    day({ dateKey: "2026-06-20", weekdayName: "Saturday", dateLabel: "Jun 20", isConfiguredWorkingDay: false, targetHours: 0 })
  ];

  it("keeps calendar order and flags why a day cannot receive the copy", () => {
    const targets = buildCopyTargets({ days, sourceDateKey: "2026-06-15", todayKey: "2026-06-18", issueKey: "YLOG-397" });
    expect(targets.map((target) => [target.dateKey, target.enabled, target.blockedReason])).toEqual([
      ["2026-06-15", false, "source"],
      ["2026-06-16", true, undefined],
      ["2026-06-17", false, "vacation"],
      ["2026-06-18", true, undefined],
      ["2026-06-19", false, "future"],
      ["2026-06-20", false, "future"]
    ]);
  });

  it("reports day totals and hours already logged to the same issue", () => {
    const [, tuesday, , , , saturday] = buildCopyTargets({
      days,
      sourceDateKey: "2026-06-15",
      todayKey: "2026-06-21",
      issueKey: "YLOG-397"
    });
    expect(tuesday).toMatchObject({ trackedHours: 6, targetHours: 8, sameIssueHours: 2 });
    expect(saturday).toMatchObject({ enabled: false, blockedReason: "non-working", sameIssueHours: 0 });
  });
});

describe("copyDraftFromWorklogs", () => {
  it("prefills ticket, duration and comment from a single worklog", () => {
    const draft = copyDraftFromWorklogs([worklog({ started: localStart("2026-06-15", 14) })]);
    expect(draft).toMatchObject({
      ticketKey: "YLOG-397",
      ticketSummary: "Restructure the access domain",
      hours: 2,
      comment: "Investigated redirect loop",
      sourceStartMinutes: 14 * 60
    });
    expect(draft?.ticket.key).toBe("YLOG-397");
  });

  it("adds up a multi-worklog row, keeps a shared comment and drops conflicting ones", () => {
    const shared = copyDraftFromWorklogs([
      worklog({ id: "a", started: localStart("2026-06-15", 15), timeSpentSeconds: 3600, comment: "Pairing" }),
      worklog({ id: "b", started: localStart("2026-06-15", 9), timeSpentSeconds: 1800, comment: " Pairing " }),
      worklog({ id: "c", started: localStart("2026-06-15", 11), timeSpentSeconds: 1800, comment: undefined })
    ]);
    expect(shared).toMatchObject({ hours: 2, comment: "Pairing", sourceStartMinutes: 9 * 60 });

    const conflicting = copyDraftFromWorklogs([
      worklog({ id: "a", comment: "Pairing" }),
      worklog({ id: "b", comment: "Review" })
    ]);
    expect(conflicting?.comment).toBe("");
  });

  it("refuses bulk slices", () => {
    expect(
      copyDraftFromWorklogs([
        worklog({
          allocation: {
            dateKey: "2026-06-16",
            started: "2026-06-16T09:00:00.000Z",
            timeSpentSeconds: 3600,
            partIndex: 1,
            partCount: 2,
            isApproximate: true,
            direction: "backward"
          }
        })
      ])
    ).toBeUndefined();
  });
});

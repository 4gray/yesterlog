import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AppSettings, JiraTicket, JiraWorklog, PendingRecurringOccurrence, RecurringEntry } from "../../shared/types";
import type { ReconstructSignal } from "../domain/reconstruct";
import { TodayView } from "./TodayView";

const ghostSignal: ReconstructSignal = {
  id: "sig-1",
  kind: "commit",
  key: "TBRO-500",
  title: "Detected coding session",
  sub: "web-app · 5 commits · 14:00–15:30",
  durationMinutes: 90,
  isMarker: false,
  confidence: "med",
  startHour: 14,
  naiveDescription: "Worked on TBRO-500"
};

const settings = {
  aiEnabled: false,
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "llama3.1:8b",
  timelineFocusTime: "06:30",
  timelineCenterOnNow: false
} as AppSettings;

const ticket: JiraTicket = {
  id: "133470",
  key: "TBRO-397",
  summary: "Restructure the access domain in nx monorepo",
  projectKey: "TBRO",
  projectName: "TimeBro Product",
  statusName: "In Progress",
  statusCategory: "indeterminate",
  loggedSecondsTotal: 0,
  issueType: { name: "Epic", hierarchyLevel: 1 },
  url: "https://elevait.atlassian.net/browse/TBRO-397"
};

const touchedTicket: JiraTicket = {
  id: "133471",
  key: "TBRO-401",
  summary: "Review current-work tracking",
  projectKey: "TBRO",
  projectName: "TimeBro Product",
  statusName: "Selected for Development",
  statusCategory: "new",
  loggedSecondsTotal: 0,
  issueType: { name: "Sub-task", subtask: true, hierarchyLevel: -1 },
  url: "https://elevait.atlassian.net/browse/TBRO-401"
};

const worklog: JiraWorklog = {
  id: "2001",
  issueId: "133470",
  issueKey: "TBRO-397",
  issueSummary: "Restructure the access domain in nx monorepo",
  authorAccountId: "account-1",
  started: "2026-06-18T08:00:00.000Z",
  timeSpentSeconds: 3600,
  comment: "Follow-up on access package structure"
};

const personalNote = {
  id: "note-1",
  weekKey: "2026-06-15",
  dateKey: "2026-06-18",
  text: "Mentoring and planning",
  timeSpentSeconds: 2 * 3600,
  startedISO: "2026-06-18T12:00:00.000Z",
  createdAt: "2026-06-18T12:00:00.000Z",
  updatedAt: "2026-06-18T12:00:00.000Z"
};

const recurringEntry: RecurringEntry = {
  eventId: "rec-daily",
  dateKey: "2026-06-18",
  title: "Daily Standup",
  localTime: "09:15",
  timeSpentSeconds: 15 * 60,
  note: "Blockers & plan for the day"
};

const pendingRecurring: PendingRecurringOccurrence = {
  eventId: "rec-sync",
  dateKey: "2026-06-18",
  title: "Weekly Team Sync",
  localTime: "15:00",
  defaultDurationMinutes: 30,
  defaultNote: "Team weekly — demos & announcements"
};

const renderToday = (
  detectedSignals: ReconstructSignal[] = [],
  recurringEntries: RecurringEntry[] = [],
  pending: PendingRecurringOccurrence[] = [],
  dockTickets: JiraTicket[] = []
) =>
  renderToStaticMarkup(
    <TodayView
      date={new Date("2026-06-18T10:00:00.000Z")}
      ticketOptions={[ticket, touchedTicket]}
      todayWorklogs={[worklog]}
      detectedSignals={detectedSignals}
      personalNotes={[personalNote]}
      recurringEntries={recurringEntries}
      pendingRecurring={pending}
      todayTrackedHours={1}
      dailyTargetHours={8}
      touchedNotLogged={[touchedTicket]}
      dockTickets={dockTickets}
      activeTicketCount={dockTickets.length}
      settings={settings}
      reminderTime="17:00"
      remindersEnabled={true}
      onCreateAt={() => undefined}
      onMoveWorklog={async () => true}
      onMoveRecurring={async () => true}
      onConfirmRecurring={async () => true}
      onSkipRecurring={async () => true}
      onEditWorklog={() => undefined}
      onEditPersonalNote={() => undefined}
    />
  );

describe("TodayView calendar", () => {
  it("renders worklogs and notes as calendar blocks on the day grid", () => {
    const markup = renderToday();

    expect(markup).toContain("cal-track");
    expect(markup).toContain("height:1440px");
    // Worklog block — key title + summary detail.
    expect(markup).toContain("TBRO-397");
    expect(markup).toContain("Restructure the access domain in nx monorepo");
    // Personal note block — falls back to its text as the title.
    expect(markup).toContain("Mentoring and planning");
    // Blocks are colored by role: worklog = accent, note = firefighting.
    expect(markup).toContain("cal-block--accent");
    expect(markup).toContain("cal-block--fire");
  });

  it("keeps the rail's touched-today tickets with their Jira links", () => {
    const markup = renderToday();

    expect(markup).toContain("TOUCHED TODAY");
    expect(markup).toContain("Open TBRO-401 in Jira");
    expect(markup).toContain("https://elevait.atlassian.net/browse/TBRO-401");
  });

  it("keeps the header figure and daily target", () => {
    const markup = renderToday();

    expect(markup).toContain("LOGGED OF 8h");
  });

  it("renders the active-work dock with Today-specific logging guidance", () => {
    const markup = renderToday([], [], [], [touchedTicket]);

    expect(markup).toContain("MY ACTIVE WORK");
    expect(markup).toContain("select a card to log time today");
    expect(markup).toContain("Log time for TBRO-401 today");
  });

  it("renders detected-but-unlogged activity as a ghost block", () => {
    const markup = renderToday([ghostSignal]);

    expect(markup).toContain("cal-block--ghost");
    expect(markup).toContain("TBRO-500");
    expect(markup).toContain("Detected coding session");
  });

  it("does not ghost activity for a ticket already logged today", () => {
    // The worklog fixture logs TBRO-397, so a signal for it must be suppressed.
    const loggedSignal: ReconstructSignal = { ...ghostSignal, id: "sig-2", key: "TBRO-397" };
    const markup = renderToday([loggedSignal]);

    expect(markup).not.toContain("cal-block--ghost");
  });

  it("renders a confirmed recurring ritual as a committed meeting block", () => {
    const markup = renderToday([], [recurringEntry]);

    // The standup shows on the grid as a recurring, meeting-colored committed block.
    expect(markup).toContain("cal-block--recurring");
    expect(markup).toContain("cal-block--meeting");
    expect(markup).toContain("is-draggable");
    expect(markup).toContain("Daily Standup");
    // It is not part of the ghost layer.
    expect(markup).not.toContain("cal-block--ghost");
  });

  it("renders a pending recurring ritual as a confirm/skip suggestion block", () => {
    const markup = renderToday([], [], [pendingRecurring]);

    // The unconfirmed weekly sync shows as a dashed suggestion with a skip affordance.
    expect(markup).toContain("cal-block--recurring-pending");
    expect(markup).toContain("Weekly Team Sync");
    expect(markup).toContain("cal-pending-skip");
    // A suggestion is not part of the ghost layer.
    expect(markup).not.toContain("cal-block--ghost");
  });
});

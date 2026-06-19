import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { JiraTicket, JiraWorklog } from "../../shared/types";
import { TodayView } from "./TodayView";

const ticket: JiraTicket = {
  id: "133470",
  key: "FTDM-397",
  summary: "Restructure the access domain in nx monorepo",
  projectKey: "FTDM",
  projectName: "Feature Team Data Management",
  statusName: "In Progress",
  statusCategory: "indeterminate",
  loggedSecondsTotal: 0,
  issueType: { name: "Epic", hierarchyLevel: 1 },
  url: "https://elevait.atlassian.net/browse/FTDM-397"
};

const touchedTicket: JiraTicket = {
  id: "133471",
  key: "FTDM-401",
  summary: "Review current-work tracking",
  projectKey: "FTDM",
  projectName: "Feature Team Data Management",
  statusName: "Selected for Development",
  statusCategory: "new",
  loggedSecondsTotal: 0,
  issueType: { name: "Sub-task", subtask: true, hierarchyLevel: -1 },
  url: "https://elevait.atlassian.net/browse/FTDM-401"
};

const worklog: JiraWorklog = {
  id: "2001",
  issueId: "133470",
  issueKey: "FTDM-397",
  issueSummary: "Restructure the access domain in nx monorepo",
  authorAccountId: "account-1",
  started: "2026-06-18T08:00:00.000Z",
  timeSpentSeconds: 3600,
  comment: "Follow-up on access package structure"
};

describe("TodayView", () => {
  it("shows Jira link icons for today's selected, logged, and touched ticket keys", () => {
    const markup = renderToStaticMarkup(
      <TodayView
        date={new Date("2026-06-18T10:00:00.000Z")}
        selectedTicket={ticket}
        ticketOptions={[ticket, touchedTicket]}
        todayWorklogs={[worklog]}
        issueUrlsByKey={{ [ticket.key]: ticket.url }}
        issueTypesByKey={{ [ticket.key]: ticket.issueType, [touchedTicket.key]: touchedTicket.issueType }}
        todayTrackedHours={1}
        dailyTargetHours={8}
        touchedNotLogged={[touchedTicket]}
        reminderTime="17:00"
        remindersEnabled={true}
        isConfigured={true}
        isLogging={false}
        onLog={async () => true}
        onSelectTicket={() => undefined}
      />
    );

    expect(markup).toContain("Open FTDM-397 in Jira");
    expect(markup).toContain("https://elevait.atlassian.net/browse/FTDM-397");
    expect(markup).toContain("Open FTDM-401 in Jira");
    expect(markup).toContain("https://elevait.atlassian.net/browse/FTDM-401");
    expect(markup).toContain("EPIC");
    expect(markup).toContain("SUB");
  });
});

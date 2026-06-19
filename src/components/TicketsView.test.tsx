import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { JiraTicket } from "../../shared/types";
import { TicketsView } from "./TicketsView";

const ticket: JiraTicket = {
  id: "133470",
  key: "FTDM-397",
  summary: "Restructure the access domain in nx monorepo",
  projectKey: "FTDM",
  projectName: "Feature Team Data Management",
  statusName: "In Progress",
  statusCategory: "indeterminate",
  loggedSecondsTotal: 0,
  issueType: { name: "Sub-task", subtask: true, hierarchyLevel: -1 },
  url: "https://elevait.atlassian.net/browse/FTDM-397"
};

describe("TicketsView", () => {
  it("shows Jira link icons next to ticket-list keys", () => {
    const markup = renderToStaticMarkup(
      <TicketsView
        inProgress={[ticket]}
        recentlyClosed={[]}
        favoriteKeys={[]}
        hoursByKey={{ [ticket.key]: 2 }}
        weekHoursLogged={2}
        isConfigured={true}
        isLoading={false}
        onToggleFavorite={() => undefined}
        onLog={() => undefined}
      />
    );

    expect(markup).toContain("FTDM-397");
    expect(markup).toContain("https://elevait.atlassian.net/browse/FTDM-397");
    expect(markup).toContain("Open FTDM-397 in Jira");
    expect(markup).toContain("SUB");
  });
});

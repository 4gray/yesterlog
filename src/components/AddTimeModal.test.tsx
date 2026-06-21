import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { JiraTicket } from "../../shared/types";
import { AddTimeModal } from "./AddTimeModal";

const ticket: JiraTicket = {
  id: "133470",
  key: "FTDM-397",
  summary: "Restructure the access domain in nx monorepo",
  projectKey: "FTDM",
  projectName: "Feature Team Data Management",
  statusName: "In Progress",
  statusCategory: "indeterminate",
  loggedSecondsTotal: 0,
  issueType: { name: "Task", hierarchyLevel: 0 },
  url: "https://elevait.atlassian.net/browse/FTDM-397"
};

describe("AddTimeModal", () => {
  it("falls back from a weekend date to the latest selectable working day", () => {
    const markup = renderToStaticMarkup(
      <AddTimeModal
        date={new Date(2026, 5, 21, 10, 30)}
        dateOptions={["2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19"]}
        ticketOptions={[ticket]}
        isConfigured={true}
        isLogging={false}
        onClose={() => undefined}
        onLog={async () => true}
        onAddPersonalNote={async () => true}
      />
    );

    expect(markup).toContain("FRI");
    expect(markup).toContain("19 JUN");
    expect(markup).toContain("Custom");
    expect(markup).not.toContain("SUN");
    expect(markup).not.toContain("21 JUN");
  });
});

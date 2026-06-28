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

  it("keeps a weekend date when it is an active working-day option", () => {
    const markup = renderToStaticMarkup(
      <AddTimeModal
        date={new Date(2026, 5, 21, 10, 30)}
        dateOptions={["2026-06-21"]}
        ticketOptions={[ticket]}
        isConfigured={true}
        isLogging={false}
        onClose={() => undefined}
        onLog={async () => true}
        onAddPersonalNote={async () => true}
      />
    );

    expect(markup).toContain("SUN");
    expect(markup).toContain("21 JUN");
  });

  it("preserves a hidden weekend date when editing a local note", () => {
    const markup = renderToStaticMarkup(
      <AddTimeModal
        date={new Date(2026, 5, 21, 10, 30)}
        dateOptions={["2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19"]}
        ticketOptions={[ticket]}
        isConfigured={true}
        isLogging={false}
        editingPersonalNote={{
          id: "note-weekend",
          weekKey: "2026-06-15",
          dateKey: "2026-06-21",
          text: "Weekend coverage",
          timeSpentSeconds: 60 * 60,
          startedISO: "2026-06-21T10:00:00.000Z",
          createdAt: "2026-06-21T10:00:00.000Z",
          updatedAt: "2026-06-21T10:00:00.000Z"
        }}
        onClose={() => undefined}
        onLog={async () => true}
        onUpdatePersonalNote={async () => true}
      />
    );

    expect(markup).toContain("SUN");
    expect(markup).toContain("21 JUN");
    expect(markup).toContain('aria-checked="true" class="modal-day-option active"><span>SUN</span><strong>21 JUN');
  });

  it("opens in local note edit mode with the saved note text", () => {
    const markup = renderToStaticMarkup(
      <AddTimeModal
        date={new Date("2026-06-18T10:00:00.000Z")}
        dateOptions={["2026-06-18", "2026-06-19"]}
        ticketOptions={[ticket]}
        isConfigured={false}
        isLogging={false}
        editingPersonalNote={{
          id: "note-1",
          weekKey: "2026-06-15",
          dateKey: "2026-06-18",
          text: "Mentoring and planning",
          timeSpentSeconds: 2 * 3600,
          startedISO: "2026-06-18T10:00:00.000Z",
          createdAt: "2026-06-18T10:00:00.000Z",
          updatedAt: "2026-06-18T10:00:00.000Z"
        }}
        onClose={() => undefined}
        onLog={async () => true}
        onUpdatePersonalNote={async () => true}
      />
    );

    expect(markup).toContain("Edit note");
    expect(markup).toContain("Mentoring and planning");
    expect(markup).toContain("Save note");
    expect(markup).not.toContain("Connect Jira to choose a ticket");
  });

  it("offers a delete action when editing a local note with an onDelete handler", () => {
    const markup = renderToStaticMarkup(
      <AddTimeModal
        date={new Date("2026-06-18T10:00:00.000Z")}
        dateOptions={["2026-06-18", "2026-06-19"]}
        ticketOptions={[ticket]}
        isConfigured={false}
        isLogging={false}
        editingPersonalNote={{
          id: "note-1",
          weekKey: "2026-06-15",
          dateKey: "2026-06-18",
          text: "Mentoring and planning",
          timeSpentSeconds: 2 * 3600,
          startedISO: "2026-06-18T10:00:00.000Z",
          createdAt: "2026-06-18T10:00:00.000Z",
          updatedAt: "2026-06-18T10:00:00.000Z"
        }}
        onClose={() => undefined}
        onLog={async () => true}
        onDelete={async () => true}
        onUpdatePersonalNote={async () => true}
      />
    );

    expect(markup).toContain("Delete note");
  });

  it("offers a Recurring tab when recurring handlers are provided", () => {
    const markup = renderToStaticMarkup(
      <AddTimeModal
        date={new Date(2026, 5, 18, 10, 30)}
        dateOptions={["2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19"]}
        ticketOptions={[ticket]}
        isConfigured={true}
        isLogging={false}
        onClose={() => undefined}
        onLog={async () => true}
        onAddPersonalNote={async () => true}
        getRecurringCandidates={() => []}
        onLogRecurring={async () => true}
      />
    );

    expect(markup).toContain(">Recurring</button>");
  });

  it("hides the Recurring tab while editing an existing worklog", () => {
    const markup = renderToStaticMarkup(
      <AddTimeModal
        date={new Date(2026, 5, 18, 10, 30)}
        dateOptions={["2026-06-18", "2026-06-19"]}
        ticketOptions={[ticket]}
        isConfigured={true}
        isLogging={false}
        editingWorklog={{
          id: "wl-1",
          issueId: "133470",
          issueKey: "FTDM-397",
          issueSummary: "Restructure the access domain in nx monorepo",
          authorAccountId: "account-1",
          started: "2026-06-18T08:00:00.000Z",
          timeSpentSeconds: 2 * 3600
        }}
        onClose={() => undefined}
        onLog={async () => true}
        getRecurringCandidates={() => []}
        onLogRecurring={async () => true}
      />
    );

    expect(markup).not.toContain(">Recurring</button>");
  });
});

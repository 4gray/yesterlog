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

const reconstructTicket: JiraTicket = {
  id: "FTDM-426",
  key: "FTDM-426",
  summary: "Create mongo mock data for documents and folders",
  projectKey: "FTDM",
  projectName: "FTDM",
  statusName: "Unknown",
  statusCategory: "unknown",
  loggedSecondsTotal: 0,
  url: "https://elevait.atlassian.net/browse/FTDM-426"
};

describe("AddTimeModal", () => {
  it("uses an Add Time prefill for reconstructed ticket logs", () => {
    const markup = renderToStaticMarkup(
      <AddTimeModal
        date={new Date(2026, 6, 7, 11, 56)}
        dateOptions={["2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10"]}
        ticketOptions={[ticket]}
        isConfigured={true}
        isLogging={false}
        prefill={{
          ticket: reconstructTicket,
          timeSpentSeconds: 40 * 60,
          startedISO: "2026-07-07T09:00:00.000Z",
          comment: "Create mongo mock data for documents and folders — 1 commit."
        }}
        onClose={() => undefined}
        onLog={async () => true}
        onAddPersonalNote={async () => true}
      />
    );

    expect(markup).toContain("FTDM-426");
    expect(markup).toContain("Create mongo mock data for documents and folders");
    expect(markup).toContain("40m");
    expect(markup).toContain("Log 40m to FTDM-426");
    expect(markup).not.toContain("2h 00m");
  });

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

  it("preserves a hidden weekend date when editing a Jira worklog", () => {
    const markup = renderToStaticMarkup(
      <AddTimeModal
        date={new Date(2026, 5, 20, 10, 30)}
        dateOptions={["2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19"]}
        ticketOptions={[ticket]}
        isConfigured={true}
        isLogging={false}
        editingWorklog={{
          id: "wl-weekend",
          issueId: ticket.id,
          issueKey: ticket.key,
          issueSummary: ticket.summary,
          authorAccountId: "account-1",
          started: "2026-06-20T10:00:00.000Z",
          timeSpentSeconds: 60 * 60
        }}
        onClose={() => undefined}
        onLog={async () => true}
      />
    );

    expect(markup).toContain("SAT");
    expect(markup).toContain("20 JUN");
    expect(markup).toContain('aria-checked="true" class="modal-day-option active"><span>SAT</span><strong>20 JUN');
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

  it("offers an explicit local distribution for a multi-day worklog", () => {
    const markup = renderToStaticMarkup(
      <AddTimeModal
        date={new Date(2026, 6, 14, 10, 30)}
        dateOptions={["2026-07-13", "2026-07-14"]}
        ticketOptions={[ticket]}
        isConfigured={true}
        isLogging={false}
        dailyTargetHours={8}
        editingWorklog={{
          id: "bulk-1",
          issueId: ticket.id,
          issueKey: ticket.key,
          issueSummary: ticket.summary,
          authorAccountId: "account-1",
          started: "2026-07-14T09:00:00.000Z",
          timeSpentSeconds: 80 * 3600,
          allocation: {
            dateKey: "2026-07-14",
            started: "2026-07-14T09:00:00.000Z",
            timeSpentSeconds: 8 * 3600,
            direction: "forward",
            partIndex: 1,
            partCount: 10,
            isApproximate: false
          }
        }}
        onClose={() => undefined}
        onLog={async () => true}
      />
    );

    expect(markup).toContain("BULK WORKLOG");
    expect(markup).toContain("One Jira entry, distributed locally");
    expect(markup).toContain('<label class="active"><input type="radio" name="bulk-worklog-distribution" checked="" value="forward"/>');
    expect(markup).toContain("<span>Start on date</span>");
  });
});

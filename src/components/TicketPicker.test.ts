import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { JiraTicket } from "../../shared/types";
import { buildTicketPickerGroups, limitTicketPickerGroups, TicketPickerItem } from "./TicketPicker";

const assignedTicket: JiraTicket = {
  id: "1001",
  key: "FTDM-397",
  summary: "Restructure the access domain in nx monorepo",
  projectKey: "FTDM",
  projectName: "Feature Team Data Management",
  statusName: "In Progress",
  statusCategory: "indeterminate",
  loggedSecondsTotal: 0,
  createdAt: "2026-06-10T09:00:00.000Z",
  assigneeDisplayName: "Demo Timekeeper",
  issueType: { name: "Task", hierarchyLevel: 0 },
  url: "https://elevait.atlassian.net/browse/FTDM-397"
};

const searchedTicket: JiraTicket = {
  id: "1002",
  key: "OPS-77",
  summary: "Pair on incident review notes",
  projectKey: "OPS",
  projectName: "Operations",
  statusName: "To Do",
  statusCategory: "new",
  loggedSecondsTotal: 0,
  createdAt: "2026-06-18T09:00:00.000Z",
  assigneeDisplayName: "Sam Rivera",
  issueType: { name: "Sub-task", subtask: true, hierarchyLevel: -1 },
  url: "https://elevait.atlassian.net/browse/OPS-77"
};

describe("buildTicketPickerGroups", () => {
  it("keeps the assigned picker list unchanged before browse results arrive", () => {
    const groups = buildTicketPickerGroups({
      ticketOptions: [assignedTicket],
      searchResults: [],
      searchQuery: ""
    });

    expect(groups).toEqual([
      {
        id: "options",
        label: undefined,
        tickets: [assignedTicket]
      }
    ]);
  });

  it("shows Jira browse results ahead of assigned tickets before text search", () => {
    const groups = buildTicketPickerGroups({
      ticketOptions: [assignedTicket, searchedTicket],
      searchResults: [searchedTicket],
      searchQuery: ""
    });

    expect(groups).toEqual([
      {
        id: "search",
        label: "JIRA TICKETS",
        tickets: [searchedTicket]
      },
      {
        id: "options",
        label: "ASSIGNED / FAVORITES",
        tickets: [assignedTicket]
      }
    ]);
  });

  it("shows Jira search results ahead of assigned tickets and removes duplicates", () => {
    const groups = buildTicketPickerGroups({
      ticketOptions: [assignedTicket, searchedTicket],
      searchResults: [searchedTicket],
      searchQuery: "ops"
    });

    expect(groups).toEqual([
      {
        id: "search",
        label: "JIRA SEARCH",
        tickets: [searchedTicket]
      },
      {
        id: "options",
        label: "ASSIGNED / FAVORITES",
        tickets: [assignedTicket]
      }
    ]);
  });

  it("can sort each picker group by newest created ticket first", () => {
    const newestAssignedTicket: JiraTicket = {
      ...assignedTicket,
      id: "1003",
      key: "FTDM-401",
      summary: "Polish Add Time modal keyboard flow",
      createdAt: "2026-06-21T09:00:00.000Z"
    };
    const olderSearchTicket: JiraTicket = {
      ...searchedTicket,
      id: "1004",
      key: "OPS-12",
      createdAt: "2026-06-01T09:00:00.000Z"
    };

    const groups = buildTicketPickerGroups({
      ticketOptions: [assignedTicket, newestAssignedTicket],
      searchResults: [searchedTicket, olderSearchTicket],
      searchQuery: "ops",
      sortMode: "createdDesc"
    });

    expect(groups.map((group) => group.tickets.map((ticket) => ticket.key))).toEqual([
      ["OPS-77", "OPS-12"],
      ["FTDM-401", "FTDM-397"]
    ]);
  });

  it("can sort each picker group by oldest created ticket first", () => {
    const newestAssignedTicket: JiraTicket = {
      ...assignedTicket,
      id: "1003",
      key: "FTDM-401",
      summary: "Polish Add Time modal keyboard flow",
      createdAt: "2026-06-21T09:00:00.000Z"
    };
    const olderSearchTicket: JiraTicket = {
      ...searchedTicket,
      id: "1004",
      key: "OPS-12",
      createdAt: "2026-06-01T09:00:00.000Z"
    };

    const groups = buildTicketPickerGroups({
      ticketOptions: [newestAssignedTicket, assignedTicket],
      searchResults: [searchedTicket, olderSearchTicket],
      searchQuery: "ops",
      sortMode: "createdAsc"
    });

    expect(groups.map((group) => group.tickets.map((ticket) => ticket.key))).toEqual([
      ["OPS-12", "OPS-77"],
      ["FTDM-397", "FTDM-401"]
    ]);
  });

  it("limits visible tickets across groups for lazy reveal", () => {
    const groups = buildTicketPickerGroups({
      ticketOptions: [
        assignedTicket,
        {
          ...assignedTicket,
          id: "1003",
          key: "FTDM-401",
          summary: "Polish Add Time modal keyboard flow"
        }
      ],
      searchResults: [
        searchedTicket,
        {
          ...searchedTicket,
          id: "1004",
          key: "OPS-12",
          createdAt: "2026-06-01T09:00:00.000Z"
        }
      ],
      searchQuery: "ops"
    });

    expect(limitTicketPickerGroups(groups, 3).map((group) => group.tickets.map((ticket) => ticket.key))).toEqual([
      ["OPS-77", "OPS-12"],
      ["FTDM-397"]
    ]);
  });

  it("renders assignee metadata when broad ticket browsing is active", () => {
    const markup = renderToStaticMarkup(
      createElement(TicketPickerItem, {
        ticket: searchedTicket,
        showAssignee: true,
        onSelect: () => undefined
      })
    );

    expect(markup).toContain("Pair on incident review notes");
    expect(markup).toContain("Assignee: Sam Rivera");
  });

  it("keeps assigned-only ticket rows compact", () => {
    const markup = renderToStaticMarkup(
      createElement(TicketPickerItem, {
        ticket: assignedTicket,
        showAssignee: false,
        onSelect: () => undefined
      })
    );

    expect(markup).toContain("Restructure the access domain in nx monorepo");
    expect(markup).not.toContain("Assignee:");
  });
});

import { describe, expect, it } from "vitest";
import type { JiraTicket } from "../../shared/types";
import { buildTicketPickerGroups } from "./TicketPicker";

const assignedTicket: JiraTicket = {
  id: "1001",
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

const searchedTicket: JiraTicket = {
  id: "1002",
  key: "OPS-77",
  summary: "Pair on incident review notes",
  projectKey: "OPS",
  projectName: "Operations",
  statusName: "To Do",
  statusCategory: "new",
  loggedSecondsTotal: 0,
  issueType: { name: "Sub-task", subtask: true, hierarchyLevel: -1 },
  url: "https://elevait.atlassian.net/browse/OPS-77"
};

describe("buildTicketPickerGroups", () => {
  it("keeps the assigned picker list unchanged before searching", () => {
    const groups = buildTicketPickerGroups({
      ticketOptions: [assignedTicket],
      searchResults: [searchedTicket],
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
});

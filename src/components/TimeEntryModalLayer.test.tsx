// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JiraTicket, JiraWorklog, PersonalNote } from "../../shared/types";
import type { AddTimeModalProps } from "./AddTimeModal";
import { TimeEntryModalLayer } from "./TimeEntryModalLayer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ticket: JiraTicket = {
  id: "133470",
  key: "YLOG-397",
  summary: "Restructure the access domain in nx monorepo",
  projectKey: "YLOG",
  projectName: "Yesterlog Product",
  statusName: "In Progress",
  statusCategory: "indeterminate",
  loggedSecondsTotal: 0,
  issueType: { name: "Task", hierarchyLevel: 0 },
  url: "https://example.atlassian.net/browse/YLOG-397"
};

const targetTicket: JiraTicket = {
  ...ticket,
  id: "133471",
  key: "YLOG-401",
  summary: "Correct Jira issue",
  url: "https://example.atlassian.net/browse/YLOG-401"
};

const worklog: JiraWorklog = {
  id: "wl-1",
  issueId: "133470",
  issueKey: "YLOG-397",
  issueSummary: "Restructure the access domain in nx monorepo",
  authorAccountId: "account-1",
  started: "2026-06-18T08:00:00.000Z",
  timeSpentSeconds: 2 * 3600,
  comment: "Existing Jira worklog"
};

const personalNote: PersonalNote = {
  id: "note-1",
  weekKey: "2026-06-15",
  dateKey: "2026-06-18",
  title: "Planning",
  text: "Mentoring and planning",
  timeSpentSeconds: 2 * 3600,
  startedISO: "2026-06-18T10:00:00.000Z",
  createdAt: "2026-06-18T10:00:00.000Z",
  updatedAt: "2026-06-18T10:00:00.000Z"
};

let container: HTMLDivElement;
let root: Root;
let onCloseAddTime: ReturnType<typeof vi.fn<() => void>>;
let onCloseEditingWorklog: ReturnType<typeof vi.fn<() => void>>;
let onCloseEditingPersonalNote: ReturnType<typeof vi.fn<() => void>>;

const asyncTrue = vi.fn<() => Promise<boolean>>(async () => true);

const baseProps = () => ({
  dateOptions: ["2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19"],
  ticketOptions: [ticket],
  isConfigured: true,
  isLogging: false,
  isDeletingWorklog: false,
  onCloseAddTime,
  onCloseEditingWorklog,
  onCloseEditingPersonalNote,
  onAddWorklog: asyncTrue as AddTimeModalProps["onLog"],
  onUpdateWorklog: asyncTrue as AddTimeModalProps["onLog"],
  onDeleteWorklog: asyncTrue,
  onSearchTickets: undefined,
  onAddPersonalNote: asyncTrue as AddTimeModalProps["onAddPersonalNote"],
  onUpdatePersonalNote: asyncTrue as AddTimeModalProps["onUpdatePersonalNote"],
  onDeletePersonalNote: asyncTrue,
  getRecurringCandidates: () => [],
  onLogRecurring: asyncTrue as AddTimeModalProps["onLogRecurring"]
});

const renderLayer = (props: Partial<Parameters<typeof TimeEntryModalLayer>[0]> = {}) => {
  act(() => {
    root.render(<TimeEntryModalLayer {...baseProps()} {...props} />);
  });
};

const dialog = () => container.querySelector<HTMLElement>('[role="dialog"]');

const clickClose = () => {
  const closeButton = container.querySelector<HTMLButtonElement>('button[aria-label="Close"]');
  if (!closeButton) {
    throw new Error("Expected modal close button to be rendered.");
  }
  act(() => closeButton.click());
};

beforeEach(() => {
  onCloseAddTime = vi.fn();
  onCloseEditingWorklog = vi.fn();
  onCloseEditingPersonalNote = vi.fn();
  asyncTrue.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("TimeEntryModalLayer", () => {
  it("renders nothing when no time-entry modal is active", () => {
    renderLayer();

    expect(dialog()).toBeNull();
  });

  it("renders the Add Time modal with recurring support and closes it through the add handler", () => {
    renderLayer({ addModalDate: new Date(2026, 5, 18, 10, 30) });

    expect(dialog()?.getAttribute("aria-label")).toBe("Log time");
    expect(container.textContent).toContain("Log to ticket");
    expect(container.textContent).toContain("Recurring");

    clickClose();

    expect(onCloseAddTime).toHaveBeenCalledTimes(1);
    expect(onCloseEditingWorklog).not.toHaveBeenCalled();
    expect(onCloseEditingPersonalNote).not.toHaveBeenCalled();
  });

  it("renders the worklog edit modal without recurring controls and closes it through the worklog handler", () => {
    renderLayer({ editingWorklog: worklog });

    expect(dialog()?.getAttribute("aria-label")).toBe("Edit time entry");
    expect(container.textContent).toContain("Existing Jira worklog");
    expect(container.textContent).not.toContain("Recurring");

    clickClose();

    expect(onCloseEditingWorklog).toHaveBeenCalledTimes(1);
    expect(onCloseAddTime).not.toHaveBeenCalled();
    expect(onCloseEditingPersonalNote).not.toHaveBeenCalled();
  });

  it("moves a worklog with preserved fields and the selected estimate behavior", async () => {
    const onUpdateWorklog = vi.fn<AddTimeModalProps["onLog"]>(async () => true);
    renderLayer({ editingWorklog: worklog, ticketOptions: [ticket, targetTicket], onUpdateWorklog });

    const moveToggle = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes("Move worklog")
    );
    if (!moveToggle) {
      throw new Error("Expected Move worklog action.");
    }
    act(() => moveToggle.click());

    expect(dialog()?.getAttribute("aria-label")).toBe("Move time entry");
    expect(container.textContent).toContain("Choose the correct Jira issue");

    const picker = container.querySelector<HTMLButtonElement>(".modal-ticket");
    if (!picker) {
      throw new Error("Expected Jira ticket picker.");
    }
    act(() => picker.click());

    const targetOption = Array.from(container.querySelectorAll<HTMLButtonElement>(".ticket-picker-item")).find((button) =>
      button.textContent?.includes(targetTicket.key)
    );
    if (!targetOption) {
      throw new Error("Expected target Jira issue option.");
    }
    act(() => targetOption.click());

    expect(container.textContent).toContain("BEFORE");
    expect(container.textContent).toContain("AFTER");
    expect(container.textContent).toContain("Same date, time, duration, comment, and author");

    const leaveEstimate = container.querySelector<HTMLInputElement>('input[name="move-worklog-estimate"][value="leave"]');
    if (!leaveEstimate) {
      throw new Error("Expected estimate adjustment choice.");
    }
    act(() => leaveEstimate.click());

    const submit = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
      button.textContent?.includes(`Move to ${targetTicket.key}`)
    );
    if (!submit) {
      throw new Error("Expected worklog move submit action.");
    }
    await act(async () => submit.click());

    expect(onUpdateWorklog).toHaveBeenCalledWith({
      issueKey: targetTicket.key,
      ticket: targetTicket,
      timeSpentSeconds: worklog.timeSpentSeconds,
      startedISO: worklog.started,
      comment: worklog.comment,
      allocationDirection: undefined,
      estimateAdjustment: "leave"
    });
    expect(onCloseEditingWorklog).toHaveBeenCalledTimes(1);
  });

  it("renders the personal-note edit modal and closes it through the personal-note handler", () => {
    renderLayer({ editingPersonalNote: personalNote, isConfigured: false });

    expect(dialog()?.getAttribute("aria-label")).toBe("Edit personal note");
    expect(container.textContent).toContain("Mentoring and planning");
    expect(container.textContent).toContain("Save note");

    clickClose();

    expect(onCloseEditingPersonalNote).toHaveBeenCalledTimes(1);
    expect(onCloseAddTime).not.toHaveBeenCalled();
    expect(onCloseEditingWorklog).not.toHaveBeenCalled();
  });
});

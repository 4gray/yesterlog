// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JiraTicket, RecurringEvent } from "../../shared/types";
import { AddTimeModal, type AddTimeModalProps } from "./AddTimeModal";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ticket: JiraTicket = {
  id: "ticket-1", key: "TEST-1", summary: "Selected ticket", projectKey: "TEST",
  projectName: "Test", statusName: "Open", statusCategory: "new", loggedSecondsTotal: 0, url: ""
};
const event: RecurringEvent = {
  id: "standup", title: "Standup", daysOfWeek: [3, 4], localTime: "09:00",
  durationMinutes: 15, defaultNote: "Default note", active: true, createdAt: "", updatedAt: ""
};
const otherEvent: RecurringEvent = { ...event, id: "planning", title: "Planning", durationMinutes: 60 };
const startedISO = new Date(2026, 5, 17, 10, 15).toISOString();
let container: HTMLDivElement;
let root: Root;
let props: AddTimeModalProps;

const render = (overrides: Partial<AddTimeModalProps> = {}) => {
  props = { ...props, ...overrides };
  act(() => root.render(<AddTimeModal {...props} />));
};
const button = (text: string) => {
  const result = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent?.trim() === text
  );
  if (!result) throw new Error(`Missing button: ${text}`);
  return result;
};
const click = (text: string) => act(() => button(text).click());
const fill = (selector: string, value: string) => {
  const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  if (!input) throw new Error(`Missing input: ${selector}`);
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const value = (selector: string) => container.querySelector<HTMLInputElement>(selector)?.value;
const time = () => value('input[type="time"]');
const recurringMinutes = '[aria-label="Exact recurring duration in minutes"]';
const personalMinutes = '[aria-label="Exact personal note duration in minutes"]';

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  props = {
    date: new Date(2026, 5, 17, 14), dateOptions: ["2026-06-17", "2026-06-18"], ticketOptions: [ticket],
    isConfigured: true, isLogging: false, prefill: { startedISO, timeSpentSeconds: 75 * 60, ticket },
    onClose: vi.fn(), onLog: vi.fn(async () => false), onAddPersonalNote: vi.fn(async () => false),
    getRecurringCandidates: () => [event, otherEvent], onLogRecurring: vi.fn(async () => false)
  };
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("AddTimeModal session state", () => {
  it("preserves a calendar slot in both directions and submits the shared interval", async () => {
    render();
    fill("textarea", "Jira draft");
    click("Personal note");
    expect(time()).toBe("10:15");
    expect(value(personalMinutes)).toBe("75");
    fill('[aria-label="Personal note title"]', "Planning draft");
    fill("textarea", "Private draft");
    click("Meeting");
    fill(personalMinutes, "35");
    fill('input[type="time"]', "11:25");
    click("Log to ticket");
    expect(time()).toBe("11:25");
    expect(container.querySelector(".modal-duration")?.textContent).toBe("35m");
    expect(value("textarea")).toBe("Jira draft");
    await act(async () => button("Log 35m to TEST-1").click());
    expect(props.onLog).toHaveBeenCalledWith(expect.objectContaining({
      startedISO: new Date(2026, 5, 17, 11, 25).toISOString(), timeSpentSeconds: 35 * 60, comment: "Jira draft"
    }));
    click("Personal note");
    expect(value('[aria-label="Personal note title"]')).toBe("Planning draft");
    expect(value("textarea")).toBe("Private draft");
    expect(button("Meeting").getAttribute("aria-checked")).toBe("true");
    await act(async () => button("Save note").click());
    expect(props.onAddPersonalNote).toHaveBeenCalledWith(expect.objectContaining({
      startedISO: new Date(2026, 5, 17, 11, 25).toISOString(), timeSpentSeconds: 35 * 60, text: "Private draft", category: "meeting"
    }));
  });

  it("keeps the chosen duration when opening Custom after a preset", () => {
    render();
    click("4h");
    click("Custom");
    expect(container.querySelector(".modal-duration")?.textContent).toBe("4h 00m");
    expect(value('[aria-label="Custom ticket duration amount"]')).toBe("4");
  });

  it("preserves recurring drafts across tabs, events, and dates without changing the calendar slot", () => {
    render();
    click("Recurring");
    fill(recurringMinutes, "35");
    fill("textarea", "Standup draft");
    act(() => container.querySelectorAll<HTMLButtonElement>(".recurring-option")[1].click());
    fill(recurringMinutes, "45");
    fill("textarea", "Planning draft");
    click("Personal note");
    expect(time()).toBe("10:15");
    expect(value(personalMinutes)).toBe("75");
    click("Recurring");
    expect(value(recurringMinutes)).toBe("45");
    expect(value("textarea")).toBe("Planning draft");
    act(() => container.querySelectorAll<HTMLButtonElement>(".recurring-option")[0].click());
    expect(value(recurringMinutes)).toBe("35");
    expect(value("textarea")).toBe("Standup draft");
    click("Personal note");
    act(() => container.querySelectorAll<HTMLButtonElement>(".modal-day-option")[1].click());
    click("Recurring");
    expect(value(recurringMinutes)).toBe("15");
    expect(value("textarea")).toBe("Default note");
    click("Personal note");
    act(() => container.querySelectorAll<HTMLButtonElement>(".modal-day-option")[0].click());
    click("Recurring");
    expect(value(recurringMinutes)).toBe("35");
    expect(value("textarea")).toBe("Standup draft");
  });

  it("does not reset drafts when working-day options, target hours, or ticket data refresh", () => {
    render();
    click("Personal note");
    fill("textarea", "Unsaved draft");
    fill(personalMinutes, "55");
    render({ dateOptions: [...props.dateOptions, "2026-06-19"], dailyTargetHours: 7, ticketOptions: [{ ...ticket }] });
    expect(value("textarea")).toBe("Unsaved draft");
    expect(value(personalMinutes)).toBe("55");
    expect(time()).toBe("10:15");
  });

  it("keeps custom amount, units, and bulk direction on a tab round trip", () => {
    render();
    fill('[aria-label="Custom ticket duration amount"]', "2");
    click("D");
    act(() => container.querySelector<HTMLInputElement>('input[value="forward"]')?.click());
    click("Personal note");
    expect(value(personalMinutes)).toBe("960");
    click("Log to ticket");
    expect(value('[aria-label="Custom ticket duration amount"]')).toBe("2");
    expect(button("D").getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector<HTMLInputElement>('input[value="forward"]')?.checked).toBe(true);
    click("1h");
    click("Custom");
    expect(value('[aria-label="Custom ticket duration amount"]')).toBe("1");
    expect(button("H").getAttribute("aria-pressed")).toBe("true");
  });

  it("uses the new candidate's defaults when a recurring event disappears during sync", async () => {
    render();
    click("Recurring");
    fill(recurringMinutes, "35");
    fill("textarea", "Standup draft");
    render({ getRecurringCandidates: () => [otherEvent] });
    expect(value(recurringMinutes)).toBe("60");
    expect(value("textarea")).toBe("Default note");
    await act(async () => button("Log 1h locally").click());
    expect(props.onLogRecurring).toHaveBeenCalledWith({
      eventId: otherEvent.id, dateKey: "2026-06-17", timeSpentSeconds: 3600, note: "Default note"
    });
    render({ getRecurringCandidates: () => [event, otherEvent] });
    expect(value(recurringMinutes)).toBe("35");
    expect(value("textarea")).toBe("Standup draft");
  });

  it("resets all drafts for a new prefill and after closing and reopening", () => {
    render();
    click("Recurring");
    fill("textarea", "Old recurring draft");
    render({ prefill: { startedISO: new Date(2026, 5, 17, 15).toISOString(), timeSpentSeconds: 90 * 60 } });
    expect(time()).toBe("15:00");
    click("Personal note");
    expect(value(personalMinutes)).toBe("90");
    expect(value("textarea")).toBe("");
    click("Recurring");
    expect(value("textarea")).toBe("Default note");
    fill("textarea", "Another recurring draft");
    act(() => root.render(null));
    render();
    click("Recurring");
    expect(value("textarea")).toBe("Default note");
  });
});

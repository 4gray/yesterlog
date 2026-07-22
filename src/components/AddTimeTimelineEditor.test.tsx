// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JiraTicket, JiraWorklog, PersonalNote, RecurringEntry } from "../../shared/types";
import { AddTimeTimelineEditor } from "./AddTimeTimelineEditor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ticket: JiraTicket = {
  id: "ticket-1",
  key: "TB-42",
  summary: "Visual time range editing",
  projectKey: "TB",
  projectName: "TimeBro",
  statusName: "In Progress",
  statusCategory: "indeterminate",
  loggedSecondsTotal: 0,
  url: "https://example.atlassian.net/browse/TB-42"
};

const atLocalTime = (hours: number, minutes = 0) => new Date(2026, 5, 18, hours, minutes).toISOString();

const worklog: JiraWorklog = {
  id: "wl-next",
  issueId: "ticket-2",
  issueKey: "TB-43",
  issueSummary: "Next scheduled ticket",
  authorAccountId: "account-1",
  started: atLocalTime(12),
  timeSpentSeconds: 60 * 60
};

const note: PersonalNote = {
  id: "note-lunch",
  weekKey: "2026-06-15",
  dateKey: "2026-06-18",
  title: "Lunch",
  text: "Lunch break",
  timeSpentSeconds: 30 * 60,
  startedISO: atLocalTime(13),
  category: "meeting",
  createdAt: atLocalTime(13),
  updatedAt: atLocalTime(13)
};

const recurring: RecurringEntry = {
  eventId: "daily",
  dateKey: "2026-06-18",
  title: "Daily stand-up",
  localTime: "09:30",
  timeSpentSeconds: 15 * 60
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

const renderEditor = (onChange = vi.fn()) => {
  act(() => {
    root.render(
      <AddTimeTimelineEditor
        dateKey="2026-06-18"
        time="10:00"
        durationSeconds={60 * 60}
        ticket={ticket}
        worklogs={[worklog]}
        personalNotes={[note]}
        recurringEntries={[recurring]}
        onChange={onChange}
      />
    );
  });
  const track = container.querySelector<HTMLElement>(".add-time-timeline-track");
  if (!track) {
    throw new Error("Expected the visual timeline track.");
  }
  vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    right: 300,
    bottom: 1248,
    left: 0,
    width: 300,
    height: 1248,
    toJSON: () => undefined
  });
  return onChange;
};

describe("AddTimeTimelineEditor", () => {
  it("shows the draft range beside the selected day's existing entries", () => {
    renderEditor();

    expect(container.querySelector(".add-time-timeline-head strong")?.textContent).toContain("10:00 → 11:00");
    expect(container.querySelector(".add-time-timeline-draft")?.textContent).toContain("TB-42");
    const existing = Array.from(container.querySelectorAll(".add-time-timeline-existing")).map((item) => item.textContent);
    expect(existing).toEqual(expect.arrayContaining([expect.stringContaining("TB-43"), expect.stringContaining("Lunch"), expect.stringContaining("Daily stand-up")]));
  });

  it("resizes in 15-minute steps and stops at the next entry", () => {
    const onChange = renderEditor();
    const handle = container.querySelector<HTMLElement>('.add-time-timeline-handle[aria-label="Resize until end"]');

    act(() => {
      handle?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientY: 572 }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, button: 0, clientY: 650 }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0, clientY: 650 }));
    });

    expect(onChange).toHaveBeenCalledWith({ startMin: 10 * 60, endMin: 12 * 60 });
  });

  it("moves the whole slot while preserving its duration", () => {
    const onChange = renderEditor();
    const draft = container.querySelector<HTMLElement>(".add-time-timeline-draft");

    act(() => {
      draft?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientY: 540 }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, button: 0, clientY: 592 }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0, clientY: 592 }));
    });

    expect(onChange).toHaveBeenCalledWith({ startMin: 11 * 60, endMin: 12 * 60 });
  });
});

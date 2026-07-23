// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { JiraTicket, JiraWorklog, PersonalNote } from "../../shared/types";
import { QuickLogSheet } from "./QuickLogSheet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const context = {
  ticketKey: "ABC-1",
  ticketSummary: "Review duration guard",
  dateKey: "2026-06-18",
  dayLabel: "THU · 18 JUN",
  hours: 2,
  startedMinutes: 600,
  timelineEndMinutes: 1200,
  comment: ""
};

const ticket: JiraTicket = {
  id: "ticket-1",
  key: "ABC-1",
  summary: "Review duration guard",
  projectKey: "ABC",
  projectName: "Yesterlog",
  statusName: "In Progress",
  statusCategory: "indeterminate",
  loggedSecondsTotal: 0,
  url: "https://example.atlassian.net/browse/ABC-1"
};

const worklog: JiraWorklog = {
  id: "worklog-1",
  issueId: "ticket-2",
  issueKey: "ABC-2",
  issueSummary: "Existing morning work",
  authorAccountId: "account-1",
  started: new Date(2026, 5, 18, 8).toISOString(),
  timeSpentSeconds: 60 * 60
};

const personalNote: PersonalNote = {
  id: "note-1",
  weekKey: "2026-06-15",
  dateKey: "2026-06-18",
  text: "Team planning",
  timeSpentSeconds: 30 * 60,
  startedISO: new Date(2026, 5, 18, 9, 15).toISOString(),
  createdAt: new Date(2026, 5, 18, 9, 15).toISOString(),
  updatedAt: new Date(2026, 5, 18, 9, 15).toISOString()
};

describe("QuickLogSheet", () => {
  it("shows the shared editable day map with the selected day's context", () => {
    const markup = renderToStaticMarkup(
      <QuickLogSheet
        context={context}
        timeline={{
          dateKey: context.dateKey,
          time: "10:00",
          ticket,
          worklogs: [worklog],
          personalNotes: [personalNote]
        }}
        color={{ seg: "#5b8cff", text: "#8fb0ff" }}
        isLogging={false}
        onChangeHours={() => undefined}
        onChangeRange={() => undefined}
        onChangeComment={() => undefined}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />
    );

    expect(markup).toContain("quicklog-sheet has-side-timeline");
    expect(markup).toContain("THU · 18 JUN · 10:00");
    expect(markup).toContain("DAY MAP");
    expect(markup).toContain("ABC-1");
    expect(markup).toContain("ABC-2");
    expect(markup).toContain("Team planning");
  });

  it("keeps the custom duration control synchronized with a timeline resize", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onChangeRange = vi.fn();

    act(() => {
      root.render(
        <QuickLogSheet
          context={context}
          timeline={{
            dateKey: context.dateKey,
            time: "10:00",
            ticket
          }}
          color={{ seg: "#5b8cff", text: "#8fb0ff" }}
          isLogging={false}
          onChangeHours={() => undefined}
          onChangeRange={onChangeRange}
          onChangeComment={() => undefined}
          onCancel={() => undefined}
          onConfirm={() => undefined}
        />
      );
    });

    const track = container.querySelector<HTMLElement>(".add-time-timeline-track");
    vi.spyOn(track!, "getBoundingClientRect").mockReturnValue({
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
    const handle = container.querySelector<HTMLElement>('.add-time-timeline-handle[aria-label="Resize until end"]');

    act(() => {
      handle?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientY: 624 }));
      window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, button: 0, clientY: 598 }));
      window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0, clientY: 598 }));
    });

    expect(onChangeRange).toHaveBeenCalledWith({ startMin: 10 * 60, endMin: 11 * 60 + 30 });
    expect(container.querySelector<HTMLInputElement>(".custom-duration-input")?.value).toBe("1.5");

    act(() => root.unmount());
    container.remove();
  });

  it("explains and blocks confirmation when the selected interval is unavailable", () => {
    const markup = renderToStaticMarkup(
      <QuickLogSheet
        context={context}
        color={{ seg: "#5b8cff", text: "#8fb0ff" }}
        isLogging={false}
        validationMessage="Choose a shorter duration or another time — this interval is unavailable."
        onChangeHours={() => undefined}
        onChangeComment={() => undefined}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("this interval is unavailable");
    expect(markup).toContain('class="quicklog-confirm" disabled=""');
  });
});

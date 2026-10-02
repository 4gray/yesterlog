// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DayTrackingSummary, JiraWorklog, SyncResult, WeekState } from "../../shared/types";
import { WeekView } from "./WeekView";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const now = new Date(2026, 5, 18, 16, 30);

const sourceWorklog: JiraWorklog = {
  id: "wl-1",
  issueId: "133470",
  issueKey: "YLOG-397",
  issueSummary: "Restructure the access domain",
  issueUrl: "https://example.atlassian.net/browse/YLOG-397",
  authorAccountId: "account-1",
  started: new Date(2026, 5, 15, 14).toISOString(),
  timeSpentSeconds: 2 * 3600,
  comment: "Investigated redirect loop"
};

const day = (overrides: Partial<DayTrackingSummary>): DayTrackingSummary => ({
  dateKey: "2026-06-16",
  dateLabel: "Jun 16",
  weekdayName: "Tuesday",
  isToday: false,
  isConfiguredWorkingDay: true,
  isSkipped: false,
  targetHours: 8,
  trackedHours: 0,
  missingHours: 8,
  issues: [],
  personalNotes: [],
  recurringEntries: [],
  pendingRecurring: [],
  ...overrides
});

const weekState: WeekState = {
  weekKey: "2026-06-15",
  weekStartISO: "2026-06-14T22:00:00.000Z",
  weekEndExclusiveISO: "2026-06-21T22:00:00.000Z",
  weekRangeLabel: "Jun 15-21",
  weeklyTargetHours: 40,
  trackedWeekHours: 2,
  jiraTrackedWeekHours: 2,
  personalNoteHours: 0,
  remainingWeekHours: 38,
  dailyTargetHours: 8,
  activeWorkingDates: ["2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18"],
  skippedDates: ["2026-06-17"],
  days: [
    day({
      dateKey: "2026-06-15",
      dateLabel: "Jun 15",
      weekdayName: "Monday",
      trackedHours: 2,
      missingHours: 6,
      issues: [
        {
          id: "133470",
          key: "YLOG-397",
          summary: "Restructure the access domain",
          url: sourceWorklog.issueUrl,
          loggedSeconds: 2 * 3600,
          comments: ["Investigated redirect loop"]
        }
      ]
    }),
    day({ dateKey: "2026-06-16", dateLabel: "Jun 16", weekdayName: "Tuesday" }),
    day({ dateKey: "2026-06-17", dateLabel: "Jun 17", weekdayName: "Wednesday", isSkipped: true }),
    day({ dateKey: "2026-06-18", dateLabel: "Jun 18", weekdayName: "Thursday", isToday: true }),
    day({ dateKey: "2026-06-19", dateLabel: "Jun 19", weekdayName: "Friday" })
  ],
  recurringTrackedHours: 0
};

const syncResult: SyncResult = {
  weekKey: "2026-06-15",
  weekStartISO: weekState.weekStartISO,
  weekEndExclusiveISO: weekState.weekEndExclusiveISO,
  syncedAt: now.toISOString(),
  accountId: "account-1",
  trackedSeconds: 2 * 3600,
  issueCount: 1,
  worklogCount: 1,
  daySummaries: {
    "2026-06-15": {
      trackedSeconds: 2 * 3600,
      issues: weekState.days[0].issues,
      worklogs: [sourceWorklog]
    }
  }
};

const renderWeek = (overrides: Partial<Parameters<typeof WeekView>[0]> = {}) => (
  <WeekView
    weekState={weekState}
    syncResult={syncResult}
    currentDate={now}
    isSyncing={false}
    isConfigured={true}
    syncState="synced"
    viewMode="summary"
    onViewModeChange={() => undefined}
    onOpenCommandPalette={() => undefined}
    onSync={() => undefined}
    onPreviousWeek={() => undefined}
    onCurrentWeek={() => undefined}
    onNextWeek={() => undefined}
    onAddTime={() => undefined}
    onMoveWorklog={async () => true}
    onMoveRecurring={async () => true}
    onEditWorklog={() => undefined}
    onEditPersonalNote={() => undefined}
    onToggleSkipped={() => undefined}
    onDockLog={async () => true}
    {...overrides}
  />
);

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
});

const copyButton = () =>
  document.body.querySelector<HTMLButtonElement>('button[aria-label="Book YLOG-397 on another day"]');

describe("WeekView copy to another day", () => {
  it("shows a copy action on ordinary worklog rows only when the week can write", () => {
    expect(renderToStaticMarkup(renderWeek())).toContain("Book YLOG-397 on another day");
    expect(renderToStaticMarkup(renderWeek({ onDockLog: undefined }))).not.toContain("Book YLOG-397 on another day");
  });

  it("hides the copy action for projected bulk slices", () => {
    const bulkSync: SyncResult = {
      ...syncResult,
      daySummaries: {
        "2026-06-15": {
          ...syncResult.daySummaries["2026-06-15"],
          worklogs: [
            {
              ...sourceWorklog,
              timeSpentSeconds: 16 * 3600,
              allocation: {
                dateKey: "2026-06-15",
                started: sourceWorklog.started,
                timeSpentSeconds: 8 * 3600,
                direction: "forward",
                partIndex: 1,
                partCount: 2,
                isApproximate: true
              }
            }
          ]
        }
      }
    };

    expect(renderToStaticMarkup(renderWeek({ syncResult: bulkSync }))).not.toContain("Book YLOG-397 on another day");
  });

  it("walks from the day picker to a prefilled copy sheet and logs the copy on the chosen day", async () => {
    const onDockLog = vi.fn<NonNullable<Parameters<typeof WeekView>[0]["onDockLog"]>>(async () => true);
    act(() => {
      root.render(renderWeek({ onDockLog }));
    });

    act(() => copyButton()?.click());

    const picker = document.body.querySelector<HTMLElement>('[role="dialog"][aria-label="Book YLOG-397 on another day"]');
    expect(picker).not.toBeNull();
    const chips = Array.from(picker!.querySelectorAll<HTMLButtonElement>(".copy-pop-day"));
    expect(chips.map((chip) => [chip.textContent?.slice(0, 3), chip.disabled])).toEqual([
      ["Mon", true],
      ["Tue", false],
      ["Wed", true],
      ["Thu", false],
      ["Fri", true]
    ]);
    expect(chips[2].textContent).toContain("vacation");
    expect(chips[4].textContent).toContain("future");
    expect(document.activeElement).toBe(chips[1]);

    act(() => chips[1].click());

    expect(document.body.querySelector('[role="dialog"][aria-label="Book YLOG-397 on another day"]')).toBeNull();
    const sheet = document.body.querySelector<HTMLElement>(".quicklog-sheet");
    expect(sheet).not.toBeNull();
    expect(sheet!.textContent).toContain("Book time");
    expect(sheet!.textContent).toContain("TUE · 16 JUN");
    expect(sheet!.textContent).toContain("14:00–16:00 · same time as Monday");
    expect(sheet!.querySelector<HTMLTextAreaElement>(".quicklog-comment")?.value).toBe("Investigated redirect loop");

    const confirm = sheet!.querySelector<HTMLButtonElement>(".quicklog-confirm");
    expect(confirm?.textContent).toContain("Book 2h on Tuesday");
    expect(confirm?.disabled).toBe(false);

    await act(async () => {
      confirm!.click();
    });

    expect(onDockLog).toHaveBeenCalledTimes(1);
    const [payload] = onDockLog.mock.calls[0];
    expect(payload.issueKey).toBe("YLOG-397");
    expect(payload.ticket.summary).toBe("Restructure the access domain");
    expect(payload.timeSpentSeconds).toBe(2 * 3600);
    expect(payload.comment).toBe("Investigated redirect loop");
    expect(new Date(payload.startedISO).getTime()).toBe(new Date(2026, 5, 16, 14).getTime());
    expect(document.body.querySelector(".quicklog-sheet")).toBeNull();
  });

  it("closes the day picker on Escape without opening a sheet", () => {
    act(() => {
      root.render(renderWeek());
    });
    act(() => copyButton()?.click());
    expect(document.body.querySelector(".copy-pop")).not.toBeNull();

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(document.body.querySelector(".copy-pop")).toBeNull();
    expect(document.body.querySelector(".quicklog-sheet")).toBeNull();
  });


  it("opens a right-click menu on a worklog row that leads to the day picker", () => {
    const onEditWorklog = vi.fn();
    act(() => {
      root.render(renderWeek({ onEditWorklog }));
    });
    const row = document.body.querySelector<HTMLElement>('.day-log[data-worklog-ids="wl-1"]');
    expect(row).not.toBeNull();

    act(() => {
      row!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 300, clientY: 200 }));
    });

    const menu = document.body.querySelector<HTMLElement>('[role="menu"][aria-label="Actions for YLOG-397"]');
    expect(menu).not.toBeNull();
    const items = Array.from(menu!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(items.map((item) => item.textContent)).toEqual(["Edit worklog", "Book on another day"]);
    expect(document.activeElement).toBe(items[0]);

    act(() => items[1].click());

    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(document.body.querySelector('[role="dialog"][aria-label="Book YLOG-397 on another day"]')).not.toBeNull();
    expect(onEditWorklog).not.toHaveBeenCalled();
  });

  it("confirms an Option-drag duplicate from the timeline in the booking sheet", async () => {
    const onDockLog = vi.fn<NonNullable<Parameters<typeof WeekView>[0]["onDockLog"]>>(async () => true);
    act(() => {
      root.render(renderWeek({ onDockLog, viewMode: "timeline" }));
    });
    const block = document.body.querySelector<HTMLElement>('.cal-block[data-worklog-id="wl-1"]');
    const track = block?.closest<HTMLElement>(".cal-track");
    expect(block).not.toBeNull();
    expect(track).not.toBeNull();
    vi.spyOn(track!, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 200,
      bottom: 1296,
      left: 0,
      width: 200,
      height: 1296,
      toJSON: () => undefined
    });
    // The week timeline resolves drop columns through elementFromPoint; point it at this track.
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => track });

    act(() => {
      block!.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 50, clientY: 500, altKey: true }));
      window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, button: 0, clientX: 50, clientY: 720, altKey: true }));
    });
    const previews = Array.from(document.body.querySelectorAll<HTMLElement>(".cal-block.is-duplicate-preview"));
    expect(previews).toHaveLength(1);
    expect(previews[0].closest<HTMLElement>(".cal-track")?.dataset.worklogMoveDay).toBe("2026-06-15");
    expect(block!.classList.contains("is-relocating")).toBe(false);

    act(() => {
      window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0, clientX: 50, clientY: 720, altKey: true }));
    });

    const sheet = document.body.querySelector<HTMLElement>(".quicklog-sheet");
    expect(sheet).not.toBeNull();
    expect(sheet!.textContent).toContain("Book time");
    expect(sheet!.textContent).toContain("Book 2h on Monday");
    expect(sheet!.textContent).toContain("18:00");
    expect(onDockLog).not.toHaveBeenCalled();
  });
});

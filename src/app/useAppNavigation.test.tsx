// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JiraTicket } from "../../shared/types";
import type { AppView } from "../components/Sidebar";
import { toLocalDateKey } from "../utils/date";
import { useAppNavigation } from "./useAppNavigation";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const defaultCurrentDate = new Date(2026, 5, 17, 12);
const defaultWeekStart = new Date(2026, 5, 15);
const defaultMonthAnchor = new Date(2026, 5, 1);

const buildTicket = (key: string): JiraTicket => ({
  id: key,
  key,
  summary: `${key} summary`,
  projectKey: key.split("-")[0],
  projectName: "TimeBro",
  statusName: "In Progress",
  statusCategory: "indeterminate",
  loggedSecondsTotal: 0,
  url: `https://example.atlassian.net/browse/${key}`
});

type NavigationApi = ReturnType<typeof useAppNavigation>;

let container: HTMLDivElement;
let root: Root;
let api: NavigationApi | undefined;
let view: AppView;
let weekStart: Date;
let monthAnchor: Date;
let selectedTicket: JiraTicket | undefined;

interface HarnessProps {
  currentDate?: Date;
  initialView?: AppView;
  initialWeekStart?: Date;
  initialMonthAnchor?: Date;
  isBitbucketReady?: boolean;
}

function Harness({
  currentDate = defaultCurrentDate,
  initialView = "week",
  initialWeekStart = defaultWeekStart,
  initialMonthAnchor = defaultMonthAnchor,
  isBitbucketReady = true
}: HarnessProps) {
  const [viewState, setView] = useState<AppView>(initialView);
  const [weekStartState, setWeekStart] = useState(initialWeekStart);
  const [monthAnchorState, setMonthAnchor] = useState(initialMonthAnchor);
  const [selectedTicketState, setSelectedTicket] = useState<JiraTicket | undefined>();

  api = useAppNavigation({
    currentDate,
    isBitbucketReady,
    view: viewState,
    setView,
    setWeekStart,
    setMonthAnchor,
    setSelectedTicket
  });
  view = viewState;
  weekStart = weekStartState;
  monthAnchor = monthAnchorState;
  selectedTicket = selectedTicketState;

  return null;
}

const getApi = () => {
  if (!api) {
    throw new Error("Navigation hook was not rendered.");
  }
  return api;
};

const renderHarness = (props: HarnessProps = {}) => {
  act(() => {
    root.render(<Harness {...props} />);
  });
};

beforeEach(() => {
  api = undefined;
  view = "week";
  weekStart = defaultWeekStart;
  monthAnchor = defaultMonthAnchor;
  selectedTicket = undefined;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useAppNavigation", () => {
  it("navigates to previous, current, and next weeks", () => {
    renderHarness({
      currentDate: new Date(2026, 6, 8, 12),
      initialWeekStart: new Date(2026, 5, 15)
    });

    act(() => getApi().goToPreviousWeek());
    expect(toLocalDateKey(weekStart)).toBe("2026-06-08");

    act(() => getApi().goToNextWeek());
    expect(toLocalDateKey(weekStart)).toBe("2026-06-15");

    act(() => getApi().goToCurrentWeek());
    expect(toLocalDateKey(weekStart)).toBe("2026-07-06");
  });

  it("opens a month week by snapping the selected date to Monday", () => {
    renderHarness({ initialView: "month" });

    act(() => getApi().openWeekFromMonth(new Date(2026, 6, 9)));

    expect(view).toBe("week");
    expect(toLocalDateKey(weekStart)).toBe("2026-07-06");
  });

  it("navigates month anchors relative to the visible and current months", () => {
    renderHarness({
      currentDate: new Date(2026, 7, 24, 12),
      initialMonthAnchor: new Date(2026, 5, 1)
    });

    act(() => getApi().goToPreviousMonth());
    expect(toLocalDateKey(monthAnchor)).toBe("2026-05-01");

    act(() => getApi().goToNextMonth());
    expect(toLocalDateKey(monthAnchor)).toBe("2026-06-01");

    act(() => getApi().goToCurrentMonth());
    expect(toLocalDateKey(monthAnchor)).toBe("2026-08-01");
  });

  it("keeps today and tickets views on the current week", () => {
    renderHarness({
      currentDate: new Date(2026, 6, 8, 12),
      initialWeekStart: new Date(2026, 5, 15)
    });

    act(() => getApi().handleViewChange("today"));
    expect(view).toBe("today");
    expect(toLocalDateKey(weekStart)).toBe("2026-07-06");

    act(() => getApi().goToPreviousWeek());
    expect(toLocalDateKey(weekStart)).toBe("2026-06-29");

    act(() => getApi().handleViewChange("tickets"));
    expect(view).toBe("tickets");
    expect(toLocalDateKey(weekStart)).toBe("2026-07-06");
  });

  it("resets the month anchor when opening the month view", () => {
    renderHarness({
      currentDate: new Date(2026, 7, 24, 12),
      initialMonthAnchor: new Date(2026, 5, 1)
    });

    act(() => getApi().handleViewChange("month"));

    expect(view).toBe("month");
    expect(toLocalDateKey(monthAnchor)).toBe("2026-08-01");
  });

  it("selects a ticket and opens the today view when logging from tickets", () => {
    const ticket = buildTicket("TB-42");
    renderHarness({ initialView: "tickets" });

    act(() => getApi().handleLogTicket(ticket));

    expect(view).toBe("today");
    expect(selectedTicket).toBe(ticket);
  });

  it("redirects away from review when Bitbucket is unavailable", () => {
    renderHarness({ initialView: "review", isBitbucketReady: false });

    expect(view).toBe("week");
  });

  it("keeps the review view when Bitbucket is available", () => {
    renderHarness({ initialView: "review", isBitbucketReady: true });

    expect(view).toBe("review");
  });
});

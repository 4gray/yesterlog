// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JiraTicket } from "../../shared/types";
import { AppTicketsRoute, type AppTicketsRouteProps } from "./AppTicketsRoute";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { ticketsViewProps } = vi.hoisted(() => ({
  ticketsViewProps: [] as Record<string, unknown>[]
}));

vi.mock("../components/TicketsView", () => ({
  TicketsView: (props: Record<string, unknown>) => {
    ticketsViewProps.push(props);
    const inProgress = props.inProgress as JiraTicket[];
    return (
      <section
        data-testid="tickets-view"
        data-in-progress={String(inProgress.length)}
        data-recently-closed={String((props.recentlyClosed as JiraTicket[]).length)}
        data-week-hours={String(props.weekHoursLogged)}
        data-configured={String(props.isConfigured)}
        data-loading={String(props.isLoading)}
        data-error={String(props.error)}
      >
        <button type="button" onClick={() => (props.onToggleFavorite as (key: string) => void)("FTDM-101")}>
          favorite
        </button>
        <button type="button" onClick={() => (props.onLog as (ticket: JiraTicket) => void)(inProgress[0])}>
          log
        </button>
      </section>
    );
  }
}));

const ticket: JiraTicket = {
  id: "10001",
  key: "FTDM-101",
  summary: "Make route extraction boring",
  projectKey: "FTDM",
  projectName: "TimeBro",
  statusName: "In Progress",
  statusCategory: "indeterminate",
  loggedSecondsTotal: 3600,
  url: "https://example.atlassian.net/browse/FTDM-101"
};

const closedTicket: JiraTicket = {
  id: "10002",
  key: "FTDM-102",
  summary: "Ship the previous slice",
  projectKey: "FTDM",
  projectName: "TimeBro",
  statusName: "Done",
  statusCategory: "done",
  loggedSecondsTotal: 7200,
  url: "https://example.atlassian.net/browse/FTDM-102"
};

const noop = () => undefined;

const baseProps = (): AppTicketsRouteProps => ({
  tickets: {
    inProgress: [ticket],
    recentlyClosed: [closedTicket]
  },
  favoriteKeys: ["FTDM-101"],
  hoursByKey: { "FTDM-101": 2 },
  weekHoursLogged: 12,
  isConfigured: true,
  ticketsLoading: false,
  ticketsError: undefined,
  toggleFavorite: noop,
  handleLogTicket: noop
});

let container: HTMLDivElement;
let root: Root;

const renderRoute = (props: Partial<AppTicketsRouteProps> = {}) => {
  act(() => {
    root.render(<AppTicketsRoute {...baseProps()} {...props} />);
  });
};

beforeEach(() => {
  ticketsViewProps.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("AppTicketsRoute", () => {
  it("maps loaded ticket state to TicketsView props", () => {
    renderRoute({ ticketsLoading: true, ticketsError: "No Jira today" });

    const rendered = container.querySelector("[data-testid='tickets-view']");
    expect(rendered?.getAttribute("data-in-progress")).toBe("1");
    expect(rendered?.getAttribute("data-recently-closed")).toBe("1");
    expect(rendered?.getAttribute("data-week-hours")).toBe("12");
    expect(rendered?.getAttribute("data-configured")).toBe("true");
    expect(rendered?.getAttribute("data-loading")).toBe("true");
    expect(rendered?.getAttribute("data-error")).toBe("No Jira today");
    expect(ticketsViewProps[0]?.favoriteKeys).toEqual(["FTDM-101"]);
    expect(ticketsViewProps[0]?.hoursByKey).toEqual({ "FTDM-101": 2 });
  });

  it("passes empty ticket buckets while ticket data has not loaded", () => {
    renderRoute({ tickets: undefined });

    expect(ticketsViewProps[0]?.inProgress).toEqual([]);
    expect(ticketsViewProps[0]?.recentlyClosed).toEqual([]);
  });

  it("passes TicketsView actions through unchanged", () => {
    const toggleFavorite = vi.fn();
    const handleLogTicket = vi.fn();
    renderRoute({ toggleFavorite, handleLogTicket });

    act(() => {
      container.querySelectorAll("button")[0]?.click();
      container.querySelectorAll("button")[1]?.click();
    });

    expect(toggleFavorite).toHaveBeenCalledWith("FTDM-101");
    expect(handleLogTicket).toHaveBeenCalledWith(ticket);
  });
});

// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JiraTicket } from "../../shared/types";
import { ActiveWorkDock } from "./ActiveWorkDock";
import { TicketDetailsProvider } from "./TicketDetailsContext";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ticket: JiraTicket = {
  id: "10001",
  key: "TB-101",
  summary: "Keep active work close at hand",
  projectKey: "TB",
  projectName: "TimeBro",
  statusName: "In Progress",
  statusCategory: "indeterminate",
  loggedSecondsTotal: 0,
  url: "https://example.atlassian.net/browse/TB-101"
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
});

describe("ActiveWorkDock", () => {
  it("activates a Today dock card by click and keyboard", () => {
    const onActivateCard = vi.fn();
    act(() => {
      root.render(
        <ActiveWorkDock
          tickets={[ticket]}
          activeCount={1}
          open={true}
          shownCount={6}
          draggingKey={null}
          now={new Date("2026-06-18T12:00:00.000Z")}
          interaction="select"
          onToggleOpen={() => undefined}
          onLoadMore={() => undefined}
          onActivateCard={onActivateCard}
        />
      );
    });

    const card = container.querySelector<HTMLElement>("[aria-label='Log time for TB-101 today']");
    act(() => card?.click());
    act(() => card?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));

    expect(onActivateCard).toHaveBeenCalledTimes(2);
    expect(onActivateCard).toHaveBeenLastCalledWith(ticket);
  });

  it("attaches wheel scrolling when tickets load after mount", () => {
    const renderDock = (tickets: JiraTicket[]) => (
      <ActiveWorkDock
        tickets={tickets}
        activeCount={tickets.length}
        open={true}
        shownCount={6}
        draggingKey={null}
        now={new Date("2026-06-18T12:00:00.000Z")}
        onToggleOpen={() => undefined}
        onLoadMore={() => undefined}
      />
    );

    act(() => root.render(renderDock([])));
    act(() => root.render(renderDock([ticket])));

    const rail = container.querySelector<HTMLElement>(".dock-rail");
    expect(rail).not.toBeNull();
    Object.defineProperties(rail, {
      scrollWidth: { configurable: true, value: 1000 },
      clientWidth: { configurable: true, value: 500 }
    });
    const wheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 80 });

    act(() => rail?.dispatchEvent(wheel));

    expect(wheel.defaultPrevented).toBe(true);
    expect(rail?.scrollLeft).toBe(80);
  });

  it("opens ticket details and Jira without arming the card drag", () => {
    const onGrabCard = vi.fn();
    const openTicketDetails = vi.fn();

    act(() => {
      root.render(
        <TicketDetailsProvider value={openTicketDetails}>
          <ActiveWorkDock
            tickets={[ticket]}
            activeCount={1}
            open={true}
            shownCount={6}
            draggingKey={null}
            now={new Date("2026-06-18T12:00:00.000Z")}
            onToggleOpen={() => undefined}
            onLoadMore={() => undefined}
            onGrabCard={onGrabCard}
          />
        </TicketDetailsProvider>
      );
    });

    const key = container.querySelector<HTMLButtonElement>(".dock-card .ticket-key-button");
    const jiraLink = container.querySelector<HTMLAnchorElement>(".dock-card .ticket-jira-link");
    const card = container.querySelector<HTMLElement>(".dock-card");

    act(() => {
      key?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      key?.click();
      jiraLink?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      jiraLink?.click();
    });

    expect(openTicketDetails).toHaveBeenCalledWith("TB-101");
    expect(jiraLink?.href).toBe("https://example.atlassian.net/browse/TB-101");
    expect(jiraLink?.draggable).toBe(false);
    expect(onGrabCard).not.toHaveBeenCalled();

    act(() => {
      card?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    });

    expect(onGrabCard).toHaveBeenCalledTimes(1);
    expect(onGrabCard).toHaveBeenCalledWith(ticket, expect.anything());
  });

  it("keeps nested ticket controls separate from Today card keyboard activation", () => {
    const onActivateCard = vi.fn();
    const openTicketDetails = vi.fn();

    act(() => {
      root.render(
        <TicketDetailsProvider value={openTicketDetails}>
          <ActiveWorkDock
            tickets={[ticket]}
            activeCount={1}
            open={true}
            shownCount={6}
            draggingKey={null}
            now={new Date("2026-06-18T12:00:00.000Z")}
            interaction="select"
            onToggleOpen={() => undefined}
            onLoadMore={() => undefined}
            onActivateCard={onActivateCard}
          />
        </TicketDetailsProvider>
      );
    });

    const key = container.querySelector<HTMLButtonElement>(".dock-card .ticket-key-button");
    const jiraLink = container.querySelector<HTMLAnchorElement>(".dock-card .ticket-jira-link");
    const card = container.querySelector<HTMLElement>(".dock-card");

    act(() => {
      key?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      key?.click();
      jiraLink?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(openTicketDetails).toHaveBeenCalledTimes(1);
    expect(onActivateCard).not.toHaveBeenCalled();

    act(() => {
      card?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(onActivateCard).toHaveBeenCalledTimes(1);
    expect(onActivateCard).toHaveBeenCalledWith(ticket);
  });
});

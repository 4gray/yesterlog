// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JiraTicket } from "../../shared/types";
import { ActiveWorkDock } from "./ActiveWorkDock";

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
});

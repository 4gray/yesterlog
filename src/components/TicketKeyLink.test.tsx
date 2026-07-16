// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TicketDetailsProvider } from "./TicketDetailsContext";
import { TicketKeyLink } from "./TicketKeyLink";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

describe("TicketKeyLink", () => {
  it("opens in-app ticket details from the key while preserving the Jira browser link", () => {
    const openTicketDetails = vi.fn();
    const parentClick = vi.fn();
    const parentMouseDown = vi.fn();
    const parentKeyDown = vi.fn();

    act(() => {
      root.render(
        <TicketDetailsProvider value={openTicketDetails}>
          <div onClick={parentClick} onMouseDown={parentMouseDown} onKeyDown={parentKeyDown}>
            <TicketKeyLink issueKey="FTDM-397" url="https://example.atlassian.net/browse/FTDM-397" />
          </div>
        </TicketDetailsProvider>
      );
    });

    act(() => {
      const key = container.querySelector<HTMLButtonElement>(".ticket-key-button");
      key?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      key?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      key?.click();
    });

    expect(openTicketDetails).toHaveBeenCalledWith("FTDM-397");
    expect(parentClick).not.toHaveBeenCalled();
    expect(parentMouseDown).not.toHaveBeenCalled();
    expect(parentKeyDown).not.toHaveBeenCalled();

    act(() => {
      const jiraLink = container.querySelector<HTMLAnchorElement>(".ticket-jira-link");
      jiraLink?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      jiraLink?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      jiraLink?.click();
    });

    expect(container.querySelector<HTMLAnchorElement>(".ticket-jira-link")?.href).toBe(
      "https://example.atlassian.net/browse/FTDM-397"
    );
    expect(parentClick).not.toHaveBeenCalled();
    expect(parentMouseDown).not.toHaveBeenCalled();
    expect(parentKeyDown).not.toHaveBeenCalled();
  });
});

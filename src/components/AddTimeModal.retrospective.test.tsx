// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JiraTicket } from "../../shared/types";
import { AddTimeModal } from "./AddTimeModal";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ticket: JiraTicket = {
  id: "ticket-1",
  key: "TB-42",
  summary: "Keep Week worklogs retrospective",
  projectKey: "TB",
  projectName: "TimeBro",
  statusName: "In Progress",
  statusCategory: "indeterminate",
  loggedSecondsTotal: 0,
  url: "https://example.atlassian.net/browse/TB-42"
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

describe("AddTimeModal retrospective start", () => {
  it("keeps a new Week worklog ending at the modal clock time when its duration changes", () => {
    act(() => {
      root.render(
        <AddTimeModal
          date={new Date(2026, 5, 17, 14, 37)}
          dateOptions={["2026-06-17"]}
          ticketOptions={[ticket]}
          isConfigured={true}
          isLogging={false}
          prefill={{ retrospective: true }}
          onClose={() => undefined}
          onLog={async () => true}
        />
      );
    });

    const readTime = () => container.querySelector<HTMLInputElement>('input[type="time"]')?.value;
    expect(readTime()).toBe("12:37");

    const personalNoteButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Personal note"
    );
    act(() => personalNoteButton?.click());
    expect(readTime()).toBe("14:07");

    const ticketButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Log to ticket"
    );
    act(() => ticketButton?.click());
    expect(readTime()).toBe("12:37");

    const fourHourButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "4h"
    );
    expect(fourHourButton).toBeDefined();

    act(() => fourHourButton?.click());
    expect(readTime()).toBe("10:37");

    const timeInput = container.querySelector<HTMLInputElement>('input[type="time"]');
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    act(() => {
      valueSetter?.call(timeInput, "09:15");
      timeInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const oneHourButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "1h"
    );
    act(() => oneHourButton?.click());
    expect(readTime()).toBe("09:15");
  });

  it("does not shift a start time explicitly supplied by Timeline", () => {
    act(() => {
      root.render(
        <AddTimeModal
          date={new Date(2026, 5, 17, 14, 37)}
          dateOptions={["2026-06-17"]}
          ticketOptions={[ticket]}
          isConfigured={true}
          isLogging={false}
          prefill={{ startedISO: new Date(2026, 5, 17, 9, 15).toISOString() }}
          onClose={() => undefined}
          onLog={async () => true}
        />
      );
    });

    const timeInput = container.querySelector<HTMLInputElement>('input[type="time"]');
    const fourHourButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "4h"
    );

    act(() => fourHourButton?.click());
    expect(timeInput?.value).toBe("09:15");
  });

  it("keeps the modal end date when a duration change crosses midnight", () => {
    act(() => {
      root.render(
        <AddTimeModal
          date={new Date(2026, 6, 14, 1, 30)}
          dateOptions={["2026-07-13", "2026-07-14"]}
          ticketOptions={[ticket]}
          isConfigured={true}
          isLogging={false}
          prefill={{ retrospective: true }}
          onClose={() => undefined}
          onLog={async () => true}
        />
      );
    });

    const readTime = () => container.querySelector<HTMLInputElement>('input[type="time"]')?.value;
    const selectedDate = () =>
      container.querySelector<HTMLButtonElement>('.modal-day-option[aria-checked="true"]')?.textContent;

    expect(readTime()).toBe("23:30");
    expect(selectedDate()).toContain("13 JUL");

    const oneHourButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "1h"
    );
    act(() => oneHourButton?.click());

    expect(readTime()).toBe("00:30");
    expect(selectedDate()).toContain("14 JUL");
  });

  it("clamps the default duration when its retrospective start is not selectable", () => {
    act(() => {
      root.render(
        <AddTimeModal
          date={new Date(2026, 6, 13, 0, 30)}
          dateOptions={["2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17"]}
          ticketOptions={[ticket]}
          isConfigured={true}
          isLogging={false}
          prefill={{ retrospective: true }}
          onClose={() => undefined}
          onLog={async () => true}
        />
      );
    });

    const timeInput = container.querySelector<HTMLInputElement>('input[type="time"]');
    const selectedDate = container.querySelector<HTMLButtonElement>('.modal-day-option[aria-checked="true"]');
    const submitButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
      button.textContent?.includes("Log 30m to TB-42")
    );

    expect(timeInput?.value).toBe("00:00");
    expect(selectedDate?.textContent).toContain("13 JUL");
    expect(submitButton).toBeDefined();
  });
});

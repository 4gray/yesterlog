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

  it("keeps the duration controls synchronized with a visual timeline resize", () => {
    act(() => {
      root.render(
        <AddTimeModal
          date={new Date(2026, 5, 17, 10)}
          dateOptions={["2026-06-17"]}
          ticketOptions={[ticket]}
          isConfigured={true}
          isLogging={false}
          prefill={{ startedISO: new Date(2026, 5, 17, 10).toISOString(), timeSpentSeconds: 2 * 60 * 60 }}
          onClose={() => undefined}
          onLog={async () => true}
        />
      );
    });

    const track = container.querySelector<HTMLElement>(".add-time-timeline-track");
    const handle = container.querySelector<HTMLElement>('.add-time-timeline-handle[aria-label="Resize until end"]');
    expect(track).not.toBeNull();
    expect(handle).not.toBeNull();
    Object.defineProperty(track, "getBoundingClientRect", {
      value: () => ({
        x: 0,
        y: 0,
        top: 0,
        right: 300,
        bottom: 1248,
        left: 0,
        width: 300,
        height: 1248,
        toJSON: () => undefined
      })
    });

    act(() => {
      handle?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, clientY: 624 }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, button: 0, clientY: 702 }));
    });
    act(() => {
      window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0, clientY: 702 }));
    });

    expect(container.querySelector(".modal-duration")?.textContent).toBe("3h 30m");
    expect(container.querySelector<HTMLInputElement>('input[type="time"]')?.value).toBe("10:00");
    expect(container.querySelector(".add-time-timeline-head strong")?.textContent).toContain("10:00 → 13:30");
  });

  it("preserves a bulk duration instead of clamping it to the current day", () => {
    act(() => {
      root.render(
        <AddTimeModal
          date={new Date(2026, 5, 17, 14, 37)}
          dateOptions={["2026-06-15", "2026-06-16", "2026-06-17"]}
          ticketOptions={[ticket]}
          isConfigured={true}
          isLogging={false}
          dailyTargetHours={8}
          prefill={{ retrospective: true }}
          onClose={() => undefined}
          onLog={async () => true}
        />
      );
    });

    const customButton = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Custom"
    );
    act(() => customButton?.click());

    const amountInput = container.querySelector<HTMLInputElement>('input[aria-label="Custom ticket duration amount"]');
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    act(() => {
      valueSetter?.call(amountInput, "2");
      amountInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const weekButton = [...container.querySelectorAll<HTMLButtonElement>(".custom-unit-toggle button")].find(
      (button) => button.textContent === "W"
    );
    act(() => weekButton?.click());

    expect(container.querySelector(".modal-duration")?.textContent).toBe("80h 00m");
    expect(container.querySelector<HTMLInputElement>('input[type="time"]')?.value).toBe("12:37");
    expect(container.textContent).toContain("BULK WORKLOG");
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

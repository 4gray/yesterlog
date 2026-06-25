// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingRecurringOccurrence, RecurringEntry } from "../../shared/types";
import {
  formatWeekRecurringMinutes,
  PendingRecurringCard,
  RecurringEntryRow
} from "./WeekRecurringRows";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const pending: PendingRecurringOccurrence = {
  eventId: "rec-standup",
  dateKey: "2026-06-17",
  title: "Daily Standup",
  localTime: "09:15",
  defaultDurationMinutes: 15,
  defaultNote: "Daily sync"
};

const entry: RecurringEntry = {
  eventId: "rec-standup",
  dateKey: "2026-06-17",
  title: "Daily Standup",
  localTime: "09:15",
  timeSpentSeconds: 15 * 60,
  note: "Daily sync"
};

let container: HTMLDivElement;
let root: Root;

const render = (node: ReactNode) => {
  act(() => {
    root.render(node);
  });
};

const setTextareaValue = (textarea: HTMLTextAreaElement, value: string) => {
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
  valueSetter?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("WeekRecurringRows", () => {
  it("formats recurring durations for week rows", () => {
    expect(formatWeekRecurringMinutes(15)).toBe("15m");
    expect(formatWeekRecurringMinutes(60)).toBe("1h");
    expect(formatWeekRecurringMinutes(75)).toBe("1h 15m");
  });

  it("confirms and skips a pending recurring suggestion", () => {
    const onConfirm = vi.fn();
    const onSkip = vi.fn();
    render(<PendingRecurringCard pending={pending} onConfirm={onConfirm} onSkip={onSkip} />);

    expect(container.textContent).toContain("Daily Standup");
    expect(container.textContent).toContain("09:15 · 15m");

    act(() => {
      container.querySelector<HTMLButtonElement>("[aria-label='Log 15m locally']")?.click();
      container.querySelector<HTMLButtonElement>("[aria-label='Skip today']")?.click();
    });

    expect(onConfirm).toHaveBeenCalledWith({
      eventId: "rec-standup",
      dateKey: "2026-06-17",
      timeSpentSeconds: 15 * 60,
      note: "Daily sync"
    });
    expect(onSkip).toHaveBeenCalledWith("rec-standup", "2026-06-17");
  });

  it("allows editing a pending recurring suggestion before confirming", () => {
    const onConfirm = vi.fn();
    render(<PendingRecurringCard pending={pending} onConfirm={onConfirm} onSkip={() => undefined} />);

    act(() => {
      container.querySelector<HTMLButtonElement>("[aria-label='Adjust duration and note']")?.click();
    });
    act(() => {
      Array.from(container.querySelectorAll<HTMLButtonElement>(".rec-chip"))
        .find((button) => button.textContent === "45m")
        ?.click();
      const textarea = container.querySelector<HTMLTextAreaElement>(".rec-pending-note");
      if (textarea) {
        setTextareaValue(textarea, "  Updated sync note  ");
      }
      container.querySelector<HTMLButtonElement>("[aria-label='Log 45m locally']")?.click();
    });

    expect(onConfirm).toHaveBeenCalledWith({
      eventId: "rec-standup",
      dateKey: "2026-06-17",
      timeSpentSeconds: 45 * 60,
      note: "Updated sync note"
    });
  });

  it("renders a confirmed recurring entry and saves edits", () => {
    const onSave = vi.fn();
    render(<RecurringEntryRow entry={entry} onSave={onSave} />);

    expect(container.textContent).toContain("EVENT");
    expect(container.textContent).toContain("Daily Standup");
    expect(container.textContent).toContain("Daily sync");
    expect(container.textContent).toContain("15m");

    act(() => {
      container.querySelector<HTMLButtonElement>("[aria-label='Edit Daily Standup']")?.click();
    });
    act(() => {
      Array.from(container.querySelectorAll<HTMLButtonElement>(".rec-chip"))
        .find((button) => button.textContent === "30m")
        ?.click();
      const textarea = container.querySelector<HTMLTextAreaElement>(".rec-pending-note");
      if (textarea) {
        setTextareaValue(textarea, "Edited recurring note");
      }
      container.querySelector<HTMLButtonElement>("[aria-label='Save 30m']")?.click();
    });

    expect(onSave).toHaveBeenCalledWith({
      eventId: "rec-standup",
      dateKey: "2026-06-17",
      timeSpentSeconds: 30 * 60,
      note: "Edited recurring note"
    });
  });

  it("allows deleting a confirmed recurring entry while editing", () => {
    const onDelete = vi.fn();
    render(<RecurringEntryRow entry={entry} onSave={() => undefined} onDelete={onDelete} />);

    act(() => {
      container.querySelector<HTMLButtonElement>("[aria-label='Edit Daily Standup']")?.click();
    });
    act(() => {
      container.querySelector<HTMLButtonElement>("[aria-label='Delete Daily Standup']")?.click();
    });

    expect(onDelete).toHaveBeenCalledWith("rec-standup", "2026-06-17");
  });
});

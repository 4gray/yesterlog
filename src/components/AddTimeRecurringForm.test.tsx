// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecurringEvent } from "../../shared/types";
import {
  AddTimeRecurringForm,
  formatRecurringMinutes,
  type AddTimeRecurringFormProps
} from "./AddTimeRecurringForm";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const recurringEvents: RecurringEvent[] = [
  {
    id: "rec-standup",
    title: "Daily Standup",
    daysOfWeek: [1, 2, 3, 4, 5],
    localTime: "09:15",
    durationMinutes: 15,
    defaultNote: "Team sync",
    active: true,
    createdAt: "2026-06-15T07:00:00.000Z",
    updatedAt: "2026-06-15T07:00:00.000Z"
  },
  {
    id: "rec-weekly",
    title: "Weekly Planning",
    daysOfWeek: [4],
    localTime: "15:00",
    durationMinutes: 75,
    defaultNote: "Planning",
    active: true,
    createdAt: "2026-06-15T07:00:00.000Z",
    updatedAt: "2026-06-15T07:00:00.000Z"
  }
];

let container: HTMLDivElement;
let root: Root;

const renderForm = ({
  candidates = recurringEvents,
  selectedEvent = recurringEvents[0],
  minutes = 15,
  note = "Team sync",
  onSelect = vi.fn(),
  onMinutesChange = vi.fn(),
  onNoteChange = vi.fn()
}: Partial<AddTimeRecurringFormProps> = {}) => {
  act(() => {
    root.render(
      <AddTimeRecurringForm
        candidates={candidates}
        selectedEvent={selectedEvent}
        minutes={minutes}
        note={note}
        onSelect={onSelect}
        onMinutesChange={onMinutesChange}
        onNoteChange={onNoteChange}
      />
    );
  });
  return { onSelect, onMinutesChange, onNoteChange };
};

const setTextAreaValue = (textarea: HTMLTextAreaElement, value: string) => {
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

describe("AddTimeRecurringForm", () => {
  it("formats recurring minute labels", () => {
    expect(formatRecurringMinutes(15)).toBe("15m");
    expect(formatRecurringMinutes(60)).toBe("1h");
    expect(formatRecurringMinutes(75)).toBe("1h 15m");
  });

  it("renders candidates and marks the selected recurring event", () => {
    renderForm({ selectedEvent: recurringEvents[1], minutes: 75, note: "Planning" });

    const options = Array.from(container.querySelectorAll<HTMLButtonElement>(".recurring-option"));
    expect(container.textContent).toContain("SCHEDULED THIS DAY");
    expect(container.textContent).toContain("Daily Standup");
    expect(container.textContent).toContain("Weekly Planning");
    expect(container.textContent).toContain("1h 15m");
    expect(options[0].getAttribute("aria-checked")).toBe("false");
    expect(options[1].getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector<HTMLTextAreaElement>(".note-textarea")?.value).toBe("Planning");
  });

  it("passes event, minute, and note changes through", () => {
    const onSelect = vi.fn();
    const onMinutesChange = vi.fn();
    const onNoteChange = vi.fn();
    renderForm({ onSelect, onMinutesChange, onNoteChange });

    act(() => {
      container.querySelectorAll<HTMLButtonElement>(".recurring-option")[1]?.click();
      Array.from(container.querySelectorAll<HTMLButtonElement>(".preset"))
        .find((button) => button.textContent === "45m")
        ?.click();
      const textarea = container.querySelector<HTMLTextAreaElement>(".note-textarea");
      if (textarea) {
        setTextAreaValue(textarea, "Updated note");
      }
    });

    expect(onSelect).toHaveBeenCalledWith(recurringEvents[1]);
    expect(onMinutesChange).toHaveBeenCalledWith(45);
    expect(onNoteChange).toHaveBeenCalledWith("Updated note");
  });

  it("renders an empty state when no candidate is available", () => {
    renderForm({ candidates: [], selectedEvent: undefined });

    expect(container.textContent).toContain("No recurring events scheduled for this day");
    expect(container.querySelector(".recurring-option")).toBeNull();
    expect(container.querySelector(".note-textarea")).toBeNull();
  });
});

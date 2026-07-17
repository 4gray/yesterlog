// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPalette, type CommandPaletteProps } from "./CommandPalette";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => undefined;

const baseProps = (): CommandPaletteProps => ({
  open: true,
  commands: [
    { id: "log-time", label: "Log time…", hint: "⌘⇧K", run: noop },
    { id: "sync-now", label: "Sync now", run: noop },
    { id: "go-today", label: "Go to current week", run: noop }
  ],
  onClose: noop
});

let container: HTMLDivElement;
let root: Root;

const renderPalette = (props: Partial<CommandPaletteProps> = {}) => {
  act(() => {
    root.render(<CommandPalette {...baseProps()} {...props} />);
  });
};

const items = () => Array.from(container.querySelectorAll<HTMLButtonElement>(".command-palette-item"));

const type = (value: string) => {
  const input = container.querySelector<HTMLInputElement>(".command-palette-input");
  // React tracks the value node-side, so a plain `input.value =` is not seen.
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  act(() => {
    valueSetter?.call(input, value);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

/** Dispatched on window: the palette binds there so Esc works wherever focus is. */
const pressKey = (key: string) => {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
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

describe("CommandPalette", () => {
  it("renders nothing while closed", () => {
    renderPalette({ open: false });
    expect(container.querySelector(".modal-overlay")).toBeNull();
  });

  it("lists every command when open", () => {
    renderPalette();

    expect(items().map((item) => item.querySelector(".command-palette-item-label")?.textContent)).toEqual([
      "Log time…",
      "Sync now",
      "Go to current week"
    ]);
    expect(items()[0]?.querySelector(".command-palette-item-hint")?.textContent).toBe("⌘⇧K");
  });

  it("filters commands by substring, case-insensitively", () => {
    renderPalette();

    type("SYNC");
    expect(items()).toHaveLength(1);
    expect(items()[0]?.textContent).toContain("Sync now");
  });

  it("shows an empty state when nothing matches", () => {
    renderPalette();

    type("nonexistent");
    expect(items()).toHaveLength(0);
    expect(container.querySelector(".command-palette-empty")).not.toBeNull();
  });

  it("runs a command on click and closes first", () => {
    const run = vi.fn();
    const onClose = vi.fn();
    renderPalette({ commands: [{ id: "sync-now", label: "Sync now", run }], onClose });

    act(() => items()[0]?.click());

    expect(run).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves the active row with arrows and runs it on Enter", () => {
    const run = vi.fn();
    renderPalette({
      commands: [
        { id: "a", label: "First", run: noop },
        { id: "b", label: "Second", run }
      ]
    });

    expect(items()[0]?.getAttribute("aria-selected")).toBe("true");
    pressKey("ArrowDown");
    expect(items()[1]?.getAttribute("aria-selected")).toBe("true");

    pressKey("Enter");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("wraps the active row at both ends", () => {
    renderPalette();

    pressKey("ArrowUp");
    expect(items()[2]?.getAttribute("aria-selected")).toBe("true");
    pressKey("ArrowDown");
    expect(items()[0]?.getAttribute("aria-selected")).toBe("true");
  });

  it("closes on Escape and on a backdrop click", () => {
    const onClose = vi.fn();
    renderPalette({ onClose });

    pressKey("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => container.querySelector<HTMLDivElement>(".modal-backdrop")?.click());
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("still closes on Escape once focus has left the input", () => {
    const onClose = vi.fn();
    renderPalette({ onClose });

    act(() => {
      container.querySelector<HTMLInputElement>(".command-palette-input")?.blur();
      document.body.focus();
    });
    pressKey("Escape");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stops listening once closed", () => {
    const onClose = vi.fn();
    renderPalette({ onClose });
    renderPalette({ open: false, onClose });

    pressKey("Escape");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("points aria-activedescendant at the active option", () => {
    renderPalette();
    const input = container.querySelector<HTMLInputElement>(".command-palette-input");

    expect(input?.getAttribute("role")).toBe("combobox");
    expect(input?.getAttribute("aria-activedescendant")).toBe("command-palette-option-log-time");

    pressKey("ArrowDown");
    expect(input?.getAttribute("aria-activedescendant")).toBe("command-palette-option-sync-now");
    expect(items()[1]?.id).toBe("command-palette-option-sync-now");
  });

  it("never runs a disabled command", () => {
    const run = vi.fn();
    renderPalette({ commands: [{ id: "sync-now", label: "Sync now", disabled: true, run }] });

    act(() => items()[0]?.click());
    pressKey("Enter");
    expect(run).not.toHaveBeenCalled();
  });

  it("resets the query each time it reopens", () => {
    renderPalette();
    type("sync");
    expect(items()).toHaveLength(1);

    renderPalette({ open: false });
    renderPalette({ open: true });

    expect(container.querySelector<HTMLInputElement>(".command-palette-input")?.value).toBe("");
    expect(items()).toHaveLength(3);
  });
});

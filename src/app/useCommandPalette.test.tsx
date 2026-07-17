// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useCommandPalette } from "./useCommandPalette";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const Harness = ({ enabled = true }: { enabled?: boolean }) => {
  const { open, close, toggle } = useCommandPalette({ enabled });
  return (
    <button type="button" data-open={open} onClick={() => (open ? close() : toggle())}>
      {open ? "open" : "closed"}
    </button>
  );
};

let container: HTMLDivElement;
let root: Root;

const pressKey = (init: KeyboardEventInit) => {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
};

const state = () => container.querySelector("button")?.dataset.open;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useCommandPalette", () => {
  it("starts closed", () => {
    act(() => root.render(<Harness />));
    expect(state()).toBe("false");
  });

  it("toggles on Cmd+K and again on a second press", () => {
    act(() => root.render(<Harness />));

    pressKey({ key: "k", metaKey: true });
    expect(state()).toBe("true");

    pressKey({ key: "k", metaKey: true });
    expect(state()).toBe("false");
  });

  it("opens on Ctrl+K for Windows and Linux", () => {
    act(() => root.render(<Harness />));

    pressKey({ key: "k", ctrlKey: true });
    expect(state()).toBe("true");
  });

  it("ignores Cmd+Shift+K, which belongs to the add-time shortcut", () => {
    act(() => root.render(<Harness />));

    pressKey({ key: "k", metaKey: true, shiftKey: true });
    expect(state()).toBe("false");
  });

  it("ignores a bare k and an already-handled event", () => {
    act(() => root.render(<Harness />));

    pressKey({ key: "k" });
    expect(state()).toBe("false");

    act(() => {
      const event = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true, cancelable: true });
      event.preventDefault();
      window.dispatchEvent(event);
    });
    expect(state()).toBe("false");
  });

  it("does not bind while disabled", () => {
    act(() => root.render(<Harness enabled={false} />));

    pressKey({ key: "k", metaKey: true });
    expect(state()).toBe("false");
  });

  it("closes when it becomes disabled mid-session", () => {
    act(() => root.render(<Harness />));
    pressKey({ key: "k", metaKey: true });
    expect(state()).toBe("true");

    act(() => root.render(<Harness enabled={false} />));
    expect(state()).toBe("false");
  });
});

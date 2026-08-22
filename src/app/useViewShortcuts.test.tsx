// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppView } from "../components/Sidebar";
import { useViewShortcuts } from "./useViewShortcuts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const Harness = ({
  enabled,
  showReview,
  onViewChange
}: {
  enabled: boolean;
  showReview: boolean;
  onViewChange: (view: AppView) => void;
}) => {
  useViewShortcuts({ enabled, showReview, onViewChange });
  return null;
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

const render = (props: { enabled: boolean; showReview: boolean; onViewChange: (view: AppView) => void }) => {
  act(() => {
    root.render(<Harness {...props} />);
  });
};

const pressDigit = (digit: string, init: KeyboardEventInit = {}) => {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: digit, metaKey: true, cancelable: true, ...init }));
  });
};

describe("useViewShortcuts", () => {
  it("jumps to the nth visible view on ⌘digit", () => {
    const onViewChange = vi.fn();
    render({ enabled: true, showReview: true, onViewChange });

    pressDigit("1");
    pressDigit("5");
    expect(onViewChange).toHaveBeenNthCalledWith(1, "today");
    expect(onViewChange).toHaveBeenNthCalledWith(2, "review");
  });

  it("skips the hidden Review entry in the numbering", () => {
    const onViewChange = vi.fn();
    render({ enabled: true, showReview: false, onViewChange });

    pressDigit("5");
    expect(onViewChange).toHaveBeenCalledWith("tickets");
  });

  it("ignores digits without a modifier, with shift, and when disabled", () => {
    const onViewChange = vi.fn();
    render({ enabled: true, showReview: true, onViewChange });

    pressDigit("1", { metaKey: false });
    pressDigit("1", { shiftKey: true });
    expect(onViewChange).not.toHaveBeenCalled();

    render({ enabled: false, showReview: true, onViewChange });
    pressDigit("1");
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it("ignores digits past the visible view count", () => {
    const onViewChange = vi.fn();
    render({ enabled: true, showReview: false, onViewChange });

    pressDigit("9");
    expect(onViewChange).not.toHaveBeenCalled();
  });
});

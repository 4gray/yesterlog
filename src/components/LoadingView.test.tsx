// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LoadingView } from "./LoadingView";

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

describe("LoadingView", () => {
  it("renders the shared app loading surface", () => {
    act(() => {
      root.render(<LoadingView />);
    });

    const view = container.querySelector<HTMLElement>(".view");

    expect(view).not.toBeNull();
    expect(view?.classList.contains("loading-view")).toBe(true);
    expect(view?.getAttribute("role")).toBe("status");
    expect(container.querySelector(".loading-view-label")?.textContent).toBe("LOADING\u2026");
  });
});

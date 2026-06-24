// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSidebarState } from "./useSidebarState";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type SidebarStateApi = ReturnType<typeof useSidebarState>;

let container: HTMLDivElement;
let root: Root;
let api: SidebarStateApi | undefined;

function Harness() {
  api = useSidebarState();

  return null;
}

const getApi = () => {
  if (!api) {
    throw new Error("Sidebar state hook was not rendered.");
  }
  return api;
};

const renderHarness = () => {
  act(() => {
    root.render(<Harness />);
  });
};

beforeEach(() => {
  api = undefined;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useSidebarState", () => {
  it("starts expanded and toggles collapsed state", () => {
    renderHarness();

    expect(getApi().sidebarCollapsed).toBe(false);

    act(() => getApi().toggleSidebarCollapsed());
    expect(getApi().sidebarCollapsed).toBe(true);

    act(() => getApi().toggleSidebarCollapsed());
    expect(getApi().sidebarCollapsed).toBe(false);
  });

  it("keeps the toggle callback stable across renders and updates", () => {
    renderHarness();
    const firstToggle = getApi().toggleSidebarCollapsed;

    renderHarness();
    expect(getApi().toggleSidebarCollapsed).toBe(firstToggle);

    act(() => firstToggle());

    expect(getApi().sidebarCollapsed).toBe(true);
    expect(getApi().toggleSidebarCollapsed).toBe(firstToggle);
  });
});

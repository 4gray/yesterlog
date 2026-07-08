// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppView } from "../components/Sidebar";
import { AppShellFrame, type AppShellFrameProps } from "./AppShellFrame";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { sidebarProps } = vi.hoisted(() => ({
  sidebarProps: [] as unknown[]
}));

vi.mock("../components/Sidebar", () => ({
  Sidebar: (props: Record<string, unknown>) => {
    sidebarProps.push(props);
    return (
      <aside
        data-testid="sidebar"
        data-view={String(props.view)}
        data-collapsed={String(props.collapsed)}
        data-review={String(props.showReview)}
        data-sync-label={String(props.syncLabel)}
        data-sync-state={String(props.syncState)}
      >
        <button type="button" onClick={() => (props.onViewChange as (view: AppView) => void)("settings")}>
          settings
        </button>
        <button type="button" onClick={() => (props.onToggleCollapse as () => void)()}>
          collapse
        </button>
      </aside>
    );
  }
}));

const noop = () => undefined;

const baseProps = (): AppShellFrameProps => ({
  isDemo: true,
  isBooting: false,
  settingsDirty: false,
  theme: "dark",
  view: "week",
  reportTab: "summary",
  sidebarCollapsed: false,
  onViewChange: noop,
  onReportTabChange: noop,
  onToggleSidebarCollapsed: noop,
  syncLabel: "SYNCED 9:30 AM",
  syncState: "synced",
  showReview: true,
  children: <main data-testid="main-view" />,
  overlays: <section data-testid="overlays" />
});

let container: HTMLDivElement;
let root: Root;

const renderFrame = (props: Partial<AppShellFrameProps> = {}) => {
  act(() => {
    root.render(<AppShellFrame {...baseProps()} {...props} />);
  });
};

beforeEach(() => {
  sidebarProps.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("AppShellFrame", () => {
  it("renders shell attributes, sidebar, content, and overlays", () => {
    renderFrame();

    const shell = container.querySelector<HTMLElement>(".app-shell");
    expect(shell?.dataset.demo).toBe("true");
    expect(shell?.dataset.screenshotReady).toBe("true");
    expect(shell?.dataset.theme).toBe("dark");
    expect(shell?.dataset.view).toBe("week");
    expect(container.querySelector("[data-testid='sidebar']")).not.toBeNull();
    expect(container.querySelector(".shell-body > [data-testid='main-view']")).not.toBeNull();
    expect(container.querySelector(".app-shell > [data-testid='overlays']")).not.toBeNull();
  });

  it("passes navigation and sync props through to the sidebar", () => {
    const onViewChange = vi.fn();
    const onToggleSidebarCollapsed = vi.fn();
    renderFrame({
      isDemo: false,
      isBooting: true,
      view: "reports",
      sidebarCollapsed: true,
      onViewChange,
      onToggleSidebarCollapsed,
      syncLabel: "SYNCING...",
      syncState: "syncing",
      showReview: false
    });

    const shell = container.querySelector<HTMLElement>(".app-shell");
    expect(shell?.dataset.demo).toBeUndefined();
    expect(shell?.dataset.screenshotReady).toBe("false");
    expect(container.querySelector("[data-testid='sidebar']")?.getAttribute("data-view")).toBe("reports");
    expect(container.querySelector("[data-testid='sidebar']")?.getAttribute("data-collapsed")).toBe("true");
    expect(container.querySelector("[data-testid='sidebar']")?.getAttribute("data-review")).toBe("false");
    expect(container.querySelector("[data-testid='sidebar']")?.getAttribute("data-sync-label")).toBe("SYNCING...");
    expect(container.querySelector("[data-testid='sidebar']")?.getAttribute("data-sync-state")).toBe("syncing");

    act(() => {
      container.querySelectorAll("button")[0]?.click();
      container.querySelectorAll("button")[1]?.click();
    });

    expect(onViewChange).toHaveBeenCalledWith("settings");
    expect(onToggleSidebarCollapsed).toHaveBeenCalledTimes(1);
    expect(sidebarProps).toHaveLength(1);
  });
});

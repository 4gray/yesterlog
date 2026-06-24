// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppView } from "../components/Sidebar";
import { useAppShellState } from "./useAppShellState";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type AppShellStateApi = ReturnType<typeof useAppShellState>;

interface HarnessProps {
  initialView?: AppView;
  isDemo: boolean;
}

let container: HTMLDivElement;
let root: Root;
let api: AppShellStateApi | undefined;

function Harness(props: HarnessProps) {
  api = useAppShellState(props);
  return null;
}

const getApi = () => {
  if (!api) {
    throw new Error("App shell state hook was not rendered.");
  }
  return api;
};

const renderHarness = (props: HarnessProps) => {
  act(() => {
    root.render(<Harness {...props} />);
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

describe("useAppShellState", () => {
  it("defaults live users to week view while booting", () => {
    renderHarness({ isDemo: false });

    expect(getApi().view).toBe("week");
    expect(getApi().isBooting).toBe(true);
  });

  it("initializes demo users with the demo view and skips booting", () => {
    renderHarness({ initialView: "tickets", isDemo: true });

    expect(getApi().view).toBe("tickets");
    expect(getApi().isBooting).toBe(false);
  });

  it("keeps lazy initial values stable across rerenders until setters change them", () => {
    renderHarness({ initialView: "reports", isDemo: false });
    renderHarness({ initialView: "settings", isDemo: true });

    expect(getApi().view).toBe("reports");
    expect(getApi().isBooting).toBe(true);

    act(() => {
      getApi().setView("today");
      getApi().setIsBooting(false);
    });

    expect(getApi().view).toBe("today");
    expect(getApi().isBooting).toBe(false);
  });
});

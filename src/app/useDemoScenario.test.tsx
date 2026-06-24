// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toLocalDateKey } from "../utils/date";
import { useDemoScenario } from "./useDemoScenario";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type DemoScenarioApi = ReturnType<typeof useDemoScenario>;

let container: HTMLDivElement;
let root: Root;
let api: DemoScenarioApi | undefined;

function Harness() {
  api = useDemoScenario();
  return null;
}

const setUrl = (path: string) => {
  window.history.replaceState(null, "", path);
};

const getApi = () => {
  if (!api) {
    throw new Error("Demo scenario hook was not rendered.");
  }
  return api;
};

const renderHarness = () => {
  act(() => {
    root.render(<Harness />);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-24T08:00:00.000Z"));
  api = undefined;
  setUrl("/");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  setUrl("/");
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useDemoScenario", () => {
  it("stays inactive when demo query parameters are absent", () => {
    renderHarness();

    expect(getApi().isDemo).toBe(false);
    expect(getApi().demoConfig).toBeUndefined();
    expect(getApi().demoScenario).toBeUndefined();
    expect(getApi().currentDate.toISOString()).toBe("2026-06-24T08:00:00.000Z");
  });

  it("builds a stable frozen demo scenario from query parameters", () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    setUrl("/?demo=1&view=tickets&theme=light&today=2026-06-18&seed=qa&update=available");

    renderHarness();

    const firstApi = getApi();
    expect(firstApi.isDemo).toBe(true);
    expect(firstApi.demoConfig?.view).toBe("tickets");
    expect(firstApi.demoConfig?.theme).toBe("light");
    expect(firstApi.demoConfig?.seed).toBe("qa");
    expect(firstApi.demoConfig?.updateAvailable).toBe(true);
    expect(toLocalDateKey(firstApi.currentDate)).toBe("2026-06-18");
    expect(firstApi.currentDate.getHours()).toBe(14);
    expect(firstApi.currentDate.getMinutes()).toBe(30);
    expect(firstApi.demoScenario?.settings.jiraBaseUrl).toBe("https://timebro-demo.example.test");
    expect(firstApi.demoScenario?.weekOverride.weekKey).toBe("2026-06-15");
    expect(setIntervalSpy).not.toHaveBeenCalled();

    renderHarness();

    expect(getApi().demoConfig).toBe(firstApi.demoConfig);
    expect(getApi().demoScenario).toBe(firstApi.demoScenario);
    expect(getApi().currentDate).toBe(firstApi.currentDate);
  });
});

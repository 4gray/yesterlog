// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppSettings } from "../../shared/types";
import { DEFAULT_SETTINGS } from "../domain/week";
import { useAppSettingsState } from "./useAppSettingsState";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type AppSettingsStateApi = ReturnType<typeof useAppSettingsState>;

interface HarnessProps {
  demoSettings?: AppSettings;
}

let container: HTMLDivElement;
let root: Root;
let api: AppSettingsStateApi | undefined;

function Harness({ demoSettings }: HarnessProps) {
  api = useAppSettingsState({
    demoScenario: demoSettings ? { settings: demoSettings } : undefined
  });
  return null;
}

const getApi = () => {
  if (!api) {
    throw new Error("App settings state hook was not rendered.");
  }
  return api;
};

const renderHarness = (props: HarnessProps = {}) => {
  act(() => {
    root.render(<Harness {...props} />);
  });
};

const buildSettings = (overrides: Partial<AppSettings> = {}): AppSettings => ({
  ...DEFAULT_SETTINGS,
  ...overrides
});

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

describe("useAppSettingsState", () => {
  it("initializes active settings and draft from default settings", () => {
    renderHarness();

    expect(getApi().settings).toBe(DEFAULT_SETTINGS);
    expect(getApi().settingsDraft).toBe(DEFAULT_SETTINGS);
  });

  it("initializes active settings and draft from demo settings", () => {
    const demoSettings = buildSettings({
      jiraBaseUrl: "https://demo.example.test",
      jiraEmail: "demo.user@example.test",
      weeklyTargetHours: 32
    });

    renderHarness({ demoSettings });

    expect(getApi().settings).toBe(demoSettings);
    expect(getApi().settingsDraft).toBe(demoSettings);
  });

  it("keeps lazy initial values stable across rerenders until setters change them", () => {
    const firstSettings = buildSettings({
      jiraBaseUrl: "https://first.example.test",
      jiraEmail: "first@example.test"
    });
    const secondSettings = buildSettings({
      jiraBaseUrl: "https://second.example.test",
      jiraEmail: "second@example.test"
    });
    const draftSettings = buildSettings({
      jiraBaseUrl: "https://draft.example.test",
      jiraEmail: "draft@example.test"
    });

    renderHarness({ demoSettings: firstSettings });
    renderHarness({ demoSettings: secondSettings });

    expect(getApi().settings).toBe(firstSettings);
    expect(getApi().settingsDraft).toBe(firstSettings);

    act(() => {
      getApi().setSettings(secondSettings);
      getApi().setSettingsDraft(draftSettings);
    });

    expect(getApi().settings).toBe(secondSettings);
    expect(getApi().settingsDraft).toBe(draftSettings);
  });
});

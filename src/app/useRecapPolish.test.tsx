// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../../shared/types";
import { polishRecap, probeOllama } from "../api/ollama";
import { useRecapPolish, type RecapPolishState } from "./useRecapPolish";

vi.mock("../api/ollama", () => ({
  probeOllama: vi.fn(),
  polishRecap: vi.fn(),
  aiConnectionFromSettings: vi.fn((settings: AppSettings) => ({
    provider: settings.aiProvider ?? "ollama",
    endpoint: settings.ollamaEndpoint,
    model: settings.ollamaModel
  })),
  aiModelLabel: vi.fn((settings: AppSettings) => settings.ollamaModel)
}));

const probeMock = vi.mocked(probeOllama);
const polishMock = vi.mocked(polishRecap);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const baseSettings: AppSettings = {
  jiraBaseUrl: "",
  jiraEmail: "",
  jiraApiToken: "",
  bitbucketEmail: "",
  bitbucketApiToken: "",
  bitbucketWorkspace: "",
  bitbucketRepositories: "",
  bitbucketReviewBucketIssueKey: "",
  weeklyTargetHours: 40,
  workingDays: [1, 2, 3, 4, 5],
  reminderTime: "16:30",
  remindersEnabled: true,
  aiEnabled: true,
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "llama3.1:8b"
};

const recap = "Yesterday (Fri Jun 19) — 2h tracked.\n\nTickets (2h):\n• ABC-1 Thing — 2h";

let container: HTMLDivElement;
let root: Root;
let state: RecapPolishState;

function Harness({ recapText = recap, settings = baseSettings }: { recapText?: string; settings?: AppSettings }) {
  state = useRecapPolish(recapText, settings);
  return null;
}

const render = (props: { recapText?: string; settings?: AppSettings } = {}) => {
  act(() => {
    root.render(<Harness {...props} />);
  });
};

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

beforeEach(() => {
  probeMock.mockReset();
  polishMock.mockReset();
  probeMock.mockResolvedValue({ reachable: true, modelReady: true, models: ["llama3.1:8b"] });
  polishMock.mockResolvedValue("I shipped ABC-1 yesterday.");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useRecapPolish", () => {
  it("stays off and never probes when AI is disabled", async () => {
    render({ settings: { ...baseSettings, aiEnabled: false } });
    await flush();
    expect(state.aiOn).toBe(false);
    expect(probeMock).not.toHaveBeenCalled();
  });

  it("turns on when the model is reachable and ready", async () => {
    render();
    await flush();
    expect(state.aiOn).toBe(true);
  });

  it("stays off when the model is not ready", async () => {
    probeMock.mockResolvedValue({ reachable: true, modelReady: false, models: [] });
    render();
    await flush();
    expect(state.aiOn).toBe(false);
  });

  it("overlays polished prose on success", async () => {
    render();
    await flush();
    act(() => state.polish());
    await flush();
    expect(state.polished).toBe("I shipped ABC-1 yesterday.");
    expect(state.isPolishing).toBe(false);
    expect(polishMock).toHaveBeenCalledWith(recap, {
      provider: "ollama",
      endpoint: baseSettings.ollamaEndpoint,
      model: baseSettings.ollamaModel
    });
  });

  it("degrades silently when polish returns the input unchanged", async () => {
    polishMock.mockResolvedValue(recap);
    render();
    await flush();
    act(() => state.polish());
    await flush();
    expect(state.polished).toBeUndefined();
  });

  it("reset() discards the prose overlay", async () => {
    render();
    await flush();
    act(() => state.polish());
    await flush();
    expect(state.polished).toBeDefined();
    act(() => state.reset());
    await flush();
    expect(state.polished).toBeUndefined();
  });

  it("discards prose when the recap text changes (new day)", async () => {
    render();
    await flush();
    act(() => state.polish());
    await flush();
    expect(state.polished).toBeDefined();
    render({ recapText: "Yesterday (Thu Jun 18) — 1h tracked.\n\nTickets (1h):\n• ABC-2 Other — 1h" });
    await flush();
    expect(state.polished).toBeUndefined();
  });
});

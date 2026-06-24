// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, WeekOverride, WeekState } from "../../shared/types";
import { buildWeekState } from "../domain/week";
import { toLocalDateKey } from "../utils/date";
import {
  type WeekActionsStorage,
  useWeekActions
} from "./useWeekActions";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const settings: AppSettings = {
  jiraBaseUrl: "https://example.atlassian.net",
  jiraEmail: "person@example.com",
  jiraApiToken: "token",
  bitbucketEmail: "",
  bitbucketApiToken: "",
  bitbucketWorkspace: "",
  bitbucketRepositories: "",
  bitbucketReviewBucketIssueKey: "",
  weeklyTargetHours: 40,
  workingDays: [1, 2, 3, 4, 5],
  reminderTime: "16:30",
  remindersEnabled: true
};

const weekStart = new Date(2026, 5, 15);
const today = new Date(2026, 5, 17, 12);
const weekKey = toLocalDateKey(weekStart);

type WeekActionsApi = ReturnType<typeof useWeekActions>;

let container: HTMLDivElement;
let root: Root;
let api: WeekActionsApi | undefined;
let weekOverride: WeekOverride;
let currentWeekState: WeekState;
let saveWeekOverride: ReturnType<typeof vi.fn<WeekActionsStorage["saveWeekOverride"]>>;
let showSuccess: ReturnType<typeof vi.fn<(message: string) => void>>;

const buildWeek = (override: WeekOverride = weekOverride) =>
  buildWeekState(weekStart, settings, override, undefined, [], today, [], []);

interface HarnessProps {
  isDemo?: boolean;
  initialOverride?: WeekOverride;
}

function Harness({ isDemo = false, initialOverride = { weekKey, skippedDates: [] } }: HarnessProps) {
  const [override, setWeekOverride] = useState(initialOverride);
  weekOverride = override;
  currentWeekState = buildWeek(override);
  api = useWeekActions({
    weekState: currentWeekState,
    weekOverride: override,
    setWeekOverride,
    isDemo,
    showSuccess,
    storage: { saveWeekOverride }
  });
  return null;
}

const getApi = () => {
  if (!api) {
    throw new Error("Week actions hook was not rendered.");
  }
  return api;
};

const renderHarness = (props: HarnessProps = {}) => {
  act(() => {
    root.render(<Harness {...props} />);
  });
};

beforeEach(() => {
  api = undefined;
  weekOverride = { weekKey, skippedDates: [] };
  currentWeekState = buildWeek(weekOverride);
  saveWeekOverride = vi.fn(async () => undefined);
  showSuccess = vi.fn();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useWeekActions", () => {
  it("adds skipped dates in sorted order and persists the next override outside demo mode", async () => {
    renderHarness({ initialOverride: { weekKey, skippedDates: ["2026-06-18"] } });

    await act(async () => {
      await getApi().handleToggleSkipped("2026-06-16");
    });

    const expected = {
      weekKey,
      skippedDates: ["2026-06-16", "2026-06-18"]
    };
    expect(weekOverride).toEqual(expected);
    expect(saveWeekOverride).toHaveBeenCalledWith(expected);
  });

  it("removes skipped dates and persists the next override", async () => {
    renderHarness({ initialOverride: { weekKey, skippedDates: ["2026-06-16", "2026-06-18"] } });

    await act(async () => {
      await getApi().handleToggleSkipped("2026-06-16");
    });

    const expected = {
      weekKey,
      skippedDates: ["2026-06-18"]
    };
    expect(weekOverride).toEqual(expected);
    expect(saveWeekOverride).toHaveBeenCalledWith(expected);
  });

  it("updates skipped dates without persisting in demo mode", async () => {
    renderHarness({ isDemo: true });

    await act(async () => {
      await getApi().handleToggleSkipped("2026-06-17");
    });

    expect(weekOverride.skippedDates).toEqual(["2026-06-17"]);
    expect(saveWeekOverride).not.toHaveBeenCalled();
  });

  it("exports the visible week CSV and reports success", async () => {
    const createObjectURL = vi.fn((blob: Blob) => {
      expect(blob).toBeInstanceOf(Blob);
      return "blob:week-csv";
    });
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL
    });
    renderHarness();

    act(() => getApi().handleExportWeekCsv());

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("text/csv;charset=utf-8");
    await expect(blob.text()).resolves.toContain("Date,Weekday,Issue,Summary,Hours,Title");
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:week-csv");
    expect(document.querySelector('a[download="timebro-week-2026-06-15.csv"]')).toBeNull();
    expect(showSuccess).toHaveBeenCalledWith("Exported Jun 15 - 21, 2026 CSV.");
  });
});

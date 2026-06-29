import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings, ReminderSchedulePayload } from "../shared/types";

type NotificationListener = (...args: unknown[]) => void;

const electronMock = vi.hoisted(() => {
  const instances: MockNotification[] = [];
  const isSupported = vi.fn(() => true);

  class MockNotification {
    static isSupported = isSupported;

    listeners: Record<string, NotificationListener> = {};
    show = vi.fn();

    constructor(public options?: unknown) {
      instances.push(this);
    }

    once(event: string, listener: NotificationListener) {
      this.listeners[event] = listener;
      return this;
    }
  }

  return { MockNotification, instances, isSupported };
});

vi.mock("electron", () => ({
  Notification: electronMock.MockNotification
}));

import { cancelReminder, scheduleReminder } from "./reminders";

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
  aiEnabled: false,
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "llama3.1:8b",
};

const makePayload = (
  overrides: Partial<Omit<ReminderSchedulePayload, "settings">> & { settings?: Partial<AppSettings> } = {}
): ReminderSchedulePayload => {
  const { settings, ...payloadOverrides } = overrides;

  return {
    settings: {
      ...baseSettings,
      ...settings
    },
    weekKey: "2026-06-22",
    skippedDates: [],
    remainingWeekHours: 8,
    todayDateKey: "2026-06-22",
    ...payloadOverrides
  };
};

describe("reminder scheduling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 22, 16, 0));
    electronMock.instances.length = 0;
    electronMock.isSupported.mockReset();
    electronMock.isSupported.mockReturnValue(true);
  });

  afterEach(() => {
    cancelReminder();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("schedules and shows the next current-week reminder", () => {
    const fireAt = new Date(2026, 5, 22, 16, 30).toISOString();

    expect(scheduleReminder(makePayload())).toEqual({
      scheduled: true,
      fireAt,
      reason: "scheduled"
    });

    expect(electronMock.instances).toHaveLength(0);

    vi.advanceTimersByTime(30 * 60 * 1000);

    expect(electronMock.instances).toHaveLength(1);
    expect(electronMock.instances[0].options).toMatchObject({
      title: "Jira time tracking reminder",
      body: "You still have 8h missing this week."
    });
    expect(electronMock.instances[0].show).toHaveBeenCalledTimes(1);
  });

  it("does not clear an existing current-week timer when viewing another week", () => {
    const currentWeekResult = scheduleReminder(makePayload());

    const otherWeekResult = scheduleReminder(
      makePayload({
        weekKey: "2026-06-15",
        todayDateKey: "2026-06-22",
        remainingWeekHours: 0
      })
    );

    expect(otherWeekResult).toEqual({
      scheduled: true,
      fireAt: currentWeekResult.fireAt,
      reason: "non-current-week",
      message: "Reminder left unchanged because the visible week is not the current week."
    });

    vi.advanceTimersByTime(30 * 60 * 1000);

    expect(electronMock.instances).toHaveLength(1);
    expect(electronMock.instances[0].show).toHaveBeenCalledTimes(1);
  });

  it("clears the current timer when reminders are disabled", () => {
    scheduleReminder(makePayload());

    expect(
      scheduleReminder(
        makePayload({
          weekKey: "2026-06-15",
          settings: { remindersEnabled: false }
        })
      )
    ).toEqual({
      scheduled: false,
      reason: "disabled"
    });

    vi.advanceTimersByTime(30 * 60 * 1000);

    expect(electronMock.instances).toHaveLength(0);
  });

  it("does not schedule when desktop notifications are unsupported", () => {
    electronMock.isSupported.mockReturnValue(false);

    expect(scheduleReminder(makePayload())).toEqual({
      scheduled: false,
      reason: "unsupported",
      message: "Desktop notifications are not supported in this Electron environment."
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not carry stale reminders into the next week", () => {
    vi.setSystemTime(new Date(2026, 5, 26, 17, 0));

    expect(scheduleReminder(makePayload())).toEqual({
      scheduled: false,
      reason: "no-working-day"
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("schedules reminders on configured weekend working days", () => {
    vi.setSystemTime(new Date(2026, 5, 27, 16, 0));
    const fireAt = new Date(2026, 5, 27, 16, 30).toISOString();

    expect(
      scheduleReminder(
        makePayload({
          settings: { workingDays: [6, 7] },
          todayDateKey: "2026-06-27"
        })
      )
    ).toEqual({
      scheduled: true,
      fireAt,
      reason: "scheduled"
    });
  });
});

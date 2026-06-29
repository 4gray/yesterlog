import { describe, expect, it } from "vitest";
import type { AppSettings } from "../../shared/types";
import { buildWeekState, DEFAULT_SETTINGS } from "../domain/week";
import { toLocalDateKey } from "../utils/date";
import {
  canOpenTrackingShortcut,
  createTrackingShortcutDate,
  selectAddTimeDate
} from "./addTimeModalState";

const weekStart = new Date(2026, 5, 15);
const currentDate = new Date(2026, 5, 17, 14, 37, 22, 456);

const buildWeek = (settingsOverrides: Partial<AppSettings> = {}, skippedDates: string[] = []) =>
  buildWeekState(
    weekStart,
    { ...DEFAULT_SETTINGS, ...settingsOverrides },
    { weekKey: toLocalDateKey(weekStart), skippedDates },
    undefined,
    [],
    currentDate,
    [],
    []
  );

const expectSelectedDate = (date: Date, dateKey: string) => {
  expect(toLocalDateKey(date)).toBe(dateKey);
  expect(date.getHours()).toBe(currentDate.getHours());
  expect(date.getMinutes()).toBe(currentDate.getMinutes());
  expect(date.getSeconds()).toBe(0);
  expect(date.getMilliseconds()).toBe(0);
};

describe("add time modal state helpers", () => {
  it("keeps a requested active working date and applies the current clock time", () => {
    const selectedDate = selectAddTimeDate({
      currentDate,
      requestedDate: new Date(2026, 5, 16, 9, 10),
      weekState: buildWeek()
    });

    expectSelectedDate(selectedDate, "2026-06-16");
  });

  it("uses the current date when no requested date is provided", () => {
    const selectedDate = selectAddTimeDate({
      currentDate,
      weekState: buildWeek()
    });

    expectSelectedDate(selectedDate, "2026-06-17");
  });

  it("falls back to the latest active day before a skipped requested date", () => {
    const selectedDate = selectAddTimeDate({
      currentDate,
      requestedDate: new Date(2026, 5, 18),
      weekState: buildWeek({}, ["2026-06-18"])
    });

    expectSelectedDate(selectedDate, "2026-06-17");
  });

  it("falls back to the latest active day before a non-working requested date", () => {
    const selectedDate = selectAddTimeDate({
      currentDate,
      requestedDate: new Date(2026, 5, 21),
      weekState: buildWeek()
    });

    expectSelectedDate(selectedDate, "2026-06-19");
  });

  it("falls back to the first active day when the requested date precedes the week", () => {
    const selectedDate = selectAddTimeDate({
      currentDate,
      requestedDate: new Date(2026, 5, 14),
      weekState: buildWeek()
    });

    expectSelectedDate(selectedDate, "2026-06-15");
  });

  it("uses the first visible week day when no active working dates exist", () => {
    const selectedDate = selectAddTimeDate({
      currentDate,
      requestedDate: new Date(2026, 5, 17),
      weekState: buildWeek({}, ["2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19"])
    });

    expectSelectedDate(selectedDate, "2026-06-15");
  });

  it("allows the tracking shortcut only while the app is configured and no modal is active", () => {
    expect(
      canOpenTrackingShortcut({
        isConfigured: true,
        welcomeConnected: false,
        isBooting: false,
        hasAddModal: false,
        hasEditingWorklog: false,
        hasEditingPersonalNote: false
      })
    ).toBe(true);
  });

  it.each([
    ["Jira is not configured", { isConfigured: false }],
    ["welcome is connected", { welcomeConnected: true }],
    ["bootstrap is running", { isBooting: true }],
    ["the add modal is open", { hasAddModal: true }],
    ["a worklog is being edited", { hasEditingWorklog: true }],
    ["a personal note is being edited", { hasEditingPersonalNote: true }]
  ])("blocks the tracking shortcut when %s", (_label, override) => {
    expect(
      canOpenTrackingShortcut({
        isConfigured: true,
        welcomeConnected: false,
        isBooting: false,
        hasAddModal: false,
        hasEditingWorklog: false,
        hasEditingPersonalNote: false,
        ...override
      })
    ).toBe(false);
  });

  it("rounds the tracking shortcut date to the minute without mutating the source date", () => {
    const selectedDate = createTrackingShortcutDate(currentDate);

    expect(selectedDate).not.toBe(currentDate);
    expect(selectedDate.getTime()).toBe(new Date(2026, 5, 17, 14, 37, 0, 0).getTime());
    expect(currentDate.getSeconds()).toBe(22);
    expect(currentDate.getMilliseconds()).toBe(456);
  });
});

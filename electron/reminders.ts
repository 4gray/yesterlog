import { Notification } from "electron";
import type { ReminderSchedulePayload, ReminderScheduleResult, WeekdayNumber } from "../shared/types";

let reminderTimer: NodeJS.Timeout | undefined;
let reminderFireAt: Date | undefined;
const activeNotifications = new Set<Notification>();

const minutesFromTime = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return (Number.isFinite(hours) ? hours : 16) * 60 + (Number.isFinite(minutes) ? minutes : 30);
};

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isoWeekday = (date: Date): WeekdayNumber | 6 | 7 => {
  const day = date.getDay();
  return (day === 0 ? 7 : day) as WeekdayNumber | 6 | 7;
};

const weekKeyForDate = (date: Date) => {
  const weekStart = new Date(date);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - (isoWeekday(weekStart) - 1));
  return toDateKey(weekStart);
};

const formatMissing = (hours: number) => {
  const totalMinutes = Math.max(Math.round(hours * 60), 0);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${wholeHours}h` : `${wholeHours}h ${String(minutes).padStart(2, "0")}m`;
};

const notificationsSupported = () => {
  try {
    return Notification.isSupported();
  } catch {
    return false;
  }
};

const clearReminderTimer = () => {
  if (reminderTimer) {
    clearTimeout(reminderTimer);
    reminderTimer = undefined;
  }

  reminderFireAt = undefined;
};

const describeNotificationFailure = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return message || "Unknown notification error.";
};

const showReminderNotification = (payload: ReminderSchedulePayload) => {
  if (!notificationsSupported()) {
    console.warn("TimeBro reminder notification skipped because desktop notifications are not supported.");
    return;
  }

  try {
    const notification = new Notification({
      title: "Jira time tracking reminder",
      body: `You still have ${formatMissing(payload.remainingWeekHours)} missing this week.`
    });

    activeNotifications.add(notification);

    const cleanupTimer = setTimeout(() => {
      activeNotifications.delete(notification);
    }, 5 * 60 * 1000);
    cleanupTimer.unref?.();

    const cleanup = () => {
      clearTimeout(cleanupTimer);
      activeNotifications.delete(notification);
    };

    notification.once("close", cleanup);
    notification.once("failed", (_event, error) => {
      console.warn(
        `TimeBro reminder notification failed: ${error}. On macOS, Electron native notifications require a signed app and system notification permission.`
      );
      cleanup();
    });
    notification.show();
  } catch (error) {
    console.warn(`TimeBro reminder notification failed: ${describeNotificationFailure(error)}`);
  }
};

const nextReminderDate = (payload: ReminderSchedulePayload, now = new Date()) => {
  const reminderMinutes = minutesFromTime(payload.settings.reminderTime);

  for (let offset = 0; offset < 8; offset += 1) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    candidate.setHours(Math.floor(reminderMinutes / 60), reminderMinutes % 60, 0, 0);
    if (weekKeyForDate(candidate) !== payload.weekKey) {
      continue;
    }

    const weekday = isoWeekday(candidate);
    const dateKey = toDateKey(candidate);
    const isWorking = weekday <= 5 && payload.settings.workingDays.includes(weekday as WeekdayNumber);
    const isSkipped = payload.skippedDates.includes(dateKey);

    if (isWorking && !isSkipped && candidate > now) {
      return candidate;
    }
  }

  return null;
};

export const cancelReminder = () => {
  clearReminderTimer();
};

export const scheduleReminder = (payload: ReminderSchedulePayload): ReminderScheduleResult => {
  if (!payload.settings.remindersEnabled) {
    clearReminderTimer();
    return { scheduled: false, reason: "disabled" };
  }

  const now = new Date();

  if (payload.weekKey !== weekKeyForDate(now)) {
    return {
      scheduled: Boolean(reminderTimer && reminderFireAt && reminderFireAt > now),
      fireAt: reminderFireAt?.toISOString(),
      reason: "non-current-week",
      message: "Reminder left unchanged because the visible week is not the current week."
    };
  }

  clearReminderTimer();

  if (payload.remainingWeekHours <= 0) {
    return { scheduled: false, reason: "complete" };
  }

  if (!notificationsSupported()) {
    return {
      scheduled: false,
      reason: "unsupported",
      message: "Desktop notifications are not supported in this Electron environment."
    };
  }

  const fireAt = nextReminderDate(payload, now);

  if (!fireAt) {
    return { scheduled: false, reason: "no-working-day" };
  }

  reminderTimer = setTimeout(() => {
    reminderTimer = undefined;
    reminderFireAt = undefined;
    showReminderNotification(payload);
    scheduleReminder(payload);
  }, fireAt.getTime() - Date.now());
  reminderTimer.unref?.();
  reminderFireAt = fireAt;

  return { scheduled: true, fireAt: fireAt.toISOString(), reason: "scheduled" };
};

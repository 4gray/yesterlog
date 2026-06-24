import type { WeekState } from "../../shared/types";
import { fromLocalDateKey, toLocalDateKey } from "../utils/date";

type AddTimeWeekState = Pick<WeekState, "activeWorkingDates" | "days">;

interface SelectAddTimeDateOptions {
  currentDate: Date;
  requestedDate?: Date;
  weekState: AddTimeWeekState;
}

interface TrackingShortcutOptions {
  isConfigured: boolean;
  welcomeConnected: boolean;
  isBooting: boolean;
  hasAddModal: boolean;
  hasEditingWorklog: boolean;
  hasEditingPersonalNote: boolean;
}

export const selectAddTimeDate = ({ currentDate, requestedDate, weekState }: SelectAddTimeDateOptions) => {
  const preferredDateKey = requestedDate ? toLocalDateKey(requestedDate) : toLocalDateKey(currentDate);
  const fallbackDateKey =
    [...weekState.days]
      .reverse()
      .find((day) => day.isConfiguredWorkingDay && !day.isSkipped && day.dateKey <= preferredDateKey)?.dateKey ??
    weekState.activeWorkingDates[0] ??
    weekState.days[0]?.dateKey ??
    preferredDateKey;
  const selectedDateKey = weekState.activeWorkingDates.includes(preferredDateKey)
    ? preferredDateKey
    : fallbackDateKey;
  const selectedDate = fromLocalDateKey(selectedDateKey);

  selectedDate.setHours(currentDate.getHours(), currentDate.getMinutes(), 0, 0);
  return selectedDate;
};

export const canOpenTrackingShortcut = ({
  isConfigured,
  welcomeConnected,
  isBooting,
  hasAddModal,
  hasEditingWorklog,
  hasEditingPersonalNote
}: TrackingShortcutOptions) =>
  isConfigured && !welcomeConnected && !isBooting && !hasAddModal && !hasEditingWorklog && !hasEditingPersonalNote;

export const createTrackingShortcutDate = (currentDate: Date) => {
  const selectedDate = new Date(currentDate);
  selectedDate.setSeconds(0, 0);
  return selectedDate;
};

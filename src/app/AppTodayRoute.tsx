import type { ComponentProps } from "react";
import { TodayView } from "../components/TodayView";
import type { AddTimePrefill } from "../components/AddTimeModal";

type TodayViewProps = ComponentProps<typeof TodayView>;

export interface AppTodayRouteProps {
  currentDate: TodayViewProps["date"];
  ticketOptions: TodayViewProps["ticketOptions"];
  todayWorklogs: TodayViewProps["todayWorklogs"];
  todaySignals: TodayViewProps["detectedSignals"];
  todayPersonalNotes: TodayViewProps["personalNotes"];
  todayRecurringEntries: TodayViewProps["recurringEntries"];
  todayPendingRecurring: TodayViewProps["pendingRecurring"];
  todayTrackedHours: TodayViewProps["todayTrackedHours"];
  dailyTargetHours: TodayViewProps["dailyTargetHours"];
  touchedNotLogged: TodayViewProps["touchedNotLogged"];
  recapDaySummary: TodayViewProps["recapDaySummary"];
  settings: TodayViewProps["settings"];
  reminderTime: TodayViewProps["reminderTime"];
  remindersEnabled: TodayViewProps["remindersEnabled"];
  handleMoveWorklog: TodayViewProps["onMoveWorklog"];
  handleConfirmRecurring: TodayViewProps["onConfirmRecurring"];
  handleSkipRecurring: TodayViewProps["onSkipRecurring"];
  openAddTime: (date?: Date, prefill?: AddTimePrefill) => void;
  openEditWorklog: TodayViewProps["onEditWorklog"];
  openEditPersonalNote: TodayViewProps["onEditPersonalNote"];
}

export const AppTodayRoute = ({
  currentDate,
  ticketOptions,
  todayWorklogs,
  todaySignals,
  todayPersonalNotes,
  todayRecurringEntries,
  todayPendingRecurring,
  todayTrackedHours,
  dailyTargetHours,
  touchedNotLogged,
  recapDaySummary,
  settings,
  reminderTime,
  remindersEnabled,
  handleMoveWorklog,
  handleConfirmRecurring,
  handleSkipRecurring,
  openAddTime,
  openEditWorklog,
  openEditPersonalNote
}: AppTodayRouteProps) => (
  <TodayView
    date={currentDate}
    ticketOptions={ticketOptions}
    todayWorklogs={todayWorklogs}
    detectedSignals={todaySignals}
    personalNotes={todayPersonalNotes}
    recurringEntries={todayRecurringEntries}
    pendingRecurring={todayPendingRecurring}
    todayTrackedHours={todayTrackedHours}
    dailyTargetHours={dailyTargetHours}
    touchedNotLogged={touchedNotLogged}
    recapDaySummary={recapDaySummary}
    settings={settings}
    reminderTime={reminderTime}
    remindersEnabled={remindersEnabled}
    onCreateAt={(prefill) => openAddTime(currentDate, prefill)}
    onMoveWorklog={handleMoveWorklog}
    onConfirmRecurring={handleConfirmRecurring}
    onSkipRecurring={handleSkipRecurring}
    onEditWorklog={openEditWorklog}
    onEditPersonalNote={openEditPersonalNote}
  />
);

import type { ComponentProps } from "react";
import { WeekView } from "../components/WeekView";

type WeekViewProps = ComponentProps<typeof WeekView>;

export interface AppWeekRouteProps {
  weekState: WeekViewProps["weekState"];
  syncResult: WeekViewProps["syncResult"];
  currentDate: WeekViewProps["currentDate"];
  timelineFocusTime?: WeekViewProps["timelineFocusTime"];
  timelineCenterOnNow?: WeekViewProps["timelineCenterOnNow"];
  isSyncing: WeekViewProps["isSyncing"];
  isSyncingReviews: WeekViewProps["isSyncing"];
  isConfigured: WeekViewProps["isConfigured"];
  syncState: WeekViewProps["syncState"];
  viewMode: WeekViewProps["viewMode"];
  onViewModeChange: WeekViewProps["onViewModeChange"];
  onOpenCommandPalette: WeekViewProps["onOpenCommandPalette"];
  dockTickets: WeekViewProps["dockTickets"];
  activeTicketCount: WeekViewProps["activeTicketCount"];
  isLogging: WeekViewProps["isLogging"];
  handleSync: WeekViewProps["onSync"];
  goToPreviousWeek: WeekViewProps["onPreviousWeek"];
  goToCurrentWeek: WeekViewProps["onCurrentWeek"];
  goToNextWeek: WeekViewProps["onNextWeek"];
  openAddTime: WeekViewProps["onAddTime"];
  handleMoveWorklog: WeekViewProps["onMoveWorklog"];
  handleMoveRecurring: WeekViewProps["onMoveRecurring"];
  handleResizePersonalNote?: WeekViewProps["onResizePersonalNote"];
  openEditWorklog: WeekViewProps["onEditWorklog"];
  openEditPersonalNote: WeekViewProps["onEditPersonalNote"];
  handleToggleSkipped: WeekViewProps["onToggleSkipped"];
  handleAddWorklog: NonNullable<WeekViewProps["onDockLog"]>;
  handleAddWorklogs?: WeekViewProps["onDockLogMany"];
  bookRequest?: WeekViewProps["bookRequest"];
  handleConfirmRecurring: WeekViewProps["onConfirmRecurring"];
  handleSkipRecurring: WeekViewProps["onSkipRecurring"];
  handleDeleteRecurringOccurrence: WeekViewProps["onDeleteRecurring"];
  savedRecaps?: WeekViewProps["savedRecaps"];
  onOpenRecap?: WeekViewProps["onOpenRecap"];
  onOpenSavedRecap?: WeekViewProps["onOpenSavedRecap"];
}

export const AppWeekRoute = ({
  weekState,
  syncResult,
  currentDate,
  timelineFocusTime,
  timelineCenterOnNow,
  isSyncing,
  isSyncingReviews,
  isConfigured,
  syncState,
  viewMode,
  onViewModeChange,
  onOpenCommandPalette,
  dockTickets,
  activeTicketCount,
  isLogging,
  handleSync,
  goToPreviousWeek,
  goToCurrentWeek,
  goToNextWeek,
  openAddTime,
  handleMoveWorklog,
  handleMoveRecurring,
  handleResizePersonalNote,
  openEditWorklog,
  openEditPersonalNote,
  handleToggleSkipped,
  handleAddWorklog,
  handleAddWorklogs,
  bookRequest,
  handleConfirmRecurring,
  handleSkipRecurring,
  handleDeleteRecurringOccurrence,
  savedRecaps,
  onOpenRecap,
  onOpenSavedRecap
}: AppWeekRouteProps) => (
  <WeekView
    weekState={weekState}
    syncResult={syncResult}
    currentDate={currentDate}
    timelineFocusTime={timelineFocusTime}
    timelineCenterOnNow={timelineCenterOnNow}
    isSyncing={isSyncing || isSyncingReviews}
    isConfigured={isConfigured}
    syncState={syncState}
    viewMode={viewMode}
    onViewModeChange={onViewModeChange}
    onOpenCommandPalette={onOpenCommandPalette}
    dockTickets={dockTickets}
    activeTicketCount={activeTicketCount}
    isLogging={isLogging}
    onSync={handleSync}
    onPreviousWeek={goToPreviousWeek}
    onCurrentWeek={goToCurrentWeek}
    onNextWeek={goToNextWeek}
    onAddTime={openAddTime}
    onMoveWorklog={handleMoveWorklog}
    onMoveRecurring={handleMoveRecurring}
    onResizePersonalNote={handleResizePersonalNote}
    onEditWorklog={openEditWorklog}
    onEditPersonalNote={openEditPersonalNote}
    onToggleSkipped={handleToggleSkipped}
    onDockLog={handleAddWorklog}
    onDockLogMany={handleAddWorklogs}
    bookRequest={bookRequest}
    onConfirmRecurring={handleConfirmRecurring}
    onSkipRecurring={handleSkipRecurring}
    onDeleteRecurring={handleDeleteRecurringOccurrence}
    savedRecaps={savedRecaps}
    onOpenRecap={onOpenRecap}
    onOpenSavedRecap={onOpenSavedRecap}
  />
);

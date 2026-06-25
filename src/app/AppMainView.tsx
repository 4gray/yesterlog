import type { ComponentProps } from "react";
import { LoadingView } from "../components/LoadingView";
import { MonthView } from "../components/MonthView";
import { ReportsView } from "../components/ReportsView";
import { ReviewView } from "../components/ReviewView";
import type { AppView } from "../components/Sidebar";
import { TicketsView } from "../components/TicketsView";
import { TodayView } from "../components/TodayView";
import { WeekView } from "../components/WeekView";
import { AppSettingsRoute } from "./AppSettingsRoute";

type TodayViewProps = ComponentProps<typeof TodayView>;
type WeekViewProps = ComponentProps<typeof WeekView>;
type MonthViewProps = ComponentProps<typeof MonthView>;
type ReviewViewProps = ComponentProps<typeof ReviewView>;
type TicketsViewProps = ComponentProps<typeof TicketsView>;
type ReportsViewProps = ComponentProps<typeof ReportsView>;
type AppSettingsRouteProps = ComponentProps<typeof AppSettingsRoute>;

export interface AppMainViewProps {
  view: AppView;
  isBooting: boolean;
  currentDate: TodayViewProps["date"];
  selectedTicket: TodayViewProps["selectedTicket"];
  ticketOptions: TodayViewProps["ticketOptions"];
  todayWorklogs: TodayViewProps["todayWorklogs"];
  todayPersonalNotes: TodayViewProps["personalNotes"];
  issueUrlsByKey: TodayViewProps["issueUrlsByKey"];
  issueTypesByKey: ReviewViewProps["issueTypesByKey"];
  todayTrackedHours: TodayViewProps["todayTrackedHours"];
  touchedNotLogged: TodayViewProps["touchedNotLogged"];
  settings: ReviewViewProps["settings"];
  settingsDraft: AppSettingsRouteProps["settingsDraft"];
  weekState: WeekViewProps["weekState"];
  syncResult: WeekViewProps["syncResult"];
  monthState: MonthViewProps["monthState"] | undefined;
  visibleBitbucketReviewResult: ReviewViewProps["result"];
  tickets: { inProgress: TicketsViewProps["inProgress"]; recentlyClosed: TicketsViewProps["recentlyClosed"] } | undefined;
  favoriteKeys: TicketsViewProps["favoriteKeys"];
  hoursByKey: TicketsViewProps["hoursByKey"];
  dockTickets: WeekViewProps["dockTickets"];
  activeTicketCount: WeekViewProps["activeTicketCount"];
  reviewTargetMode: ReviewViewProps["targetMode"];
  isConfigured: TodayViewProps["isConfigured"];
  isBitbucketReady: ReviewViewProps["isConfigured"];
  isSyncing: WeekViewProps["isSyncing"];
  isSyncingReviews: ReviewViewProps["isSyncing"];
  isLogging: TodayViewProps["isLogging"];
  isLoggingReview: ReviewViewProps["isLogging"];
  ticketsLoading: TicketsViewProps["isLoading"];
  ticketsError: TicketsViewProps["error"];
  isTesting: AppSettingsRouteProps["isTesting"];
  isTestingBitbucket: AppSettingsRouteProps["isTestingBitbucket"];
  effectiveTheme: AppSettingsRouteProps["effectiveTheme"];
  updateInfo: AppSettingsRouteProps["updateInfo"];
  isCheckingUpdates: AppSettingsRouteProps["isCheckingUpdates"];
  recurringEvents: AppSettingsRouteProps["recurringEvents"];
  isImportingPersonalNotes: AppSettingsRouteProps["isImportingPersonalNotes"];
  handleAddWorklog: TodayViewProps["onLog"] & NonNullable<WeekViewProps["onDockLog"]>;
  handleAddPersonalNote: TodayViewProps["onAddPersonalNote"];
  handleSync: WeekViewProps["onSync"];
  goToPreviousWeek: WeekViewProps["onPreviousWeek"];
  goToCurrentWeek: WeekViewProps["onCurrentWeek"];
  goToNextWeek: WeekViewProps["onNextWeek"];
  goToPreviousMonth: MonthViewProps["onPreviousMonth"];
  goToCurrentMonth: MonthViewProps["onCurrentMonth"];
  goToNextMonth: MonthViewProps["onNextMonth"];
  openWeekFromMonth: MonthViewProps["onSelectWeek"];
  handleReviewSync: ReviewViewProps["onSync"];
  handleLogReviewSessions: ReviewViewProps["onLogSessions"];
  setReviewTargetMode: ReviewViewProps["onTargetModeChange"];
  toggleFavorite: TicketsViewProps["onToggleFavorite"];
  handleLogTicket: TicketsViewProps["onLog"];
  setSettingsDraft: AppSettingsRouteProps["setSettingsDraft"];
  handleSaveSettings: AppSettingsRouteProps["handleSaveSettings"];
  handleTestConnection: AppSettingsRouteProps["handleTestConnection"];
  handleTestBitbucketConnection: AppSettingsRouteProps["handleTestBitbucketConnection"];
  selectTheme: AppSettingsRouteProps["selectTheme"];
  checkForUpdatesFromSettings: AppSettingsRouteProps["checkForUpdatesFromSettings"];
  openCurrentReleaseNotes: AppSettingsRouteProps["openCurrentReleaseNotes"];
  openCurrentUpdateDownload: AppSettingsRouteProps["openCurrentUpdateDownload"];
  openReleasePage: AppSettingsRouteProps["openReleasePage"];
  handleExportWeekCsv: AppSettingsRouteProps["handleExportWeekCsv"];
  handleImportPersonalNotes: AppSettingsRouteProps["handleImportPersonalNotes"];
  handleSaveRecurringEvent: AppSettingsRouteProps["handleSaveRecurringEvent"];
  handleDeleteRecurringEvent: AppSettingsRouteProps["handleDeleteRecurringEvent"];
  handleToggleRecurringEvent: AppSettingsRouteProps["handleToggleRecurringEvent"];
  setSelectedTicket: TodayViewProps["onSelectTicket"];
  searchTickets: TodayViewProps["onSearchTickets"];
  openAddTime: WeekViewProps["onAddTime"];
  openEditWorklog: TodayViewProps["onEditWorklog"];
  openEditPersonalNote: TodayViewProps["onEditPersonalNote"];
  handleToggleSkipped: WeekViewProps["onToggleSkipped"];
  handleConfirmRecurring: WeekViewProps["onConfirmRecurring"];
  handleSkipRecurring: WeekViewProps["onSkipRecurring"];
  handleDeleteRecurringOccurrence: WeekViewProps["onDeleteRecurring"];
}

export const AppMainView = ({
  view,
  isBooting,
  currentDate,
  selectedTicket,
  ticketOptions,
  todayWorklogs,
  todayPersonalNotes,
  issueUrlsByKey,
  issueTypesByKey,
  todayTrackedHours,
  touchedNotLogged,
  settings,
  settingsDraft,
  weekState,
  syncResult,
  monthState,
  visibleBitbucketReviewResult,
  tickets,
  favoriteKeys,
  hoursByKey,
  dockTickets,
  activeTicketCount,
  reviewTargetMode,
  isConfigured,
  isBitbucketReady,
  isSyncing,
  isSyncingReviews,
  isLogging,
  isLoggingReview,
  ticketsLoading,
  ticketsError,
  isTesting,
  isTestingBitbucket,
  effectiveTheme,
  updateInfo,
  isCheckingUpdates,
  recurringEvents,
  isImportingPersonalNotes,
  handleAddWorklog,
  handleAddPersonalNote,
  handleSync,
  goToPreviousWeek,
  goToCurrentWeek,
  goToNextWeek,
  goToPreviousMonth,
  goToCurrentMonth,
  goToNextMonth,
  openWeekFromMonth,
  handleReviewSync,
  handleLogReviewSessions,
  setReviewTargetMode,
  toggleFavorite,
  handleLogTicket,
  setSettingsDraft,
  handleSaveSettings,
  handleTestConnection,
  handleTestBitbucketConnection,
  selectTheme,
  checkForUpdatesFromSettings,
  openCurrentReleaseNotes,
  openCurrentUpdateDownload,
  openReleasePage,
  handleExportWeekCsv,
  handleImportPersonalNotes,
  handleSaveRecurringEvent,
  handleDeleteRecurringEvent,
  handleToggleRecurringEvent,
  setSelectedTicket,
  searchTickets,
  openAddTime,
  openEditWorklog,
  openEditPersonalNote,
  handleToggleSkipped,
  handleConfirmRecurring,
  handleSkipRecurring,
  handleDeleteRecurringOccurrence
}: AppMainViewProps) => {
  let content;

  if (isBooting) {
    content = <LoadingView />;
  } else if (view === "today") {
    content = (
      <TodayView
        date={currentDate}
        selectedTicket={selectedTicket}
        ticketOptions={ticketOptions}
        todayWorklogs={todayWorklogs}
        personalNotes={todayPersonalNotes}
        issueUrlsByKey={issueUrlsByKey}
        issueTypesByKey={issueTypesByKey}
        todayTrackedHours={todayTrackedHours}
        dailyTargetHours={weekState.dailyTargetHours}
        touchedNotLogged={touchedNotLogged}
        reminderTime={settings.reminderTime}
        remindersEnabled={settings.remindersEnabled}
        isConfigured={isConfigured}
        isLogging={isLogging}
        onLog={handleAddWorklog}
        onAddPersonalNote={handleAddPersonalNote}
        onEditWorklog={openEditWorklog}
        onEditPersonalNote={openEditPersonalNote}
        onSelectTicket={setSelectedTicket}
        onSearchTickets={searchTickets}
      />
    );
  } else if (view === "week") {
    content = (
      <WeekView
        weekState={weekState}
        syncResult={syncResult}
        currentDate={currentDate}
        isSyncing={isSyncing || isSyncingReviews}
        isConfigured={isConfigured}
        dockTickets={dockTickets}
        activeTicketCount={activeTicketCount}
        isLogging={isLogging}
        onSync={handleSync}
        onPreviousWeek={goToPreviousWeek}
        onCurrentWeek={goToCurrentWeek}
        onNextWeek={goToNextWeek}
        onAddTime={openAddTime}
        onEditWorklog={openEditWorklog}
        onEditPersonalNote={openEditPersonalNote}
        onToggleSkipped={handleToggleSkipped}
        onDockLog={handleAddWorklog}
        onConfirmRecurring={handleConfirmRecurring}
        onSkipRecurring={handleSkipRecurring}
        onDeleteRecurring={handleDeleteRecurringOccurrence}
      />
    );
  } else if (view === "month") {
    content = monthState ? (
      <MonthView
        monthState={monthState}
        onSelectWeek={openWeekFromMonth}
        onPreviousMonth={goToPreviousMonth}
        onCurrentMonth={goToCurrentMonth}
        onNextMonth={goToNextMonth}
      />
    ) : (
      <LoadingView />
    );
  } else if (view === "review") {
    content = (
      <ReviewView
        weekKey={weekState.weekKey}
        weekStartISO={weekState.weekStartISO}
        settings={settings}
        result={visibleBitbucketReviewResult}
        issueUrlsByKey={issueUrlsByKey}
        issueTypesByKey={issueTypesByKey}
        isConfigured={isBitbucketReady}
        isSyncing={isSyncingReviews}
        isLogging={isLoggingReview}
        targetMode={reviewTargetMode}
        onTargetModeChange={setReviewTargetMode}
        onSync={handleReviewSync}
        onLogSessions={handleLogReviewSessions}
        onPreviousWeek={goToPreviousWeek}
        onCurrentWeek={goToCurrentWeek}
        onNextWeek={goToNextWeek}
      />
    );
  } else if (view === "tickets") {
    content = (
      <TicketsView
        inProgress={tickets?.inProgress ?? []}
        recentlyClosed={tickets?.recentlyClosed ?? []}
        favoriteKeys={favoriteKeys}
        hoursByKey={hoursByKey}
        weekHoursLogged={weekState.trackedWeekHours}
        isConfigured={isConfigured}
        isLoading={ticketsLoading}
        error={ticketsError}
        onToggleFavorite={toggleFavorite}
        onLog={handleLogTicket}
      />
    );
  } else if (view === "reports") {
    content = (
      <ReportsView
        weekState={weekState}
        onPreviousWeek={goToPreviousWeek}
        onCurrentWeek={goToCurrentWeek}
        onNextWeek={goToNextWeek}
      />
    );
  } else {
    content = (
      <AppSettingsRoute
        settingsDraft={settingsDraft}
        setSettingsDraft={setSettingsDraft}
        handleSaveSettings={handleSaveSettings}
        handleTestConnection={handleTestConnection}
        handleTestBitbucketConnection={handleTestBitbucketConnection}
        isTesting={isTesting}
        isTestingBitbucket={isTestingBitbucket}
        effectiveTheme={effectiveTheme}
        selectTheme={selectTheme}
        updateInfo={updateInfo}
        isCheckingUpdates={isCheckingUpdates}
        checkForUpdatesFromSettings={checkForUpdatesFromSettings}
        openCurrentReleaseNotes={openCurrentReleaseNotes}
        openCurrentUpdateDownload={openCurrentUpdateDownload}
        openReleasePage={openReleasePage}
        weekRangeLabel={weekState.weekRangeLabel}
        handleExportWeekCsv={handleExportWeekCsv}
        handleImportPersonalNotes={handleImportPersonalNotes}
        isImportingPersonalNotes={isImportingPersonalNotes}
        recurringEvents={recurringEvents}
        handleSaveRecurringEvent={handleSaveRecurringEvent}
        handleDeleteRecurringEvent={handleDeleteRecurringEvent}
        handleToggleRecurringEvent={handleToggleRecurringEvent}
      />
    );
  }

  return <main className="main-area">{content}</main>;
};

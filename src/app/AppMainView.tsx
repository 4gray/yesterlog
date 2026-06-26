import type { ComponentProps } from "react";
import { LoadingView } from "../components/LoadingView";
import type { AppView } from "../components/Sidebar";
import { AppMonthRoute } from "./AppMonthRoute";
import { AppReconRoute } from "./AppReconRoute";
import { AppReportsRoute } from "./AppReportsRoute";
import { AppReviewRoute } from "./AppReviewRoute";
import { AppSettingsRoute } from "./AppSettingsRoute";
import { AppTicketsRoute } from "./AppTicketsRoute";
import { AppTodayRoute } from "./AppTodayRoute";
import { AppWeekRoute } from "./AppWeekRoute";

type AppMonthRouteProps = ComponentProps<typeof AppMonthRoute>;
type AppReviewRouteProps = ComponentProps<typeof AppReviewRoute>;
type AppSettingsRouteProps = ComponentProps<typeof AppSettingsRoute>;
type AppTicketsRouteProps = ComponentProps<typeof AppTicketsRoute>;
type AppTodayRouteProps = ComponentProps<typeof AppTodayRoute>;
type AppWeekRouteProps = ComponentProps<typeof AppWeekRoute>;

export interface AppMainViewProps {
  view: AppView;
  isBooting: boolean;
  currentDate: AppTodayRouteProps["currentDate"];
  selectedTicket: AppTodayRouteProps["selectedTicket"];
  ticketOptions: AppTodayRouteProps["ticketOptions"];
  todayWorklogs: AppTodayRouteProps["todayWorklogs"];
  todayPersonalNotes: AppTodayRouteProps["todayPersonalNotes"];
  issueUrlsByKey: AppTodayRouteProps["issueUrlsByKey"];
  issueTypesByKey: AppReviewRouteProps["issueTypesByKey"];
  todayTrackedHours: AppTodayRouteProps["todayTrackedHours"];
  touchedNotLogged: AppTodayRouteProps["touchedNotLogged"];
  settings: AppReviewRouteProps["settings"];
  settingsDraft: AppSettingsRouteProps["settingsDraft"];
  weekState: AppWeekRouteProps["weekState"];
  syncResult: AppWeekRouteProps["syncResult"];
  monthState: AppMonthRouteProps["monthState"];
  visibleBitbucketReviewResult: AppReviewRouteProps["visibleBitbucketReviewResult"];
  tickets: AppTicketsRouteProps["tickets"];
  favoriteKeys: AppTicketsRouteProps["favoriteKeys"];
  hoursByKey: AppTicketsRouteProps["hoursByKey"];
  dockTickets: AppWeekRouteProps["dockTickets"];
  activeTicketCount: AppWeekRouteProps["activeTicketCount"];
  reviewTargetMode: AppReviewRouteProps["reviewTargetMode"];
  isConfigured: AppTodayRouteProps["isConfigured"];
  isBitbucketReady: AppReviewRouteProps["isBitbucketReady"];
  isSyncing: AppWeekRouteProps["isSyncing"];
  isSyncingReviews: AppReviewRouteProps["isSyncingReviews"];
  isLogging: AppTodayRouteProps["isLogging"];
  isLoggingReview: AppReviewRouteProps["isLoggingReview"];
  ticketsLoading: AppTicketsRouteProps["ticketsLoading"];
  ticketsError: AppTicketsRouteProps["ticketsError"];
  isTesting: AppSettingsRouteProps["isTesting"];
  isTestingBitbucket: AppSettingsRouteProps["isTestingBitbucket"];
  effectiveTheme: AppSettingsRouteProps["effectiveTheme"];
  updateInfo: AppSettingsRouteProps["updateInfo"];
  isCheckingUpdates: AppSettingsRouteProps["isCheckingUpdates"];
  recurringEvents: AppSettingsRouteProps["recurringEvents"];
  isImportingPersonalNotes: AppSettingsRouteProps["isImportingPersonalNotes"];
  handleAddWorklog: AppTodayRouteProps["handleAddWorklog"] & AppWeekRouteProps["handleAddWorklog"];
  handleAddPersonalNote: AppTodayRouteProps["handleAddPersonalNote"];
  handleSync: AppWeekRouteProps["handleSync"];
  goToPreviousWeek: AppWeekRouteProps["goToPreviousWeek"];
  goToCurrentWeek: AppWeekRouteProps["goToCurrentWeek"];
  goToNextWeek: AppWeekRouteProps["goToNextWeek"];
  goToPreviousMonth: AppMonthRouteProps["goToPreviousMonth"];
  goToCurrentMonth: AppMonthRouteProps["goToCurrentMonth"];
  goToNextMonth: AppMonthRouteProps["goToNextMonth"];
  openWeekFromMonth: AppMonthRouteProps["openWeekFromMonth"];
  handleReviewSync: AppReviewRouteProps["handleReviewSync"];
  handleLogReviewSessions: AppReviewRouteProps["handleLogReviewSessions"];
  setReviewTargetMode: AppReviewRouteProps["setReviewTargetMode"];
  toggleFavorite: AppTicketsRouteProps["toggleFavorite"];
  handleLogTicket: AppTicketsRouteProps["handleLogTicket"];
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
  setSelectedTicket: AppTodayRouteProps["setSelectedTicket"];
  searchTickets: AppTodayRouteProps["searchTickets"];
  openAddTime: AppWeekRouteProps["openAddTime"];
  openEditWorklog: AppTodayRouteProps["openEditWorklog"] & AppWeekRouteProps["openEditWorklog"];
  openEditPersonalNote: AppTodayRouteProps["openEditPersonalNote"] & AppWeekRouteProps["openEditPersonalNote"];
  handleToggleSkipped: AppWeekRouteProps["handleToggleSkipped"];
  handleConfirmRecurring: AppWeekRouteProps["handleConfirmRecurring"];
  handleSkipRecurring: AppWeekRouteProps["handleSkipRecurring"];
  handleDeleteRecurringOccurrence: AppWeekRouteProps["handleDeleteRecurringOccurrence"];
  openSettings: () => void;
  settingsSection: AppSettingsRouteProps["initialSection"];
  syncState: "synced" | "stale" | "syncing";
  syncLabel: string;
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
  handleDeleteRecurringOccurrence,
  openSettings,
  settingsSection,
  syncState,
  syncLabel
}: AppMainViewProps) => {
  let content;

  if (isBooting) {
    content = <LoadingView />;
  } else if (view === "today") {
    content = (
      <AppTodayRoute
        currentDate={currentDate}
        selectedTicket={selectedTicket}
        ticketOptions={ticketOptions}
        todayWorklogs={todayWorklogs}
        todayPersonalNotes={todayPersonalNotes}
        issueUrlsByKey={issueUrlsByKey}
        issueTypesByKey={issueTypesByKey}
        todayTrackedHours={todayTrackedHours}
        dailyTargetHours={weekState.dailyTargetHours}
        touchedNotLogged={touchedNotLogged}
        reminderTime={settings.reminderTime}
        remindersEnabled={settings.remindersEnabled}
        isConfigured={isConfigured}
        isLogging={isLogging}
        handleAddWorklog={handleAddWorklog}
        handleAddPersonalNote={handleAddPersonalNote}
        openEditWorklog={openEditWorklog}
        openEditPersonalNote={openEditPersonalNote}
        setSelectedTicket={setSelectedTicket}
        searchTickets={searchTickets}
      />
    );
  } else if (view === "week") {
    content = (
      <AppWeekRoute
        weekState={weekState}
        syncResult={syncResult}
        currentDate={currentDate}
        isSyncing={isSyncing}
        isSyncingReviews={isSyncingReviews}
        isConfigured={isConfigured}
        dockTickets={dockTickets}
        activeTicketCount={activeTicketCount}
        isLogging={isLogging}
        handleSync={handleSync}
        goToPreviousWeek={goToPreviousWeek}
        goToCurrentWeek={goToCurrentWeek}
        goToNextWeek={goToNextWeek}
        openAddTime={openAddTime}
        openEditWorklog={openEditWorklog}
        openEditPersonalNote={openEditPersonalNote}
        handleToggleSkipped={handleToggleSkipped}
        handleAddWorklog={handleAddWorklog}
        handleConfirmRecurring={handleConfirmRecurring}
        handleSkipRecurring={handleSkipRecurring}
        handleDeleteRecurringOccurrence={handleDeleteRecurringOccurrence}
      />
    );
  } else if (view === "recon") {
    content = (
      <AppReconRoute
        currentDate={currentDate}
        settings={settings}
        syncResult={syncResult}
        reviewResult={visibleBitbucketReviewResult}
        dailyTargetHours={weekState.dailyTargetHours}
        syncState={syncState}
        syncLabel={syncLabel}
        onSync={handleSync}
        onOpenSettings={openSettings}
        onLogTime={openAddTime}
      />
    );
  } else if (view === "month") {
    content = (
      <AppMonthRoute
        monthState={monthState}
        openWeekFromMonth={openWeekFromMonth}
        goToPreviousMonth={goToPreviousMonth}
        goToCurrentMonth={goToCurrentMonth}
        goToNextMonth={goToNextMonth}
      />
    );
  } else if (view === "review") {
    content = (
      <AppReviewRoute
        weekKey={weekState.weekKey}
        weekStartISO={weekState.weekStartISO}
        settings={settings}
        visibleBitbucketReviewResult={visibleBitbucketReviewResult}
        issueUrlsByKey={issueUrlsByKey}
        issueTypesByKey={issueTypesByKey}
        isBitbucketReady={isBitbucketReady}
        isSyncingReviews={isSyncingReviews}
        isLoggingReview={isLoggingReview}
        reviewTargetMode={reviewTargetMode}
        setReviewTargetMode={setReviewTargetMode}
        handleReviewSync={handleReviewSync}
        handleLogReviewSessions={handleLogReviewSessions}
        goToPreviousWeek={goToPreviousWeek}
        goToCurrentWeek={goToCurrentWeek}
        goToNextWeek={goToNextWeek}
      />
    );
  } else if (view === "tickets") {
    content = (
      <AppTicketsRoute
        tickets={tickets}
        favoriteKeys={favoriteKeys}
        hoursByKey={hoursByKey}
        weekHoursLogged={weekState.trackedWeekHours}
        isConfigured={isConfigured}
        ticketsLoading={ticketsLoading}
        ticketsError={ticketsError}
        toggleFavorite={toggleFavorite}
        handleLogTicket={handleLogTicket}
      />
    );
  } else if (view === "reports") {
    content = (
      <AppReportsRoute
        weekState={weekState}
        goToPreviousWeek={goToPreviousWeek}
        goToCurrentWeek={goToCurrentWeek}
        goToNextWeek={goToNextWeek}
      />
    );
  } else {
    content = (
      <AppSettingsRoute
        initialSection={settingsSection}
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

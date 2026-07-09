import type { ComponentProps } from "react";
import type { WeekState } from "../../shared/types";
import { LoadingView } from "../components/LoadingView";
import type { AppView, ReportTab } from "../components/Sidebar";
import { TicketDetailsProvider, type OpenTicketDetails } from "../components/TicketDetailsContext";
import { AppMonthRoute } from "./AppMonthRoute";
import { AppReconRoute } from "./AppReconRoute";
import { AppReportsRoute } from "./AppReportsRoute";
import { AppReviewRoute } from "./AppReviewRoute";
import { AppSettingsRoute } from "./AppSettingsRoute";
import { AppTicketsRoute } from "./AppTicketsRoute";
import { AppTodayRoute } from "./AppTodayRoute";
import { AppWeekRoute } from "./AppWeekRoute";

type AppMonthRouteProps = ComponentProps<typeof AppMonthRoute>;
type AppReconRouteProps = ComponentProps<typeof AppReconRoute>;
type AppReviewRouteProps = ComponentProps<typeof AppReviewRoute>;
type AppSettingsRouteProps = ComponentProps<typeof AppSettingsRoute>;
type AppTicketsRouteProps = ComponentProps<typeof AppTicketsRoute>;
type AppTodayRouteProps = ComponentProps<typeof AppTodayRoute>;
type AppWeekRouteProps = ComponentProps<typeof AppWeekRoute>;

export interface AppMainViewProps {
  view: AppView;
  reportTab: ReportTab;
  isBooting: boolean;
  currentDate: AppTodayRouteProps["currentDate"];
  ticketOptions: AppTodayRouteProps["ticketOptions"];
  todayWorklogs: AppTodayRouteProps["todayWorklogs"];
  todaySignals: AppTodayRouteProps["todaySignals"];
  todayPersonalNotes: AppTodayRouteProps["todayPersonalNotes"];
  todayRecurringEntries: AppTodayRouteProps["todayRecurringEntries"];
  todayPendingRecurring: AppTodayRouteProps["todayPendingRecurring"];
  issueUrlsByKey: AppReviewRouteProps["issueUrlsByKey"];
  issueTypesByKey: AppReviewRouteProps["issueTypesByKey"];
  todayTrackedHours: AppTodayRouteProps["todayTrackedHours"];
  todayDailyTargetHours: AppTodayRouteProps["dailyTargetHours"];
  touchedNotLogged: AppTodayRouteProps["touchedNotLogged"];
  recapDaySummary: AppTodayRouteProps["recapDaySummary"];
  settings: AppReviewRouteProps["settings"];
  settingsDraft: AppSettingsRouteProps["settingsDraft"];
  isSettingsDirty: boolean;
  weekState: AppWeekRouteProps["weekState"];
  reportsWeekStates?: WeekState[];
  personalNotes: AppReconRouteProps["personalNotes"];
  syncResult: AppWeekRouteProps["syncResult"];
  jiraActivityResult: AppReconRouteProps["jiraActivityResult"];
  monthState: AppMonthRouteProps["monthState"];
  visibleBitbucketReviewResult: AppReviewRouteProps["visibleBitbucketReviewResult"];
  tickets: AppTicketsRouteProps["tickets"];
  favoriteKeys: AppTicketsRouteProps["favoriteKeys"];
  hoursByKey: AppTicketsRouteProps["hoursByKey"];
  dockTickets: AppWeekRouteProps["dockTickets"];
  activeTicketCount: AppWeekRouteProps["activeTicketCount"];
  reviewTargetMode: AppReviewRouteProps["reviewTargetMode"];
  isConfigured: AppWeekRouteProps["isConfigured"];
  isBitbucketReady: AppReviewRouteProps["isBitbucketReady"];
  isSyncing: AppWeekRouteProps["isSyncing"];
  isSyncingReviews: AppReviewRouteProps["isSyncingReviews"];
  isLogging: AppWeekRouteProps["isLogging"];
  isLoggingReview: AppReviewRouteProps["isLoggingReview"];
  ticketsLoading: AppTicketsRouteProps["ticketsLoading"];
  ticketsError: AppTicketsRouteProps["ticketsError"];
  isTesting: AppSettingsRouteProps["isTesting"];
  isTestingBitbucket: AppSettingsRouteProps["isTestingBitbucket"];
  effectiveTheme: AppSettingsRouteProps["effectiveTheme"];
  updateInfo: AppSettingsRouteProps["updateInfo"];
  isCheckingUpdates: AppSettingsRouteProps["isCheckingUpdates"];
  recurringEvents: AppSettingsRouteProps["recurringEvents"];
  recurringOccurrences: AppReconRouteProps["recurringOccurrences"];
  isImportingPersonalNotes: AppSettingsRouteProps["isImportingPersonalNotes"];
  handleAddWorklog: AppWeekRouteProps["handleAddWorklog"];
  handleMoveWorklog: AppTodayRouteProps["handleMoveWorklog"];
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
  downloadCurrentUpdate: AppSettingsRouteProps["downloadCurrentUpdate"];
  installDownloadedUpdate: AppSettingsRouteProps["installDownloadedUpdate"];
  openReleasePage: AppSettingsRouteProps["openReleasePage"];
  handleExportWeekCsv: AppSettingsRouteProps["handleExportWeekCsv"];
  handleImportPersonalNotes: AppSettingsRouteProps["handleImportPersonalNotes"];
  handleSaveRecurringEvent: AppSettingsRouteProps["handleSaveRecurringEvent"];
  handleDeleteRecurringEvent: AppSettingsRouteProps["handleDeleteRecurringEvent"];
  handleToggleRecurringEvent: AppSettingsRouteProps["handleToggleRecurringEvent"];
  openAddTime: AppReconRouteProps["onLogTime"];
  openEditWorklog: AppTodayRouteProps["openEditWorklog"] & AppWeekRouteProps["openEditWorklog"];
  openEditPersonalNote: AppTodayRouteProps["openEditPersonalNote"] & AppWeekRouteProps["openEditPersonalNote"];
  handleToggleSkipped: AppWeekRouteProps["handleToggleSkipped"];
  // Sourced from the Today route (non-optional): the app always supplies these handlers,
  // and both the Today and Week routes accept this stricter signature.
  handleConfirmRecurring: AppTodayRouteProps["handleConfirmRecurring"];
  handleSkipRecurring: AppTodayRouteProps["handleSkipRecurring"];
  handleDeleteRecurringOccurrence: AppWeekRouteProps["handleDeleteRecurringOccurrence"];
  openSettings: () => void;
  openTicketDetails: OpenTicketDetails;
  settingsSection: AppSettingsRouteProps["initialSection"];
  syncState: "synced" | "stale" | "syncing";
  syncLabel: string;
}

export const AppMainView = ({
  view,
  reportTab,
  isBooting,
  currentDate,
  ticketOptions,
  todayWorklogs,
  todaySignals,
  todayPersonalNotes,
  todayRecurringEntries,
  todayPendingRecurring,
  issueUrlsByKey,
  issueTypesByKey,
  todayTrackedHours,
  todayDailyTargetHours,
  touchedNotLogged,
  recapDaySummary,
  settings,
  settingsDraft,
  isSettingsDirty,
  weekState,
  reportsWeekStates,
  personalNotes,
  syncResult,
  jiraActivityResult,
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
  recurringOccurrences,
  isImportingPersonalNotes,
  handleAddWorklog,
  handleMoveWorklog,
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
  downloadCurrentUpdate,
  installDownloadedUpdate,
  openReleasePage,
  handleExportWeekCsv,
  handleImportPersonalNotes,
  handleSaveRecurringEvent,
  handleDeleteRecurringEvent,
  handleToggleRecurringEvent,
  openAddTime,
  openEditWorklog,
  openEditPersonalNote,
  handleToggleSkipped,
  handleConfirmRecurring,
  handleSkipRecurring,
  handleDeleteRecurringOccurrence,
  openSettings,
  openTicketDetails,
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
        ticketOptions={ticketOptions}
        todayWorklogs={todayWorklogs}
        todaySignals={todaySignals}
        todayPersonalNotes={todayPersonalNotes}
        todayRecurringEntries={todayRecurringEntries}
        todayPendingRecurring={todayPendingRecurring}
        todayTrackedHours={todayTrackedHours}
        dailyTargetHours={todayDailyTargetHours}
        touchedNotLogged={touchedNotLogged}
        recapDaySummary={recapDaySummary}
        settings={settings}
        reminderTime={settings.reminderTime}
        remindersEnabled={settings.remindersEnabled}
        handleMoveWorklog={handleMoveWorklog}
        handleConfirmRecurring={handleConfirmRecurring}
        handleSkipRecurring={handleSkipRecurring}
        openAddTime={openAddTime}
        openEditWorklog={openEditWorklog}
        openEditPersonalNote={openEditPersonalNote}
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
        jiraActivityResult={jiraActivityResult}
        reviewResult={visibleBitbucketReviewResult}
        localWeekKey={weekState.weekKey}
        personalNotes={personalNotes}
        recurringEvents={recurringEvents}
        recurringOccurrences={recurringOccurrences}
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
        reportTab={reportTab}
        weekState={weekState}
        weekStates={reportsWeekStates}
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
        isDirty={isSettingsDirty}
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
        downloadCurrentUpdate={downloadCurrentUpdate}
        installDownloadedUpdate={installDownloadedUpdate}
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

  return (
    <TicketDetailsProvider value={openTicketDetails}>
      <main className="main-area">{content}</main>
    </TicketDetailsProvider>
  );
};

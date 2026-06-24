import { useState } from "react";
import type {
  BitbucketReviewTargetMode,
  JiraWorklog,
  PersonalNote,
  SyncResult
} from "../shared/types";
import { AppMainView } from "./app/AppMainView";
import { AppOverlays } from "./app/AppOverlays";
import { AppWelcomeScreen } from "./app/AppWelcomeScreen";
import { isJiraConfigured } from "./app/appHelpers";
import { useAppCalendarState } from "./app/useAppCalendarState";
import { useAppRecurringState } from "./app/useAppRecurringState";
import { useAppSettingsState } from "./app/useAppSettingsState";
import { useAddTimeModalActions } from "./app/useAddTimeModalActions";
import { useAppLifecycleEffects } from "./app/useAppLifecycleEffects";
import { useAppNavigation } from "./app/useAppNavigation";
import { useBitbucketReviewLogging } from "./app/useBitbucketReviewLogging";
import { useBitbucketReviewSync } from "./app/useBitbucketReviewSync";
import { useDemoScenario } from "./app/useDemoScenario";
import { useIssueMetadata } from "./app/useIssueMetadata";
import { useJiraSync } from "./app/useJiraSync";
import { useJiraWorklogs } from "./app/useJiraWorklogs";
import { useMonthState } from "./app/useMonthState";
import { usePersonalNotes } from "./app/usePersonalNotes";
import { useRecurringActions } from "./app/useRecurringActions";
import { useReleaseUpdates } from "./app/useReleaseUpdates";
import { useSettingsActions } from "./app/useSettingsActions";
import { useSidebarState } from "./app/useSidebarState";
import { useSnackbars } from "./app/useSnackbars";
import { useSyncControls } from "./app/useSyncControls";
import { useThemeMode } from "./app/useThemeMode";
import { useTickets } from "./app/useTickets";
import { useWeekActions } from "./app/useWeekActions";
import { useWeekStorage } from "./app/useWeekStorage";
import { useWeekState } from "./app/useWeekState";
import { useWelcomeFlow } from "./app/useWelcomeFlow";
import { Sidebar, type AppView } from "./components/Sidebar";
import { isBitbucketConfigured } from "./domain/bitbucketReview";

// The version this build is running; baked from package.json at build time.
const APP_VERSION = import.meta.env.VITE_APP_VERSION || "unknown";

export const App = () => {
  const { currentDate, demoConfig, demoScenario, isDemo } = useDemoScenario();
  const [view, setView] = useState<AppView>(() => demoConfig?.view ?? "week");
  const { settings, setSettings, settingsDraft, setSettingsDraft } = useAppSettingsState({ demoScenario });
  const { weekStart, setWeekStart, monthAnchor, setMonthAnchor, weekOverride, setWeekOverride } = useAppCalendarState({
    currentDate,
    demoScenario
  });
  const [syncResult, setSyncResult] = useState<SyncResult | undefined>(() => demoScenario?.syncResult);
  const [personalNotes, setPersonalNotes] = useState<PersonalNote[]>([]);
  const { recurringEvents, setRecurringEvents, recurringOccurrences, setRecurringOccurrences } = useAppRecurringState({
    isDemo
  });
  const [isBooting, setIsBooting] = useState(() => !isDemo);
  const [reviewTargetMode, setReviewTargetMode] = useState<BitbucketReviewTargetMode>("reviewed-ticket");
  const { snackbars, dismissSnackbar, showSnackbar, showSuccess, showError, showInfo } = useSnackbars();
  const { sidebarCollapsed, toggleSidebarCollapsed } = useSidebarState();
  const [addModalDate, setAddModalDate] = useState<Date | undefined>();
  const [editingWorklog, setEditingWorklog] = useState<JiraWorklog | undefined>();
  const { effectiveTheme, selectTheme } = useThemeMode({
    initialTheme: demoConfig?.theme,
    persist: !isDemo
  });
  const {
    updateInfo,
    isCheckingUpdates,
    releaseNotesDialogInfo,
    openReleasePage,
    checkForUpdatesFromSettings,
    openCurrentReleaseNotes,
    closeReleaseNotes,
    openUpdateDownload,
    openCurrentUpdateDownload
  } = useReleaseUpdates({
    appVersion: APP_VERSION,
    isDemo,
    demoUpdateAvailable: demoConfig?.updateAvailable ?? false,
    showSnackbar,
    showSuccess,
    showError
  });
  const {
    tickets,
    ticketsLoading,
    ticketsError,
    favoriteKeys,
    setFavoriteKeys,
    selectedTicket,
    setSelectedTicket,
    ticketOptions,
    dockTickets,
    activeTicketCount,
    loadTickets,
    searchTickets,
    toggleFavorite
  } = useTickets({
    settings,
    isBooting,
    demoScenario
  });

  const weekState = useWeekState({
    weekStart,
    settings,
    weekOverride,
    syncResult,
    personalNotes,
    currentDate,
    recurringEvents,
    recurringOccurrences
  });

  const isConfigured = isJiraConfigured(settings);
  const isBitbucketReady = isBitbucketConfigured(settings);
  const welcomeFlow = useWelcomeFlow({ isDemo, isBooting, isConfigured, setView });
  const {
    goToPreviousWeek,
    goToCurrentWeek,
    goToNextWeek,
    goToPreviousMonth,
    goToCurrentMonth,
    goToNextMonth,
    openWeekFromMonth,
    handleViewChange,
    handleLogTicket
  } = useAppNavigation({
    currentDate,
    isBitbucketReady,
    view,
    setView,
    setWeekStart,
    setMonthAnchor,
    setSelectedTicket
  });
  const monthState = useMonthState({
    isMonthView: view === "month",
    isBooting,
    monthAnchor,
    currentDate,
    settings,
    visibleWeekState: weekState,
    recurringEvents,
    recurringOccurrences,
    demoWeekStart: demoScenario?.weekStart,
    demoWeekOverride: demoScenario?.weekOverride,
    demoSyncResult: demoScenario?.syncResult,
    onError: showError
  });

  const {
    bitbucketReviewResult,
    setBitbucketReviewResult,
    isSyncingReviews,
    runReviewSync,
    handleReviewSync
  } = useBitbucketReviewSync({
    settings,
    weekKey: weekState.weekKey,
    weekStartISO: weekState.weekStartISO,
    weekEndExclusiveISO: weekState.weekEndExclusiveISO,
    demoReviewResult: demoScenario?.bitbucketReviewResult,
    showSuccess,
    showError
  });
  useWeekStorage({
    isDemo,
    isBooting,
    weekStart,
    setSettings,
    setSettingsDraft,
    setWeekOverride,
    setSyncResult,
    setFavoriteKeys,
    setPersonalNotes,
    setBitbucketReviewResult,
    setRecurringEvents,
    setRecurringOccurrences,
    setIsBooting,
    showError
  });

  const {
    visibleSyncResult,
    visibleBitbucketReviewResult,
    hoursByKey,
    issueUrlsByKey,
    issueTypesByKey,
    todayKey,
    todayWorklogs,
    todayPersonalNotes,
    todayTrackedHours,
    touchedNotLogged
  } = useIssueMetadata({
    currentDate,
    weekState,
    syncResult,
    bitbucketReviewResult,
    tickets,
    selectedTicket
  });

  const addTimeDateOptions = weekState.activeWorkingDates;
  const { isSyncing, runSync } = useJiraSync({
    settings,
    weekKey: weekState.weekKey,
    weekStartISO: weekState.weekStartISO,
    weekEndExclusiveISO: weekState.weekEndExclusiveISO,
    demoSyncResult: demoScenario?.syncResult,
    onSyncResult: setSyncResult,
    showSuccess,
    showError
  });
  const {
    isTesting,
    isTestingBitbucket,
    handleSaveSettings,
    handleWelcomeConnect,
    handleTestConnection,
    handleTestBitbucketConnection
  } = useSettingsActions({
    settingsDraft,
    isDemo,
    demoSyncResult: demoScenario?.syncResult,
    runSync,
    loadTickets,
    setSettings,
    setSettingsDraft,
    setWelcomeConnected: welcomeFlow.setWelcomeConnected,
    showSuccess,
    showError
  });
  const {
    isLogging,
    isDeletingWorklog,
    logError,
    setIsLogging,
    setLogError,
    handleAddWorklog,
    handleUpdateWorklog,
    handleDeleteWorklog
  } = useJiraWorklogs({
    settings,
    syncResult,
    editingWorklog,
    isDemo,
    runSync,
    loadTickets,
    onSyncResult: setSyncResult,
    setEditingWorklog,
    showSuccess,
    showError
  });
  const {
    editingPersonalNote,
    setEditingPersonalNote,
    isImportingPersonalNotes,
    handleImportPersonalNotes,
    handleAddPersonalNote,
    handleUpdatePersonalNote,
    handleDeletePersonalNote
  } = usePersonalNotes({
    personalNotes,
    setPersonalNotes,
    visibleWeekKey: weekState.weekKey,
    isDemo,
    setIsLogging,
    setLogError,
    showInfo,
    showSuccess,
    showError
  });
  const {
    handleSaveRecurringEvent,
    handleDeleteRecurringEvent,
    handleToggleRecurringEvent,
    handleConfirmRecurring,
    handleSkipRecurring,
    handleDeleteRecurringOccurrence,
    recurringCandidatesForDate
  } = useRecurringActions({
    recurringEvents,
    setRecurringEvents,
    recurringOccurrences,
    setRecurringOccurrences,
    visibleWeekKey: weekState.weekKey,
    isDemo,
    showSuccess,
    showError
  });
  const { isLoggingReview, handleLogReviewSessions } = useBitbucketReviewLogging({
    settings,
    sourceResult: visibleBitbucketReviewResult,
    isDemo,
    runSync,
    loadTickets,
    onReviewResult: setBitbucketReviewResult,
    setLogError,
    showInfo,
    showSuccess,
    showError
  });

  const { handleSync, syncLabel, syncState } = useSyncControls({
    settings,
    syncResult,
    isSyncing,
    isSyncingReviews,
    runSync,
    runReviewSync
  });
  const { handleToggleSkipped, handleExportWeekCsv } = useWeekActions({
    weekState,
    weekOverride,
    setWeekOverride,
    isDemo,
    showSuccess
  });

  useAppLifecycleEffects({
    isDemo,
    isBooting,
    isConfigured,
    isBitbucketReady,
    settings,
    weekKey: weekState.weekKey,
    skippedDates: weekState.skippedDates,
    remainingWeekHours: weekState.remainingWeekHours,
    todayDateKey: todayKey,
    runSync,
    runReviewSync
  });

  const addTimeModalActions = useAddTimeModalActions({
    currentDate,
    weekState,
    isConfigured,
    welcomeConnected: welcomeFlow.welcomeConnected,
    isBooting,
    addModalDate,
    editingWorklog,
    editingPersonalNote,
    setWeekStart,
    setAddModalDate,
    setEditingWorklog,
    setEditingPersonalNote,
    setLogError
  });

  if (welcomeFlow.isWelcomeVisible) {
    return (
      <AppWelcomeScreen
        theme={effectiveTheme}
        initialSettings={settingsDraft}
        isConnected={welcomeFlow.welcomeConnected}
        connectedSettings={settings}
        onConnect={handleWelcomeConnect}
        onEnterApp={welcomeFlow.enterApp}
        notifications={snackbars}
        onDismissNotification={dismissSnackbar}
      />
    );
  }

  return (
    <div
      className="app-shell"
      data-demo={demoScenario ? "true" : undefined}
      data-screenshot-ready={isBooting ? "false" : "true"}
      data-theme={effectiveTheme}
      data-view={view}
    >
      <div className="shell-body">
        <Sidebar
          view={view}
          collapsed={sidebarCollapsed}
          onViewChange={handleViewChange}
          onToggleCollapse={toggleSidebarCollapsed}
          syncLabel={syncLabel}
          syncState={syncState}
          showReview={isBitbucketReady}
        />

        <AppMainView
          view={view}
          isBooting={isBooting}
          currentDate={currentDate}
          selectedTicket={selectedTicket}
          ticketOptions={ticketOptions}
          todayWorklogs={todayWorklogs}
          todayPersonalNotes={todayPersonalNotes}
          issueUrlsByKey={issueUrlsByKey}
          issueTypesByKey={issueTypesByKey}
          todayTrackedHours={todayTrackedHours}
          touchedNotLogged={touchedNotLogged}
          settings={settings}
          settingsDraft={settingsDraft}
          weekState={weekState}
          syncResult={syncResult}
          monthState={monthState}
          visibleBitbucketReviewResult={visibleBitbucketReviewResult}
          tickets={tickets}
          favoriteKeys={favoriteKeys}
          hoursByKey={hoursByKey}
          dockTickets={dockTickets}
          activeTicketCount={activeTicketCount}
          reviewTargetMode={reviewTargetMode}
          isConfigured={isConfigured}
          isBitbucketReady={isBitbucketReady}
          isSyncing={isSyncing}
          isSyncingReviews={isSyncingReviews}
          isLogging={isLogging}
          isLoggingReview={isLoggingReview}
          ticketsLoading={ticketsLoading}
          ticketsError={ticketsError}
          isTesting={isTesting}
          isTestingBitbucket={isTestingBitbucket}
          effectiveTheme={effectiveTheme}
          updateInfo={updateInfo}
          isCheckingUpdates={isCheckingUpdates}
          recurringEvents={recurringEvents}
          isImportingPersonalNotes={isImportingPersonalNotes}
          handleAddWorklog={handleAddWorklog}
          handleAddPersonalNote={handleAddPersonalNote}
          handleSync={handleSync}
          goToPreviousWeek={goToPreviousWeek}
          goToCurrentWeek={goToCurrentWeek}
          goToNextWeek={goToNextWeek}
          goToPreviousMonth={goToPreviousMonth}
          goToCurrentMonth={goToCurrentMonth}
          goToNextMonth={goToNextMonth}
          openWeekFromMonth={openWeekFromMonth}
          handleReviewSync={handleReviewSync}
          handleLogReviewSessions={handleLogReviewSessions}
          setReviewTargetMode={setReviewTargetMode}
          toggleFavorite={toggleFavorite}
          handleLogTicket={handleLogTicket}
          setSettingsDraft={setSettingsDraft}
          handleSaveSettings={handleSaveSettings}
          handleTestConnection={handleTestConnection}
          handleTestBitbucketConnection={handleTestBitbucketConnection}
          selectTheme={selectTheme}
          checkForUpdatesFromSettings={checkForUpdatesFromSettings}
          openCurrentReleaseNotes={openCurrentReleaseNotes}
          openCurrentUpdateDownload={openCurrentUpdateDownload}
          openReleasePage={openReleasePage}
          handleExportWeekCsv={handleExportWeekCsv}
          handleImportPersonalNotes={handleImportPersonalNotes}
          handleSaveRecurringEvent={handleSaveRecurringEvent}
          handleDeleteRecurringEvent={handleDeleteRecurringEvent}
          handleToggleRecurringEvent={handleToggleRecurringEvent}
          setSelectedTicket={setSelectedTicket}
          searchTickets={searchTickets}
          openAddTime={addTimeModalActions.openAddTime}
          openEditWorklog={addTimeModalActions.openEditWorklog}
          openEditPersonalNote={addTimeModalActions.openEditPersonalNote}
          handleToggleSkipped={handleToggleSkipped}
          handleConfirmRecurring={handleConfirmRecurring}
          handleSkipRecurring={handleSkipRecurring}
          handleDeleteRecurringOccurrence={handleDeleteRecurringOccurrence}
        />
      </div>

      <AppOverlays
        addModalDate={addModalDate}
        editingWorklog={editingWorklog}
        editingPersonalNote={editingPersonalNote}
        dateOptions={addTimeDateOptions}
        ticketOptions={ticketOptions}
        isConfigured={isConfigured}
        isLogging={isLogging}
        isDeletingWorklog={isDeletingWorklog}
        logError={logError}
        onCloseAddTime={addTimeModalActions.closeAddTime}
        onCloseEditingWorklog={addTimeModalActions.closeEditingWorklog}
        onCloseEditingPersonalNote={addTimeModalActions.closeEditingPersonalNote}
        onAddWorklog={handleAddWorklog}
        onUpdateWorklog={handleUpdateWorklog}
        onDeleteWorklog={handleDeleteWorklog}
        onSearchTickets={searchTickets}
        onAddPersonalNote={handleAddPersonalNote}
        onUpdatePersonalNote={handleUpdatePersonalNote}
        onDeletePersonalNote={handleDeletePersonalNote}
        getRecurringCandidates={recurringCandidatesForDate}
        onLogRecurring={handleConfirmRecurring}
        releaseNotesDialogInfo={releaseNotesDialogInfo}
        onCloseReleaseNotes={closeReleaseNotes}
        onDownloadUpdate={openUpdateDownload}
        onOpenReleasePage={openReleasePage}
        notifications={snackbars}
        onDismissNotification={dismissSnackbar}
      />
    </div>
  );
};

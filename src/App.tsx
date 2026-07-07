import { useCallback, useEffect, useMemo, useState } from "react";
import { AppMainView } from "./app/AppMainView";
import { AppOverlays } from "./app/AppOverlays";
import { AppShellFrame } from "./app/AppShellFrame";
import { AppWelcomeScreen } from "./app/AppWelcomeScreen";
import type { AppView } from "./components/Sidebar";
import type { SettingsSection } from "./components/SettingsView";
import { useAppCalendarState } from "./app/useAppCalendarState";
import { useAppConnectionState } from "./app/useAppConnectionState";
import { useAppReviewTargetState } from "./app/useAppReviewTargetState";
import { useAppRecurringState } from "./app/useAppRecurringState";
import { useAppSettingsState } from "./app/useAppSettingsState";
import { useAppShellState } from "./app/useAppShellState";
import { useAppTimeEntryModalState } from "./app/useAppTimeEntryModalState";
import { useAppWeekDataState } from "./app/useAppWeekDataState";
import { useAddTimeModalActions } from "./app/useAddTimeModalActions";
import { useAppLifecycleEffects } from "./app/useAppLifecycleEffects";
import { useAppNavigation } from "./app/useAppNavigation";
import { useBitbucketReviewLogging } from "./app/useBitbucketReviewLogging";
import { useBitbucketReviewSync } from "./app/useBitbucketReviewSync";
import { useDemoScenario } from "./app/useDemoScenario";
import { useIssueMetadata } from "./app/useIssueMetadata";
import { useJiraActivitySync } from "./app/useJiraActivitySync";
import { useJiraSync } from "./app/useJiraSync";
import { useJiraWorklogs } from "./app/useJiraWorklogs";
import { useMonthState } from "./app/useMonthState";
import { usePersonalNotes } from "./app/usePersonalNotes";
import { usePrevWorkingDay } from "./app/usePrevWorkingDay";
import { useRecurringActions } from "./app/useRecurringActions";
import { useReleaseUpdates } from "./app/useReleaseUpdates";
import { useReportsHistory } from "./app/useReportsHistory";
import { useSettingsActions } from "./app/useSettingsActions";
import { useSidebarState } from "./app/useSidebarState";
import { useSnackbars } from "./app/useSnackbars";
import { useSyncControls } from "./app/useSyncControls";
import { useThemeMode } from "./app/useThemeMode";
import { useTicketDetails } from "./app/useTicketDetails";
import { useTickets } from "./app/useTickets";
import { useWeekActions } from "./app/useWeekActions";
import { useWeekStorage } from "./app/useWeekStorage";
import { useWeekState } from "./app/useWeekState";
import { useWelcomeFlow } from "./app/useWelcomeFlow";

// The version this build is running; baked from package.json at build time.
const APP_VERSION = import.meta.env.VITE_APP_VERSION || "unknown";

export const App = () => {
  const { currentDate, demoConfig, demoScenario, isDemo } = useDemoScenario();
  const { view, setView, isBooting, setIsBooting } = useAppShellState({ initialView: demoConfig?.view, isDemo });
  const { settings, setSettings, settingsDraft, setSettingsDraft } = useAppSettingsState({ demoScenario });
  const isSettingsDirty = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(settingsDraft),
    [settings, settingsDraft]
  );

  // Quit/reload guard: unsaved settings edits live only in memory (settingsDraft),
  // so the one moment they are truly lost is closing or reloading the app. In
  // Electron this triggers the main-process will-prevent-unload confirm dialog.
  useEffect(() => {
    if (!isSettingsDirty || isDemo) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isSettingsDirty, isDemo]);
  const { weekStart, setWeekStart, monthAnchor, setMonthAnchor, weekOverride, setWeekOverride } = useAppCalendarState({
    currentDate,
    demoScenario
  });
  const { syncResult, setSyncResult, personalNotes, setPersonalNotes } = useAppWeekDataState({
    demoSyncResult: demoScenario?.syncResult,
    demoPersonalNotes: demoScenario?.personalNotes
  });
  const { recurringEvents, setRecurringEvents, recurringOccurrences, setRecurringOccurrences } = useAppRecurringState({
    isDemo,
    demoRecurringOccurrences: demoScenario?.recurringOccurrences
  });
  const { reviewTargetMode, setReviewTargetMode } = useAppReviewTargetState();
  const { snackbars, dismissSnackbar, showSnackbar, showSuccess, showError, showInfo } = useSnackbars();
  const { sidebarCollapsed, toggleSidebarCollapsed } = useSidebarState();
  const { addModalDate, setAddModalDate, addTimePrefill, setAddTimePrefill, editingWorklog, setEditingWorklog } =
    useAppTimeEntryModalState();
  const { effectiveTheme, selectTheme } = useThemeMode({
    initialTheme: demoConfig?.theme,
    persist: !isDemo
  });
  const {
    updateInfo,
    isCheckingUpdates,
    releaseNotesDialogInfo,
    releaseHistory,
    isLoadingReleaseHistory,
    releaseHistoryError,
    openReleasePage,
    checkForUpdatesFromSettings,
    openCurrentReleaseNotes,
    selectReleaseNotesVersion,
    refreshReleaseHistory,
    closeReleaseNotes,
    downloadCurrentUpdate,
    installDownloadedUpdate
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

  const { isConfigured, isBitbucketReady } = useAppConnectionState(settings);
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
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("jira");
  const openAiSettings = useCallback(() => {
    setSettingsSection("reconstruct");
    handleViewChange("settings");
  }, [handleViewChange]);
  const handleShellViewChange = useCallback(
    (nextView: AppView) => {
      if (nextView === "settings") {
        setSettingsSection("jira");
      }
      handleViewChange(nextView);
    },
    [handleViewChange]
  );
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

  const reportsWeekStates = useReportsHistory({
    isReportsView: view === "reports",
    isBooting,
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
  const {
    jiraActivityResult,
    setJiraActivityResult,
    isSyncingJiraActivity,
    runJiraActivitySync
  } = useJiraActivitySync({
    settings,
    weekKey: weekState.weekKey,
    weekStartISO: weekState.weekStartISO,
    weekEndExclusiveISO: weekState.weekEndExclusiveISO,
    demoJiraActivityResult: demoScenario?.jiraActivityResult,
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
    setJiraActivityResult,
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
    todaySummary,
    prevDaySummary,
    todayWorklogs,
    todayPersonalNotes,
    todayTrackedHours,
    touchedNotLogged
  } = useIssueMetadata({
    currentDate,
    weekState,
    syncResult,
    bitbucketReviewResult,
    personalNotes,
    tickets,
    selectedTicket
  });

  // Recap's previous working day: the in-week day when one exists (Tue–Fri),
  // else the prior week's last working day (the Monday → last-Friday case).
  const prevDayCrossWeek = usePrevWorkingDay({
    isTodayView: view === "today",
    isBooting,
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
  const recapDaySummary = prevDaySummary ?? prevDayCrossWeek;

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
    runJiraActivitySync,
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
    isSyncingJiraActivity,
    isSyncingReviews,
    runSync,
    runJiraActivitySync,
    runReviewSync
  });
  const { handleToggleSkipped, handleExportWeekCsv } = useWeekActions({
    weekState,
    weekOverride,
    setWeekOverride,
    isDemo,
    showSuccess
  });
  const ticketDetails = useTicketDetails({
    settings,
    isDemo,
    weekState,
    syncResult,
    tickets,
    selectedTicket
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
    runJiraActivitySync,
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
    setAddTimePrefill,
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
    <AppShellFrame
      isDemo={Boolean(demoScenario)}
      isBooting={isBooting}
      theme={effectiveTheme}
      view={view}
      sidebarCollapsed={sidebarCollapsed}
      onViewChange={handleShellViewChange}
      onToggleSidebarCollapsed={toggleSidebarCollapsed}
      syncLabel={syncLabel}
      syncState={syncState}
      showReview={isBitbucketReady}
      settingsDirty={isSettingsDirty}
      overlays={
        <AppOverlays
          addModalDate={addModalDate}
          addTimePrefill={addTimePrefill}
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
          ticketDetailsDialog={
            ticketDetails.issueKey
              ? {
                  issueKey: ticketDetails.issueKey,
                  details: ticketDetails.details,
                  localDetails: ticketDetails.localDetails,
                  weekLoggedSeconds: ticketDetails.weekLoggedSeconds,
                  weekWorklogCount: ticketDetails.weekWorklogCount,
                  weekRangeLabel: weekState.weekRangeLabel,
                  isLoading: ticketDetails.isLoading,
                  error: ticketDetails.error,
                  onOpenInCursor: ticketDetails.openInCursor
                }
              : undefined
          }
          onCloseTicketDetails={ticketDetails.closeTicketDetails}
          releaseNotesDialogInfo={releaseNotesDialogInfo}
          onCloseReleaseNotes={closeReleaseNotes}
          onDownloadUpdate={downloadCurrentUpdate}
          onOpenReleasePage={openReleasePage}
          releaseHistory={releaseHistory}
          isLoadingReleaseHistory={isLoadingReleaseHistory}
          releaseHistoryError={releaseHistoryError}
          onSelectReleaseNotesVersion={selectReleaseNotesVersion}
          onRefreshReleaseHistory={refreshReleaseHistory}
          notifications={snackbars}
          onDismissNotification={dismissSnackbar}
        />
      }
    >
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
        todayDailyTargetHours={todaySummary?.targetHours ?? 0}
        touchedNotLogged={touchedNotLogged}
        recapDaySummary={recapDaySummary}
        settings={settings}
        settingsDraft={settingsDraft}
        isSettingsDirty={isSettingsDirty}
        weekState={weekState}
        reportsWeekStates={reportsWeekStates}
        personalNotes={personalNotes}
        syncResult={syncResult}
        jiraActivityResult={jiraActivityResult}
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
        recurringOccurrences={recurringOccurrences}
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
        downloadCurrentUpdate={downloadCurrentUpdate}
        installDownloadedUpdate={installDownloadedUpdate}
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
        openSettings={openAiSettings}
        openTicketDetails={ticketDetails.openTicketDetails}
        settingsSection={settingsSection}
        syncState={syncState}
        syncLabel={syncLabel}
      />
    </AppShellFrame>
  );
};

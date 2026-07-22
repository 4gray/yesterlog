import { useCallback, useEffect, useMemo, useState } from "react";
import { AppMainView } from "./app/AppMainView";
import type { CommandPaletteCommand } from "./components/CommandPalette";
import { formatShortcut } from "./utils/platform";
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
import { useCommandPalette } from "./app/useCommandPalette";
import { useOnlineStatus } from "./app/useOnlineStatus";
import { useBitbucketReviewLogging } from "./app/useBitbucketReviewLogging";
import { useBitbucketReviewSync } from "./app/useBitbucketReviewSync";
import { useDemoScenario } from "./app/useDemoScenario";
import { useIssueMetadata } from "./app/useIssueMetadata";
import { buildDaySignals } from "./domain/todaySignals";
import { projectWorklogsForWeek } from "./domain/worklogAllocation";
import { useJiraActivitySync } from "./app/useJiraActivitySync";
import { useJiraSync } from "./app/useJiraSync";
import { useJiraWorklogs } from "./app/useJiraWorklogs";
import { useMonthState } from "./app/useMonthState";
import { usePersonalNotes } from "./app/usePersonalNotes";
import { usePrevWorkingDay } from "./app/usePrevWorkingDay";
import { useRecurringActions } from "./app/useRecurringActions";
import { useReleaseUpdates } from "./app/useReleaseUpdates";
import { useReportsHistory } from "./app/useReportsHistory";
import { useReportTabState } from "./app/useReportTabState";
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
import { useWeekViewMode } from "./components/useWeekViewMode";
import { useWelcomeFlow } from "./app/useWelcomeFlow";

// The version this build is running; baked from package.json at build time.
const APP_VERSION = import.meta.env.VITE_APP_VERSION || "unknown";

export const App = () => {
  const { currentDate, demoConfig, demoScenario, isDemo } = useDemoScenario();
  const { view, setView, isBooting, setIsBooting } = useAppShellState({ initialView: demoConfig?.view, isDemo });
  const { reportTab, setReportTab } = useReportTabState({ initialTab: demoConfig?.reportTab, persist: !isDemo });
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
  const {
    syncResult,
    setSyncResult,
    personalNotes,
    setPersonalNotes,
    weekOverrides,
    setWeekOverrides,
    worklogAllocationPreferences,
    setWorklogAllocationPreferences
  } = useAppWeekDataState({
    demoSyncResult: demoScenario?.syncResult,
    demoPersonalNotes: demoScenario?.personalNotes
  });
  useEffect(() => {
    setWeekOverrides((current) => {
      const existing = current.find((override) => override.weekKey === weekOverride.weekKey);
      if (existing && existing.skippedDates.join(",") === weekOverride.skippedDates.join(",")) {
        return current;
      }
      return [...current.filter((override) => override.weekKey !== weekOverride.weekKey), weekOverride].sort((left, right) =>
        left.weekKey.localeCompare(right.weekKey)
      );
    });
  }, [setWeekOverrides, weekOverride]);
  const allocationSkippedDates = useMemo(
    () => Array.from(new Set(weekOverrides.flatMap((override) => override.skippedDates))).sort(),
    [weekOverrides]
  );
  const { recurringEvents, setRecurringEvents, recurringOccurrences, setRecurringOccurrences } = useAppRecurringState({
    isDemo,
    demoRecurringOccurrences: demoScenario?.recurringOccurrences
  });
  const projectedSyncResult = useMemo(
    () =>
      projectWorklogsForWeek(syncResult, {
        settings,
        skippedDates: allocationSkippedDates,
        preferences: worklogAllocationPreferences,
        now: currentDate
      }),
    [allocationSkippedDates, currentDate, settings, syncResult, worklogAllocationPreferences]
  );
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
    ticketViewTickets,
    ticketFilters,
    setTicketFilters,
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
    syncResult: projectedSyncResult,
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
    allocationSkippedDates,
    worklogAllocationPreferences,
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
    allocationSkippedDates,
    worklogAllocationPreferences,
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
    setWeekOverrides,
    setSyncResult,
    setWorklogAllocationPreferences,
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
    todayRecurringEntries,
    todayPendingRecurring,
    todayTrackedHours,
    touchedNotLogged
  } = useIssueMetadata({
    currentDate,
    weekState,
    syncResult: projectedSyncResult,
    bitbucketReviewResult,
    personalNotes,
    tickets,
    selectedTicket
  });

  // Today's detected-but-unlogged activity for the calendar ghost layer — derived from
  // the same signals Reconstruct uses; no extra sync (inputs already resident).
  const todaySignals = useMemo(
    () => buildDaySignals(todayKey, bitbucketReviewResult, jiraActivityResult),
    [todayKey, bitbucketReviewResult, jiraActivityResult]
  );

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
    allocationSkippedDates,
    worklogAllocationPreferences,
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
    handleMoveWorklog,
    handleDeleteWorklog
  } = useJiraWorklogs({
    settings,
    syncResult,
    editingWorklog,
    isDemo,
    runSync,
    loadTickets,
    onSyncResult: setSyncResult,
    onWorklogAllocationPreference: (preference) =>
      setWorklogAllocationPreferences((current) => [
        ...current.filter((candidate) => candidate.preferenceKey !== preference.preferenceKey),
        preference
      ]),
    onWorklogAllocationPreferenceRemoved: (preferenceKey) =>
      setWorklogAllocationPreferences((current) =>
        current.filter((candidate) => candidate.preferenceKey !== preferenceKey)
      ),
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
    handleMoveRecurring,
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

  const isOnline = useOnlineStatus();
  const { handleSync, syncLabel, syncState } = useSyncControls({
    settings,
    syncResult: projectedSyncResult,
    isSyncing,
    isSyncingJiraActivity,
    isSyncingReviews,
    isOnline,
    runSync,
    runJiraActivitySync,
    runReviewSync
  });
  const { mode: weekViewMode, selectMode: selectWeekViewMode } = useWeekViewMode();
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
    syncResult: projectedSyncResult,
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

  // A time-entry modal owns the screen and its own Esc handler; letting the
  // palette stack on top would leave one Esc closing both and losing the entry.
  const hasOpenTimeEntryModal = Boolean(addModalDate || editingWorklog || editingPersonalNote);
  const commandPalette = useCommandPalette({
    enabled: !welcomeFlow.isWelcomeVisible && !isBooting && !hasOpenTimeEntryModal
  });

  // TODO(nl-parsing): the brief's headline command is free-text ("Log 2h on
  // TBRO-352", "go to week 28"). Until the parser lands these are the static
  // fallbacks the palette offers.
  const commands = useMemo<CommandPaletteCommand[]>(
    () => [
      {
        id: "log-time",
        label: "Log time…",
        hint: formatShortcut("K", { shift: true }),
        disabled: !isConfigured,
        run: addTimeModalActions.openTrackingShortcut
      },
      { id: "sync-now", label: "Sync now", disabled: !isConfigured || syncState === "syncing", run: handleSync },
      // Week navigation is invisible from Today/Reports/etc, so these surface the
      // week view alongside the jump rather than silently moving offscreen state.
      {
        id: "go-today",
        label: "Go to current week",
        run: () => {
          handleViewChange("week");
          goToCurrentWeek();
        }
      },
      {
        id: "go-prev-week",
        label: "Go to previous week",
        run: () => {
          handleViewChange("week");
          goToPreviousWeek();
        }
      },
      {
        id: "go-next-week",
        label: "Go to next week",
        run: () => {
          handleViewChange("week");
          goToNextWeek();
        }
      },
      {
        id: "view-summary",
        label: "Switch to Summary",
        hint: weekViewMode === "summary" ? "Current" : undefined,
        run: () => {
          selectWeekViewMode("summary");
          handleViewChange("week");
        }
      },
      {
        id: "view-timeline",
        label: "Switch to Timeline",
        hint: weekViewMode === "timeline" ? "Current" : undefined,
        run: () => {
          selectWeekViewMode("timeline");
          handleViewChange("week");
        }
      }
    ],
    [
      addTimeModalActions.openTrackingShortcut,
      goToCurrentWeek,
      goToNextWeek,
      goToPreviousWeek,
      handleSync,
      handleViewChange,
      isConfigured,
      selectWeekViewMode,
      syncState,
      weekViewMode
    ]
  );

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
      reportTab={reportTab}
      sidebarCollapsed={sidebarCollapsed}
      onViewChange={handleShellViewChange}
      onReportTabChange={setReportTab}
      onToggleSidebarCollapsed={toggleSidebarCollapsed}
      syncLabel={syncLabel}
      syncState={syncState}
      showReview={isBitbucketReady}
      settingsDirty={isSettingsDirty}
      overlays={
        <AppOverlays
          commandPaletteOpen={commandPalette.open}
          commands={commands}
          onCloseCommandPalette={commandPalette.close}
          addModalDate={addModalDate}
          addTimePrefill={addTimePrefill}
          editingWorklog={editingWorklog}
          editingPersonalNote={editingPersonalNote}
          dateOptions={addTimeDateOptions}
          ticketOptions={ticketOptions}
          timelineWorklogs={Object.values(visibleSyncResult?.daySummaries ?? {}).flatMap((bucket) => bucket.worklogs)}
          timelinePersonalNotes={personalNotes}
          timelineRecurringEntries={weekState.days.flatMap((day) => day.recurringEntries)}
          isConfigured={isConfigured}
          isLogging={isLogging}
          isDeletingWorklog={isDeletingWorklog}
          dailyTargetHours={weekState.dailyTargetHours}
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
        reportTab={reportTab}
        isBooting={isBooting}
        viewMode={weekViewMode}
        onViewModeChange={selectWeekViewMode}
        onOpenCommandPalette={commandPalette.toggle}
        currentDate={currentDate}
        ticketOptions={ticketOptions}
        todayWorklogs={todayWorklogs}
        todaySignals={todaySignals}
        todayPersonalNotes={todayPersonalNotes}
        todayRecurringEntries={todayRecurringEntries}
        todayPendingRecurring={todayPendingRecurring}
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
        syncResult={projectedSyncResult}
        jiraActivityResult={jiraActivityResult}
        monthState={monthState}
        visibleBitbucketReviewResult={visibleBitbucketReviewResult}
        tickets={ticketViewTickets}
        ticketFilters={ticketFilters}
        setTicketFilters={setTicketFilters}
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
        allocationSkippedDates={allocationSkippedDates}
        worklogAllocationPreferences={worklogAllocationPreferences}
        isImportingPersonalNotes={isImportingPersonalNotes}
        handleAddWorklog={handleAddWorklog}
        handleMoveWorklog={handleMoveWorklog}
        handleMoveRecurring={handleMoveRecurring}
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

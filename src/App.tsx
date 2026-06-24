import { useMemo, useState } from "react";
import type {
  AppSettings,
  BitbucketReviewTargetMode,
  JiraWorklog,
  PersonalNote,
  RecurringEvent,
  RecurringOccurrence,
  SyncResult,
  WeekOverride
} from "../shared/types";
import { isJiraConfigured } from "./app/appHelpers";
import { useAddTimeModalActions } from "./app/useAddTimeModalActions";
import { useAppLifecycleEffects } from "./app/useAppLifecycleEffects";
import { useAppNavigation } from "./app/useAppNavigation";
import { useBitbucketReviewLogging } from "./app/useBitbucketReviewLogging";
import { useBitbucketReviewSync } from "./app/useBitbucketReviewSync";
import { useLiveDate } from "./app/useLiveDate";
import { useIssueMetadata } from "./app/useIssueMetadata";
import { useJiraSync } from "./app/useJiraSync";
import { useJiraWorklogs } from "./app/useJiraWorklogs";
import { useMonthState } from "./app/useMonthState";
import { usePersonalNotes } from "./app/usePersonalNotes";
import { useRecurringActions } from "./app/useRecurringActions";
import { useReleaseUpdates } from "./app/useReleaseUpdates";
import { useSettingsActions } from "./app/useSettingsActions";
import { useSnackbars } from "./app/useSnackbars";
import { useSyncControls } from "./app/useSyncControls";
import { useThemeMode } from "./app/useThemeMode";
import { useTickets } from "./app/useTickets";
import { useWeekActions } from "./app/useWeekActions";
import { useWeekStorage } from "./app/useWeekStorage";
import { useWeekState } from "./app/useWeekState";
import { useWelcomeFlow } from "./app/useWelcomeFlow";
import { ReportsView } from "./components/ReportsView";
import { ReleaseNotesDialog } from "./components/ReleaseNotesDialog";
import { ReviewView } from "./components/ReviewView";
import { SettingsView } from "./components/SettingsView";
import { Sidebar, type AppView } from "./components/Sidebar";
import { SnackbarStack } from "./components/SnackbarStack";
import { TicketsView } from "./components/TicketsView";
import { TimeEntryModalLayer } from "./components/TimeEntryModalLayer";
import { TodayView } from "./components/TodayView";
import { MonthView } from "./components/MonthView";
import { WelcomeView } from "./components/WelcomeView";
import { WeekView } from "./components/WeekView";
import { getDemoConfig } from "./demo/config";
import { createDemoScenario } from "./demo/fixtures";
import { isBitbucketConfigured } from "./domain/bitbucketReview";
import { DEFAULT_SETTINGS, getWeekBounds } from "./domain/week";
import { buildDefaultRecurringEvents } from "./domain/recurring";
import { getMonthAnchor } from "./domain/month";
import { toLocalDateKey } from "./utils/date";

// The version this build is running; baked from package.json at build time.
const APP_VERSION = import.meta.env.VITE_APP_VERSION || "unknown";

export const App = () => {
  const demoConfig = useMemo(() => getDemoConfig(), []);
  const demoScenario = useMemo(() => (demoConfig ? createDemoScenario(demoConfig) : undefined), [demoConfig]);
  const isDemo = Boolean(demoScenario);
  const currentDate = useLiveDate(demoScenario?.today);
  const [view, setView] = useState<AppView>(() => demoConfig?.view ?? "week");
  const [settings, setSettings] = useState<AppSettings>(() => demoScenario?.settings ?? DEFAULT_SETTINGS);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings>(() => demoScenario?.settings ?? DEFAULT_SETTINGS);
  const [weekStart, setWeekStart] = useState(() => demoScenario?.weekStart ?? getWeekBounds(currentDate).weekStart);
  const [monthAnchor, setMonthAnchor] = useState(() => getMonthAnchor(currentDate));
  const [weekOverride, setWeekOverride] = useState<WeekOverride>(() => ({
    ...(demoScenario?.weekOverride ?? {
      weekKey: toLocalDateKey(getWeekBounds(currentDate).weekStart),
      skippedDates: []
    })
  }));
  const [syncResult, setSyncResult] = useState<SyncResult | undefined>(() => demoScenario?.syncResult);
  const [personalNotes, setPersonalNotes] = useState<PersonalNote[]>([]);
  const [recurringEvents, setRecurringEvents] = useState<RecurringEvent[]>(() =>
    demoScenario ? buildDefaultRecurringEvents() : []
  );
  const [recurringOccurrences, setRecurringOccurrences] = useState<RecurringOccurrence[]>([]);
  const [isBooting, setIsBooting] = useState(() => !isDemo);
  const [reviewTargetMode, setReviewTargetMode] = useState<BitbucketReviewTargetMode>("reviewed-ticket");
  const { snackbars, dismissSnackbar, showSnackbar, showSuccess, showError, showInfo } = useSnackbars();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
      <div className="app-shell" data-theme={effectiveTheme} data-view="welcome">
        <WelcomeView
          initialSettings={settingsDraft}
          isConnected={welcomeFlow.welcomeConnected}
          connectedSettings={settings}
          onConnect={handleWelcomeConnect}
          onEnterApp={welcomeFlow.enterApp}
        />
        <SnackbarStack notifications={snackbars} onDismiss={dismissSnackbar} />
      </div>
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
          onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
          syncLabel={syncLabel}
          syncState={syncState}
          showReview={isBitbucketReady}
        />

        <main className="main-area">
          {isBooting ? (
            <div className="view" style={{ display: "grid", placeItems: "center" }}>
              <span className="sync-label">LOADING…</span>
            </div>
          ) : view === "today" ? (
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
              onEditWorklog={addTimeModalActions.openEditWorklog}
              onEditPersonalNote={addTimeModalActions.openEditPersonalNote}
              onSelectTicket={setSelectedTicket}
              onSearchTickets={searchTickets}
            />
          ) : view === "week" ? (
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
              onAddTime={addTimeModalActions.openAddTime}
              onEditWorklog={addTimeModalActions.openEditWorklog}
              onEditPersonalNote={addTimeModalActions.openEditPersonalNote}
              onToggleSkipped={handleToggleSkipped}
              onDockLog={handleAddWorklog}
              onConfirmRecurring={handleConfirmRecurring}
              onSkipRecurring={handleSkipRecurring}
              onDeleteRecurring={handleDeleteRecurringOccurrence}
            />
          ) : view === "month" ? (
            monthState ? (
              <MonthView
                monthState={monthState}
                onSelectWeek={openWeekFromMonth}
                onPreviousMonth={goToPreviousMonth}
                onCurrentMonth={goToCurrentMonth}
                onNextMonth={goToNextMonth}
              />
            ) : (
              <div className="view" style={{ display: "grid", placeItems: "center" }}>
                <span className="sync-label">LOADING…</span>
              </div>
            )
          ) : view === "review" ? (
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
          ) : view === "tickets" ? (
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
          ) : view === "reports" ? (
            <ReportsView
              weekState={weekState}
              onPreviousWeek={goToPreviousWeek}
              onCurrentWeek={goToCurrentWeek}
              onNextWeek={goToNextWeek}
            />
          ) : (
            <SettingsView
              draft={settingsDraft}
              onDraftChange={setSettingsDraft}
              onSave={handleSaveSettings}
              onTestConnection={handleTestConnection}
              onTestBitbucketConnection={handleTestBitbucketConnection}
              isTesting={isTesting}
              isTestingBitbucket={isTestingBitbucket}
              effectiveTheme={effectiveTheme}
              onSelectTheme={selectTheme}
              updateInfo={updateInfo}
              isCheckingUpdates={isCheckingUpdates}
              onCheckForUpdates={checkForUpdatesFromSettings}
              onShowReleaseNotes={openCurrentReleaseNotes}
              onDownloadUpdate={openCurrentUpdateDownload}
              onOpenReleasePage={openReleasePage}
              weekRangeLabel={weekState.weekRangeLabel}
              onExportWeekCsv={handleExportWeekCsv}
              onImportPersonalNotes={handleImportPersonalNotes}
              isImportingPersonalNotes={isImportingPersonalNotes}
              recurringEvents={recurringEvents}
              onSaveRecurringEvent={handleSaveRecurringEvent}
              onDeleteRecurringEvent={handleDeleteRecurringEvent}
              onToggleRecurringEvent={handleToggleRecurringEvent}
            />
          )}
        </main>
      </div>

      <TimeEntryModalLayer
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
      />

      {releaseNotesDialogInfo && (
        <ReleaseNotesDialog
          updateInfo={releaseNotesDialogInfo}
          onClose={closeReleaseNotes}
          onDownload={openUpdateDownload}
          onOpenReleasePage={openReleasePage}
        />
      )}

      <SnackbarStack notifications={snackbars} onDismiss={dismissSnackbar} />
    </div>
  );
};

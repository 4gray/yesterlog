import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  canOpenTrackingShortcut,
  createTrackingShortcutDate,
  selectAddTimeDate
} from "./app/addTimeModalState";
import {
  formatSyncTime,
  isJiraConfigured
} from "./app/appHelpers";
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
import { useThemeMode } from "./app/useThemeMode";
import { useTickets } from "./app/useTickets";
import { useWeekStorage } from "./app/useWeekStorage";
import { nativeApi } from "./api/native";
import { AddTimeModal } from "./components/AddTimeModal";
import { ReportsView } from "./components/ReportsView";
import { ReleaseNotesDialog } from "./components/ReleaseNotesDialog";
import { ReviewView } from "./components/ReviewView";
import { SettingsView } from "./components/SettingsView";
import { Sidebar, type AppView } from "./components/Sidebar";
import { SnackbarStack } from "./components/SnackbarStack";
import { TicketsView } from "./components/TicketsView";
import { TodayView } from "./components/TodayView";
import { MonthView } from "./components/MonthView";
import { WelcomeView } from "./components/WelcomeView";
import { WeekView } from "./components/WeekView";
import { getDemoConfig } from "./demo/config";
import { createDemoScenario } from "./demo/fixtures";
import { buildWeekCsv } from "./domain/personalNotesCsv";
import { isBitbucketConfigured } from "./domain/bitbucketReview";
import { buildWeekState, DEFAULT_SETTINGS, getWeekBounds } from "./domain/week";
import { buildDefaultRecurringEvents } from "./domain/recurring";
import { getMonthAnchor } from "./domain/month";
import { saveWeekOverride } from "./storage/db";
import { toLocalDateKey } from "./utils/date";

// The version this build is running; baked from package.json at build time.
const APP_VERSION = import.meta.env.VITE_APP_VERSION || "unknown";

export const App = () => {
  const demoConfig = useMemo(() => getDemoConfig(), []);
  const demoScenario = useMemo(() => (demoConfig ? createDemoScenario(demoConfig) : undefined), [demoConfig]);
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
  const [isBooting, setIsBooting] = useState(() => !demoScenario);
  const [reviewTargetMode, setReviewTargetMode] = useState<BitbucketReviewTargetMode>("reviewed-ticket");
  const { snackbars, dismissSnackbar, showSnackbar, showSuccess, showError, showInfo } = useSnackbars();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [addModalDate, setAddModalDate] = useState<Date | undefined>();
  const [editingWorklog, setEditingWorklog] = useState<JiraWorklog | undefined>();
  const [welcomeConnected, setWelcomeConnected] = useState(false);
  const { effectiveTheme, selectTheme } = useThemeMode({
    initialTheme: demoConfig?.theme,
    persist: !demoScenario
  });
  const startupSyncCheckedRef = useRef(false);
  const {
    updateInfo,
    isCheckingUpdates,
    releaseNotesDialogInfo,
    checkForUpdates,
    openReleasePage,
    openReleaseNotes,
    closeReleaseNotes,
    openUpdateDownload
  } = useReleaseUpdates({
    appVersion: APP_VERSION,
    isDemo: Boolean(demoScenario),
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

  const weekState = useMemo(
    () =>
      buildWeekState(
        weekStart,
        settings,
        weekOverride,
        syncResult,
        personalNotes,
        currentDate,
        recurringEvents,
        recurringOccurrences
      ),
    [currentDate, personalNotes, recurringEvents, recurringOccurrences, settings, syncResult, weekOverride, weekStart]
  );

  const isConfigured = isJiraConfigured(settings);
  const isBitbucketReady = isBitbucketConfigured(settings);
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
    runReviewSync
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
    isDemo: Boolean(demoScenario),
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
  const demoJiraResult = useMemo(
    () =>
      demoScenario
        ? {
            ok: true,
            accountId: demoScenario.syncResult.accountId,
            displayName: demoScenario.syncResult.displayName,
            message: `Connected as ${demoScenario.syncResult.displayName}.`
          }
        : undefined,
    [demoScenario]
  );
  const {
    isTesting,
    isTestingBitbucket,
    handleSaveSettings,
    handleWelcomeConnect,
    handleTestConnection,
    handleTestBitbucketConnection
  } = useSettingsActions({
    settingsDraft,
    isDemo: Boolean(demoScenario),
    demoJiraResult,
    runSync,
    loadTickets,
    setSettings,
    setSettingsDraft,
    setWelcomeConnected,
    showSuccess,
    showError
  });
  const clearEditingWorklog = useCallback(() => setEditingWorklog(undefined), []);
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
    isDemo: Boolean(demoScenario),
    runSync,
    loadTickets,
    onSyncResult: setSyncResult,
    onClearEditingWorklog: clearEditingWorklog,
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
    isDemo: Boolean(demoScenario),
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
    isDemo: Boolean(demoScenario),
    showSuccess,
    showError
  });
  const { isLoggingReview, handleLogReviewSessions } = useBitbucketReviewLogging({
    settings,
    sourceResult: visibleBitbucketReviewResult,
    isDemo: Boolean(demoScenario),
    runSync,
    loadTickets,
    onReviewResult: setBitbucketReviewResult,
    setLogError,
    showInfo,
    showSuccess,
    showError
  });

  const handleSync = useCallback(async () => {
    await runSync();
    if (isBitbucketConfigured(settings)) {
      await runReviewSync(settings);
    }
  }, [runReviewSync, runSync, settings]);

  useEffect(() => {
    if (demoScenario || isBooting || startupSyncCheckedRef.current) {
      return;
    }

    startupSyncCheckedRef.current = true;

    if (!isConfigured) {
      return;
    }

    void (async () => {
      await runSync();
      if (isBitbucketReady) {
        await runReviewSync();
      }
    })();
  }, [demoScenario, isBitbucketReady, isBooting, isConfigured, runReviewSync, runSync]);

  useEffect(() => {
    if (demoScenario) {
      return;
    }

    void nativeApi
      .scheduleReminder({
        settings,
        weekKey: weekState.weekKey,
        skippedDates: weekState.skippedDates,
        remainingWeekHours: weekState.remainingWeekHours,
        todayDateKey: todayKey
      })
      .then((result) => {
        if (result.reason === "unsupported" && result.message) {
          console.warn(result.message);
        }
      })
      .catch((error) => {
        console.warn("Unable to schedule reminder.", error);
      });
  }, [demoScenario, settings, todayKey, weekState.weekKey, weekState.remainingWeekHours, weekState.skippedDates]);

  const handleToggleSkipped = async (dateKey: string) => {
    const skippedDates = weekOverride.skippedDates.includes(dateKey)
      ? weekOverride.skippedDates.filter((candidate) => candidate !== dateKey)
      : [...weekOverride.skippedDates, dateKey].sort();
    const nextOverride = { weekKey: weekState.weekKey, skippedDates };

    setWeekOverride(nextOverride);
    if (!demoScenario) {
      await saveWeekOverride(nextOverride);
    }
  };

  const handleExportWeekCsv = () => {
    const blob = new Blob([buildWeekCsv(weekState)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `timebro-week-${weekState.weekKey}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showSuccess(`Exported ${weekState.weekRangeLabel} CSV.`);
  };

  const syncState = isSyncing || isSyncingReviews ? "syncing" : syncResult ? "synced" : "stale";
  const syncLabel = isSyncing || isSyncingReviews ? "SYNCING…" : formatSyncTime(syncResult);

  const openAddTime = (date?: Date) => {
    setEditingWorklog(undefined);
    setEditingPersonalNote(undefined);
    setLogError(undefined);
    setAddModalDate(selectAddTimeDate({ currentDate, requestedDate: date, weekState }));
  };

  const openTrackingShortcut = useCallback(() => {
    if (
      !canOpenTrackingShortcut({
        isConfigured,
        welcomeConnected,
        isBooting,
        hasAddModal: Boolean(addModalDate),
        hasEditingWorklog: Boolean(editingWorklog),
        hasEditingPersonalNote: Boolean(editingPersonalNote)
      })
    ) {
      return;
    }

    setWeekStart(getWeekBounds(currentDate).weekStart);
    setEditingWorklog(undefined);
    setEditingPersonalNote(undefined);
    setLogError(undefined);
    setAddModalDate(createTrackingShortcutDate(currentDate));
  }, [addModalDate, currentDate, editingPersonalNote, editingWorklog, isBooting, isConfigured, welcomeConnected]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key.toLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey)) {
        return;
      }

      event.preventDefault();
      openTrackingShortcut();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openTrackingShortcut]);

  const openEditWorklog = (worklog: JiraWorklog) => {
    setAddModalDate(undefined);
    setLogError(undefined);
    setEditingPersonalNote(undefined);
    setEditingWorklog(worklog);
  };

  const openEditPersonalNote = (note: PersonalNote) => {
    setAddModalDate(undefined);
    setLogError(undefined);
    setEditingWorklog(undefined);
    setEditingPersonalNote(note);
  };

  if (!demoScenario && !isBooting && (!isConfigured || welcomeConnected)) {
    return (
      <div className="app-shell" data-theme={effectiveTheme} data-view="welcome">
        <WelcomeView
          initialSettings={settingsDraft}
          isConnected={welcomeConnected}
          connectedSettings={settings}
          onConnect={handleWelcomeConnect}
          onEnterApp={() => {
            setWelcomeConnected(false);
            setView("week");
          }}
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
              onEditWorklog={openEditWorklog}
              onEditPersonalNote={openEditPersonalNote}
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
              onAddTime={openAddTime}
              onEditWorklog={openEditWorklog}
              onEditPersonalNote={openEditPersonalNote}
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
              onSync={() => {
                void runReviewSync();
              }}
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
              onCheckForUpdates={() => {
                void checkForUpdates({ force: true, notifyWhenCurrent: true });
              }}
              onShowReleaseNotes={() => openReleaseNotes(updateInfo)}
              onDownloadUpdate={() => openUpdateDownload(updateInfo)}
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

      {addModalDate && (
        <AddTimeModal
          date={addModalDate}
          dateOptions={addTimeDateOptions}
          ticketOptions={ticketOptions}
          isConfigured={isConfigured}
          isLogging={isLogging}
          logError={logError}
          onClose={() => setAddModalDate(undefined)}
          onLog={handleAddWorklog}
          onSearchTickets={searchTickets}
          onAddPersonalNote={handleAddPersonalNote}
          getRecurringCandidates={recurringCandidatesForDate}
          onLogRecurring={handleConfirmRecurring}
        />
      )}

      {editingWorklog && (
        <AddTimeModal
          date={new Date(editingWorklog.started)}
          dateOptions={addTimeDateOptions}
          ticketOptions={ticketOptions}
          isConfigured={isConfigured}
          isLogging={isLogging}
          isDeleting={isDeletingWorklog}
          logError={logError}
          editingWorklog={editingWorklog}
          onClose={() => setEditingWorklog(undefined)}
          onLog={handleUpdateWorklog}
          onDelete={handleDeleteWorklog}
          onSearchTickets={searchTickets}
          onAddPersonalNote={handleAddPersonalNote}
        />
      )}

      {editingPersonalNote && (
        <AddTimeModal
          date={new Date(editingPersonalNote.startedISO)}
          dateOptions={addTimeDateOptions}
          ticketOptions={ticketOptions}
          isConfigured={isConfigured}
          isLogging={isLogging}
          logError={logError}
          editingPersonalNote={editingPersonalNote}
          onClose={() => setEditingPersonalNote(undefined)}
          onLog={handleAddWorklog}
          onDelete={handleDeletePersonalNote}
          onSearchTickets={searchTickets}
          onAddPersonalNote={handleAddPersonalNote}
          onUpdatePersonalNote={handleUpdatePersonalNote}
        />
      )}

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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppSettings,
  BitbucketReviewSyncResult,
  BitbucketReviewTargetMode,
  JiraConnectionResult,
  JiraTicket,
  JiraWorklog,
  PersonalNote,
  RecurringEvent,
  RecurringOccurrence,
  SyncResult,
  WeekOverride
} from "../shared/types";
import {
  formatSyncTime,
  isJiraConfigured,
  normalizeJiraSiteInput
} from "./app/appHelpers";
import { useBitbucketReviewLogging } from "./app/useBitbucketReviewLogging";
import { useLiveDate } from "./app/useLiveDate";
import { useIssueMetadata } from "./app/useIssueMetadata";
import { useJiraSync } from "./app/useJiraSync";
import { useJiraWorklogs } from "./app/useJiraWorklogs";
import { usePersonalNotes } from "./app/usePersonalNotes";
import { useRecurringActions } from "./app/useRecurringActions";
import { useReleaseUpdates } from "./app/useReleaseUpdates";
import { useSnackbars } from "./app/useSnackbars";
import { useThemeMode } from "./app/useThemeMode";
import { useTickets } from "./app/useTickets";
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
import { WelcomeView, type WelcomeConnectPayload } from "./components/WelcomeView";
import { WeekView } from "./components/WeekView";
import { getDemoConfig } from "./demo/config";
import { createDemoScenario } from "./demo/fixtures";
import { buildWeekCsv } from "./domain/personalNotesCsv";
import {
  getBitbucketRepositorySlugs,
  isBitbucketConfigured,
  mergeReviewSessionStates
} from "./domain/bitbucketReview";
import { buildWeekState, DEFAULT_SETTINGS, getWeekBounds } from "./domain/week";
import { buildDefaultRecurringEvents } from "./domain/recurring";
import { buildMonthState, getMonthAnchor, getMonthWeekStarts, type MonthState } from "./domain/month";
import {
  getFavoriteKeys,
  getBitbucketReviewResult,
  getPersonalNotes,
  getRecurringEvents,
  getRecurringOccurrences,
  getSettings,
  getSyncResult,
  getWeekOverride,
  saveBitbucketReviewResult,
  saveRecurringEvents,
  saveSettings,
  saveWeekOverride
} from "./storage/db";
import { addDays, fromLocalDateKey, toLocalDateKey } from "./utils/date";

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
  const [monthState, setMonthState] = useState<MonthState | undefined>();
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
  const [isTesting, setIsTesting] = useState(false);
  const [isTestingBitbucket, setIsTestingBitbucket] = useState(false);
  const [bitbucketReviewResult, setBitbucketReviewResult] = useState<BitbucketReviewSyncResult | undefined>(
    () => demoScenario?.bitbucketReviewResult
  );
  const [isSyncingReviews, setIsSyncingReviews] = useState(false);
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
  const skipInitialWeekReloadRef = useRef(false);
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

  const runReviewSync = useCallback(
    async (settingsForSync: AppSettings = settings): Promise<BitbucketReviewSyncResult | undefined> => {
      if (demoScenario) {
        setBitbucketReviewResult(demoScenario.bitbucketReviewResult);
        showSuccess("Demo Bitbucket reviews refreshed from seeded fixtures.");
        return demoScenario.bitbucketReviewResult;
      }

      if (!isBitbucketConfigured(settingsForSync)) {
        showError("Connect Bitbucket in Settings before syncing reviews.");
        return undefined;
      }

      setIsSyncingReviews(true);

      try {
        const result = await nativeApi.syncBitbucketReviews({
          settings: settingsForSync,
          weekKey: weekState.weekKey,
          weekStartISO: weekState.weekStartISO,
          weekEndExclusiveISO: weekState.weekEndExclusiveISO
        });
        const merged = mergeReviewSessionStates(result, bitbucketReviewResult);
        await saveBitbucketReviewResult(merged);
        setBitbucketReviewResult(merged);
        showSuccess(`Synced ${merged.sessionCount} Bitbucket review sessions.`);
        return merged;
      } catch (error) {
        showError(error instanceof Error ? error.message : "Unable to sync Bitbucket review sessions.");
        return undefined;
      } finally {
        setIsSyncingReviews(false);
      }
    },
    [
      bitbucketReviewResult,
      demoScenario,
      settings,
      showError,
      showSuccess,
      weekState.weekEndExclusiveISO,
      weekState.weekKey,
      weekState.weekStartISO
    ]
  );

  const handleSync = useCallback(async () => {
    await runSync();
    if (isBitbucketConfigured(settings)) {
      await runReviewSync(settings);
    }
  }, [runReviewSync, runSync, settings]);

  useEffect(() => {
    if (demoScenario) {
      return;
    }

    let isMounted = true;

    const loadInitialState = async () => {
      const weekKey = toLocalDateKey(weekStart);
      const [
        storedSettings,
        storedOverride,
        storedSyncResult,
        storedFavorites,
        storedPersonalNotes,
        storedBitbucketReviewResult,
        storedRecurringEvents,
        storedRecurringOccurrences
      ] = await Promise.all([
        getSettings(),
        getWeekOverride(weekKey),
        getSyncResult(weekKey),
        getFavoriteKeys(),
        getPersonalNotes(weekKey),
        getBitbucketReviewResult(weekKey),
        getRecurringEvents(),
        getRecurringOccurrences(weekKey)
      ]);

      if (!isMounted) {
        return;
      }

      // Seed the prototype defaults the first time the feature is opened so it
      // is discoverable rather than empty; persist so the seed is stable.
      let recurringEventsToUse = storedRecurringEvents;
      if (!recurringEventsToUse) {
        recurringEventsToUse = buildDefaultRecurringEvents();
        await saveRecurringEvents(recurringEventsToUse);
      }

      setSettings(storedSettings);
      setSettingsDraft(storedSettings);
      setWeekOverride(storedOverride);
      setSyncResult(storedSyncResult);
      setFavoriteKeys(storedFavorites);
      setPersonalNotes(storedPersonalNotes);
      setBitbucketReviewResult(storedBitbucketReviewResult);
      setRecurringEvents(recurringEventsToUse);
      setRecurringOccurrences(storedRecurringOccurrences);
      skipInitialWeekReloadRef.current = true;
      setIsBooting(false);
    };

    loadInitialState().catch((error) => {
      console.error(error);
      setIsBooting(false);
      showError("Unable to load local tracker data.");
    });

    return () => {
      isMounted = false;
    };
  }, [showError]);

  useEffect(() => {
    if (demoScenario || isBooting) {
      return;
    }

    if (skipInitialWeekReloadRef.current) {
      skipInitialWeekReloadRef.current = false;
      return;
    }

    let isMounted = true;
    const weekKey = toLocalDateKey(weekStart);

    const loadWeek = async () => {
      const [
        storedOverride,
        storedSyncResult,
        storedPersonalNotes,
        storedBitbucketReviewResult,
        storedRecurringOccurrences
      ] = await Promise.all([
        getWeekOverride(weekKey),
        getSyncResult(weekKey),
        getPersonalNotes(weekKey),
        getBitbucketReviewResult(weekKey),
        getRecurringOccurrences(weekKey)
      ]);

      if (!isMounted) {
        return;
      }

      setWeekOverride(storedOverride);
      setSyncResult(storedSyncResult);
      setPersonalNotes(storedPersonalNotes);
      setBitbucketReviewResult(storedBitbucketReviewResult);
      setRecurringOccurrences(storedRecurringOccurrences);
    };

    loadWeek().catch((error) => {
      console.error(error);
      showError("Unable to load the selected week.");
    });

    return () => {
      isMounted = false;
    };
  }, [demoScenario, isBooting, showError, weekStart]);

  // Build the month grid by aggregating every Monday-week that overlaps the
  // anchored month. The visible week reuses the in-memory weekState (freshest,
  // includes unsaved demo notes); the rest load from local storage.
  useEffect(() => {
    if (view !== "month" || isBooting) {
      return;
    }

    let isMounted = true;

    const loadMonth = async () => {
      const weekStarts = getMonthWeekStarts(monthAnchor);
      const weekStates = await Promise.all(
        weekStarts.map(async (start) => {
          const weekKey = toLocalDateKey(start);
          if (weekKey === weekState.weekKey) {
            return weekState;
          }

          if (demoScenario) {
            const isDemoWeek = weekKey === toLocalDateKey(demoScenario.weekStart);
            return buildWeekState(
              start,
              settings,
              isDemoWeek ? demoScenario.weekOverride : { weekKey, skippedDates: [] },
              isDemoWeek ? demoScenario.syncResult : undefined,
              [],
              currentDate,
              recurringEvents,
              isDemoWeek ? recurringOccurrences : []
            );
          }

          const [storedOverride, storedSyncResult, storedPersonalNotes, storedRecurringOccurrences] =
            await Promise.all([
              getWeekOverride(weekKey),
              getSyncResult(weekKey),
              getPersonalNotes(weekKey),
              getRecurringOccurrences(weekKey)
            ]);
          return buildWeekState(
            start,
            settings,
            storedOverride,
            storedSyncResult,
            storedPersonalNotes,
            currentDate,
            recurringEvents,
            storedRecurringOccurrences
          );
        })
      );

      if (!isMounted) {
        return;
      }

      setMonthState(buildMonthState(monthAnchor, currentDate, settings, weekStates));
    };

    loadMonth().catch((error) => {
      console.error(error);
      if (isMounted) {
        showError("Unable to load the selected month.");
      }
    });

    return () => {
      isMounted = false;
    };
  }, [
    currentDate,
    demoScenario,
    isBooting,
    monthAnchor,
    recurringEvents,
    recurringOccurrences,
    settings,
    showError,
    view,
    weekState
  ]);

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

  useEffect(() => {
    if (view === "review" && !isBitbucketReady) {
      setView("week");
    }
  }, [isBitbucketReady, view]);

  const goToWeek = (date: Date) => {
    setWeekStart(getWeekBounds(date).weekStart);
  };

  const goToPreviousWeek = () => {
    setWeekStart((current) => addDays(current, -7));
  };

  const goToCurrentWeek = () => {
    goToWeek(currentDate);
  };

  const goToNextWeek = () => {
    setWeekStart((current) => addDays(current, 7));
  };

  const goToPreviousMonth = () => {
    setMonthAnchor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setMonthAnchor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1));
  };

  const goToCurrentMonth = () => {
    setMonthAnchor(getMonthAnchor(currentDate));
  };

  const openWeekFromMonth = (date: Date) => {
    goToWeek(date);
    setView("week");
  };

  const handleViewChange = (nextView: AppView) => {
    if (nextView === "today" || nextView === "tickets") {
      goToCurrentWeek();
    }
    if (nextView === "month") {
      setMonthAnchor(getMonthAnchor(currentDate));
    }
    setView(nextView);
  };

  const handleLogTicket = (ticket: JiraTicket) => {
    setSelectedTicket(ticket);
    setView("today");
  };

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

  const handleSaveSettings = async () => {
    const cleanedSettings: AppSettings = {
      ...settingsDraft,
      jiraBaseUrl: normalizeJiraSiteInput(settingsDraft.jiraBaseUrl),
      jiraEmail: settingsDraft.jiraEmail.trim(),
      bitbucketEmail: settingsDraft.bitbucketEmail.trim(),
      bitbucketApiToken: settingsDraft.bitbucketApiToken.trim(),
      bitbucketWorkspace: settingsDraft.bitbucketWorkspace.trim(),
      bitbucketRepositories: getBitbucketRepositorySlugs(settingsDraft).join(", "),
      bitbucketReviewBucketIssueKey: settingsDraft.bitbucketReviewBucketIssueKey.trim().toUpperCase(),
      weeklyTargetHours: Math.max(Number(settingsDraft.weeklyTargetHours) || 40, 1),
      workingDays: settingsDraft.workingDays.length ? settingsDraft.workingDays : [1, 2, 3, 4, 5]
    };

    if (!demoScenario) {
      await saveSettings(cleanedSettings);
    }
    setSettings(cleanedSettings);
    setSettingsDraft(cleanedSettings);
    showSuccess(demoScenario ? "Demo settings updated for this preview." : "Settings saved locally.");
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

  const handleWelcomeConnect = async (payload: WelcomeConnectPayload): Promise<JiraConnectionResult> => {
    const cleanedSettings: AppSettings = {
      ...settingsDraft,
      ...payload,
      jiraBaseUrl: normalizeJiraSiteInput(payload.jiraBaseUrl),
      jiraEmail: payload.jiraEmail.trim(),
      weeklyTargetHours: settingsDraft.weeklyTargetHours || DEFAULT_SETTINGS.weeklyTargetHours,
      workingDays: settingsDraft.workingDays.length ? settingsDraft.workingDays : DEFAULT_SETTINGS.workingDays
    };

    const result = await nativeApi.testJiraConnection(cleanedSettings);

    if (result.ok) {
      await saveSettings(cleanedSettings);
      await runSync(cleanedSettings);
      setSettings(cleanedSettings);
      setSettingsDraft(cleanedSettings);
      showSuccess(result.message);
      setWelcomeConnected(true);
      void loadTickets(cleanedSettings);
    } else {
      showError(result.message);
    }

    return result;
  };

  const handleTestConnection = async () => {
    setIsTesting(true);

    try {
      if (demoScenario) {
        const result: JiraConnectionResult = {
          ok: true,
          accountId: demoScenario.syncResult.accountId,
          displayName: demoScenario.syncResult.displayName,
          message: `Connected as ${demoScenario.syncResult.displayName}.`
        };
        showSuccess(result.message);
        return;
      }

      const result = await nativeApi.testJiraConnection({
        ...settingsDraft,
        jiraBaseUrl: normalizeJiraSiteInput(settingsDraft.jiraBaseUrl),
        jiraEmail: settingsDraft.jiraEmail.trim()
      });
      if (result.ok) {
        showSuccess(result.message);
      } else {
        showError(result.message);
      }
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestBitbucketConnection = async () => {
    setIsTestingBitbucket(true);

    try {
      const cleanedSettings: AppSettings = {
        ...settingsDraft,
        bitbucketEmail: settingsDraft.bitbucketEmail.trim(),
        bitbucketApiToken: settingsDraft.bitbucketApiToken.trim(),
        bitbucketWorkspace: settingsDraft.bitbucketWorkspace.trim(),
        bitbucketRepositories: getBitbucketRepositorySlugs(settingsDraft).join(", ")
      };

      if (demoScenario) {
        showSuccess("Connected to Bitbucket as Demo Reviewer; found Explorer Web.");
        return;
      }

      const result = await nativeApi.testBitbucketConnection(cleanedSettings);
      if (result.ok) {
        showSuccess(result.message);
      } else {
        showError(result.message);
      }
    } finally {
      setIsTestingBitbucket(false);
    }
  };

  const syncState = isSyncing || isSyncingReviews ? "syncing" : syncResult ? "synced" : "stale";
  const syncLabel = isSyncing || isSyncingReviews ? "SYNCING…" : formatSyncTime(syncResult);

  const openAddTime = (date?: Date) => {
    setEditingWorklog(undefined);
    setEditingPersonalNote(undefined);
    setLogError(undefined);

    const preferredDateKey = date ? toLocalDateKey(date) : toLocalDateKey(currentDate);
    const fallbackDateKey =
      [...weekState.days]
        .reverse()
        .find((day) => day.isConfiguredWorkingDay && !day.isSkipped && day.dateKey <= preferredDateKey)?.dateKey ??
      addTimeDateOptions[0] ??
      weekState.days[0]?.dateKey ??
      preferredDateKey;
    const selectedDateKey = addTimeDateOptions.includes(preferredDateKey) ? preferredDateKey : fallbackDateKey;
    const selectedDate = fromLocalDateKey(selectedDateKey);
    selectedDate.setHours(currentDate.getHours(), currentDate.getMinutes(), 0, 0);

    setAddModalDate(selectedDate);
  };

  const openTrackingShortcut = useCallback(() => {
    if (!isConfigured || welcomeConnected || isBooting || addModalDate || editingWorklog || editingPersonalNote) {
      return;
    }

    setWeekStart(getWeekBounds(currentDate).weekStart);
    setEditingWorklog(undefined);
    setEditingPersonalNote(undefined);
    setLogError(undefined);

    const selectedDate = new Date(currentDate);
    selectedDate.setSeconds(0, 0);
    setAddModalDate(selectedDate);
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

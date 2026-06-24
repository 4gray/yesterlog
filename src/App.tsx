import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppSettings,
  BitbucketReviewSession,
  BitbucketReviewSyncResult,
  BitbucketReviewTargetMode,
  JiraConnectionResult,
  JiraTicket,
  JiraWorklog,
  PersonalNote,
  RecurringEvent,
  RecurringOccurrence,
  SyncResult,
  WeekdayNumber,
  WeekOverride
} from "../shared/types";
import {
  formatPersonalNoteCount,
  formatSyncTime,
  groupPersonalNotesByWeek,
  isJiraConfigured,
  mergeImportedPersonalNotes,
  normalizeJiraSiteInput,
  sortPersonalNotes,
  updateVisiblePersonalNotes
} from "./app/appHelpers";
import { useLiveDate } from "./app/useLiveDate";
import { useIssueMetadata } from "./app/useIssueMetadata";
import { useJiraSync } from "./app/useJiraSync";
import { useReleaseUpdates } from "./app/useReleaseUpdates";
import { useSnackbars } from "./app/useSnackbars";
import { useThemeMode } from "./app/useThemeMode";
import { useTickets } from "./app/useTickets";
import { nativeApi } from "./api/native";
import { AddTimeModal } from "./components/AddTimeModal";
import type { RecurringEventDraft } from "./components/SettingsView";
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
import { buildWeekCsv, parsePersonalNotesCsv } from "./domain/personalNotesCsv";
import {
  buildReviewWorklogComment,
  getBitbucketRepositorySlugs,
  getReviewTargetIssueKey,
  isBitbucketConfigured,
  markReviewSessionsLogged,
  mergeReviewSessionStates
} from "./domain/bitbucketReview";
import { mergeCreatedWorklogIntoSyncResult } from "./domain/syncResult";
import { buildWeekState, DEFAULT_SETTINGS, getWeekBounds } from "./domain/week";
import { buildDefaultRecurringEvents, getRecurringCandidates, indexOccurrences } from "./domain/recurring";
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
  savePersonalNotes,
  saveRecurringEvents,
  saveRecurringOccurrences,
  saveSettings,
  saveSyncResult,
  saveWeekOverride
} from "./storage/db";
import { addDays, formatClock, formatDuration, fromLocalDateKey, isoWeekday, toLocalDateKey } from "./utils/date";

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
  const [isImportingPersonalNotes, setIsImportingPersonalNotes] = useState(false);
  const [isLogging, setIsLogging] = useState(false);
  const [isLoggingReview, setIsLoggingReview] = useState(false);
  const [isDeletingWorklog, setIsDeletingWorklog] = useState(false);
  const [logError, setLogError] = useState<string | undefined>();
  const [bitbucketReviewResult, setBitbucketReviewResult] = useState<BitbucketReviewSyncResult | undefined>(
    () => demoScenario?.bitbucketReviewResult
  );
  const [isSyncingReviews, setIsSyncingReviews] = useState(false);
  const [reviewTargetMode, setReviewTargetMode] = useState<BitbucketReviewTargetMode>("reviewed-ticket");
  const { snackbars, dismissSnackbar, showSnackbar, showSuccess, showError, showInfo } = useSnackbars();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [addModalDate, setAddModalDate] = useState<Date | undefined>();
  const [editingWorklog, setEditingWorklog] = useState<JiraWorklog | undefined>();
  const [editingPersonalNote, setEditingPersonalNote] = useState<PersonalNote | undefined>();
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

  const handleImportPersonalNotes = async (file: File) => {
    setIsImportingPersonalNotes(true);

    try {
      const importResult = parsePersonalNotesCsv(await file.text());

      if (importResult.notes.length === 0) {
        showError("No personal notes found. Import reads LOCAL-NOTE rows from exported weekly CSV files.");
        return;
      }

      const notesByWeek = groupPersonalNotesByWeek(importResult.notes);

      if (demoScenario) {
        const visibleImportedNotes = notesByWeek.get(weekState.weekKey) ?? [];
        if (visibleImportedNotes.length === 0) {
          showInfo("The CSV has no personal notes for this demo week.");
          return;
        }

        const merged = mergeImportedPersonalNotes(personalNotes, visibleImportedNotes);
        setPersonalNotes(merged.notes);
        if (merged.addedCount > 0) {
          showSuccess(`Imported ${formatPersonalNoteCount(merged.addedCount)} into this demo week.`);
        } else {
          showInfo("No new personal notes imported; this demo week already has matching notes.");
        }
        return;
      }

      let addedCount = 0;
      let visibleWeekNotes: PersonalNote[] | undefined;

      for (const [weekKey, importedWeekNotes] of notesByWeek) {
        const storedWeekNotes = weekKey === weekState.weekKey ? personalNotes : await getPersonalNotes(weekKey);
        const merged = mergeImportedPersonalNotes(storedWeekNotes, importedWeekNotes);
        addedCount += merged.addedCount;

        if (merged.addedCount > 0) {
          await savePersonalNotes(weekKey, merged.notes);
        }

        if (weekKey === weekState.weekKey) {
          visibleWeekNotes = merged.notes;
        }
      }

      if (visibleWeekNotes) {
        setPersonalNotes(visibleWeekNotes);
      }

      if (addedCount > 0) {
        showSuccess(`Imported ${formatPersonalNoteCount(addedCount)} from ${file.name}.`);
      } else {
        showInfo("No new personal notes imported; stored notes already match that CSV.");
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unable to import personal notes from that CSV.");
    } finally {
      setIsImportingPersonalNotes(false);
    }
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

  const handleAddWorklog = async (payload: {
    issueKey: string;
    ticket: JiraTicket;
    timeSpentSeconds: number;
    startedISO: string;
    comment?: string;
  }) => {
    setIsLogging(true);
    setLogError(undefined);

    try {
      if (demoScenario) {
        showSuccess(`Demo logged ${formatDuration(payload.timeSpentSeconds / 3600)} to ${payload.issueKey}.`);
        return true;
      }

      const { ticket, ...worklogPayload } = payload;
      const result = await nativeApi.addWorklog({ settings, ...worklogPayload });
      showSuccess(`Logged ${formatDuration(result.timeSpentSeconds / 3600)} to ${result.issueKey}.`);
      const syncedResult = await runSync(settings, { queueAfterCurrent: true });
      const mergedSyncResult = mergeCreatedWorklogIntoSyncResult(syncedResult ?? syncResult, {
        ticket,
        worklogId: result.worklogId,
        startedISO: payload.startedISO,
        timeSpentSeconds: result.timeSpentSeconds,
        comment: payload.comment,
        syncedAtISO: new Date().toISOString()
      });

      if (mergedSyncResult && mergedSyncResult !== syncedResult && mergedSyncResult !== syncResult) {
        await saveSyncResult(mergedSyncResult);
        setSyncResult(mergedSyncResult);
      }
      await loadTickets();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to log time to Jira.";
      setLogError(message);
      showError(message);
      return false;
    } finally {
      setIsLogging(false);
    }
  };

  const handleLogReviewSessions = async (
    sessionIds: string[],
    targetMode: BitbucketReviewTargetMode,
    durationOverrides: Record<string, number> = {}
  ): Promise<boolean> => {
    const sourceResult = visibleBitbucketReviewResult;
    if (!sourceResult || sessionIds.length === 0) {
      showInfo("No review sessions selected.");
      return false;
    }

    const sessionsById = new Map(sourceResult.sessions.map((session) => [session.id, session]));
    const sessionsToLog = sessionIds
      .map((sessionId) => sessionsById.get(sessionId))
      .filter((session): session is BitbucketReviewSession => Boolean(session && session.status !== "logged"));

    if (sessionsToLog.length === 0) {
      showInfo("Selected review sessions are already logged.");
      return false;
    }

    setIsLoggingReview(true);
    setLogError(undefined);

    const loggedSessions: Array<{
      sessionId: string;
      logged: {
        issueKey: string;
        worklogId: string;
        loggedAt: string;
        targetMode: BitbucketReviewTargetMode;
      };
    }> = [];
    let failure: string | undefined;

    try {
      if (demoScenario) {
        const demoLogged = sessionsToLog.flatMap((session, index) => {
          const issueKey = getReviewTargetIssueKey(session, settings, targetMode);
          return issueKey
            ? [
                {
                  sessionId: session.id,
                  logged: {
                    issueKey,
                    worklogId: `demo-review-wl-${index + 1}`,
                    loggedAt: new Date().toISOString(),
                    targetMode
                  }
                }
              ]
            : [];
        });
        const updated = markReviewSessionsLogged(sourceResult, demoLogged);
        setBitbucketReviewResult(updated);
        showSuccess(`Demo logged ${demoLogged.length} review sessions.`);
        return demoLogged.length > 0;
      }

      for (const session of sessionsToLog) {
        const issueKey = getReviewTargetIssueKey(session, settings, targetMode);
        const timeSpentSeconds = durationOverrides[session.id] && durationOverrides[session.id] > 0
          ? durationOverrides[session.id]
          : session.estimatedSeconds;

        if (!issueKey) {
          continue;
        }

        try {
          const result = await nativeApi.addWorklog({
            settings,
            issueKey,
            timeSpentSeconds,
            startedISO: session.startedISO,
            comment: buildReviewWorklogComment(session)
          });
          loggedSessions.push({
            sessionId: session.id,
            logged: {
              issueKey,
              worklogId: result.worklogId,
              loggedAt: new Date().toISOString(),
              targetMode
            }
          });
        } catch (error) {
          failure = error instanceof Error ? error.message : `Unable to log review session for PR #${session.pullRequestId}.`;
          break;
        }
      }

      if (loggedSessions.length > 0) {
        const updated = markReviewSessionsLogged(sourceResult, loggedSessions);
        await saveBitbucketReviewResult(updated);
        setBitbucketReviewResult(updated);
        showSuccess(`Logged ${loggedSessions.length} review ${loggedSessions.length === 1 ? "session" : "sessions"} to Jira.`);
        await runSync(settings, { queueAfterCurrent: true });
        await loadTickets();
      }

      if (failure) {
        setLogError(failure);
        showError(failure);
        return false;
      }

      if (loggedSessions.length === 0) {
        showError("No selected review sessions have a Jira target.");
        return false;
      }

      return true;
    } finally {
      setIsLoggingReview(false);
    }
  };

  const handleUpdateWorklog = async (payload: {
    issueKey: string;
    timeSpentSeconds: number;
    startedISO: string;
    comment?: string;
  }) => {
    if (!editingWorklog) {
      return false;
    }

    setIsLogging(true);
    setLogError(undefined);

    try {
      if (demoScenario) {
        showSuccess(`Demo updated ${formatDuration(payload.timeSpentSeconds / 3600)} on ${editingWorklog.issueKey}.`);
        return true;
      }

      const result = await nativeApi.updateWorklog({
        settings,
        issueKey: editingWorklog.issueKey,
        worklogId: editingWorklog.id,
        timeSpentSeconds: payload.timeSpentSeconds,
        startedISO: payload.startedISO,
        comment: payload.comment
      });
      showSuccess(`Updated ${formatDuration(result.timeSpentSeconds / 3600)} on ${result.issueKey}.`);
      await runSync(settings, { queueAfterCurrent: true });
      await loadTickets();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update Jira worklog.";
      setLogError(message);
      showError(message);
      return false;
    } finally {
      setIsLogging(false);
    }
  };

  const handleDeleteWorklog = async () => {
    if (!editingWorklog) {
      return false;
    }

    setIsDeletingWorklog(true);
    setLogError(undefined);

    try {
      if (demoScenario) {
        showSuccess(`Demo deleted worklog from ${editingWorklog.issueKey}.`);
        setEditingWorklog(undefined);
        return true;
      }

      const result = await nativeApi.deleteWorklog({
        settings,
        issueKey: editingWorklog.issueKey,
        worklogId: editingWorklog.id
      });
      showSuccess(`Deleted worklog from ${result.issueKey}.`);
      await runSync(settings, { queueAfterCurrent: true });
      await loadTickets();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete Jira worklog.";
      setLogError(message);
      showError(message);
      return false;
    } finally {
      setIsDeletingWorklog(false);
    }
  };

  const handleAddPersonalNote = async (payload: {
    title?: string;
    text: string;
    timeSpentSeconds: number;
    startedISO: string;
  }) => {
    const started = new Date(payload.startedISO);
    const noteWeekKey = toLocalDateKey(getWeekBounds(started).weekStart);
    const now = new Date().toISOString();
    const note: PersonalNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      weekKey: noteWeekKey,
      dateKey: toLocalDateKey(started),
      title: payload.title?.trim() || undefined,
      text: payload.text.trim(),
      timeSpentSeconds: Math.round(payload.timeSpentSeconds),
      startedISO: payload.startedISO,
      createdAt: now,
      updatedAt: now
    };

    if (!note.text || note.timeSpentSeconds <= 0) {
      const message = "Add a note and a duration before saving.";
      setLogError(message);
      showError(message);
      return false;
    }

    try {
      if (demoScenario) {
        setPersonalNotes((current) => [...current, note]);
        setLogError(undefined);
        showSuccess(`Demo saved ${formatDuration(note.timeSpentSeconds / 3600)} as a local note.`);
        return true;
      }

      const currentNotes = noteWeekKey === weekState.weekKey ? personalNotes : await getPersonalNotes(noteWeekKey);
      const nextNotes = sortPersonalNotes([...currentNotes, note]);
      await savePersonalNotes(noteWeekKey, nextNotes);
      if (noteWeekKey === weekState.weekKey) {
        setPersonalNotes(nextNotes);
      }
      setLogError(undefined);
      showSuccess(`Saved ${formatDuration(note.timeSpentSeconds / 3600)} as a local note.`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save the personal note locally.";
      setLogError(message);
      showError(message);
      return false;
    }
  };

  const handleUpdatePersonalNote = async (payload: {
    title?: string;
    text: string;
    timeSpentSeconds: number;
    startedISO: string;
  }) => {
    if (!editingPersonalNote) {
      return false;
    }

    const started = new Date(payload.startedISO);
    const noteWeekKey = toLocalDateKey(getWeekBounds(started).weekStart);
    const nextNote: PersonalNote = {
      ...editingPersonalNote,
      weekKey: noteWeekKey,
      dateKey: toLocalDateKey(started),
      title: payload.title?.trim() || undefined,
      text: payload.text.trim(),
      timeSpentSeconds: Math.round(payload.timeSpentSeconds),
      startedISO: payload.startedISO,
      updatedAt: new Date().toISOString()
    };

    if (!nextNote.text || nextNote.timeSpentSeconds <= 0) {
      const message = "Add a note and a duration before saving.";
      setLogError(message);
      showError(message);
      return false;
    }

    setIsLogging(true);
    setLogError(undefined);

    try {
      if (demoScenario) {
        setPersonalNotes((current) => updateVisiblePersonalNotes(current, editingPersonalNote, nextNote, weekState.weekKey));
        showSuccess(`Demo updated ${formatDuration(nextNote.timeSpentSeconds / 3600)} local note.`);
        return true;
      }

      if (editingPersonalNote.weekKey === noteWeekKey) {
        const currentNotes =
          noteWeekKey === weekState.weekKey ? personalNotes : await getPersonalNotes(editingPersonalNote.weekKey);
        const nextNotes = sortPersonalNotes([
          ...currentNotes.filter((note) => note.id !== editingPersonalNote.id),
          nextNote
        ]);

        await savePersonalNotes(noteWeekKey, nextNotes);
        if (noteWeekKey === weekState.weekKey) {
          setPersonalNotes(nextNotes);
        }
      } else {
        const [previousWeekNotes, nextWeekNotes] = await Promise.all([
          editingPersonalNote.weekKey === weekState.weekKey
            ? Promise.resolve(personalNotes)
            : getPersonalNotes(editingPersonalNote.weekKey),
          noteWeekKey === weekState.weekKey ? Promise.resolve(personalNotes) : getPersonalNotes(noteWeekKey)
        ]);
        const previousWeekNextNotes = previousWeekNotes.filter((note) => note.id !== editingPersonalNote.id);
        const nextWeekNextNotes = sortPersonalNotes([
          ...nextWeekNotes.filter((note) => note.id !== editingPersonalNote.id),
          nextNote
        ]);

        await Promise.all([
          savePersonalNotes(editingPersonalNote.weekKey, previousWeekNextNotes),
          savePersonalNotes(noteWeekKey, nextWeekNextNotes)
        ]);

        if (editingPersonalNote.weekKey === weekState.weekKey) {
          setPersonalNotes(previousWeekNextNotes);
        } else if (noteWeekKey === weekState.weekKey) {
          setPersonalNotes(nextWeekNextNotes);
        }
      }

      showSuccess(`Updated ${formatDuration(nextNote.timeSpentSeconds / 3600)} local note.`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update the personal note locally.";
      setLogError(message);
      showError(message);
      return false;
    } finally {
      setIsLogging(false);
    }
  };

  const handleDeletePersonalNote = async () => {
    if (!editingPersonalNote) {
      return false;
    }
    const note = editingPersonalNote;
    const remove = (list: PersonalNote[]) => list.filter((candidate) => candidate.id !== note.id);

    try {
      if (demoScenario) {
        setPersonalNotes((current) => remove(current));
        showSuccess("Deleted the local note.");
        return true;
      }

      const current = note.weekKey === weekState.weekKey ? personalNotes : await getPersonalNotes(note.weekKey);
      const next = remove(current);
      await savePersonalNotes(note.weekKey, next);
      if (note.weekKey === weekState.weekKey) {
        setPersonalNotes(next);
      }
      showSuccess("Deleted the local note.");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete the personal note locally.";
      setLogError(message);
      showError(message);
      return false;
    }
  };

  const persistRecurringEvents = async (next: RecurringEvent[]) => {
    setRecurringEvents(next);
    if (!demoScenario) {
      await saveRecurringEvents(next);
    }
  };

  const handleSaveRecurringEvent = async (draft: RecurringEventDraft) => {
    const title = draft.title.trim();
    if (!title || draft.daysOfWeek.length === 0) {
      return;
    }

    const now = new Date().toISOString();
    const next = draft.id
      ? recurringEvents.map((event) =>
          event.id === draft.id
            ? {
                ...event,
                title,
                daysOfWeek: [...draft.daysOfWeek],
                localTime: draft.localTime,
                durationMinutes: draft.durationMinutes,
                defaultNote: draft.defaultNote,
                updatedAt: now
              }
            : event
        )
      : [
          ...recurringEvents,
          {
            id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            title,
            daysOfWeek: [...draft.daysOfWeek],
            localTime: draft.localTime,
            durationMinutes: draft.durationMinutes,
            defaultNote: draft.defaultNote,
            active: true,
            createdAt: now,
            updatedAt: now
          }
        ];

    try {
      await persistRecurringEvents(next);
      showSuccess(draft.id ? "Updated recurring event." : "Added recurring event.");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unable to save the recurring event.");
    }
  };

  const handleDeleteRecurringEvent = async (id: string) => {
    const next = recurringEvents.filter((event) => event.id !== id);
    try {
      await persistRecurringEvents(next);
      showSuccess("Removed recurring event.");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unable to remove the recurring event.");
    }
  };

  const handleToggleRecurringEvent = async (id: string) => {
    const now = new Date().toISOString();
    const next = recurringEvents.map((event) =>
      event.id === id ? { ...event, active: !event.active, updatedAt: now } : event
    );
    try {
      await persistRecurringEvents(next);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unable to update the recurring event.");
    }
  };

  // Confirm/skip writes the per-day resolution; the dateKey always belongs to a
  // single week, so we scope the occurrence to that week (like personal notes).
  const upsertRecurringOccurrence = async (occurrence: RecurringOccurrence) => {
    const replace = (list: RecurringOccurrence[]) => [
      ...list.filter(
        (item) => !(item.eventId === occurrence.eventId && item.dateKey === occurrence.dateKey)
      ),
      occurrence
    ];

    if (demoScenario) {
      setRecurringOccurrences((current) => replace(current));
      return true;
    }

    try {
      const current =
        occurrence.weekKey === weekState.weekKey
          ? recurringOccurrences
          : await getRecurringOccurrences(occurrence.weekKey);
      const next = replace(current);
      await saveRecurringOccurrences(occurrence.weekKey, next);
      if (occurrence.weekKey === weekState.weekKey) {
        setRecurringOccurrences(next);
      }
      return true;
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unable to save the recurring entry locally.");
      return false;
    }
  };

  const handleConfirmRecurring = async (payload: {
    eventId: string;
    dateKey: string;
    timeSpentSeconds: number;
    note?: string;
  }) => {
    const event = recurringEvents.find((candidate) => candidate.id === payload.eventId);
    const weekKey = toLocalDateKey(getWeekBounds(fromLocalDateKey(payload.dateKey)).weekStart);
    const existing = recurringOccurrences.find(
      (item) => item.eventId === payload.eventId && item.dateKey === payload.dateKey
    );
    const now = new Date().toISOString();
    const ok = await upsertRecurringOccurrence({
      eventId: payload.eventId,
      weekKey,
      dateKey: payload.dateKey,
      status: "confirmed",
      timeSpentSeconds: Math.round(payload.timeSpentSeconds),
      note: payload.note?.trim() || undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });
    if (ok) {
      showSuccess(`Logged ${formatClock(payload.timeSpentSeconds)} to ${event?.title ?? "recurring event"} locally.`);
    }
    return ok;
  };

  const handleSkipRecurring = async (eventId: string, dateKey: string) => {
    const weekKey = toLocalDateKey(getWeekBounds(fromLocalDateKey(dateKey)).weekStart);
    const existing = recurringOccurrences.find(
      (item) => item.eventId === eventId && item.dateKey === dateKey
    );
    const now = new Date().toISOString();
    return upsertRecurringOccurrence({
      eventId,
      weekKey,
      dateKey,
      status: "skipped",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });
  };

  // Removes a logged/skipped occurrence record entirely so the day reverts to a
  // pending suggestion — the forgiving "undo" for an accidental confirm.
  const handleDeleteRecurringOccurrence = async (eventId: string, dateKey: string) => {
    const weekKey = toLocalDateKey(getWeekBounds(fromLocalDateKey(dateKey)).weekStart);
    const event = recurringEvents.find((candidate) => candidate.id === eventId);
    const remove = (list: RecurringOccurrence[]) =>
      list.filter((item) => !(item.eventId === eventId && item.dateKey === dateKey));

    if (demoScenario) {
      setRecurringOccurrences((current) => remove(current));
      showSuccess(`Removed ${event?.title ?? "recurring entry"} — it's a suggestion again.`);
      return true;
    }

    try {
      const current =
        weekKey === weekState.weekKey ? recurringOccurrences : await getRecurringOccurrences(weekKey);
      const next = remove(current);
      await saveRecurringOccurrences(weekKey, next);
      if (weekKey === weekState.weekKey) {
        setRecurringOccurrences(next);
      }
      showSuccess(`Removed ${event?.title ?? "recurring entry"} — it's a suggestion again.`);
      return true;
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unable to remove the recurring entry locally.");
      return false;
    }
  };

  const recurringCandidatesForDate = useCallback(
    (dateKey: string) => {
      const weekday = isoWeekday(fromLocalDateKey(dateKey)) as WeekdayNumber;
      return getRecurringCandidates(recurringEvents, indexOccurrences(recurringOccurrences), dateKey, weekday);
    },
    [recurringEvents, recurringOccurrences]
  );

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

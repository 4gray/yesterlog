import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AppSettings,
  JiraConnectionResult,
  JiraIssueTypeInfo,
  JiraTicket,
  SyncResult,
  TicketsResult,
  WeekOverride
} from "../shared/types";
import { nativeApi } from "./api/native";
import { AddTimeModal } from "./components/AddTimeModal";
import { ReportsView } from "./components/ReportsView";
import { SettingsView } from "./components/SettingsView";
import { Sidebar, type AppView, type ThemeMode } from "./components/Sidebar";
import { TicketsView } from "./components/TicketsView";
import { TodayView } from "./components/TodayView";
import { WeekView } from "./components/WeekView";
import { buildWeekState, DEFAULT_SETTINGS, getWeekBounds } from "./domain/week";
import {
  getFavoriteKeys,
  getSettings,
  getSyncResult,
  getWeekOverride,
  saveFavoriteKeys,
  saveSettings,
  saveSyncResult,
  saveWeekOverride
} from "./storage/db";
import { addDays, formatDuration, toLocalDateKey } from "./utils/date";

const isJiraConfigured = (settings: AppSettings) =>
  Boolean(settings.jiraBaseUrl.trim() && settings.jiraEmail.trim() && settings.jiraApiToken.trim());

const normalizeJiraSiteInput = (rawSite: string) => {
  const trimmed = rawSite.trim().replace(/\/+$/, "");

  if (!trimmed) {
    return "";
  }

  const candidate = trimmed.includes("://")
    ? trimmed
    : `https://${trimmed.includes(".") ? trimmed : `${trimmed}.atlassian.net`}`;

  try {
    const url = new URL(candidate);
    return `${url.protocol}//${url.host}`;
  } catch {
    return trimmed;
  }
};

const formatSyncTime = (syncResult?: SyncResult) => {
  if (!syncResult) {
    return "NOT SYNCED";
  }

  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })
    .format(new Date(syncResult.syncedAt))
    .toUpperCase();
  return `SYNCED ${time}`;
};

export const App = () => {
  const [view, setView] = useState<AppView>("week");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [weekStart, setWeekStart] = useState(() => getWeekBounds(new Date()).weekStart);
  const [weekOverride, setWeekOverride] = useState<WeekOverride>(() => ({
    weekKey: toLocalDateKey(getWeekBounds(new Date()).weekStart),
    skippedDates: []
  }));
  const [syncResult, setSyncResult] = useState<SyncResult | undefined>();
  const [isBooting, setIsBooting] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [syncError, setSyncError] = useState<string | undefined>();
  const [syncMessage, setSyncMessage] = useState<string | undefined>();
  const [savedMessage, setSavedMessage] = useState<string | undefined>();
  const [testResult, setTestResult] = useState<JiraConnectionResult | undefined>();
  const [tickets, setTickets] = useState<TicketsResult | undefined>();
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsError, setTicketsError] = useState<string | undefined>();
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<JiraTicket | undefined>();
  const [isLogging, setIsLogging] = useState(false);
  const [logError, setLogError] = useState<string | undefined>();
  const [logMessage, setLogMessage] = useState<string | undefined>();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [addModalDate, setAddModalDate] = useState<Date | undefined>();
  const [theme, setTheme] = useState<ThemeMode | null>(() => {
    try {
      const stored = localStorage.getItem("sprintf-theme");
      return stored === "light" || stored === "dark" ? stored : null;
    } catch {
      return null;
    }
  });
  const [systemLight, setSystemLight] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches === true
  );

  const effectiveTheme: ThemeMode = theme ?? (systemLight ? "light" : "dark");

  const weekState = useMemo(
    () => buildWeekState(weekStart, settings, weekOverride, syncResult),
    [settings, syncResult, weekOverride, weekStart]
  );

  const isConfigured = isJiraConfigured(settings);

  const hoursByKey = useMemo(() => {
    const map: Record<string, number> = {};
    if (syncResult) {
      for (const bucket of Object.values(syncResult.daySummaries)) {
        for (const issue of bucket.issues) {
          map[issue.key] = (map[issue.key] ?? 0) + issue.loggedSeconds / 3600;
        }
      }
    }
    return map;
  }, [syncResult]);

  const issueUrlsByKey = useMemo(() => {
    const map: Record<string, string> = {};
    if (syncResult) {
      for (const bucket of Object.values(syncResult.daySummaries)) {
        for (const issue of bucket.issues) {
          if (issue.url) {
            map[issue.key] = issue.url;
          }
        }
      }
    }
    return map;
  }, [syncResult]);

  const issueTypesByKey = useMemo(() => {
    const map: Record<string, JiraIssueTypeInfo> = {};
    if (syncResult) {
      for (const bucket of Object.values(syncResult.daySummaries)) {
        for (const issue of bucket.issues) {
          if (issue.issueType) {
            map[issue.key] = issue.issueType;
          }
        }
      }
    }

    for (const ticket of [...(tickets?.inProgress ?? []), ...(tickets?.recentlyClosed ?? [])]) {
      if (ticket.issueType) {
        map[ticket.key] = ticket.issueType;
      }
    }

    if (selectedTicket?.issueType) {
      map[selectedTicket.key] = selectedTicket.issueType;
    }

    return map;
  }, [selectedTicket, syncResult, tickets]);

  const todayKey = toLocalDateKey(new Date());
  const todayBucket = syncResult?.daySummaries[todayKey];
  const todayWorklogs = todayBucket?.worklogs ?? [];
  const todayTrackedHours = (todayBucket?.trackedSeconds ?? 0) / 3600;

  const ticketOptions = useMemo(() => {
    const map = new Map<string, JiraTicket>();
    const all = [...(tickets?.inProgress ?? []), ...(tickets?.recentlyClosed ?? [])];
    if (selectedTicket) {
      map.set(selectedTicket.key, selectedTicket);
    }
    for (const key of favoriteKeys) {
      const ticket = all.find((candidate) => candidate.key === key);
      if (ticket) {
        map.set(key, ticket);
      }
    }
    for (const ticket of tickets?.inProgress ?? []) {
      map.set(ticket.key, ticket);
    }
    return [...map.values()];
  }, [favoriteKeys, selectedTicket, tickets]);

  const touchedNotLogged = useMemo(() => {
    const loggedKeys = new Set(todayWorklogs.map((worklog) => worklog.issueKey));
    return (tickets?.inProgress ?? []).filter((ticket) => !loggedKeys.has(ticket.key));
  }, [tickets, todayWorklogs]);

  const loadTickets = useCallback(async () => {
    if (!isConfigured) {
      setTickets(undefined);
      setTicketsError(undefined);
      return;
    }

    setTicketsLoading(true);
    setTicketsError(undefined);

    try {
      const result = await nativeApi.fetchAssignedTickets({ settings });
      setTickets(result);
    } catch (error) {
      setTicketsError(error instanceof Error ? error.message : "Unable to load tickets.");
    } finally {
      setTicketsLoading(false);
    }
  }, [isConfigured, settings]);

  useEffect(() => {
    let isMounted = true;

    const loadInitialState = async () => {
      const [storedSettings, storedOverride, storedSyncResult, storedFavorites] = await Promise.all([
        getSettings(),
        getWeekOverride(toLocalDateKey(weekStart)),
        getSyncResult(toLocalDateKey(weekStart)),
        getFavoriteKeys()
      ]);

      if (!isMounted) {
        return;
      }

      setSettings(storedSettings);
      setSettingsDraft(storedSettings);
      setWeekOverride(storedOverride);
      setSyncResult(storedSyncResult);
      setFavoriteKeys(storedFavorites);
      setIsBooting(false);
    };

    loadInitialState().catch((error) => {
      console.error(error);
      setIsBooting(false);
      setSyncError("Unable to load local tracker data.");
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const weekKey = toLocalDateKey(weekStart);

    const loadWeek = async () => {
      const [storedOverride, storedSyncResult] = await Promise.all([
        getWeekOverride(weekKey),
        getSyncResult(weekKey)
      ]);

      if (!isMounted) {
        return;
      }

      setWeekOverride(storedOverride);
      setSyncResult(storedSyncResult);
      setSyncError(undefined);
      setSyncMessage(undefined);
    };

    loadWeek().catch((error) => {
      console.error(error);
      setSyncError("Unable to load the selected week.");
    });

    return () => {
      isMounted = false;
    };
  }, [weekStart]);

  useEffect(() => {
    nativeApi.scheduleReminder({
      settings,
      weekKey: weekState.weekKey,
      skippedDates: weekState.skippedDates,
      remainingWeekHours: weekState.remainingWeekHours,
      todayDateKey: toLocalDateKey(new Date())
    });
  }, [settings, weekState.weekKey, weekState.remainingWeekHours, weekState.skippedDates]);

  useEffect(() => {
    if (isBooting) {
      return;
    }
    void loadTickets();
  }, [isBooting, loadTickets]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("theme-light", "theme-dark");
    if (theme === "light") {
      root.classList.add("theme-light");
    } else if (theme === "dark") {
      root.classList.add("theme-dark");
    }
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!mq) {
      return;
    }
    const onChange = () => setSystemLight(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const selectTheme = (next: ThemeMode) => {
    try {
      localStorage.setItem("sprintf-theme", next);
    } catch {
      /* ignore persistence failures */
    }
    setTheme(next);
  };

  const goToWeek = (date: Date) => {
    setWeekStart(getWeekBounds(date).weekStart);
  };

  const handleToggleFavorite = (key: string) => {
    setFavoriteKeys((current) => {
      const next = current.includes(key) ? current.filter((candidate) => candidate !== key) : [...current, key];
      void saveFavoriteKeys(next);
      return next;
    });
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
    await saveWeekOverride(nextOverride);
  };

  const handleSaveSettings = async () => {
    const cleanedSettings: AppSettings = {
      ...settingsDraft,
      jiraBaseUrl: normalizeJiraSiteInput(settingsDraft.jiraBaseUrl),
      jiraEmail: settingsDraft.jiraEmail.trim(),
      weeklyTargetHours: Math.max(Number(settingsDraft.weeklyTargetHours) || 40, 1),
      workingDays: settingsDraft.workingDays.length ? settingsDraft.workingDays : [1, 2, 3, 4, 5]
    };

    await saveSettings(cleanedSettings);
    setSettings(cleanedSettings);
    setSettingsDraft(cleanedSettings);
    setSavedMessage("Settings saved locally.");
    window.setTimeout(() => setSavedMessage(undefined), 2500);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(undefined);

    try {
      const result = await nativeApi.testJiraConnection({
        ...settingsDraft,
        jiraBaseUrl: normalizeJiraSiteInput(settingsDraft.jiraBaseUrl),
        jiraEmail: settingsDraft.jiraEmail.trim()
      });
      setTestResult(result);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncError(undefined);
    setSyncMessage(undefined);

    try {
      const result = await nativeApi.syncJiraWorklogs({
        settings,
        weekKey: weekState.weekKey,
        weekStartISO: weekState.weekStartISO,
        weekEndExclusiveISO: weekState.weekEndExclusiveISO
      });
      await saveSyncResult(result);
      setSyncResult(result);
      setSyncMessage(`Synced ${result.worklogCount} worklogs across ${result.issueCount} candidate issues.`);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Unable to sync Jira worklogs.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddWorklog = async (payload: {
    issueKey: string;
    timeSpentSeconds: number;
    startedISO: string;
    comment?: string;
  }) => {
    setIsLogging(true);
    setLogError(undefined);
    setLogMessage(undefined);

    try {
      const result = await nativeApi.addWorklog({ settings, ...payload });
      setLogMessage(`Logged ${formatDuration(result.timeSpentSeconds / 3600)} to ${result.issueKey}.`);
      await handleSync();
      await loadTickets();
      return true;
    } catch (error) {
      setLogError(error instanceof Error ? error.message : "Unable to log time to Jira.");
      return false;
    } finally {
      setIsLogging(false);
    }
  };

  const syncState = isSyncing ? "syncing" : syncResult ? "synced" : "stale";
  const syncLabel = isSyncing ? "SYNCING…" : formatSyncTime(syncResult);
  const banner = syncError ?? syncMessage;

  const openAddTime = (date?: Date) => setAddModalDate(date ?? new Date());

  return (
    <div className="app-shell">
      <div className="titlebar" />

      <div className="shell-body">
        <Sidebar
          view={view}
          collapsed={sidebarCollapsed}
          onViewChange={setView}
          onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
          syncLabel={syncLabel}
          syncState={syncState}
        />

        <main className="main-area">
          {!isBooting && banner && view !== "settings" && (
            <div className={`callout ${syncError ? "error" : "success"}`} role="status">
              {banner}
            </div>
          )}

          {isBooting ? (
            <div className="view" style={{ display: "grid", placeItems: "center" }}>
              <span className="sync-label">LOADING…</span>
            </div>
          ) : view === "today" ? (
            <TodayView
              date={new Date()}
              selectedTicket={selectedTicket}
              ticketOptions={ticketOptions}
              todayWorklogs={todayWorklogs}
              issueUrlsByKey={issueUrlsByKey}
              issueTypesByKey={issueTypesByKey}
              todayTrackedHours={todayTrackedHours}
              dailyTargetHours={weekState.dailyTargetHours}
              touchedNotLogged={touchedNotLogged}
              reminderTime={settings.reminderTime}
              remindersEnabled={settings.remindersEnabled}
              isConfigured={isConfigured}
              isLogging={isLogging}
              logError={logError}
              logMessage={logMessage}
              onLog={handleAddWorklog}
              onSelectTicket={setSelectedTicket}
            />
          ) : view === "week" ? (
            <WeekView
              weekState={weekState}
              syncResult={syncResult}
              isSyncing={isSyncing}
              onSync={handleSync}
              onPreviousWeek={() => setWeekStart((current) => addDays(current, -7))}
              onCurrentWeek={() => goToWeek(new Date())}
              onNextWeek={() => setWeekStart((current) => addDays(current, 7))}
              onAddTime={openAddTime}
              onToggleSkipped={handleToggleSkipped}
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
              onToggleFavorite={handleToggleFavorite}
              onLog={handleLogTicket}
            />
          ) : view === "reports" ? (
            <ReportsView weekState={weekState} onCurrentWeek={() => goToWeek(new Date())} />
          ) : (
            <SettingsView
              draft={settingsDraft}
              onDraftChange={setSettingsDraft}
              onSave={handleSaveSettings}
              onTestConnection={handleTestConnection}
              isTesting={isTesting}
              testResult={testResult}
              savedMessage={savedMessage}
              effectiveTheme={effectiveTheme}
              onSelectTheme={selectTheme}
            />
          )}
        </main>
      </div>

      {addModalDate && (
        <AddTimeModal
          date={addModalDate}
          ticketOptions={ticketOptions}
          isConfigured={isConfigured}
          isLogging={isLogging}
          logError={logError}
          onClose={() => setAddModalDate(undefined)}
          onLog={handleAddWorklog}
        />
      )}
    </div>
  );
};

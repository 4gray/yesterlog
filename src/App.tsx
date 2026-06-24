import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppSettings,
  AppUpdateInfo,
  BitbucketReviewSession,
  BitbucketReviewSyncResult,
  BitbucketReviewTargetMode,
  JiraConnectionResult,
  JiraIssueTypeInfo,
  JiraTicket,
  JiraWorklog,
  PersonalNote,
  RecurringEvent,
  RecurringOccurrence,
  SyncResult,
  TicketSortMode,
  TicketsResult,
  WeekdayNumber,
  WeekOverride
} from "../shared/types";
import { GITHUB_RELEASES_URL } from "../shared/releases";
import { nativeApi } from "./api/native";
import { AddTimeModal } from "./components/AddTimeModal";
import type { RecurringEventDraft } from "./components/SettingsView";
import { ReportsView } from "./components/ReportsView";
import { ReleaseNotesDialog } from "./components/ReleaseNotesDialog";
import { ReviewView } from "./components/ReviewView";
import { SettingsView } from "./components/SettingsView";
import { Sidebar, type AppView, type ThemeMode } from "./components/Sidebar";
import { SnackbarStack, type SnackbarKind, type SnackbarNotification } from "./components/SnackbarStack";
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
import { isRecentUpdateInfo, readCachedUpdateInfo, writeCachedUpdateInfo } from "./domain/updateCache";
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
  saveFavoriteKeys,
  savePersonalNotes,
  saveRecurringEvents,
  saveRecurringOccurrences,
  saveSettings,
  saveSyncResult,
  saveWeekOverride
} from "./storage/db";
import { addDays, formatClock, formatDuration, fromLocalDateKey, isoWeekday, toLocalDateKey } from "./utils/date";

const isJiraConfigured = (settings: AppSettings) =>
  Boolean(settings.jiraBaseUrl.trim() && settings.jiraEmail.trim() && settings.jiraApiToken.trim());

const THEME_STORAGE_KEY = "timebro-theme";
const LEGACY_THEME_STORAGE_KEY = "sprintf-theme";
// The version this build is running; baked from package.json at build time.
const APP_VERSION = import.meta.env.VITE_APP_VERSION || "unknown";
const MAX_SNACKBARS = 4;

type SnackbarOptions = Pick<SnackbarNotification, "actionLabel" | "actions" | "onAction" | "autoDismiss">;

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

const formatReleaseVersion = (version?: string) => {
  const trimmed = version?.trim();
  return trimmed ? `v${trimmed.replace(/^v/i, "")}` : "unknown";
};

const sortPersonalNotes = (notes: PersonalNote[]) =>
  [...notes].sort((a, b) => new Date(a.startedISO).getTime() - new Date(b.startedISO).getTime());

const getTicketCreatedTime = (ticket: JiraTicket) => {
  if (!ticket.createdAt) {
    return undefined;
  }

  const time = Date.parse(ticket.createdAt);
  return Number.isFinite(time) ? time : undefined;
};

const compareTicketsByCreated = (sortMode: TicketSortMode) => {
  return (left: JiraTicket, right: JiraTicket) => {
    const leftTime = getTicketCreatedTime(left);
    const rightTime = getTicketCreatedTime(right);

    if (leftTime === undefined && rightTime === undefined) {
      return left.key.localeCompare(right.key);
    }

    if (leftTime === undefined) {
      return 1;
    }

    if (rightTime === undefined) {
      return -1;
    }

    return sortMode === "createdAsc"
      ? leftTime - rightTime || left.key.localeCompare(right.key)
      : rightTime - leftTime || left.key.localeCompare(right.key);
  };
};

const updateVisiblePersonalNotes = (
  current: PersonalNote[],
  previousNote: PersonalNote,
  nextNote: PersonalNote,
  visibleWeekKey: string
) => {
  const withoutPrevious = current.filter((note) => note.id !== previousNote.id);
  if (nextNote.weekKey !== visibleWeekKey) {
    return sortPersonalNotes(withoutPrevious);
  }
  return sortPersonalNotes([...withoutPrevious, nextNote]);
};

const getPersonalNoteImportFingerprint = (note: PersonalNote) =>
  [note.dateKey, note.title?.trim() ?? "", note.text.trim(), note.timeSpentSeconds].join("\u0000");

const mergeImportedPersonalNotes = (currentNotes: PersonalNote[], importedNotes: PersonalNote[]) => {
  const seen = new Set(currentNotes.map(getPersonalNoteImportFingerprint));
  const additions = importedNotes.filter((note) => {
    const fingerprint = getPersonalNoteImportFingerprint(note);
    if (seen.has(fingerprint)) {
      return false;
    }
    seen.add(fingerprint);
    return true;
  });

  return {
    notes: sortPersonalNotes([...currentNotes, ...additions]),
    addedCount: additions.length
  };
};

const groupPersonalNotesByWeek = (notes: PersonalNote[]) => {
  return notes.reduce<Map<string, PersonalNote[]>>((groups, note) => {
    const group = groups.get(note.weekKey) ?? [];
    group.push(note);
    groups.set(note.weekKey, group);
    return groups;
  }, new Map());
};

const formatPersonalNoteCount = (count: number) => `${count} personal ${count === 1 ? "note" : "notes"}`;

const createDemoUpdateInfo = (updateAvailable = false): AppUpdateInfo => {
  const latestVersion = updateAvailable ? "1.3.0" : "1.0.0";

  return {
    currentVersion: "1.0.0",
    latestVersion,
    releaseName: updateAvailable ? "TimeBro v1.3.0" : undefined,
    releaseNotes: updateAvailable
      ? "## Highlights\n\n- Added in-app release notes for update prompts.\n- Added direct platform downloads from GitHub release assets.\n- Kept the update snackbar visible while the notes dialog is open."
      : "Maintenance polish for the local preview build.",
    releasePageUrl: updateAvailable
      ? "https://github.com/4gray/time-bro/releases/tag/v1.3.0"
      : GITHUB_RELEASES_URL,
    downloadUrl: updateAvailable
      ? "https://github.com/4gray/time-bro/releases/download/v1.3.0/TimeBro-1.3.0-arm64.dmg"
      : undefined,
    downloadName: updateAvailable ? "TimeBro-1.3.0-arm64.dmg" : undefined,
    downloadPlatform: updateAvailable ? "macos" : undefined,
    publishedAt: updateAvailable ? "2026-06-24T09:00:00.000Z" : undefined,
    checkedAt: new Date().toISOString(),
    updateAvailable
  };
};

export const App = () => {
  const demoConfig = useMemo(() => getDemoConfig(), []);
  const demoScenario = useMemo(() => (demoConfig ? createDemoScenario(demoConfig) : undefined), [demoConfig]);
  // A stable "now" that only advances on a slow tick. Calling `new Date()`
  // directly in render handed back a fresh object every render, which rebuilt
  // `weekState` (and its arrays) every render. Downstream that spun the app in a
  // re-render loop and constantly changed the drag handlers' identities — which
  // tore the live drag listeners off `document` mid-gesture, breaking dock
  // drag-to-log in the packaged app. Demo mode keeps the clock frozen.
  const [liveDate, setLiveDate] = useState(() => new Date());
  const currentDate = demoScenario?.today ?? liveDate;
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
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isTestingBitbucket, setIsTestingBitbucket] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | undefined>(() =>
    demoConfig ? createDemoUpdateInfo(demoConfig.updateAvailable) : undefined
  );
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [releaseNotesDialogInfo, setReleaseNotesDialogInfo] = useState<AppUpdateInfo | undefined>();
  const [isImportingPersonalNotes, setIsImportingPersonalNotes] = useState(false);
  const [tickets, setTickets] = useState<TicketsResult | undefined>(() => demoScenario?.tickets);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsError, setTicketsError] = useState<string | undefined>();
  const [favoriteKeys, setFavoriteKeys] = useState<string[]>(() => demoScenario?.favoriteKeys ?? []);
  const [selectedTicket, setSelectedTicket] = useState<JiraTicket | undefined>(() => demoScenario?.selectedTicket);
  const [isLogging, setIsLogging] = useState(false);
  const [isLoggingReview, setIsLoggingReview] = useState(false);
  const [isDeletingWorklog, setIsDeletingWorklog] = useState(false);
  const [logError, setLogError] = useState<string | undefined>();
  const [bitbucketReviewResult, setBitbucketReviewResult] = useState<BitbucketReviewSyncResult | undefined>(
    () => demoScenario?.bitbucketReviewResult
  );
  const [isSyncingReviews, setIsSyncingReviews] = useState(false);
  const [reviewTargetMode, setReviewTargetMode] = useState<BitbucketReviewTargetMode>("reviewed-ticket");
  const [snackbars, setSnackbars] = useState<SnackbarNotification[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [addModalDate, setAddModalDate] = useState<Date | undefined>();
  const [editingWorklog, setEditingWorklog] = useState<JiraWorklog | undefined>();
  const [editingPersonalNote, setEditingPersonalNote] = useState<PersonalNote | undefined>();
  const [welcomeConnected, setWelcomeConnected] = useState(false);
  const [theme, setTheme] = useState<ThemeMode | null>(() => {
    if (demoConfig?.theme) {
      return demoConfig.theme;
    }

    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) ?? localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
      return stored === "light" || stored === "dark" ? stored : null;
    } catch {
      return null;
    }
  });
  const [systemLight, setSystemLight] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches === true
  );
  const syncInFlightRef = useRef<Promise<SyncResult | undefined> | undefined>();
  const startupSyncCheckedRef = useRef(false);
  const skipInitialWeekReloadRef = useRef(false);
  const snackbarIdRef = useRef(0);
  const updateSnackbarShownForRef = useRef<string | undefined>();

  const effectiveTheme: ThemeMode = theme ?? (systemLight ? "light" : "dark");

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

  const visibleSyncResult = syncResult?.weekKey === weekState.weekKey ? syncResult : undefined;
  const visibleBitbucketReviewResult =
    bitbucketReviewResult?.weekKey === weekState.weekKey ? bitbucketReviewResult : undefined;

  const isConfigured = isJiraConfigured(settings);
  const isBitbucketReady = isBitbucketConfigured(settings);

  const hoursByKey = useMemo(() => {
    const map: Record<string, number> = {};
    if (visibleSyncResult) {
      for (const bucket of Object.values(visibleSyncResult.daySummaries)) {
        for (const issue of bucket.issues) {
          map[issue.key] = (map[issue.key] ?? 0) + issue.loggedSeconds / 3600;
        }
      }
    }
    return map;
  }, [visibleSyncResult]);

  const issueUrlsByKey = useMemo(() => {
    const map: Record<string, string> = {};
    if (visibleSyncResult) {
      for (const bucket of Object.values(visibleSyncResult.daySummaries)) {
        for (const issue of bucket.issues) {
          if (issue.url) {
            map[issue.key] = issue.url;
          }
        }
      }
    }

    for (const ticket of [...(tickets?.inProgress ?? []), ...(tickets?.recentlyClosed ?? [])]) {
      map[ticket.key] = ticket.url;
    }

    if (selectedTicket) {
      map[selectedTicket.key] = selectedTicket.url;
    }

    return map;
  }, [selectedTicket, tickets, visibleSyncResult]);

  const issueTypesByKey = useMemo(() => {
    const map: Record<string, JiraIssueTypeInfo> = {};
    if (visibleSyncResult) {
      for (const bucket of Object.values(visibleSyncResult.daySummaries)) {
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
  }, [selectedTicket, tickets, visibleSyncResult]);

  const todayKey = toLocalDateKey(currentDate);
  const todaySummary = weekState.days.find((day) => day.dateKey === todayKey);
  const todayBucket = visibleSyncResult?.daySummaries[todayKey];
  const todayWorklogs = todayBucket?.worklogs ?? [];
  const todayPersonalNotes = todaySummary?.personalNotes ?? [];
  const todayTrackedHours = todaySummary?.trackedHours ?? (todayBucket?.trackedSeconds ?? 0) / 3600;

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

  // Active-work dock: in-progress tickets first, then recently closed (dimmed).
  const dockTickets = useMemo(() => {
    const byKey = new Map<string, JiraTicket>();
    for (const ticket of [...(tickets?.inProgress ?? []), ...(tickets?.recentlyClosed ?? [])]) {
      if (!byKey.has(ticket.key)) {
        byKey.set(ticket.key, ticket);
      }
    }
    return [...byKey.values()];
  }, [tickets]);

  const addTimeDateOptions = weekState.activeWorkingDates;

  const touchedNotLogged = useMemo(() => {
    const loggedKeys = new Set(todayWorklogs.map((worklog) => worklog.issueKey));
    return (tickets?.inProgress ?? []).filter((ticket) => !loggedKeys.has(ticket.key));
  }, [tickets, todayWorklogs]);

  const dismissSnackbar = useCallback((id: number) => {
    setSnackbars((current) => current.filter((notification) => notification.id !== id));
  }, []);

  const showSnackbar = useCallback((kind: SnackbarKind, message: string, options: SnackbarOptions = {}) => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      return;
    }

    snackbarIdRef.current += 1;
    const notification: SnackbarNotification = {
      id: snackbarIdRef.current,
      kind,
      message: trimmedMessage,
      ...options
    };

    setSnackbars((current) => [...current, notification].slice(-MAX_SNACKBARS));
  }, []);

  const showSuccess = useCallback((message: string) => showSnackbar("success", message), [showSnackbar]);
  const showError = useCallback((message: string) => showSnackbar("error", message), [showSnackbar]);
  const showInfo = useCallback((message: string) => showSnackbar("info", message), [showSnackbar]);

  const openReleasePage = useCallback(
    (url?: string) => {
      void nativeApi.openReleasePage(url ?? GITHUB_RELEASES_URL).catch((error) => {
        showError(error instanceof Error ? error.message : "Unable to open GitHub Releases.");
      });
    },
    [showError]
  );

  const openReleaseNotes = useCallback(
    (info?: AppUpdateInfo) => {
      const releaseInfo = info ?? updateInfo;
      if (!releaseInfo?.latestVersion) {
        showError("No GitHub release notes are available yet.");
        return;
      }

      setReleaseNotesDialogInfo(releaseInfo);
    },
    [showError, updateInfo]
  );

  const openUpdateDownload = useCallback(
    (info?: AppUpdateInfo) => {
      const downloadUrl = info?.downloadUrl ?? updateInfo?.downloadUrl;
      if (!downloadUrl) {
        showError("No installer download is available for this platform.");
        return;
      }

      void nativeApi.openReleasePage(downloadUrl).catch((error) => {
        showError(error instanceof Error ? error.message : "Unable to open the release download.");
      });
    },
    [showError, updateInfo]
  );

  const showUpdateAvailable = useCallback(
    (info: AppUpdateInfo) => {
      if (!info.updateAvailable || !info.latestVersion) {
        return;
      }

      if (updateSnackbarShownForRef.current === info.latestVersion) {
        return;
      }

      updateSnackbarShownForRef.current = info.latestVersion;
      showSnackbar(
        "info",
        `TimeBro ${formatReleaseVersion(info.latestVersion)} is available. Current version: ${formatReleaseVersion(
          info.currentVersion
        )}.`,
        {
          actions: [
            {
              label: "Release notes",
              icon: "notes",
              onAction: () => openReleaseNotes(info)
            },
            ...(info.downloadUrl
              ? [
                  {
                    label: "Download",
                    icon: "download" as const,
                    onAction: () => openUpdateDownload(info)
                  }
                ]
              : [
                  {
                    label: "GitHub",
                    icon: "external" as const,
                    onAction: () => openReleasePage(info.releasePageUrl)
                  }
                ])
          ],
          autoDismiss: false
        }
      );
    },
    [openReleaseNotes, openReleasePage, openUpdateDownload, showSnackbar]
  );

  const checkForUpdates = useCallback(
    async (options: { force?: boolean; notifyWhenCurrent?: boolean } = {}) => {
      if (demoScenario) {
        const demoUpdateInfo = createDemoUpdateInfo(demoConfig?.updateAvailable ?? false);
        setUpdateInfo(demoUpdateInfo);

        if (demoUpdateInfo.updateAvailable) {
          showUpdateAvailable(demoUpdateInfo);
        } else if (options.notifyWhenCurrent) {
          showSuccess("TimeBro is up to date.");
        }

        return demoUpdateInfo;
      }

      if (!options.force) {
        const cachedUpdateInfo = readCachedUpdateInfo(APP_VERSION);
        if (cachedUpdateInfo && isRecentUpdateInfo(cachedUpdateInfo)) {
          setUpdateInfo(cachedUpdateInfo);
          if (cachedUpdateInfo.updateAvailable) {
            showUpdateAvailable(cachedUpdateInfo);
          }
          return cachedUpdateInfo;
        }
      }

      setIsCheckingUpdates(true);

      try {
        const result = await nativeApi.getUpdateInfo();
        setUpdateInfo(result);
        writeCachedUpdateInfo(result);

        if (result.updateAvailable) {
          showUpdateAvailable(result);
        } else if (options.notifyWhenCurrent) {
          if (result.error) {
            showError(result.error);
          } else {
            showSuccess("TimeBro is up to date.");
          }
        }

        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to check GitHub Releases.";
        setUpdateInfo((current) => ({
          currentVersion: current?.currentVersion ?? "unknown",
          releasePageUrl: current?.releasePageUrl ?? GITHUB_RELEASES_URL,
          checkedAt: new Date().toISOString(),
          updateAvailable: false,
          error: message
        }));

        if (options.notifyWhenCurrent) {
          showError(message);
        }

        return undefined;
      } finally {
        setIsCheckingUpdates(false);
      }
    },
    [demoConfig, demoScenario, showError, showSuccess, showUpdateAvailable]
  );

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

  const handleSearchTickets = useCallback(
    async (
      query: string,
      sortMode: TicketSortMode = "createdDesc",
      limit = 20,
      assignedOnly = false,
      allowEmptyQuery = false
    ) => {
      const normalizedQuery = query.trim().toLowerCase();
      const canBrowseWithoutQuery = allowEmptyQuery && normalizedQuery.length === 0;

      if (!isConfigured || (normalizedQuery.length < 2 && !canBrowseWithoutQuery)) {
        return [];
      }

      if (demoScenario) {
        const allDemoTickets = [...demoScenario.tickets.inProgress, ...demoScenario.tickets.recentlyClosed];
        const demoTickets = assignedOnly
          ? allDemoTickets.filter((ticket) => ticket.assigneeDisplayName === demoScenario.syncResult.displayName)
          : allDemoTickets;
        const byKey = new Map<string, JiraTicket>();
        for (const ticket of demoTickets) {
          byKey.set(ticket.key, ticket);
        }

        const matches = canBrowseWithoutQuery
          ? [...byKey.values()]
          : [...byKey.values()].filter((ticket) =>
              [ticket.key, ticket.summary, ticket.projectName, ticket.statusName].some((value) =>
                value.toLowerCase().includes(normalizedQuery)
              )
            );

        return [...matches].sort(compareTicketsByCreated(sortMode)).slice(0, limit);
      }

      const result = await nativeApi.searchJiraTickets({
        settings,
        query,
        limit,
        sortMode,
        assignedOnly,
        allowEmptyQuery
      });
      return result.issues;
    },
    [demoScenario, isConfigured, settings]
  );

  const runSync = useCallback(
    async (
      settingsForSync: AppSettings = settings,
      options: { queueAfterCurrent?: boolean } = {}
    ): Promise<SyncResult | undefined> => {
      if (demoScenario) {
        setSyncResult(demoScenario.syncResult);
        showSuccess("Demo data refreshed from seeded fixtures.");
        return demoScenario.syncResult;
      }

      while (syncInFlightRef.current) {
        const currentSync = syncInFlightRef.current;
        if (!options.queueAfterCurrent) {
          return currentSync;
        }
        await currentSync;
      }

      if (!isJiraConfigured(settingsForSync)) {
        showError("Connect Jira in Settings before syncing.");
        return undefined;
      }

      setIsSyncing(true);

      const syncTask = (async () => {
        try {
          const result = await nativeApi.syncJiraWorklogs({
            settings: settingsForSync,
            weekKey: weekState.weekKey,
            weekStartISO: weekState.weekStartISO,
            weekEndExclusiveISO: weekState.weekEndExclusiveISO
          });
          await saveSyncResult(result);
          setSyncResult(result);
          showSuccess(`Synced ${result.worklogCount} worklogs across ${result.issueCount} candidate issues.`);
          return result;
        } catch (error) {
          showError(error instanceof Error ? error.message : "Unable to sync Jira worklogs.");
          return undefined;
        }
      })();

      syncInFlightRef.current = syncTask;

      try {
        return await syncTask;
      } finally {
        if (syncInFlightRef.current === syncTask) {
          syncInFlightRef.current = undefined;
          setIsSyncing(false);
        }
      }
    },
    [demoScenario, settings, showError, showSuccess, weekState.weekEndExclusiveISO, weekState.weekKey, weekState.weekStartISO]
  );

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

    void checkForUpdates();
  }, [checkForUpdates, demoScenario]);

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
    if (isBooting || demoScenario) {
      return;
    }
    void loadTickets();
  }, [demoScenario, isBooting, loadTickets]);

  useEffect(() => {
    if (view === "review" && !isBitbucketReady) {
      setView("week");
    }
  }, [isBitbucketReady, view]);

  // Advance the live clock on a slow cadence so "today"/now stay fresh (day
  // rollover, the now-marker) without re-rendering the whole app every frame.
  // Pinned in demo mode so fixtures and screenshots stay deterministic.
  useEffect(() => {
    if (demoScenario) {
      return;
    }
    const id = setInterval(() => setLiveDate(new Date()), 60_000);
    return () => clearInterval(id);
  }, [demoScenario]);

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
    if (!demoScenario) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
        localStorage.removeItem(LEGACY_THEME_STORAGE_KEY);
      } catch {
        /* ignore persistence failures */
      }
    }
    setTheme(next);
  };

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

  const handleToggleFavorite = (key: string) => {
    setFavoriteKeys((current) => {
      const next = current.includes(key) ? current.filter((candidate) => candidate !== key) : [...current, key];
      if (!demoScenario) {
        void saveFavoriteKeys(next);
      }
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
      setTicketsLoading(true);
      setTicketsError(undefined);
      nativeApi.fetchAssignedTickets({ settings: cleanedSettings })
        .then(setTickets)
        .catch((error) => setTicketsError(error instanceof Error ? error.message : "Unable to load tickets."))
        .finally(() => setTicketsLoading(false));
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
              onSearchTickets={handleSearchTickets}
            />
          ) : view === "week" ? (
            <WeekView
              weekState={weekState}
              syncResult={syncResult}
              currentDate={currentDate}
              isSyncing={isSyncing || isSyncingReviews}
              isConfigured={isConfigured}
              dockTickets={dockTickets}
              activeTicketCount={tickets?.inProgress.length ?? 0}
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
              onToggleFavorite={handleToggleFavorite}
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
          onSearchTickets={handleSearchTickets}
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
          onSearchTickets={handleSearchTickets}
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
          onSearchTickets={handleSearchTickets}
          onAddPersonalNote={handleAddPersonalNote}
          onUpdatePersonalNote={handleUpdatePersonalNote}
        />
      )}

      {releaseNotesDialogInfo && (
        <ReleaseNotesDialog
          updateInfo={releaseNotesDialogInfo}
          onClose={() => setReleaseNotesDialogInfo(undefined)}
          onDownload={openUpdateDownload}
          onOpenReleasePage={openReleasePage}
        />
      )}

      <SnackbarStack notifications={snackbars} onDismiss={dismissSnackbar} />
    </div>
  );
};

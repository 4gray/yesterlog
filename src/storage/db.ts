import type {
  AppSettings,
  BitbucketReviewSyncResult,
  JiraActivitySyncResult,
  JiraWorklog,
  PersonalNote,
  RecurringEvent,
  RecurringOccurrence,
  SyncResult,
  WeekOverride,
  WorklogAllocationPreference
} from "../../shared/types";
import { normalizeWorkingDays } from "../../shared/weekdays";
import { DEFAULT_SETTINGS } from "../domain/week";
import { addDays, fromLocalDateKey, toLocalDateKey } from "../utils/date";

const DB_NAME = "jira-week-tracker";
const DB_VERSION = 12;
const SETTINGS_KEY = "default";
const JIRA_CONTEXT_KEY = "jira-context";
const FAVORITES_KEY = "default";
const RECURRING_EVENTS_KEY = "default";

type StoreName =
  | "settings"
  | "weekOverrides"
  | "syncResults"
  | "jiraActivityResults"
  | "favorites"
  | "personalNotes"
  | "bitbucketReviewResults"
  | "recurringEvents"
  | "recurringOccurrences"
  | "reconstructDrafts"
  | "reconstructAiDrafts"
  | "worklogAllocationPreferences"
  | "jiraWorklogs";

let dbPromise: Promise<IDBDatabase> | undefined;

interface CachedJiraWorklog {
  cacheKey: string;
  jiraSite: string;
  authorAccountId: string;
  worklog: JiraWorklog;
}

interface ActiveJiraContext {
  id: typeof JIRA_CONTEXT_KEY;
  jiraSite: string;
  authorAccountId: string;
  jiraEmail: string;
  syncedAt: string;
}

let jiraWorklogCachePromise: Promise<CachedJiraWorklog[]> | undefined;

const openDatabase = () => {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;

      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("weekOverrides")) {
        db.createObjectStore("weekOverrides", { keyPath: "weekKey" });
      }

      if (!db.objectStoreNames.contains("syncResults")) {
        db.createObjectStore("syncResults", { keyPath: "weekKey" });
      }

      if (!db.objectStoreNames.contains("jiraActivityResults")) {
        db.createObjectStore("jiraActivityResults", { keyPath: "weekKey" });
      }

      if (!db.objectStoreNames.contains("favorites")) {
        db.createObjectStore("favorites", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("personalNotes")) {
        db.createObjectStore("personalNotes", { keyPath: "weekKey" });
      }

      if (!db.objectStoreNames.contains("bitbucketReviewResults")) {
        db.createObjectStore("bitbucketReviewResults", { keyPath: "weekKey" });
      }

      if (!db.objectStoreNames.contains("recurringEvents")) {
        db.createObjectStore("recurringEvents", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("recurringOccurrences")) {
        db.createObjectStore("recurringOccurrences", { keyPath: "weekKey" });
      }

      if (!db.objectStoreNames.contains("reconstructDrafts")) {
        db.createObjectStore("reconstructDrafts", { keyPath: "dateKey" });
      }

      if (!db.objectStoreNames.contains("reconstructAiDrafts")) {
        db.createObjectStore("reconstructAiDrafts", { keyPath: "dateKey" });
      }

      // Preferences introduced on the unreleased v11 schema were keyed by Jira
      // worklog ID alone. Recreate the local-only store with site/account scope.
      if (
        event.oldVersion > 0 &&
        event.oldVersion < 12 &&
        db.objectStoreNames.contains("worklogAllocationPreferences")
      ) {
        db.deleteObjectStore("worklogAllocationPreferences");
      }

      if (!db.objectStoreNames.contains("worklogAllocationPreferences")) {
        db.createObjectStore("worklogAllocationPreferences", { keyPath: "preferenceKey" });
      }

      // Version 10 briefly stored raw worklogs by Jira ID alone. Recreate this
      // derived cache so equal IDs from different Jira sites cannot collide.
      if (event.oldVersion === 10 && db.objectStoreNames.contains("jiraWorklogs")) {
        db.deleteObjectStore("jiraWorklogs");
      }

      if (!db.objectStoreNames.contains("jiraWorklogs")) {
        db.createObjectStore("jiraWorklogs", { keyPath: "cacheKey" });
      }
    };

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });

  return dbPromise;
};

const readStore = async <T>(storeName: StoreName, key: IDBValidKey) => {
  const db = await openDatabase();

  return new Promise<T | undefined>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as T | undefined);
  });
};

const writeStore = async <T>(storeName: StoreName, value: T) => {
  const db = await openDatabase();

  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const request = transaction.objectStore(storeName).put(value);

    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve();
  });
};

const readAllStore = async <T>(storeName: StoreName) => {
  const db = await openDatabase();

  return new Promise<T[]>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as T[]);
  });
};

const readJiraWorklogCache = () => {
  jiraWorklogCachePromise ??= readAllStore<CachedJiraWorklog>("jiraWorklogs");
  return jiraWorklogCachePromise;
};

const invalidateJiraWorklogCache = () => {
  jiraWorklogCachePromise = undefined;
};

export const getSettings = async (): Promise<AppSettings> => {
  const stored = await readStore<AppSettings & { id: string }>("settings", SETTINGS_KEY);
  const { id: _id, ...settings } = stored ?? { id: SETTINGS_KEY, ...DEFAULT_SETTINGS };
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    workingDays: normalizeWorkingDays(settings.workingDays)
  };
};

export const saveSettings = (settings: AppSettings) => {
  return writeStore("settings", {
    id: SETTINGS_KEY,
    ...settings,
    workingDays: normalizeWorkingDays(settings.workingDays)
  });
};

export const getWeekOverride = async (weekKey: string): Promise<WeekOverride> => {
  return (await readStore<WeekOverride>("weekOverrides", weekKey)) ?? { weekKey, skippedDates: [] };
};

export const getWeekOverrides = () => readAllStore<WeekOverride>("weekOverrides");

export const saveWeekOverride = (override: WeekOverride) => {
  return writeStore("weekOverrides", override);
};

const rawCachedWorklog = (worklog: JiraWorklog): JiraWorklog => {
  const { allocation: _allocation, ...raw } = worklog;
  return raw;
};

const jiraSiteFromWorklog = (worklog?: JiraWorklog) => {
  if (!worklog?.issueUrl) {
    return undefined;
  }
  try {
    return new URL(worklog.issueUrl).origin;
  } catch {
    return undefined;
  }
};

const jiraSiteForResult = (result?: SyncResult) =>
  result?.jiraSite ?? result?.sourceWorklogs?.map(jiraSiteFromWorklog).find((site): site is string => Boolean(site));

const jiraSiteFromSettings = (rawSite: string) => {
  const trimmed = rawSite.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return undefined;
  }
  const candidate = trimmed.includes("://")
    ? trimmed
    : `https://${trimmed.includes(".") ? trimmed : `${trimmed}.atlassian.net`}`;
  try {
    return new URL(candidate).origin;
  } catch {
    return undefined;
  }
};

const normalizedJiraEmail = (email: string) => email.trim().toLocaleLowerCase();

const getConfiguredJiraContext = async () => {
  const [settings, storedContext] = await Promise.all([
    getSettings(),
    readStore<ActiveJiraContext>("settings", JIRA_CONTEXT_KEY)
  ]);
  const jiraSite = jiraSiteFromSettings(settings.jiraBaseUrl);
  const jiraEmail = normalizedJiraEmail(settings.jiraEmail);
  const activeContext =
    storedContext && storedContext.jiraSite === jiraSite && storedContext.jiraEmail === jiraEmail
      ? storedContext
      : undefined;
  return { jiraSite, jiraEmail, activeContext, hasStoredContext: Boolean(storedContext) };
};

const saveActiveJiraContext = async (result: SyncResult) => {
  const jiraSite = jiraSiteForResult(result);
  if (!jiraSite || !result.accountId) {
    return;
  }
  const settings = await getSettings();
  if (jiraSiteFromSettings(settings.jiraBaseUrl) !== jiraSite) {
    return;
  }
  await writeStore("settings", {
    id: JIRA_CONTEXT_KEY,
    jiraSite,
    authorAccountId: result.accountId,
    jiraEmail: normalizedJiraEmail(settings.jiraEmail),
    syncedAt: result.syncedAt
  } satisfies ActiveJiraContext);
};

const jiraWorklogCacheKey = (jiraSite: string, worklogId: string) => JSON.stringify([jiraSite, worklogId]);

const summarizeWorklogsForWeek = (
  sourceWorklogs: JiraWorklog[],
  weekStart: Date,
  weekEndExclusive: Date
) => {
  const daySummaries: SyncResult["daySummaries"] = {};
  const visibleWorklogIds = new Set<string>();
  const visibleIssueKeys = new Set<string>();

  for (const worklog of sourceWorklogs) {
    const started = new Date(worklog.started);
    if (Number.isNaN(started.getTime()) || started < weekStart || started >= weekEndExclusive) {
      continue;
    }

    const dateKey = toLocalDateKey(started);
    const bucket = daySummaries[dateKey] ?? { trackedSeconds: 0, issues: [], worklogs: [] };
    bucket.trackedSeconds += worklog.timeSpentSeconds;
    bucket.worklogs.push(worklog);

    const issue = bucket.issues.find((candidate) => candidate.key === worklog.issueKey);
    if (issue) {
      issue.loggedSeconds += worklog.timeSpentSeconds;
      if (worklog.comment) {
        issue.comments = Array.from(new Set([...(issue.comments ?? []), worklog.comment]));
      }
    } else {
      bucket.issues.push({
        id: worklog.issueId,
        key: worklog.issueKey,
        summary: worklog.issueSummary,
        url: worklog.issueUrl,
        issueType: worklog.issueType,
        epic: worklog.epic,
        loggedSeconds: worklog.timeSpentSeconds,
        comments: worklog.comment ? [worklog.comment] : []
      });
    }

    daySummaries[dateKey] = bucket;
    visibleWorklogIds.add(worklog.id);
    visibleIssueKeys.add(worklog.issueKey);
  }

  for (const bucket of Object.values(daySummaries)) {
    bucket.worklogs.sort(
      (left, right) => new Date(left.started).getTime() - new Date(right.started).getTime()
    );
  }

  return {
    daySummaries,
    trackedSeconds: Object.values(daySummaries).reduce(
      (total, bucket) => total + bucket.trackedSeconds,
      0
    ),
    issueCount: visibleIssueKeys.size,
    worklogCount: visibleWorklogIds.size
  };
};

const reconcileJiraWorklogCache = async (result: SyncResult) => {
  const jiraSite = jiraSiteForResult(result);
  if (!result.sourceWorklogs || !jiraSite) {
    return;
  }

  const db = await openDatabase();
  const existing = await readJiraWorklogCache();
  const incoming = result.sourceWorklogs.map(rawCachedWorklog).map(
    (worklog): CachedJiraWorklog => ({
      cacheKey: jiraWorklogCacheKey(jiraSite, worklog.id),
      jiraSite,
      authorAccountId: worklog.authorAccountId,
      worklog
    })
  );
  const incomingKeys = new Set(incoming.map((entry) => entry.cacheKey));
  const scanStart = result.scanStartISO ? new Date(result.scanStartISO) : undefined;
  const scanEnd = result.scanEndExclusiveISO ? new Date(result.scanEndExclusiveISO) : undefined;

  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("jiraWorklogs", "readwrite");
    const store = transaction.objectStore("jiraWorklogs");

    if (scanStart && scanEnd && !Number.isNaN(scanStart.getTime()) && !Number.isNaN(scanEnd.getTime())) {
      for (const entry of existing) {
        const started = new Date(entry.worklog.started);
        if (
          entry.jiraSite === jiraSite &&
          entry.authorAccountId === result.accountId &&
          started >= scanStart &&
          started < scanEnd &&
          !incomingKeys.has(entry.cacheKey)
        ) {
          store.delete(entry.cacheKey);
        }
      }
    }

    for (const entry of incoming) {
      store.put(entry);
    }

    transaction.onerror = () => {
      invalidateJiraWorklogCache();
      reject(transaction.error);
    };
    transaction.oncomplete = () => {
      invalidateJiraWorklogCache();
      resolve();
    };
  });
};

export const getSyncResult = async (weekKey: string) => {
  let stored = await readStore<SyncResult>("syncResults", weekKey);
  const configuredContext = await getConfiguredJiraContext();
  let accountId = configuredContext.activeContext?.authorAccountId;
  let jiraSite = configuredContext.activeContext?.jiraSite;

  if (!configuredContext.activeContext) {
    if (configuredContext.hasStoredContext) {
      return undefined;
    }
    const storedSite = jiraSiteForResult(stored);
    if (!stored || !configuredContext.jiraSite || storedSite !== configuredContext.jiraSite) {
      return undefined;
    }
    // A legacy stored week without site context remains usable as-is, but must
    // never be combined with or used to synthesize from a global ledger.
    return stored;
  }

  if (stored && (stored.accountId !== accountId || jiraSiteForResult(stored) !== jiraSite)) {
    stored = undefined;
  }

  if (!accountId || !jiraSite) {
    return stored;
  }

  // All week loaders share one in-memory IndexedDB read. Reconciliation
  // invalidates it, so already-cached weeks still see newly synced bulk logs.
  const cachedEntries = await readJiraWorklogCache();
  const sourceWorklogs = cachedEntries
    .filter((entry) => entry.jiraSite === jiraSite && entry.authorAccountId === accountId)
    .map((entry) => entry.worklog);
  if (!stored && sourceWorklogs.length === 0) {
    return undefined;
  }

  const weekStart = fromLocalDateKey(weekKey);
  const weekEndExclusive = addDays(weekStart, 7);
  const summary = summarizeWorklogsForWeek(sourceWorklogs, weekStart, weekEndExclusive);

  if (stored) {
    return {
      ...stored,
      jiraSite,
      trackedSeconds: summary.trackedSeconds,
      issueCount: summary.issueCount,
      worklogCount: summary.worklogCount,
      daySummaries: summary.daySummaries,
      sourceWorklogs
    };
  }

  const syncedAt = sourceWorklogs.reduce(
    (latest, worklog) => {
      const candidate = worklog.updated ?? worklog.created;
      const candidateTime = candidate ? new Date(candidate).getTime() : Number.NaN;
      return candidate && Number.isFinite(candidateTime) && candidateTime > latest.time
        ? { time: candidateTime, value: candidate }
        : latest;
    },
    { time: 0, value: new Date(0).toISOString() }
  ).value;

  return {
    weekKey,
    weekStartISO: weekStart.toISOString(),
    weekEndExclusiveISO: weekEndExclusive.toISOString(),
    syncedAt,
    accountId,
    jiraSite,
    trackedSeconds: summary.trackedSeconds,
    issueCount: summary.issueCount,
    worklogCount: summary.worklogCount,
    daySummaries: summary.daySummaries,
    sourceWorklogs
  } satisfies SyncResult;
};

export const saveSyncResult = async (result: SyncResult) => {
  await Promise.all([
    writeStore("syncResults", result),
    reconcileJiraWorklogCache(result),
    saveActiveJiraContext(result)
  ]);
};

export const getWorklogAllocationPreferences = () =>
  readAllStore<WorklogAllocationPreference>("worklogAllocationPreferences");

export const saveWorklogAllocationPreference = (preference: WorklogAllocationPreference) =>
  writeStore("worklogAllocationPreferences", preference);

export const getJiraActivityResult = (weekKey: string) => {
  return readStore<JiraActivitySyncResult>("jiraActivityResults", weekKey);
};

export const saveJiraActivityResult = (result: JiraActivitySyncResult) => {
  return writeStore("jiraActivityResults", result);
};

export const getBitbucketReviewResult = (weekKey: string) => {
  return readStore<BitbucketReviewSyncResult>("bitbucketReviewResults", weekKey);
};

export const saveBitbucketReviewResult = (result: BitbucketReviewSyncResult) => {
  return writeStore("bitbucketReviewResults", result);
};

export const getFavoriteKeys = async (): Promise<string[]> => {
  const stored = await readStore<{ id: string; keys: string[] }>("favorites", FAVORITES_KEY);
  return stored?.keys ?? [];
};

export const saveFavoriteKeys = (keys: string[]) => {
  return writeStore("favorites", { id: FAVORITES_KEY, keys });
};

export const getPersonalNotes = async (weekKey: string): Promise<PersonalNote[]> => {
  const stored = await readStore<{ weekKey: string; notes: PersonalNote[] }>("personalNotes", weekKey);
  return stored?.notes ?? [];
};

export const savePersonalNotes = (weekKey: string, notes: PersonalNote[]) => {
  return writeStore("personalNotes", { weekKey, notes });
};

export const getRecurringEvents = async (): Promise<RecurringEvent[] | undefined> => {
  const stored = await readStore<{ id: string; events: RecurringEvent[] }>(
    "recurringEvents",
    RECURRING_EVENTS_KEY
  );
  return stored?.events;
};

export const saveRecurringEvents = (events: RecurringEvent[]) => {
  return writeStore("recurringEvents", { id: RECURRING_EVENTS_KEY, events });
};

export const getRecurringOccurrences = async (weekKey: string): Promise<RecurringOccurrence[]> => {
  const stored = await readStore<{ weekKey: string; occurrences: RecurringOccurrence[] }>(
    "recurringOccurrences",
    weekKey
  );
  return stored?.occurrences ?? [];
};

export const saveRecurringOccurrences = (weekKey: string, occurrences: RecurringOccurrence[]) => {
  return writeStore("recurringOccurrences", { weekKey, occurrences });
};

interface StoredReconstructDraft {
  placements: Record<string, number>;
  /** signalId → overridden duration in minutes (optional; falls back to the estimate). */
  durations: Record<string, number>;
}

/** Per-day Day-Reconstruction draft: signal placements + duration overrides. */
export const getReconstructDraft = async (dateKey: string): Promise<StoredReconstructDraft | undefined> => {
  const stored = await readStore<{ dateKey: string } & Partial<StoredReconstructDraft>>("reconstructDrafts", dateKey);
  if (!stored) {
    return undefined;
  }
  return { placements: stored.placements ?? {}, durations: stored.durations ?? {} };
};

export const saveReconstructDraft = (
  dateKey: string,
  placements: Record<string, number>,
  durations: Record<string, number>
) => {
  return writeStore("reconstructDrafts", { dateKey, placements, durations });
};

interface StoredAiDrafts {
  entries: Record<string, string>;
  gaps: Record<string, string>;
}

/** Per-day cached local-AI drafts (signalId → prose, hour → gap note). */
export const getReconstructAiDrafts = async (dateKey: string): Promise<StoredAiDrafts | undefined> => {
  const stored = await readStore<{ dateKey: string; drafts: StoredAiDrafts }>("reconstructAiDrafts", dateKey);
  return stored?.drafts;
};

export const saveReconstructAiDrafts = (dateKey: string, drafts: StoredAiDrafts) => {
  return writeStore("reconstructAiDrafts", { dateKey, drafts });
};

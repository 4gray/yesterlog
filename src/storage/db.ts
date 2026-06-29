import type {
  AppSettings,
  BitbucketReviewSyncResult,
  PersonalNote,
  RecurringEvent,
  RecurringOccurrence,
  SyncResult,
  WeekOverride
} from "../../shared/types";
import { normalizeWorkingDays } from "../../shared/weekdays";
import { DEFAULT_SETTINGS } from "../domain/week";

const DB_NAME = "jira-week-tracker";
const DB_VERSION = 7;
const SETTINGS_KEY = "default";
const FAVORITES_KEY = "default";
const RECURRING_EVENTS_KEY = "default";

type StoreName =
  | "settings"
  | "weekOverrides"
  | "syncResults"
  | "favorites"
  | "personalNotes"
  | "bitbucketReviewResults"
  | "recurringEvents"
  | "recurringOccurrences"
  | "reconstructDrafts"
  | "reconstructAiDrafts";

let dbPromise: Promise<IDBDatabase> | undefined;

const openDatabase = () => {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
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

export const saveWeekOverride = (override: WeekOverride) => {
  return writeStore("weekOverrides", override);
};

export const getSyncResult = (weekKey: string) => {
  return readStore<SyncResult>("syncResults", weekKey);
};

export const saveSyncResult = (result: SyncResult) => {
  return writeStore("syncResults", result);
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

import type { AppSettings, BitbucketReviewSyncResult, PersonalNote, SyncResult, WeekOverride } from "../../shared/types";
import { DEFAULT_SETTINGS } from "../domain/week";

const DB_NAME = "jira-week-tracker";
const DB_VERSION = 4;
const SETTINGS_KEY = "default";
const FAVORITES_KEY = "default";

type StoreName =
  | "settings"
  | "weekOverrides"
  | "syncResults"
  | "favorites"
  | "personalNotes"
  | "bitbucketReviewResults";

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
    ...settings
  };
};

export const saveSettings = (settings: AppSettings) => {
  return writeStore("settings", {
    id: SETTINGS_KEY,
    ...settings
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

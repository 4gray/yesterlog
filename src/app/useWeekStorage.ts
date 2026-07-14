import { useEffect, useRef } from "react";
import type {
  AppSettings,
  BitbucketReviewSyncResult,
  JiraActivitySyncResult,
  PersonalNote,
  RecurringEvent,
  RecurringOccurrence,
  SyncResult,
  WeekOverride,
  WorklogAllocationPreference
} from "../../shared/types";
import { buildDefaultRecurringEvents } from "../domain/recurring";
import {
  getBitbucketReviewResult,
  getFavoriteKeys,
  getJiraActivityResult,
  getPersonalNotes,
  getRecurringEvents,
  getRecurringOccurrences,
  getSettings,
  getSyncResult,
  getWorklogAllocationPreferences,
  getWeekOverride,
  getWeekOverrides,
  saveRecurringEvents
} from "../storage/db";
import { toLocalDateKey } from "../utils/date";

export interface WeekStorageClient {
  getSettings(): Promise<AppSettings>;
  getWeekOverride(weekKey: string): Promise<WeekOverride>;
  getWeekOverrides(): Promise<WeekOverride[]>;
  getSyncResult(weekKey: string): Promise<SyncResult | undefined>;
  getWorklogAllocationPreferences(): Promise<WorklogAllocationPreference[]>;
  getJiraActivityResult(weekKey: string): Promise<JiraActivitySyncResult | undefined>;
  getFavoriteKeys(): Promise<string[]>;
  getPersonalNotes(weekKey: string): Promise<PersonalNote[]>;
  getBitbucketReviewResult(weekKey: string): Promise<BitbucketReviewSyncResult | undefined>;
  getRecurringEvents(): Promise<RecurringEvent[] | undefined>;
  getRecurringOccurrences(weekKey: string): Promise<RecurringOccurrence[]>;
  saveRecurringEvents(events: RecurringEvent[]): Promise<void>;
}

interface UseWeekStorageOptions {
  isDemo: boolean;
  isBooting: boolean;
  weekStart: Date;
  storage?: WeekStorageClient;
  setSettings: (settings: AppSettings) => void;
  setSettingsDraft: (settings: AppSettings) => void;
  setWeekOverride: (override: WeekOverride) => void;
  setWeekOverrides: (overrides: WeekOverride[]) => void;
  setSyncResult: (result: SyncResult | undefined) => void;
  setWorklogAllocationPreferences: (preferences: WorklogAllocationPreference[]) => void;
  setJiraActivityResult: (result: JiraActivitySyncResult | undefined) => void;
  setFavoriteKeys: (keys: string[]) => void;
  setPersonalNotes: (notes: PersonalNote[]) => void;
  setBitbucketReviewResult: (result: BitbucketReviewSyncResult | undefined) => void;
  setRecurringEvents: (events: RecurringEvent[]) => void;
  setRecurringOccurrences: (occurrences: RecurringOccurrence[]) => void;
  setIsBooting: (isBooting: boolean) => void;
  showError: (message: string) => void;
}

const defaultStorage: WeekStorageClient = {
  getSettings,
  getWeekOverride,
  getWeekOverrides,
  getSyncResult,
  getWorklogAllocationPreferences,
  getJiraActivityResult,
  getFavoriteKeys,
  getPersonalNotes,
  getBitbucketReviewResult,
  getRecurringEvents,
  getRecurringOccurrences,
  saveRecurringEvents
};

export const useWeekStorage = ({
  isDemo,
  isBooting,
  weekStart,
  storage = defaultStorage,
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
}: UseWeekStorageOptions) => {
  const skipInitialWeekReloadRef = useRef(false);

  useEffect(() => {
    if (isDemo || !isBooting) {
      return;
    }

    let isMounted = true;

    const loadInitialState = async () => {
      const weekKey = toLocalDateKey(weekStart);
      const [
        storedSettings,
        storedOverride,
        storedWeekOverrides,
        storedSyncResult,
        storedWorklogAllocationPreferences,
        storedJiraActivityResult,
        storedFavorites,
        storedPersonalNotes,
        storedBitbucketReviewResult,
        storedRecurringEvents,
        storedRecurringOccurrences
      ] = await Promise.all([
        storage.getSettings(),
        storage.getWeekOverride(weekKey),
        storage.getWeekOverrides(),
        storage.getSyncResult(weekKey),
        storage.getWorklogAllocationPreferences(),
        storage.getJiraActivityResult(weekKey),
        storage.getFavoriteKeys(),
        storage.getPersonalNotes(weekKey),
        storage.getBitbucketReviewResult(weekKey),
        storage.getRecurringEvents(),
        storage.getRecurringOccurrences(weekKey)
      ]);

      if (!isMounted) {
        return;
      }

      // Seed the prototype defaults the first time the feature is opened so it
      // is discoverable rather than empty; persist so the seed is stable.
      let recurringEventsToUse = storedRecurringEvents;
      if (!recurringEventsToUse) {
        recurringEventsToUse = buildDefaultRecurringEvents();
        await storage.saveRecurringEvents(recurringEventsToUse);
      }

      if (!isMounted) {
        return;
      }

      setSettings(storedSettings);
      setSettingsDraft(storedSettings);
      setWeekOverride(storedOverride);
      setWeekOverrides(storedWeekOverrides);
      setSyncResult(storedSyncResult);
      setWorklogAllocationPreferences(storedWorklogAllocationPreferences);
      setJiraActivityResult(storedJiraActivityResult);
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
      if (isMounted) {
        setIsBooting(false);
        showError("Unable to load local tracker data.");
      }
    });

    return () => {
      isMounted = false;
    };
  }, [
    isBooting,
    isDemo,
    setBitbucketReviewResult,
    setFavoriteKeys,
    setJiraActivityResult,
    setIsBooting,
    setPersonalNotes,
    setRecurringEvents,
    setRecurringOccurrences,
    setSettings,
    setSettingsDraft,
    setSyncResult,
    setWorklogAllocationPreferences,
    setWeekOverride,
    setWeekOverrides,
    showError,
    storage,
    weekStart
  ]);

  useEffect(() => {
    if (isDemo || isBooting) {
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
        storedJiraActivityResult,
        storedPersonalNotes,
        storedBitbucketReviewResult,
        storedRecurringOccurrences
      ] = await Promise.all([
        storage.getWeekOverride(weekKey),
        storage.getSyncResult(weekKey),
        storage.getJiraActivityResult(weekKey),
        storage.getPersonalNotes(weekKey),
        storage.getBitbucketReviewResult(weekKey),
        storage.getRecurringOccurrences(weekKey)
      ]);

      if (!isMounted) {
        return;
      }

      setWeekOverride(storedOverride);
      setSyncResult(storedSyncResult);
      setJiraActivityResult(storedJiraActivityResult);
      setPersonalNotes(storedPersonalNotes);
      setBitbucketReviewResult(storedBitbucketReviewResult);
      setRecurringOccurrences(storedRecurringOccurrences);
    };

    loadWeek().catch((error) => {
      console.error(error);
      if (isMounted) {
        showError("Unable to load the selected week.");
      }
    });

    return () => {
      isMounted = false;
    };
  }, [
    isBooting,
    isDemo,
    setBitbucketReviewResult,
    setJiraActivityResult,
    setPersonalNotes,
    setRecurringOccurrences,
    setSyncResult,
    setWeekOverride,
    showError,
    storage,
    weekStart
  ]);
};

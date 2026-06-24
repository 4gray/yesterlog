import { useEffect, useRef } from "react";
import type {
  AppSettings,
  BitbucketReviewSyncResult,
  ReminderSchedulePayload,
  ReminderScheduleResult,
  SyncResult
} from "../../shared/types";
import { nativeApi } from "../api/native";

export interface AppLifecycleClient {
  scheduleReminder(payload: ReminderSchedulePayload): Promise<ReminderScheduleResult>;
}

interface UseAppLifecycleEffectsOptions {
  isDemo: boolean;
  isBooting: boolean;
  isConfigured: boolean;
  isBitbucketReady: boolean;
  settings: AppSettings;
  weekKey: string;
  skippedDates: string[];
  remainingWeekHours: number;
  todayDateKey: string;
  runSync: () => Promise<SyncResult | undefined>;
  runReviewSync: () => Promise<BitbucketReviewSyncResult | undefined>;
  client?: AppLifecycleClient;
}

export const useAppLifecycleEffects = ({
  isDemo,
  isBooting,
  isConfigured,
  isBitbucketReady,
  settings,
  weekKey,
  skippedDates,
  remainingWeekHours,
  todayDateKey,
  runSync,
  runReviewSync,
  client = nativeApi
}: UseAppLifecycleEffectsOptions) => {
  const startupSyncCheckedRef = useRef(false);

  useEffect(() => {
    if (isDemo || isBooting || startupSyncCheckedRef.current) {
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
  }, [isBitbucketReady, isBooting, isConfigured, isDemo, runReviewSync, runSync]);

  useEffect(() => {
    if (isDemo) {
      return;
    }

    void client
      .scheduleReminder({
        settings,
        weekKey,
        skippedDates,
        remainingWeekHours,
        todayDateKey
      })
      .then((result) => {
        if (result.reason === "unsupported" && result.message) {
          console.warn(result.message);
        }
      })
      .catch((error) => {
        console.warn("Unable to schedule reminder.", error);
      });
  }, [client, isDemo, remainingWeekHours, settings, skippedDates, todayDateKey, weekKey]);
};

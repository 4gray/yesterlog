import { useCallback, useState } from "react";
import type {
  AppSettings,
  BitbucketConnectionResult,
  JiraConnectionResult,
  SyncResult
} from "../../shared/types";
import { normalizeWorkingDays } from "../../shared/weekdays";
import { nativeApi } from "../api/native";
import { getBitbucketRepositorySlugs } from "../domain/bitbucketReview";
import { DEFAULT_SETTINGS } from "../domain/week";
import { saveSettings as saveSettingsToStorage } from "../storage/db";
import { normalizeJiraSiteInput } from "./appHelpers";

export type WelcomeConnectPayload = Pick<AppSettings, "jiraBaseUrl" | "jiraEmail" | "jiraApiToken">;

export interface SettingsActionsClient {
  testJiraConnection(settings: AppSettings): Promise<JiraConnectionResult>;
  testBitbucketConnection(settings: AppSettings): Promise<BitbucketConnectionResult>;
}

interface UseSettingsActionsOptions {
  settingsDraft: AppSettings;
  isDemo: boolean;
  demoSyncResult?: SyncResult;
  client?: SettingsActionsClient;
  saveSettings?: (settings: AppSettings) => Promise<void>;
  runSync: (settingsForSync?: AppSettings) => Promise<SyncResult | undefined>;
  loadTickets: (settingsForLoad?: AppSettings) => Promise<unknown>;
  setSettings: (settings: AppSettings) => void;
  setSettingsDraft: (settings: AppSettings) => void;
  setWelcomeConnected: (connected: boolean) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

const cleanSettingsDraft = (settingsDraft: AppSettings): AppSettings => ({
  ...settingsDraft,
  jiraBaseUrl: normalizeJiraSiteInput(settingsDraft.jiraBaseUrl),
  jiraEmail: settingsDraft.jiraEmail.trim(),
  bitbucketEmail: settingsDraft.bitbucketEmail.trim(),
  bitbucketApiToken: settingsDraft.bitbucketApiToken.trim(),
  bitbucketWorkspace: settingsDraft.bitbucketWorkspace.trim(),
  bitbucketRepositories: getBitbucketRepositorySlugs(settingsDraft).join(", "),
  bitbucketReviewBucketIssueKey: settingsDraft.bitbucketReviewBucketIssueKey.trim().toUpperCase(),
  weeklyTargetHours: Math.max(Number(settingsDraft.weeklyTargetHours) || 40, 1),
  workingDays: normalizeWorkingDays(settingsDraft.workingDays)
});

const cleanWelcomeSettings = (settingsDraft: AppSettings, payload: WelcomeConnectPayload): AppSettings => ({
  ...settingsDraft,
  ...payload,
  jiraBaseUrl: normalizeJiraSiteInput(payload.jiraBaseUrl),
  jiraEmail: payload.jiraEmail.trim(),
  weeklyTargetHours: settingsDraft.weeklyTargetHours || DEFAULT_SETTINGS.weeklyTargetHours,
  workingDays: normalizeWorkingDays(settingsDraft.workingDays)
});

const cleanBitbucketSettings = (settingsDraft: AppSettings): AppSettings => ({
  ...settingsDraft,
  bitbucketEmail: settingsDraft.bitbucketEmail.trim(),
  bitbucketApiToken: settingsDraft.bitbucketApiToken.trim(),
  bitbucketWorkspace: settingsDraft.bitbucketWorkspace.trim(),
  bitbucketRepositories: getBitbucketRepositorySlugs(settingsDraft).join(", ")
});

export const useSettingsActions = ({
  settingsDraft,
  isDemo,
  demoSyncResult,
  client = nativeApi,
  saveSettings = saveSettingsToStorage,
  runSync,
  loadTickets,
  setSettings,
  setSettingsDraft,
  setWelcomeConnected,
  showSuccess,
  showError
}: UseSettingsActionsOptions) => {
  const [isTesting, setIsTesting] = useState(false);
  const [isTestingBitbucket, setIsTestingBitbucket] = useState(false);

  const handleSaveSettings = useCallback(async () => {
    const cleanedSettings = cleanSettingsDraft(settingsDraft);

    if (!isDemo) {
      await saveSettings(cleanedSettings);
    }
    setSettings(cleanedSettings);
    setSettingsDraft(cleanedSettings);
    showSuccess(isDemo ? "Demo settings updated for this preview." : "Settings saved locally.");
  }, [isDemo, saveSettings, setSettings, setSettingsDraft, settingsDraft, showSuccess]);

  const handleWelcomeConnect = useCallback(
    async (payload: WelcomeConnectPayload): Promise<JiraConnectionResult> => {
      const cleanedSettings = cleanWelcomeSettings(settingsDraft, payload);
      const result = await client.testJiraConnection(cleanedSettings);

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
    },
    [
      client,
      loadTickets,
      runSync,
      saveSettings,
      setSettings,
      setSettingsDraft,
      setWelcomeConnected,
      settingsDraft,
      showError,
      showSuccess
    ]
  );

  const handleTestConnection = useCallback(async () => {
    setIsTesting(true);

    try {
      if (isDemo && demoSyncResult) {
        const displayName = demoSyncResult.displayName ?? "Demo Timekeeper";
        showSuccess(`Connected as ${displayName}.`);
        return;
      }

      const result = await client.testJiraConnection({
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
  }, [client, demoSyncResult, isDemo, settingsDraft, showError, showSuccess]);

  const handleTestBitbucketConnection = useCallback(async () => {
    setIsTestingBitbucket(true);

    try {
      const cleanedSettings = cleanBitbucketSettings(settingsDraft);

      if (isDemo) {
        showSuccess("Connected to Bitbucket as Demo Reviewer; found Explorer Web.");
        return;
      }

      const result = await client.testBitbucketConnection(cleanedSettings);
      if (result.ok) {
        showSuccess(result.message);
      } else {
        showError(result.message);
      }
    } finally {
      setIsTestingBitbucket(false);
    }
  }, [client, isDemo, settingsDraft, showError, showSuccess]);

  return {
    isTesting,
    isTestingBitbucket,
    handleSaveSettings,
    handleWelcomeConnect,
    handleTestConnection,
    handleTestBitbucketConnection
  };
};

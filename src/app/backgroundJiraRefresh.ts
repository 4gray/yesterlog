import type { AppSettings, SyncResult } from "../../shared/types";
import type { JiraSyncReconciler, RunJiraSyncOptions } from "./useJiraSync";

export type RunJiraSync = (
  settingsForSync?: AppSettings,
  options?: RunJiraSyncOptions
) => Promise<SyncResult | undefined>;

export type LoadJiraTickets = (settingsForLoad?: AppSettings) => Promise<unknown>;

interface QueueBackgroundJiraRefreshOptions {
  settings: AppSettings;
  runSync: RunJiraSync;
  loadTickets: LoadJiraTickets;
  context: string;
  reconcile?: JiraSyncReconciler;
}

export const runBackgroundTask = (description: string, task: () => Promise<unknown>) => {
  let pending: Promise<unknown>;

  try {
    pending = task();
  } catch (error) {
    console.error(`Unable to ${description}.`, error);
    return;
  }

  void pending.catch((error) => {
    console.error(`Unable to ${description}.`, error);
  });
};

/**
 * Reconcile Jira-owned data after a confirmed mutation without keeping its dialog
 * open. Worklog sync and ticket refresh intentionally run in parallel; each failure
 * is isolated because Jira has already accepted the user's write.
 */
export const queueBackgroundJiraRefresh = ({
  settings,
  runSync,
  loadTickets,
  context,
  reconcile
}: QueueBackgroundJiraRefreshOptions) => {
  runBackgroundTask(`reconcile Jira worklogs after ${context}`, () =>
    runSync(settings, { queueAfterCurrent: true, mode: "delta", reconcile })
  );
  runBackgroundTask(`refresh Jira tickets after ${context}`, () => loadTickets(settings));
};

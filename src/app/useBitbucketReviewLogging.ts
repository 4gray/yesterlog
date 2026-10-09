import { useCallback, useState } from "react";
import type {
  AddWorklogRequest,
  AddWorklogResult,
  AppSettings,
  BitbucketLoggedReview,
  BitbucketReviewSession,
  BitbucketReviewSyncResult,
  BitbucketReviewTargetMode,
  JiraTicket,
  SyncResult
} from "../../shared/types";
import { nativeApi } from "../api/native";
import {
  buildReviewWorklogComment,
  getReviewTargetIssueKey,
  markReviewSessionsLogged
} from "../domain/bitbucketReview";
import { mergeCreatedWorklogIntoSyncResult } from "../domain/syncResult";
import {
  saveBitbucketReviewResult as saveBitbucketReviewResultToStorage,
  saveSyncResult as saveSyncResultToStorage
} from "../storage/db";
import {
  queueBackgroundJiraRefresh,
  runBackgroundTask,
  type RunJiraSync
} from "./backgroundJiraRefresh";

export interface BitbucketReviewLoggingClient {
  addWorklog(request: AddWorklogRequest): Promise<AddWorklogResult>;
}

interface UseBitbucketReviewLoggingOptions {
  settings: AppSettings;
  sourceResult?: BitbucketReviewSyncResult;
  isDemo: boolean;
  client?: BitbucketReviewLoggingClient;
  saveBitbucketReviewResult?: (result: BitbucketReviewSyncResult) => Promise<void>;
  /** Current Jira week cache; logged reviews are merged into it optimistically like Add Time does. */
  syncResult?: SyncResult;
  onSyncResult?: (result: SyncResult) => void;
  saveSyncResult?: (result: SyncResult) => Promise<void>;
  /** Known ticket metadata for the issue the review time goes to (dock/recent/search tickets). */
  resolveTicket?: (issueKey: string) => JiraTicket | undefined;
  runSync: RunJiraSync;
  loadTickets: (settingsForLoad?: AppSettings) => Promise<unknown>;
  onReviewResult: (result: BitbucketReviewSyncResult) => void;
  setLogError: (message: string | undefined) => void;
  showInfo: (message: string) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

export const useBitbucketReviewLogging = ({
  settings,
  sourceResult,
  isDemo,
  client = nativeApi,
  saveBitbucketReviewResult = saveBitbucketReviewResultToStorage,
  syncResult,
  onSyncResult,
  saveSyncResult = saveSyncResultToStorage,
  resolveTicket,
  runSync,
  loadTickets,
  onReviewResult,
  setLogError,
  showInfo,
  showSuccess,
  showError
}: UseBitbucketReviewLoggingOptions) => {
  const [isLoggingReview, setIsLoggingReview] = useState(false);

  /**
   * The ticket the optimistic week entry is built from. Review targets are often the shared
   * review bucket issue, which rarely appears in the dock, so fall back to what the week cache
   * already knows about the issue and finally to a minimal stub; the background reconcile
   * replaces the stub with Jira's own metadata.
   */
  const ticketForIssue = useCallback(
    (issueKey: string): JiraTicket => {
      const known = resolveTicket?.(issueKey);
      if (known) {
        return known;
      }
      const cached = syncResult
        ? Object.values(syncResult.daySummaries)
            .flatMap((bucket) => bucket.issues)
            .find((issue) => issue.key === issueKey)
        : undefined;
      const baseUrl = settings.jiraBaseUrl.trim().replace(/\/+$/, "");
      return {
        id: cached?.id ?? issueKey,
        key: issueKey,
        summary: cached?.summary ?? "Code review",
        projectKey: issueKey.split("-")[0] ?? "",
        projectName: "",
        statusName: "",
        statusCategory: "unknown",
        loggedSecondsTotal: 0,
        issueType: cached?.issueType,
        epic: cached?.epic,
        url: cached?.url ?? (baseUrl ? `${baseUrl}/browse/${issueKey}` : "")
      };
    },
    [resolveTicket, settings.jiraBaseUrl, syncResult]
  );

  const handleLogReviewSessions = useCallback(
    async (
      sessionIds: string[],
      targetMode: BitbucketReviewTargetMode,
      durationOverrides: Record<string, number> = {},
      startedISOOverrides: Record<string, string> = {}
    ): Promise<boolean> => {
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

      const loggedSessions: Array<{ sessionId: string; logged: BitbucketLoggedReview }> = [];
      type CreatedWorklog = Parameters<typeof mergeCreatedWorklogIntoSyncResult>[1];
      const createdWorklogs: CreatedWorklog[] = [];
      let failure: string | undefined;

      try {
        if (isDemo) {
          const demoLogged = sessionsToLog.flatMap((session, index) => {
            const issueKey = getReviewTargetIssueKey(session, settings, targetMode);
            const timeSpentSeconds =
              durationOverrides[session.id] && durationOverrides[session.id] > 0
                ? durationOverrides[session.id]
                : session.estimatedSeconds;
            return issueKey
              ? [
                  {
                    sessionId: session.id,
                    logged: {
                      issueKey,
                      worklogId: `demo-review-wl-${index + 1}`,
                      loggedAt: new Date().toISOString(),
                      targetMode,
                      timeSpentSeconds,
                      estimatedSecondsAtLog: session.estimatedSeconds
                    }
                  }
                ]
              : [];
          });
          const updated = markReviewSessionsLogged(sourceResult, demoLogged);
          onReviewResult(updated);
          showSuccess(`Demo logged ${demoLogged.length} review sessions.`);
          return demoLogged.length > 0;
        }

        for (const session of sessionsToLog) {
          const issueKey = getReviewTargetIssueKey(session, settings, targetMode);
          const timeSpentSeconds =
            durationOverrides[session.id] && durationOverrides[session.id] > 0
              ? durationOverrides[session.id]
              : session.estimatedSeconds;
          const overrideStartedISO = startedISOOverrides[session.id];
          const startedISO =
            overrideStartedISO && !Number.isNaN(new Date(overrideStartedISO).getTime())
              ? overrideStartedISO
              : session.startedISO;

          if (!issueKey) {
            continue;
          }

          try {
            const comment = buildReviewWorklogComment(session);
            const result = await client.addWorklog({
              settings,
              issueKey,
              timeSpentSeconds,
              startedISO,
              comment
            });
            createdWorklogs.push({
              ticket: ticketForIssue(issueKey),
              worklogId: result.worklogId,
              startedISO,
              timeSpentSeconds: result.timeSpentSeconds,
              comment,
              syncedAtISO: new Date().toISOString()
            });
            loggedSessions.push({
              sessionId: session.id,
              logged: {
                issueKey,
                worklogId: result.worklogId,
                loggedAt: new Date().toISOString(),
                targetMode,
                timeSpentSeconds: result.timeSpentSeconds,
                estimatedSecondsAtLog: session.estimatedSeconds
              }
            });
          } catch (error) {
            failure = error instanceof Error ? error.message : `Unable to log review session for PR #${session.pullRequestId}.`;
            break;
          }
        }

        if (loggedSessions.length > 0) {
          const updated = markReviewSessionsLogged(sourceResult, loggedSessions);
          onReviewResult(updated);
          runBackgroundTask("save the logged review sessions", () => saveBitbucketReviewResult(updated));
          showSuccess(`Logged ${loggedSessions.length} review ${loggedSessions.length === 1 ? "session" : "sessions"} to Jira.`);

          // Show the new worklogs in Week/Today right away instead of waiting for the next
          // Jira sync (whose search index may also lag behind the write).
          const mergeAll = (base: SyncResult | undefined) =>
            createdWorklogs.reduce<SyncResult | undefined>(
              (accumulated, worklog) => mergeCreatedWorklogIntoSyncResult(accumulated, worklog) ?? accumulated,
              base
            );
          const optimistic = mergeAll(syncResult);
          if (optimistic && optimistic !== syncResult && onSyncResult) {
            onSyncResult(optimistic);
            runBackgroundTask("cache the logged review worklogs", () => saveSyncResult(optimistic));
          }
          queueBackgroundJiraRefresh({
            settings,
            runSync,
            loadTickets,
            context: "logging review sessions",
            reconcile: async (syncedResult) => mergeAll(syncedResult) ?? syncedResult
          });
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
    },
    [
      client,
      isDemo,
      loadTickets,
      onReviewResult,
      onSyncResult,
      runSync,
      saveBitbucketReviewResult,
      saveSyncResult,
      setLogError,
      settings,
      showError,
      showInfo,
      showSuccess,
      sourceResult,
      syncResult,
      ticketForIssue
    ]
  );

  return {
    isLoggingReview,
    handleLogReviewSessions
  };
};

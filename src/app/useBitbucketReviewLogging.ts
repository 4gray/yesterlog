import { useCallback, useState } from "react";
import type {
  AddWorklogRequest,
  AddWorklogResult,
  AppSettings,
  BitbucketLoggedReview,
  BitbucketReviewSession,
  BitbucketReviewSyncResult,
  BitbucketReviewTargetMode,
  SyncResult
} from "../../shared/types";
import { nativeApi } from "../api/native";
import {
  buildReviewWorklogComment,
  getReviewTargetIssueKey,
  markReviewSessionsLogged
} from "../domain/bitbucketReview";
import { saveBitbucketReviewResult as saveBitbucketReviewResultToStorage } from "../storage/db";

export interface BitbucketReviewLoggingClient {
  addWorklog(request: AddWorklogRequest): Promise<AddWorklogResult>;
}

interface UseBitbucketReviewLoggingOptions {
  settings: AppSettings;
  sourceResult?: BitbucketReviewSyncResult;
  isDemo: boolean;
  client?: BitbucketReviewLoggingClient;
  saveBitbucketReviewResult?: (result: BitbucketReviewSyncResult) => Promise<void>;
  runSync: (
    settingsForSync?: AppSettings,
    options?: { queueAfterCurrent?: boolean }
  ) => Promise<SyncResult | undefined>;
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
  runSync,
  loadTickets,
  onReviewResult,
  setLogError,
  showInfo,
  showSuccess,
  showError
}: UseBitbucketReviewLoggingOptions) => {
  const [isLoggingReview, setIsLoggingReview] = useState(false);

  const handleLogReviewSessions = useCallback(
    async (
      sessionIds: string[],
      targetMode: BitbucketReviewTargetMode,
      durationOverrides: Record<string, number> = {}
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

          if (!issueKey) {
            continue;
          }

          try {
            const result = await client.addWorklog({
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
          await saveBitbucketReviewResult(updated);
          onReviewResult(updated);
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
    },
    [
      client,
      isDemo,
      loadTickets,
      onReviewResult,
      runSync,
      saveBitbucketReviewResult,
      setLogError,
      settings,
      showError,
      showInfo,
      showSuccess,
      sourceResult
    ]
  );

  return {
    isLoggingReview,
    handleLogReviewSessions
  };
};

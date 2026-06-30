import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AppSettings,
  IssueDetailsResult,
  JiraIssueDetails,
  JiraTicket,
  OpenCursorPromptResult,
  SyncResult,
  WeekState
} from "../../shared/types";
import { buildCursorPromptDeeplink } from "../../shared/cursorDeeplink";
import { nativeApi } from "../api/native";

const EMPTY_TICKETS: JiraTicket[] = [];

interface UseTicketDetailsOptions {
  settings: AppSettings;
  isDemo: boolean;
  weekState: WeekState;
  syncResult?: SyncResult;
  tickets?: {
    inProgress: JiraTicket[];
    recentlyClosed: JiraTicket[];
  };
  selectedTicket?: JiraTicket;
}

const ticketToDetails = (ticket: JiraTicket): JiraIssueDetails => ({
  ...ticket,
  myLoggedSecondsTotal: 0,
  myWorklogCount: 0
});

const issueToDetails = (issue: WeekState["days"][number]["issues"][number]): JiraIssueDetails => ({
  id: issue.id,
  key: issue.key,
  summary: issue.summary,
  projectKey: issue.key.split("-")[0],
  projectName: issue.key.split("-")[0],
  statusName: "Unknown",
  statusCategory: "unknown",
  loggedSecondsTotal: issue.loggedSeconds,
  issueType: issue.issueType,
  epic: issue.epic,
  url: issue.url ?? "",
  myLoggedSecondsTotal: 0,
  myWorklogCount: 0
});

const ticketsAsList = (
  tickets: UseTicketDetailsOptions["tickets"],
  selectedTicket: JiraTicket | undefined
) => {
  const list = tickets ? [...tickets.inProgress, ...tickets.recentlyClosed] : EMPTY_TICKETS;
  return selectedTicket ? [selectedTicket, ...list] : list;
};

export const buildLocalTicketDetails = ({
  issueKey,
  weekState,
  tickets,
  selectedTicket
}: Pick<UseTicketDetailsOptions, "weekState" | "tickets" | "selectedTicket"> & {
  issueKey?: string;
}) => {
  const normalizedKey = issueKey?.trim().toUpperCase();

  if (!normalizedKey) {
    return undefined;
  }

  const ticket = ticketsAsList(tickets, selectedTicket).find((candidate) => candidate.key === normalizedKey);

  if (ticket) {
    return ticketToDetails(ticket);
  }

  for (const day of weekState.days) {
    const issue = day.issues.find((candidate) => candidate.key === normalizedKey);

    if (issue) {
      return issueToDetails(issue);
    }
  }

  return undefined;
};

export const buildTicketWeekStats = ({
  issueKey,
  weekState,
  syncResult
}: Pick<UseTicketDetailsOptions, "weekState" | "syncResult"> & {
  issueKey?: string;
}) => {
  const normalizedKey = issueKey?.trim().toUpperCase();

  if (!normalizedKey) {
    return { loggedSeconds: 0, worklogCount: 0 };
  }

  const visibleDayKeys = new Set(weekState.days.map((day) => day.dateKey));
  const visibleSyncResult = syncResult?.weekKey === weekState.weekKey ? syncResult : undefined;

  if (visibleSyncResult) {
    let loggedSeconds = 0;
    let worklogCount = 0;

    for (const [dateKey, bucket] of Object.entries(visibleSyncResult.daySummaries)) {
      if (!visibleDayKeys.has(dateKey)) {
        continue;
      }

      for (const worklog of bucket.worklogs) {
        if (worklog.issueKey === normalizedKey) {
          loggedSeconds += worklog.timeSpentSeconds;
          worklogCount += 1;
        }
      }
    }

    return { loggedSeconds, worklogCount };
  }

  const loggedSeconds = weekState.days.reduce((weekTotal, day) => {
    const dayTotal = day.issues.reduce(
      (sum, issue) => sum + (issue.key === normalizedKey ? issue.loggedSeconds : 0),
      0
    );
    return weekTotal + dayTotal;
  }, 0);

  return { loggedSeconds, worklogCount: 0 };
};

const hasJiraSettings = (settings: AppSettings) =>
  Boolean(settings.jiraBaseUrl.trim() && settings.jiraEmail.trim() && settings.jiraApiToken.trim());

export const useTicketDetails = ({
  settings,
  isDemo,
  weekState,
  syncResult,
  tickets,
  selectedTicket
}: UseTicketDetailsOptions) => {
  const [issueKey, setIssueKey] = useState<string>();
  const [details, setDetails] = useState<IssueDetailsResult>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();

  const openTicketDetails = useCallback((nextIssueKey: string) => {
    setIssueKey(nextIssueKey.trim().toUpperCase());
  }, []);

  const closeTicketDetails = useCallback(() => {
    setIssueKey(undefined);
    setDetails(undefined);
    setError(undefined);
    setIsLoading(false);
  }, []);

  const localDetails = useMemo(
    () => buildLocalTicketDetails({ issueKey, weekState, tickets, selectedTicket }),
    [issueKey, selectedTicket, tickets, weekState]
  );
  const weekStats = useMemo(
    () => buildTicketWeekStats({ issueKey, weekState, syncResult }),
    [issueKey, syncResult, weekState]
  );

  const openInCursor = useCallback((): Promise<OpenCursorPromptResult> => {
    // Prefer freshly fetched Jira details (they carry the description); fall
    // back to the locally-known ticket so the button still works offline.
    const issue = details ?? localDetails;

    if (!issue) {
      return Promise.resolve({ ok: false, error: "Ticket details are still loading." });
    }

    const deeplink = buildCursorPromptDeeplink({
      key: issue.key,
      summary: issue.summary,
      description: issue.description,
      url: issue.url
    });

    return nativeApi.openCursorPrompt(deeplink);
  }, [details, localDetails]);

  useEffect(() => {
    if (!issueKey || isDemo || !hasJiraSettings(settings)) {
      setDetails(undefined);
      setError(undefined);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    setDetails(undefined);
    setError(undefined);
    setIsLoading(true);

    nativeApi
      .fetchJiraIssueDetails({ settings, issueKey })
      .then((nextDetails) => {
        if (!cancelled) {
          setDetails(nextDetails);
        }
      })
      .catch((fetchError: unknown) => {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Unable to load Jira issue details.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isDemo, issueKey, settings]);

  return {
    issueKey,
    localDetails,
    details,
    weekLoggedSeconds: weekStats.loggedSeconds,
    weekWorklogCount: weekStats.worklogCount,
    isLoading,
    error,
    openTicketDetails,
    closeTicketDetails,
    openInCursor
  };
};

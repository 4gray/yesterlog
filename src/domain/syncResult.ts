import type { JiraIssueSummary, JiraTicket, JiraWorklog, SyncDayBucket, SyncResult } from "../../shared/types";
import { toLocalDateKey } from "../utils/date";

interface CreatedWorklogPayload {
  ticket: JiraTicket;
  worklogId: string;
  startedISO: string;
  timeSpentSeconds: number;
  comment?: string;
  syncedAtISO?: string;
}

const mergeIssue = (bucket: SyncDayBucket, issue: JiraIssueSummary) => {
  const existing = bucket.issues.find((candidate) => candidate.key === issue.key);

  if (existing) {
    existing.loggedSeconds += issue.loggedSeconds;

    if (!existing.issueType && issue.issueType) {
      existing.issueType = issue.issueType;
    }

    if (!existing.epic && issue.epic) {
      existing.epic = issue.epic;
    }

    if (issue.comments?.length) {
      existing.comments = Array.from(new Set([...(existing.comments ?? []), ...issue.comments]));
    }

    return;
  }

  bucket.issues.push(issue);
};

export const mergeCreatedWorklogIntoSyncResult = (
  syncResult: SyncResult | undefined,
  payload: CreatedWorklogPayload
) => {
  if (!syncResult) {
    return undefined;
  }

  const started = new Date(payload.startedISO);
  const weekStart = new Date(syncResult.weekStartISO);
  const weekEndExclusive = new Date(syncResult.weekEndExclusiveISO);

  if (
    Number.isNaN(started.getTime()) ||
    Number.isNaN(weekStart.getTime()) ||
    Number.isNaN(weekEndExclusive.getTime()) ||
    started < weekStart ||
    started >= weekEndExclusive
  ) {
    return syncResult;
  }

  const alreadyHasWorklog = Object.values(syncResult.daySummaries).some((bucket) =>
    bucket.worklogs.some((worklog) => worklog.id === payload.worklogId)
  );

  if (alreadyHasWorklog) {
    return syncResult;
  }

  const dateKey = toLocalDateKey(started);
  const previousBucket = syncResult.daySummaries[dateKey] ?? {
    trackedSeconds: 0,
    issues: [],
    worklogs: []
  };
  const nextBucket: SyncDayBucket = {
    trackedSeconds: previousBucket.trackedSeconds + payload.timeSpentSeconds,
    issues: previousBucket.issues.map((issue) => ({
      ...issue,
      comments: issue.comments ? [...issue.comments] : undefined
    })),
    worklogs: [...previousBucket.worklogs]
  };
  const worklog: JiraWorklog = {
    id: payload.worklogId,
    issueId: payload.ticket.id,
    issueKey: payload.ticket.key,
    issueSummary: payload.ticket.summary,
    issueUrl: payload.ticket.url,
    issueType: payload.ticket.issueType,
    epic: payload.ticket.epic,
    authorAccountId: syncResult.accountId,
    started: payload.startedISO,
    timeSpentSeconds: payload.timeSpentSeconds,
    comment: payload.comment
  };

  nextBucket.worklogs = [...nextBucket.worklogs, worklog].sort(
    (left, right) => new Date(left.started).getTime() - new Date(right.started).getTime()
  );

  mergeIssue(nextBucket, {
    id: payload.ticket.id,
    key: payload.ticket.key,
    summary: payload.ticket.summary,
    url: payload.ticket.url,
    issueType: payload.ticket.issueType,
    epic: payload.ticket.epic,
    loggedSeconds: payload.timeSpentSeconds,
    comments: payload.comment ? [payload.comment] : []
  });

  return {
    ...syncResult,
    syncedAt: payload.syncedAtISO ?? syncResult.syncedAt,
    trackedSeconds: syncResult.trackedSeconds + payload.timeSpentSeconds,
    worklogCount: syncResult.worklogCount + 1,
    issueCount: Math.max(
      syncResult.issueCount,
      Object.values({
        ...syncResult.daySummaries,
        [dateKey]: nextBucket
      }).reduce((keys, bucket) => {
        for (const issue of bucket.issues) {
          keys.add(issue.key);
        }
        return keys;
      }, new Set<string>()).size
    ),
    daySummaries: {
      ...syncResult.daySummaries,
      [dateKey]: nextBucket
    }
  };
};

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

interface UpdatedWorklogPayload {
  worklogId: string;
  startedISO: string;
  timeSpentSeconds: number;
  /** Omit to preserve the existing comment (drag move/resize never touches it). */
  comment?: string;
  syncedAtISO?: string;
}

const cloneIssue = (issue: JiraIssueSummary): JiraIssueSummary => ({
  ...issue,
  comments: issue.comments ? [...issue.comments] : undefined
});

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
    comment: payload.comment,
    created: payload.syncedAtISO,
    updated: payload.syncedAtISO
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
    },
    sourceWorklogs: syncResult.sourceWorklogs
      ? [...syncResult.sourceWorklogs, worklog]
      : undefined
  };
};

/**
 * Apply a drag move/resize to a worklog already in the cached result — the optimistic
 * counterpart to a full re-sync. Finds the worklog by id, updates its `started` /
 * `timeSpentSeconds` (and optionally comment), and keeps the affected day bucket(s) and
 * issue totals consistent. Handles same-day edits (the common case) and cross-midnight
 * moves by shifting the worklog between buckets. Returns the input unchanged when the
 * worklog is absent or the new start falls outside the synced week.
 */
export const mergeUpdatedWorklogIntoSyncResult = (
  syncResult: SyncResult | undefined,
  payload: UpdatedWorklogPayload
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

  let sourceDateKey: string | undefined;
  let existing: JiraWorklog | undefined;
  for (const [dateKey, bucket] of Object.entries(syncResult.daySummaries)) {
    const found = bucket.worklogs.find((worklog) => worklog.id === payload.worklogId);
    if (found) {
      sourceDateKey = dateKey;
      existing = found;
      break;
    }
  }

  if (!existing || !sourceDateKey) {
    return syncResult;
  }

  const oldSeconds = existing.timeSpentSeconds;
  const newSeconds = payload.timeSpentSeconds;
  const targetDateKey = toLocalDateKey(started);
  const updated: JiraWorklog = {
    ...existing,
    started: payload.startedISO,
    timeSpentSeconds: newSeconds,
    comment: payload.comment !== undefined ? payload.comment : existing.comment
  };

  const daySummaries = { ...syncResult.daySummaries };

  // 1) Remove the old worklog from its bucket and back out its logged time.
  const sourceSrc = syncResult.daySummaries[sourceDateKey];
  daySummaries[sourceDateKey] = {
    trackedSeconds: sourceSrc.trackedSeconds - oldSeconds,
    issues: sourceSrc.issues.map((issue) =>
      issue.key === existing!.issueKey
        ? { ...cloneIssue(issue), loggedSeconds: Math.max(0, issue.loggedSeconds - oldSeconds) }
        : cloneIssue(issue)
    ),
    worklogs: sourceSrc.worklogs.filter((worklog) => worklog.id !== payload.worklogId)
  };

  // 2) Insert the updated worklog into its (possibly same) target bucket. Read from
  //    `daySummaries` so a same-day edit chains onto step 1 rather than clobbering it.
  const targetSrc = daySummaries[targetDateKey] ?? { trackedSeconds: 0, issues: [], worklogs: [] };
  const targetIssues = targetSrc.issues.map(cloneIssue);
  const issueIndex = targetIssues.findIndex((issue) => issue.key === updated.issueKey);
  if (issueIndex >= 0) {
    targetIssues[issueIndex] = {
      ...targetIssues[issueIndex],
      loggedSeconds: targetIssues[issueIndex].loggedSeconds + newSeconds
    };
  } else {
    targetIssues.push({
      id: updated.issueId,
      key: updated.issueKey,
      summary: updated.issueSummary,
      url: updated.issueUrl,
      issueType: updated.issueType,
      epic: updated.epic,
      loggedSeconds: newSeconds,
      comments: updated.comment ? [updated.comment] : []
    });
  }

  daySummaries[targetDateKey] = {
    trackedSeconds: targetSrc.trackedSeconds + newSeconds,
    issues: targetIssues,
    worklogs: [...targetSrc.worklogs, updated].sort(
      (left, right) => new Date(left.started).getTime() - new Date(right.started).getTime()
    )
  };

  return {
    ...syncResult,
    syncedAt: payload.syncedAtISO ?? syncResult.syncedAt,
    trackedSeconds: syncResult.trackedSeconds + (newSeconds - oldSeconds),
    daySummaries,
    sourceWorklogs: syncResult.sourceWorklogs?.map((worklog) =>
      worklog.id === payload.worklogId
        ? {
            ...worklog,
            started: payload.startedISO,
            timeSpentSeconds: payload.timeSpentSeconds,
            comment: payload.comment !== undefined ? payload.comment : worklog.comment,
            updated: payload.syncedAtISO ?? worklog.updated
          }
        : worklog
    )
  };
};

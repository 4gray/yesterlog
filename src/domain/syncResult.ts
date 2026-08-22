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

interface MovedWorklogPayload {
  worklogId: string;
  targetTicket: JiraTicket;
  syncedAtISO?: string;
}

interface DeletedWorklogPayload {
  worklogId: string;
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

const issueFromWorklog = (worklog: JiraWorklog, loggedSeconds: number): JiraIssueSummary => ({
  id: worklog.issueId,
  key: worklog.issueKey,
  summary: worklog.issueSummary,
  url: worklog.issueUrl,
  issueType: worklog.issueType,
  epic: worklog.epic,
  loggedSeconds,
  comments: worklog.comment ? [worklog.comment] : []
});

const worklogDisplaySeconds = (worklog: JiraWorklog) =>
  worklog.allocation?.timeSpentSeconds ?? worklog.timeSpentSeconds;

const summarizeIssues = (worklogs: JiraWorklog[]) => {
  const issues: JiraIssueSummary[] = [];
  const summaryBucket: SyncDayBucket = { trackedSeconds: 0, worklogs: [], issues };

  for (const worklog of worklogs) {
    mergeIssue(summaryBucket, issueFromWorklog(worklog, worklogDisplaySeconds(worklog)));
  }

  return issues;
};

const moveWorklogToTicket = (
  worklog: JiraWorklog,
  targetTicket: JiraTicket,
  syncedAtISO?: string
): JiraWorklog => ({
  ...worklog,
  issueId: targetTicket.id,
  issueKey: targetTicket.key,
  issueSummary: targetTicket.summary,
  issueUrl: targetTicket.url,
  issueType: targetTicket.issueType,
  epic: targetTicket.epic,
  projectKey: targetTicket.projectKey,
  projectName: targetTicket.projectName,
  updated: syncedAtISO ?? worklog.updated
});

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
  const nextComment = payload.comment !== undefined ? payload.comment : existing.comment;
  if (
    existing.started === payload.startedISO &&
    oldSeconds === newSeconds &&
    existing.comment === nextComment
  ) {
    return syncResult;
  }
  const updated: JiraWorklog = {
    ...existing,
    started: payload.startedISO,
    timeSpentSeconds: newSeconds,
    comment: nextComment,
    updated: payload.syncedAtISO ?? existing.updated
  };

  const daySummaries = { ...syncResult.daySummaries };

  // 1) Remove the old worklog from its bucket and back out its logged time.
  const sourceSrc = syncResult.daySummaries[sourceDateKey];
  const sourceWorklogs = sourceSrc.worklogs.filter((worklog) => worklog.id !== payload.worklogId);
  daySummaries[sourceDateKey] = {
    trackedSeconds: sourceSrc.trackedSeconds - oldSeconds,
    issues: sourceSrc.issues.map((issue) =>
      issue.key === existing!.issueKey
        ? {
            ...cloneIssue(issue),
            loggedSeconds: Math.max(0, issue.loggedSeconds - oldSeconds),
            comments: Array.from(
              new Set(
                sourceWorklogs
                  .filter((worklog) => worklog.issueKey === issue.key)
                  .flatMap((worklog) => (worklog.comment ? [worklog.comment] : []))
              )
            )
          }
        : cloneIssue(issue)
    ),
    worklogs: sourceWorklogs
  };

  // 2) Insert the updated worklog into its (possibly same) target bucket. Read from
  //    `daySummaries` so a same-day edit chains onto step 1 rather than clobbering it.
  const targetSrc = daySummaries[targetDateKey] ?? { trackedSeconds: 0, issues: [], worklogs: [] };
  const targetIssues = targetSrc.issues.map(cloneIssue);
  const issueIndex = targetIssues.findIndex((issue) => issue.key === updated.issueKey);
  if (issueIndex >= 0) {
    const targetComments = Array.from(
      new Set(
        [...targetSrc.worklogs, updated]
          .filter((worklog) => worklog.issueKey === updated.issueKey)
          .flatMap((worklog) => (worklog.comment ? [worklog.comment] : []))
      )
    );
    targetIssues[issueIndex] = {
      ...targetIssues[issueIndex],
      loggedSeconds: targetIssues[issueIndex].loggedSeconds + newSeconds,
      comments: targetComments
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

/**
 * Move an existing cached worklog to a new Jira issue after Jira accepts the
 * server-side move. The worklog ID, timing, comment, author, and any local bulk
 * allocation stay unchanged; only issue metadata and affected issue summaries
 * change.
 */
export const mergeMovedWorklogIntoSyncResult = (
  syncResult: SyncResult | undefined,
  payload: MovedWorklogPayload
) => {
  if (!syncResult) {
    return undefined;
  }

  const sourceMatch =
    syncResult.sourceWorklogs?.find((worklog) => worklog.id === payload.worklogId) ??
    Object.values(syncResult.daySummaries)
      .flatMap((bucket) => bucket.worklogs)
      .find((worklog) => worklog.id === payload.worklogId);

  if (!sourceMatch || sourceMatch.issueKey === payload.targetTicket.key) {
    return syncResult;
  }

  let changedVisibleBucket = false;
  const daySummaries = Object.fromEntries(
    Object.entries(syncResult.daySummaries).map(([dateKey, bucket]) => {
      if (!bucket.worklogs.some((worklog) => worklog.id === payload.worklogId)) {
        return [dateKey, bucket];
      }

      changedVisibleBucket = true;
      const worklogs = bucket.worklogs.map((worklog) =>
        worklog.id === payload.worklogId
          ? moveWorklogToTicket(worklog, payload.targetTicket, payload.syncedAtISO)
          : worklog
      );
      const issues: JiraIssueSummary[] = [];
      for (const worklog of worklogs) {
        mergeIssue(
          { trackedSeconds: bucket.trackedSeconds, worklogs: [], issues },
          issueFromWorklog(worklog, worklog.allocation?.timeSpentSeconds ?? worklog.timeSpentSeconds)
        );
      }

      return [dateKey, { ...bucket, worklogs, issues }];
    })
  );

  const sourceWorklogs = syncResult.sourceWorklogs?.map((worklog) =>
    worklog.id === payload.worklogId
      ? moveWorklogToTicket(worklog, payload.targetTicket, payload.syncedAtISO)
      : worklog
  );
  const issueCount = changedVisibleBucket
    ? new Set(Object.values(daySummaries).flatMap((bucket) => bucket.issues.map((issue) => issue.key))).size
    : syncResult.issueCount;

  return {
    ...syncResult,
    syncedAt: payload.syncedAtISO ?? syncResult.syncedAt,
    issueCount,
    daySummaries,
    sourceWorklogs
  };
};

/** Remove a Jira-confirmed deletion from the cached raw week immediately. */
export const removeWorklogFromSyncResult = (
  syncResult: SyncResult | undefined,
  payload: DeletedWorklogPayload
) => {
  if (!syncResult) {
    return undefined;
  }

  const sourceContainsWorklog = syncResult.sourceWorklogs?.some(
    (worklog) => worklog.id === payload.worklogId
  );
  const visibleContainsWorklog = Object.values(syncResult.daySummaries).some((bucket) =>
    bucket.worklogs.some((worklog) => worklog.id === payload.worklogId)
  );
  if (!sourceContainsWorklog && !visibleContainsWorklog) {
    return syncResult;
  }

  const daySummaries = Object.fromEntries(
    Object.entries(syncResult.daySummaries).map(([dateKey, bucket]) => {
      const worklogs = bucket.worklogs.filter((worklog) => worklog.id !== payload.worklogId);
      if (worklogs.length === bucket.worklogs.length) {
        return [dateKey, bucket];
      }

      return [
        dateKey,
        {
          trackedSeconds: worklogs.reduce((sum, worklog) => sum + worklogDisplaySeconds(worklog), 0),
          issues: summarizeIssues(worklogs),
          worklogs
        }
      ];
    })
  );
  const visibleWorklogs = Object.values(daySummaries).flatMap((bucket) => bucket.worklogs);

  return {
    ...syncResult,
    syncedAt: payload.syncedAtISO ?? syncResult.syncedAt,
    trackedSeconds: Object.values(daySummaries).reduce((sum, bucket) => sum + bucket.trackedSeconds, 0),
    issueCount: new Set(visibleWorklogs.map((worklog) => worklog.issueKey)).size,
    worklogCount: new Set(visibleWorklogs.map((worklog) => worklog.id)).size,
    daySummaries,
    sourceWorklogs: syncResult.sourceWorklogs?.filter(
      (worklog) => worklog.id !== payload.worklogId
    )
  };
};

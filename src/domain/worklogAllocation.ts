import type {
  AppSettings,
  JiraIssueSummary,
  JiraWorklog,
  SyncDayBucket,
  SyncResult,
  WorklogAllocationDirection,
  WorklogAllocationPreference
} from "../../shared/types";
import { normalizeWorkingDays } from "../../shared/weekdays";
import { addDays, fromLocalDateKey, isoWeekday, toLocalDateKey } from "../utils/date";

const MAX_ALLOCATION_DAYS = 730;
const DEFAULT_ALLOCATION_START_HOUR = 9;

export interface ProjectWorklogsOptions {
  settings: Pick<AppSettings, "weeklyTargetHours" | "workingDays">;
  skippedDates?: string[];
  preferences?: WorklogAllocationPreference[];
  now?: Date;
}

interface PendingAllocation {
  dateKey: string;
  started: string;
  timeSpentSeconds: number;
}

interface TimeRange {
  startSeconds: number;
  endSeconds: number;
}

const rawWorklog = (worklog: JiraWorklog): JiraWorklog => {
  const { allocation: _allocation, ...raw } = worklog;
  return raw;
};

const sourceWorklogs = (syncResult: SyncResult): JiraWorklog[] => {
  const candidates = syncResult.sourceWorklogs?.length
    ? syncResult.sourceWorklogs
    : Object.values(syncResult.daySummaries).flatMap((bucket) => bucket.worklogs);
  const byId = new Map<string, JiraWorklog>();
  for (const candidate of candidates) {
    byId.set(candidate.id, rawWorklog(candidate));
  }
  return [...byId.values()];
};

const allocationStartedISO = (dateKey: string, secondsFromMidnight = DEFAULT_ALLOCATION_START_HOUR * 3600) => {
  const started = fromLocalDateKey(dateKey);
  started.setHours(0, 0, 0, 0);
  started.setSeconds(secondsFromMidnight);
  return started.toISOString();
};

const secondsFromMidnight = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
};

const addBlockedRange = (rangesByDate: Map<string, TimeRange[]>, dateKey: string, range: TimeRange) => {
  const ranges = rangesByDate.get(dateKey) ?? [];
  ranges.push(range);
  rangesByDate.set(dateKey, ranges);
};

const freeRangesForDate = (
  rangesByDate: Map<string, TimeRange[]>,
  dateKey: string,
  workdayStartSeconds: number,
  workdayEndSeconds: number
) => {
  const blocked = (rangesByDate.get(dateKey) ?? [])
    .map((range) => ({
      startSeconds: Math.max(range.startSeconds, workdayStartSeconds),
      endSeconds: Math.min(range.endSeconds, workdayEndSeconds)
    }))
    .filter((range) => range.endSeconds > range.startSeconds)
    .sort((left, right) => left.startSeconds - right.startSeconds);
  const free: TimeRange[] = [];
  let cursor = workdayStartSeconds;

  for (const range of blocked) {
    if (range.startSeconds > cursor) {
      free.push({ startSeconds: cursor, endSeconds: range.startSeconds });
    }
    cursor = Math.max(cursor, range.endSeconds);
    if (cursor >= workdayEndSeconds) {
      return free;
    }
  }

  if (cursor < workdayEndSeconds) {
    free.push({ startSeconds: cursor, endSeconds: workdayEndSeconds });
  }
  return free;
};

const dateKeyFor = (value?: string) => {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : toLocalDateKey(date);
};

const addIssue = (bucket: SyncDayBucket, worklog: JiraWorklog, loggedSeconds: number) => {
  const existing = bucket.issues.find((issue) => issue.key === worklog.issueKey);
  if (existing) {
    existing.loggedSeconds += loggedSeconds;
    if (worklog.comment) {
      existing.comments = Array.from(new Set([...(existing.comments ?? []), worklog.comment]));
    }
    return;
  }

  const issue: JiraIssueSummary = {
    id: worklog.issueId,
    key: worklog.issueKey,
    summary: worklog.issueSummary,
    url: worklog.issueUrl,
    issueType: worklog.issueType,
    epic: worklog.epic,
    loggedSeconds,
    comments: worklog.comment ? [worklog.comment] : []
  };
  bucket.issues.push(issue);
};

const inferDirection = (
  worklog: JiraWorklog,
  preferences: Map<string, WorklogAllocationPreference>
): { direction: WorklogAllocationDirection; isApproximate: boolean } => {
  const preference = preferences.get(worklog.id);
  if (preference) {
    return { direction: preference.direction, isApproximate: false };
  }

  const startedKey = dateKeyFor(worklog.started);
  const createdKey = dateKeyFor(worklog.created);
  return {
    direction: createdKey && startedKey && createdKey > startedKey ? "forward" : "backward",
    isApproximate: true
  };
};

const appendResidual = (
  allocations: PendingAllocation[],
  fallbackDateKey: string,
  seconds: number,
  blockedRanges: Map<string, TimeRange[]>
) => {
  if (seconds <= 0) {
    return;
  }
  const dateKey = allocations[allocations.length - 1]?.dateKey ?? fallbackDateKey;
  const startSeconds = (blockedRanges.get(dateKey) ?? []).reduce(
    (latest, range) => Math.max(latest, range.endSeconds),
    DEFAULT_ALLOCATION_START_HOUR * 3600
  );
  allocations.push({
    dateKey,
    started: allocationStartedISO(dateKey, startSeconds),
    timeSpentSeconds: seconds
  });
  addBlockedRange(blockedRanges, dateKey, {
    startSeconds,
    endSeconds: startSeconds + seconds
  });
};

/**
 * Projects authoritative Jira worklogs into the visible week. Small worklogs
 * stay on their Jira date. A worklog longer than the configured daily target is
 * split over working days while its raw ID/start/duration remain untouched.
 */
export const projectWorklogsForWeek = (
  syncResult: SyncResult | undefined,
  options: ProjectWorklogsOptions
): SyncResult | undefined => {
  if (!syncResult) {
    return undefined;
  }

  const workingDays = normalizeWorkingDays(options.settings.workingDays);
  const dailyCapacitySeconds = Math.max(
    60,
    Math.round((options.settings.weeklyTargetHours * 3600) / workingDays.length)
  );
  const workingDaySet = new Set<number>(workingDays);
  const skippedDateSet = new Set(options.skippedDates ?? []);
  const preferenceMap = new Map((options.preferences ?? []).map((preference) => [preference.worklogId, preference]));
  const now = options.now ?? new Date();
  const todayKey = toLocalDateKey(now);
  const weekStart = fromLocalDateKey(syncResult.weekKey);
  const weekEndExclusive = addDays(weekStart, 7);
  const weekStartKey = toLocalDateKey(weekStart);
  const weekEndKey = toLocalDateKey(weekEndExclusive);
  const rawSources = sourceWorklogs(syncResult);
  // Older/demo fixtures can carry aggregate buckets without individual worklog
  // records. Preserve those authoritative aggregates rather than rebuilding an
  // empty week from information that is not available.
  if (rawSources.length === 0) {
    return syncResult;
  }
  const occupiedSeconds = new Map<string, number>();
  const blockedRanges = new Map<string, TimeRange[]>();
  const workdayStartSeconds = DEFAULT_ALLOCATION_START_HOUR * 3600;
  const workdayEndSeconds = workdayStartSeconds + dailyCapacitySeconds;

  const isEligibleDate = (date: Date) => {
    const dateKey = toLocalDateKey(date);
    return workingDaySet.has(isoWeekday(date)) && !skippedDateSet.has(dateKey) && dateKey <= todayKey;
  };

  for (const worklog of rawSources) {
    if (worklog.timeSpentSeconds > dailyCapacitySeconds) {
      continue;
    }
    const dateKey = dateKeyFor(worklog.started);
    if (dateKey) {
      occupiedSeconds.set(dateKey, (occupiedSeconds.get(dateKey) ?? 0) + worklog.timeSpentSeconds);
      const startSeconds = secondsFromMidnight(worklog.started);
      if (startSeconds !== undefined) {
        addBlockedRange(blockedRanges, dateKey, {
          startSeconds,
          endSeconds: startSeconds + worklog.timeSpentSeconds
        });
      }
    }
  }

  const projected: JiraWorklog[] = [];
  const bulkWorklogs = rawSources
    .filter((worklog) => worklog.timeSpentSeconds > dailyCapacitySeconds)
    .sort((left, right) => new Date(left.started).getTime() - new Date(right.started).getTime() || left.id.localeCompare(right.id));

  for (const worklog of rawSources) {
    if (worklog.timeSpentSeconds <= dailyCapacitySeconds) {
      projected.push(worklog);
    }
  }

  for (const worklog of bulkWorklogs) {
    const anchorKey = dateKeyFor(worklog.started);
    if (!anchorKey) {
      projected.push(worklog);
      continue;
    }

    const { direction, isApproximate } = inferDirection(worklog, preferenceMap);
    const anchor = fromLocalDateKey(anchorKey);
    const createdKey = dateKeyFor(worklog.created);
    const forwardEndKey = createdKey && createdKey < todayKey ? createdKey : todayKey;
    const allocations: PendingAllocation[] = [];
    let remaining = worklog.timeSpentSeconds;
    let cursor = new Date(anchor);

    for (let guard = 0; remaining > 0 && guard < MAX_ALLOCATION_DAYS; guard += 1) {
      const dateKey = toLocalDateKey(cursor);
      if (direction === "forward" && dateKey > forwardEndKey) {
        break;
      }

      if (isEligibleDate(cursor)) {
        const available = Math.max(dailyCapacitySeconds - (occupiedSeconds.get(dateKey) ?? 0), 0);
        let allocatable = Math.min(remaining, available);
        let allocatedForDay = 0;
        for (const range of freeRangesForDate(blockedRanges, dateKey, workdayStartSeconds, workdayEndSeconds)) {
          if (allocatable <= 0) {
            break;
          }
          const allocated = Math.min(allocatable, range.endSeconds - range.startSeconds);
          if (allocated <= 0) {
            continue;
          }
          allocations.push({
            dateKey,
            started: allocationStartedISO(dateKey, range.startSeconds),
            timeSpentSeconds: allocated
          });
          addBlockedRange(blockedRanges, dateKey, {
            startSeconds: range.startSeconds,
            endSeconds: range.startSeconds + allocated
          });
          allocatable -= allocated;
          allocatedForDay += allocated;
          remaining -= allocated;
        }
        if (allocatedForDay > 0) {
          occupiedSeconds.set(dateKey, (occupiedSeconds.get(dateKey) ?? 0) + allocatedForDay);
        }
      }
      cursor = addDays(cursor, direction === "forward" ? 1 : -1);
    }

    // A forward range can run out at creation/today when normal worklogs already
    // consume its capacity. Keep the Jira total exact and expose the overload on
    // the last eligible day instead of silently dropping or moving pre-start time.
    appendResidual(allocations, anchorKey, remaining, blockedRanges);

    const partCount = allocations.length;
    allocations.forEach((allocation, index) => {
      projected.push({
        ...worklog,
        allocation: {
          dateKey: allocation.dateKey,
          started: allocation.started,
          timeSpentSeconds: allocation.timeSpentSeconds,
          direction,
          partIndex: index + 1,
          partCount,
          isApproximate
        }
      });
    });
  }

  const daySummaries: Record<string, SyncDayBucket> = {};
  const contributingIds = new Set<string>();
  const contributingIssueKeys = new Set<string>();

  for (const worklog of projected) {
    const dateKey = worklog.allocation?.dateKey ?? dateKeyFor(worklog.started);
    if (!dateKey || dateKey < weekStartKey || dateKey >= weekEndKey) {
      continue;
    }
    const seconds = worklog.allocation?.timeSpentSeconds ?? worklog.timeSpentSeconds;
    const bucket = daySummaries[dateKey] ?? { trackedSeconds: 0, issues: [], worklogs: [] };
    bucket.trackedSeconds += seconds;
    bucket.worklogs.push(worklog);
    addIssue(bucket, worklog, seconds);
    daySummaries[dateKey] = bucket;
    contributingIds.add(worklog.id);
    contributingIssueKeys.add(worklog.issueKey);
  }

  for (const bucket of Object.values(daySummaries)) {
    bucket.worklogs.sort(
      (left, right) =>
        new Date(getWorklogDisplayStarted(left)).getTime() - new Date(getWorklogDisplayStarted(right)).getTime()
    );
  }

  return {
    ...syncResult,
    trackedSeconds: Object.values(daySummaries).reduce((sum, bucket) => sum + bucket.trackedSeconds, 0),
    issueCount: contributingIssueKeys.size,
    worklogCount: contributingIds.size,
    daySummaries,
    sourceWorklogs: rawSources
  };
};

export const getWorklogDisplaySeconds = (worklog: JiraWorklog) =>
  worklog.allocation?.timeSpentSeconds ?? worklog.timeSpentSeconds;

export const getWorklogDisplayStarted = (worklog: JiraWorklog) =>
  worklog.allocation?.started ?? worklog.started;

export const isAllocatedWorklog = (worklog: JiraWorklog) => Boolean(worklog.allocation);

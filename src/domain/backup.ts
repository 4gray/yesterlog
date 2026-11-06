import { DEFAULT_SETTINGS } from "./week";

export const BACKUP_DB_VERSION = 16;
export const BACKUP_STORE_KEYS = {
  settings: "id", weekOverrides: "weekKey", syncResults: "weekKey",
  jiraActivityResults: "weekKey", favorites: "id", personalNotes: "weekKey",
  bitbucketReviewResults: "weekKey", prAnalytics: "cacheKey", recurringEvents: "id",
  recurringOccurrences: "weekKey", reconstructDrafts: "dateKey", reconstructAiDrafts: "dateKey",
  recapDrafts: "intervalKey", savedRecaps: "id", worklogAllocationPreferences: "preferenceKey",
  jiraWorklogs: "cacheKey", workspaceNotes: "containerId", noteNotebooks: "id"
} as const;
export type BackupStoreName = keyof typeof BACKUP_STORE_KEYS;
export type BackupStores = Record<BackupStoreName, Record<string, unknown>[]>;
export const RESTORE_PREFERENCES_KEY = "restore-ui-preferences";
export const BACKUP_PREFERENCE_KEYS = [
  "yesterlog-theme", "yesterlog-week-view-mode", "yesterlog.reportTab",
  "yesterlog-recap-preferences", "yesterlog-ticket-picker-sort",
  "yesterlog-ticket-picker-assigned-only", "yesterlog-active-dock"
];
export const isBackupPreference = (key: string) =>
  BACKUP_PREFERENCE_KEYS.includes(key) || key.startsWith("yesterlog:pr-analytics:");

export interface AppBackup {
  format: "yesterlog-backup";
  version: 1;
  appVersion: string;
  dbVersion: number;
  exportedAt: string;
  stores: BackupStores;
  preferences: Record<string, string>;
}

// Validate nested data consumed by the renderer before replacing any existing records.
type Validator = (value: unknown) => boolean;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const str: Validator = (v) => typeof v === "string";
const num: Validator = (v) => typeof v === "number" && Number.isFinite(v);
const nonnegative: Validator = (v) => num(v) && (v as number) >= 0;
const bool: Validator = (v) => typeof v === "boolean";
const date: Validator = (v) => str(v) && Number.isFinite(Date.parse(v as string));
const day: Validator = (v) => str(v) && /^\d{4}-\d{2}-\d{2}$/.test(v as string) && date(v)
  && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const oneOf = (...values: unknown[]): Validator => (v) => values.includes(v);
const optional = (check: Validator): Validator => (v) => v === undefined || check(v);
const nullable = (check: Validator): Validator => (v) => v === null || check(v);
const array = (check: Validator): Validator => (v) => Array.isArray(v) && v.every(check);
const dictionary = (check: Validator): Validator => (v) => record(v) && Object.values(v).every(check);
const object = (fields: Record<string, Validator>): Validator => (v) =>
  record(v) && Object.entries(fields).every(([key, check]) => check(v[key]));
const strings = array(str);
const timestamps = { createdAt: date, updatedAt: date };
const confidence = oneOf("high", "medium", "low");
const direction = oneOf("forward", "backward");
const issueType = object({ name: optional(str), subtask: optional(bool), hierarchyLevel: optional(num) });
const epic = object({ key: str, summary: str, id: optional(str), url: optional(str) });
const issueMetadata = { issueType: optional(issueType), epic: optional(epic), components: optional(strings),
  projectKey: optional(str), projectName: optional(str) };
const worklog = object({
  id: str, issueId: str, issueKey: str, issueSummary: str, authorAccountId: str,
  started: date, timeSpentSeconds: nonnegative, comment: optional(str),
  created: optional(date), updated: optional(date), issueUrl: optional(str), ...issueMetadata,
  allocation: optional(object({ dateKey: day, started: date, timeSpentSeconds: nonnegative,
    direction, partIndex: num, partCount: num, isApproximate: bool }))
});
const week = { weekKey: day, weekStartISO: date, weekEndExclusiveISO: date, syncedAt: date };
const user = object({ accountId: optional(str), uuid: optional(str), displayName: optional(str) });
const comment = object({ id: num, createdAt: date, author: user });
const analyticsPr = object({
  key: str, id: num, repository: str, title: str, url: str, state: str, draft: bool, author: user,
  createdAt: optional(date), updatedAt: optional(date), mergedAt: optional(date), firstResponseAt: optional(date),
  comments: array(comment), activityComplete: bool, commentsComplete: bool, mergeTimeMissing: bool,
  history: optional(object({ startedAt: date, activityNext: nullable(str), commentsNext: nullable(str),
    mergedAt: optional(date), firstResponseAt: optional(date), comments: array(comment) }))
});
const analyticsRepository = object({
  workspace: str, repository: str, user, rangeStart: date, rangeEnd: date, syncedAt: date,
  listComplete: bool, complete: bool, pullRequests: array(analyticsPr), warnings: strings,
  scanCursors: optional(dictionary(nullable(str)))
});
const recapFormat = oneOf("perf", "manager", "cv", "changelog");
const copy = object({
  lead: optional(str), version: optional(str),
  paragraphs: optional(array(object({ id: str, text: str, refs: strings }))),
  lines: array(object({ id: str, short: str, long: str, refs: strings,
    tag: optional(oneOf("Added", "Changed", "Fixed")), emphasis: optional(str),
    needsImpact: optional(bool), userImpact: optional(str) }))
});
const recapVersion = object({
  version: num, generatedAt: date, generator: oneOf("deterministic", "ai"),
  schemaVersion: optional(num), aiFormats: optional(array(recapFormat)), editedAt: optional(date),
  interval: object({ key: str, period: oneOf("week", "month", "quarter"), startDateKey: day,
    endDateKeyExclusive: day, label: str, shortLabel: str, calendarLabel: str }),
  themes: array(object({ id: str, name: str, colorToken: oneOf("blue", "purple", "teal", "amber", "coral"),
    hours: nonnegative, pullRequestCount: nonnegative, ticketCount: nonnegative, sourceIds: strings,
    copy: object({ perf: copy, manager: copy, cv: copy, changelog: copy }) })),
  narratives: optional(object({ perf: optional(copy), manager: optional(copy) })),
  sources: array(object({ id: str, kind: oneOf("ticket", "pull-request", "commit", "meeting", "local"),
    dateKey: day, title: str, timeSpentSeconds: nonnegative, clusterKey: str,
    components: optional(strings), details: optional(strings), dateKeys: optional(array(day)),
    issueKey: optional(str), issueUrl: optional(str), epicKey: optional(str), epicSummary: optional(str),
    projectKey: optional(str), projectName: optional(str), repository: optional(str), pullRequestId: optional(num),
    pullRequestUrl: optional(str), role: optional(oneOf("authored", "reviewed")), status: optional(str), detail: optional(str) })),
  coverage: object({ requestedWeeks: nonnegative, jiraWeeks: nonnegative, bitbucketWeeks: nonnegative,
    ticketCount: nonnegative, pullRequestCount: nonnegative, commitCount: nonnegative,
    elapsedWeeks: optional(nonnegative), ratio: optional(nonnegative), status: optional(oneOf("complete", "partial", "sparse")) })
});
const note = object({ id: str, weekKey: day, dateKey: day, text: str, title: optional(str),
  timeSpentSeconds: nonnegative, startedISO: date, category: optional(oneOf("meeting", "firefighting")), ...timestamps });
const weekdays = array(oneOf(1, 2, 3, 4, 5, 6, 7));
const clock: Validator = (v) => str(v) && /^([01]\d|2[0-3]):[0-5]\d$/.test(v as string);
const settingsFields: Record<string, Validator> = Object.fromEntries(
  Object.entries(DEFAULT_SETTINGS).map(([key, value]) => [key,
    optional(Array.isArray(value) ? weekdays : typeof value === "boolean" ? bool : typeof value === "number" ? num : str)])
);
settingsFields.workingDays = optional((v) => weekdays(v) && (v as number[]).length > 0);
settingsFields.aiProvider = optional(oneOf("ollama", "claude-cli", "codex-cli"));
settingsFields.timelineFocusTime = optional(clock);
settingsFields.reminderTime = optional((value) => value === "" || clock(value));
settingsFields.weeklyTargetHours = optional((v) => num(v) && (v as number) > 0);

const validators: Record<BackupStoreName, Validator> = {
  settings: (v) => record(v) && (v.id === "default" ? object(settingsFields)(v)
    : v.id === "jira-context" && object({ jiraSite: str, authorAccountId: str, jiraEmail: str, syncedAt: date })(v)),
  weekOverrides: object({ weekKey: day, skippedDates: array(day) }),
  syncResults: object({ ...week, accountId: str, trackedSeconds: nonnegative, issueCount: nonnegative,
    worklogCount: nonnegative, jiraSite: optional(str), displayName: optional(str), sourceWorklogs: optional(array(worklog)),
    scanStartISO: optional(date), scanEndExclusiveISO: optional(date), worklogSyncCursorMs: optional(nonnegative),
    diagnostics: optional(object({ mode: oneOf("full", "delta"), durationMs: nonnegative, requestCount: nonnegative,
      candidateIssueCount: optional(nonnegative), changedWorklogCount: optional(nonnegative), deletedWorklogCount: optional(nonnegative),
      extendedRangeIssueCount: optional(nonnegative), fallbackReason: optional(str) })),
    daySummaries: dictionary(object({ trackedSeconds: nonnegative, worklogs: array(worklog),
      issues: array(object({ id: str, key: str, summary: str, loggedSeconds: nonnegative,
        comments: optional(strings), url: optional(str), ...issueMetadata })) })) }),
  jiraWorklogs: object({ cacheKey: str, jiraSite: str, authorAccountId: str, worklog }),
  jiraActivityResults: object({ ...week, accountId: str, displayName: optional(str), issueCount: nonnegative, activityCount: nonnegative,
    isPartial: optional(bool), scannedIssueCount: optional(nonnegative), skippedIssueCount: optional(nonnegative),
    truncatedIssueCount: optional(nonnegative), truncatedDetailIssueCount: optional(nonnegative),
    activities: array(object({ id: str, kind: oneOf("issue-created", "comment", "status-change", "field-change"),
      issueId: str, issueKey: str, issueSummary: str, actorAccountId: str, dateKey: day,
      occurredAt: date, title: str, description: str, estimatedSeconds: nonnegative, confidence, ...issueMetadata,
      issueUrl: optional(str), actorDisplayName: optional(str), fieldName: optional(str), fromValue: optional(str),
      toValue: optional(str), commentId: optional(str), commentBody: optional(str) })) }),
  favorites: object({ id: oneOf("default"), keys: strings }),
  personalNotes: object({ weekKey: day, notes: array(note) }),
  bitbucketReviewResults: object({ ...week, workspace: str, accountId: optional(str), displayName: optional(str), repositoryCount: nonnegative,
    pullRequestCount: nonnegative, sessionCount: nonnegative,
    sessions: array(object({ id: str, workspace: str, repositorySlug: str, repositoryName: str,
      pullRequestId: num, pullRequestTitle: str, pullRequestUrl: str, pullRequestState: str,
      pullRequestAuthorAccountId: optional(str), pullRequestAuthorDisplayName: optional(str), isPullRequestAuthor: optional(bool),
      sourceBranch: optional(str), destinationBranch: optional(str), jiraIssueKey: optional(str),
      dateKey: day, startedISO: date, endedISO: date, estimatedSeconds: nonnegative,
      reviewStateLabel: oneOf("APPROVED", "CHANGES", "COMMENTED", "UPDATED"),
      commentCount: nonnegative, activityCount: nonnegative, confidence, status: oneOf("unlogged", "logged"),
      events: array(object({ id: str, type: oneOf("comment", "approved", "changes_requested", "updated"), occurredAt: date })),
      logged: optional(object({ issueKey: str, worklogId: str, loggedAt: date,
        targetMode: oneOf("reviewed-ticket", "review-bucket"), timeSpentSeconds: optional(nonnegative), estimatedSecondsAtLog: optional(nonnegative) })) })),
    commitGroups: optional(array(object({ id: str, workspace: str, repositorySlug: str, repositoryName: str,
      branch: optional(str), jiraIssueKey: optional(str), pullRequestId: optional(num), dateKey: day, commitCount: nonnegative, firstCommitISO: date,
      lastCommitISO: date, estimatedSeconds: nonnegative, primaryMessage: str, confidence }))) }),
  prAnalytics: object({ cacheKey: str, accountKey: str, repositories: array(analyticsRepository) }),
  recurringEvents: object({ id: oneOf("default"), events: array(object({ id: str, title: str,
    daysOfWeek: weekdays, localTime: clock, durationMinutes: nonnegative, defaultNote: str, active: bool, ...timestamps })) }),
  recurringOccurrences: object({ weekKey: day, occurrences: array(object({ eventId: str, weekKey: day,
    dateKey: day, status: oneOf("confirmed", "skipped"), localTime: optional(clock),
    timeSpentSeconds: optional(nonnegative), note: optional(str), ...timestamps })) }),
  reconstructDrafts: object({ dateKey: day, placements: dictionary(num), durations: optional(dictionary(nonnegative)) }),
  reconstructAiDrafts: object({ dateKey: day, drafts: object({ entries: dictionary(str), gaps: dictionary(str) }) }),
  recapDrafts: object({ intervalKey: str, activeVersion: num, versions: array(recapVersion) }),
  savedRecaps: object({ id: str, savedAt: date, format: recapFormat,
    detail: oneOf("headline", "balanced", "detailed"), version: recapVersion }),
  worklogAllocationPreferences: object({ preferenceKey: str, jiraSite: str, authorAccountId: str,
    worklogId: str, direction, ...timestamps }),
  workspaceNotes: object({ containerId: str, logicalContainerId: optional(str), jiraSite: optional(str),
    authorAccountId: optional(str), jira: optional(object({ key: str, summary: str, url: optional(str), statusName: optional(str),
      statusCategory: optional(oneOf("new", "indeterminate", "done", "unknown")), issueType: optional(issueType), epic: optional(epic) })),
    document: optional(object({ text: str, editorState: optional(str), updatedAt: date })),
    notes: array(object({ id: str, type: oneOf("todo", "text"), done: bool, text: str,
      archivedAt: optional(date), ...timestamps })) }),
  noteNotebooks: object({ id: oneOf("default"), notebooks: array(object({ id: str, title: str, ...timestamps })) })
};

export const sanitizeBackupStores = (stores: BackupStores): BackupStores => ({
  ...stores,
  settings: stores.settings.filter((row) => row.id !== RESTORE_PREFERENCES_KEY).map((row) => {
    if (row.id === "jira-context") return {
      id: row.id, jiraSite: row.jiraSite, authorAccountId: row.authorAccountId,
      jiraEmail: row.jiraEmail, syncedAt: row.syncedAt
    };
    if (row.id !== "default") return row;
    const safe = Object.fromEntries(Object.keys(DEFAULT_SETTINGS)
      .filter((key) => !["jiraApiToken", "bitbucketApiToken", "claudeCliPath", "codexCliPath"].includes(key))
      .filter((key) => row[key] !== undefined).map((key) => [key, row[key]]));
    return { id: "default", ...safe, aiEnabled: false };
  })
});

export const validateBackup = (value: unknown): AppBackup => {
  if (!record(value) || value.format !== "yesterlog-backup") throw new Error("Choose a Yesterlog backup JSON file.");
  if (value.version !== 1 || value.dbVersion !== BACKUP_DB_VERSION) {
    throw new Error("This backup version is not supported. Use a compatible version of Yesterlog.");
  }
  if (!str(value.appVersion) || !date(value.exportedAt) || !record(value.stores) || !record(value.preferences)) {
    throw new Error("The backup header or preferences are invalid.");
  }
  if (Object.keys(value.stores).some((key) => !Object.prototype.hasOwnProperty.call(BACKUP_STORE_KEYS, key))) {
    throw new Error("The backup contains an unsupported data category.");
  }
  for (const name of Object.keys(BACKUP_STORE_KEYS) as BackupStoreName[]) {
    const rows = value.stores[name];
    const key = BACKUP_STORE_KEYS[name];
    if (!Array.isArray(rows) || !rows.every((row) => record(row) && str(row[key]) && row[key] !== "" && validators[name](row))) {
      throw new Error(`The backup contains invalid ${name} data.`);
    }
    if (new Set(rows.map((row) => row[key])).size !== rows.length) throw new Error(`The backup contains duplicate ${name} keys.`);
    if (name === "workspaceNotes" && rows.some((row) => row.logicalContainerId !== undefined &&
      (!str(row.jiraSite) || !str(row.authorAccountId) || !row.authorAccountId ||
        row.containerId !== JSON.stringify(["jira", row.jiraSite, row.authorAccountId, (row.logicalContainerId as string).trim().toUpperCase()])))) {
      throw new Error("The backup contains invalid workspaceNotes account scopes.");
    }
    if (name === "jiraWorklogs" && rows.some((row) => {
      const item = row.worklog as Record<string, unknown>;
      return row.cacheKey !== JSON.stringify([row.jiraSite, item.id]) || row.authorAccountId !== item.authorAccountId;
    })) throw new Error("The backup contains invalid jiraWorklogs account scopes.");
  }
  for (const [key, entry] of Object.entries(value.preferences)) {
    if (!isBackupPreference(key) || !str(entry)) throw new Error("The backup contains unsupported UI preferences.");
    if (key === "yesterlog-recap-preferences" || key.startsWith("yesterlog:pr-analytics:")) {
      try {
        if (!record(JSON.parse(entry as string))) throw new Error("Invalid preference object");
      } catch { throw new Error("The backup contains invalid UI preferences."); }
    }
  }
  const backup = value as unknown as AppBackup;
  return { ...backup, stores: sanitizeBackupStores(backup.stores) };
};

export const parseBackup = (text: string): AppBackup => {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("The backup is not valid JSON."); }
  return validateBackup(value);
};

export const readBackupPreferences = (storage: Storage): Record<string, string> => {
  const preferences: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && isBackupPreference(key)) preferences[key] = storage.getItem(key)!;
  }
  return preferences;
};

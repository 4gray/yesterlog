export type WeekdayNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface AppSettings {
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  bitbucketEmail: string;
  bitbucketApiToken: string;
  bitbucketWorkspace: string;
  bitbucketRepositories: string;
  bitbucketReviewBucketIssueKey: string;
  weeklyTargetHours: number;
  workingDays: WeekdayNumber[];
  reminderTime: string;
  remindersEnabled: boolean;
  /**
   * Optional local-AI (Ollama) enhancement for Day Reconstruction. Off by default —
   * the reconstruction core works fully without it. When on, drafts are written
   * on-device by the configured Ollama model. Never sends data off the machine.
   */
  aiEnabled: boolean;
  /** Ollama HTTP endpoint, default `http://localhost:11434`. */
  ollamaEndpoint: string;
  /** Selected Ollama model tag, e.g. `llama3.1:8b`. */
  ollamaModel: string;
}

export interface WeekOverride {
  weekKey: string;
  skippedDates: string[];
}

export interface JiraIssueTypeInfo {
  name?: string;
  subtask?: boolean;
  hierarchyLevel?: number;
}

export interface JiraEpicInfo {
  id?: string;
  key: string;
  summary: string;
  url?: string;
}

export interface JiraIssueSummary {
  id: string;
  key: string;
  summary: string;
  url?: string;
  issueType?: JiraIssueTypeInfo;
  epic?: JiraEpicInfo;
  loggedSeconds: number;
  comments?: string[];
}

export type WorklogAllocationDirection = "backward" | "forward";

/**
 * A local-only preference for projecting one large Jira worklog over working
 * days. Jira still owns one authoritative worklog; this preference never
 * creates or mutates additional Jira records.
 */
export interface WorklogAllocationPreference {
  worklogId: string;
  direction: WorklogAllocationDirection;
  createdAt: string;
  updatedAt: string;
}

/** One visible day slice derived from a larger authoritative Jira worklog. */
export interface JiraWorklogAllocation {
  dateKey: string;
  started: string;
  timeSpentSeconds: number;
  direction: WorklogAllocationDirection;
  partIndex: number;
  partCount: number;
  /** False when TimeBro captured an explicit direction while creating the worklog. */
  isApproximate: boolean;
}

export interface JiraWorklog {
  id: string;
  issueId: string;
  issueKey: string;
  issueSummary: string;
  issueUrl?: string;
  issueType?: JiraIssueTypeInfo;
  epic?: JiraEpicInfo;
  authorAccountId: string;
  started: string;
  timeSpentSeconds: number;
  comment?: string;
  created?: string;
  updated?: string;
  /** Present only on a derived display slice; top-level fields remain the raw Jira values. */
  allocation?: JiraWorklogAllocation;
}

export interface SyncDayBucket {
  trackedSeconds: number;
  issues: JiraIssueSummary[];
  worklogs: JiraWorklog[];
}

export interface SyncResult {
  weekKey: string;
  weekStartISO: string;
  weekEndExclusiveISO: string;
  syncedAt: string;
  accountId: string;
  /** Normalized Jira origin used to keep local caches isolated across sites. */
  jiraSite?: string;
  displayName?: string;
  trackedSeconds: number;
  issueCount: number;
  worklogCount: number;
  daySummaries: Record<string, SyncDayBucket>;
  /** Raw, de-duplicated worklogs fetched around the visible week for local projection. */
  sourceWorklogs?: JiraWorklog[];
  scanStartISO?: string;
  scanEndExclusiveISO?: string;
}

export type JiraActivityKind = "issue-created" | "comment" | "status-change" | "field-change";
export type JiraActivityConfidence = "high" | "medium" | "low";

export interface JiraActivity {
  id: string;
  kind: JiraActivityKind;
  issueId: string;
  issueKey: string;
  issueSummary: string;
  issueUrl?: string;
  issueType?: JiraIssueTypeInfo;
  epic?: JiraEpicInfo;
  actorAccountId: string;
  actorDisplayName?: string;
  dateKey: string;
  occurredAt: string;
  title: string;
  description: string;
  fieldName?: string;
  fromValue?: string;
  toValue?: string;
  commentId?: string;
  commentBody?: string;
  estimatedSeconds: number;
  confidence: JiraActivityConfidence;
}

export interface JiraActivitySyncResult {
  weekKey: string;
  weekStartISO: string;
  weekEndExclusiveISO: string;
  syncedAt: string;
  accountId: string;
  displayName?: string;
  issueCount: number;
  activityCount: number;
  activities: JiraActivity[];
  isPartial?: boolean;
  scannedIssueCount?: number;
  skippedIssueCount?: number;
  truncatedIssueCount?: number;
  truncatedDetailIssueCount?: number;
}

export interface DayTrackingSummary {
  dateKey: string;
  dateLabel: string;
  weekdayName: string;
  isToday: boolean;
  isConfiguredWorkingDay: boolean;
  isSkipped: boolean;
  targetHours: number;
  trackedHours: number;
  missingHours: number;
  issues: JiraIssueSummary[];
  personalNotes: PersonalNote[];
  /** Confirmed recurring local-time occurrences logged on this day. */
  recurringEntries: RecurringEntry[];
  /** Scheduled recurring events not yet confirmed or skipped for this day. */
  pendingRecurring: PendingRecurringOccurrence[];
}

export interface WeekState {
  weekKey: string;
  weekStartISO: string;
  weekEndExclusiveISO: string;
  weekRangeLabel: string;
  weeklyTargetHours: number;
  trackedWeekHours: number;
  jiraTrackedWeekHours: number;
  personalNoteHours: number;
  remainingWeekHours: number;
  dailyTargetHours: number;
  activeWorkingDates: string[];
  skippedDates: string[];
  days: DayTrackingSummary[];
  /** Confirmed recurring local-time hours folded into local/tracked totals. */
  recurringTrackedHours: number;
}

export interface JiraConnectionResult {
  ok: boolean;
  message: string;
  accountId?: string;
  displayName?: string;
}

export interface BitbucketConnectionResult {
  ok: boolean;
  message: string;
  accountId?: string;
  displayName?: string;
  workspace?: string;
}

export type BitbucketReviewTargetMode = "reviewed-ticket" | "review-bucket";
export type BitbucketReviewConfidence = "high" | "medium" | "low";
export type BitbucketReviewSessionStatus = "unlogged" | "logged";

export interface BitbucketReviewEvent {
  id: string;
  type: "comment" | "approved" | "changes_requested" | "updated";
  occurredAt: string;
}

export interface BitbucketLoggedReview {
  issueKey: string;
  worklogId: string;
  loggedAt: string;
  targetMode: BitbucketReviewTargetMode;
  timeSpentSeconds?: number;
  estimatedSecondsAtLog?: number;
}

export interface BitbucketReviewSession {
  id: string;
  workspace: string;
  repositorySlug: string;
  repositoryName: string;
  pullRequestId: number;
  pullRequestTitle: string;
  pullRequestUrl: string;
  pullRequestState: string;
  pullRequestAuthorAccountId?: string;
  pullRequestAuthorDisplayName?: string;
  isPullRequestAuthor?: boolean;
  sourceBranch?: string;
  destinationBranch?: string;
  jiraIssueKey?: string;
  dateKey: string;
  startedISO: string;
  endedISO: string;
  estimatedSeconds: number;
  reviewStateLabel: "APPROVED" | "CHANGES" | "COMMENTED" | "UPDATED";
  commentCount: number;
  activityCount: number;
  confidence: BitbucketReviewConfidence;
  events: BitbucketReviewEvent[];
  status: BitbucketReviewSessionStatus;
  logged?: BitbucketLoggedReview;
}

/**
 * A run of the current user's own commits on one PR's branch on one day — the raw signal
 * of coding work, grouped for Day Reconstruction. Optional on the sync result so older
 * cached results stay valid.
 */
export interface BitbucketCommitGroup {
  id: string;
  workspace: string;
  repositorySlug: string;
  repositoryName: string;
  branch?: string;
  jiraIssueKey?: string;
  pullRequestId?: number;
  dateKey: string;
  commitCount: number;
  firstCommitISO: string;
  lastCommitISO: string;
  estimatedSeconds: number;
  /** Representative commit subject for the group. */
  primaryMessage: string;
  confidence: BitbucketReviewConfidence;
}

export interface BitbucketReviewSyncResult {
  weekKey: string;
  weekStartISO: string;
  weekEndExclusiveISO: string;
  syncedAt: string;
  accountId?: string;
  displayName?: string;
  workspace: string;
  repositoryCount: number;
  pullRequestCount: number;
  sessionCount: number;
  sessions: BitbucketReviewSession[];
  /** The user's own commit runs for the week (for Day Reconstruction). */
  commitGroups?: BitbucketCommitGroup[];
}

export type TicketStatusCategory = "new" | "indeterminate" | "done" | "unknown";

export type TicketFilterStatusCategory = Exclude<TicketStatusCategory, "unknown">;
export type TicketViewSortMode = "updatedDesc" | "createdDesc" | "createdAsc" | "keyAsc";

export interface TicketFilters {
  assignedOnly: boolean;
  statusCategories: TicketFilterStatusCategory[];
  query: string;
  sortMode: TicketViewSortMode;
}

export interface JiraTicket {
  id: string;
  key: string;
  summary: string;
  projectKey: string;
  projectName: string;
  statusName: string;
  statusCategory: TicketStatusCategory;
  loggedSecondsTotal: number;
  createdAt?: string;
  updatedAt?: string;
  assigneeDisplayName?: string;
  issueType?: JiraIssueTypeInfo;
  epic?: JiraEpicInfo;
  url: string;
}

export interface JiraIssueDetails extends JiraTicket {
  description?: string;
  descriptionAdf?: unknown;
  myLoggedSecondsTotal: number;
  myWorklogCount: number;
}

/**
 * How a personal note counts toward the day rings. "meeting" pulls the note into
 * the Meetings ring (ad-hoc syncs, 1:1s, interviews) instead of leaving it in
 * the catch-all; anything else (including undefined) stays "firefighting".
 */
export type PersonalNoteCategory = "meeting" | "firefighting";

export interface PersonalNote {
  id: string;
  weekKey: string;
  dateKey: string;
  /** Optional short headline; groups notes separately in reports. */
  title?: string;
  text: string;
  timeSpentSeconds: number;
  startedISO: string;
  /** Ring bucket for this note. Undefined is treated as "firefighting". */
  category?: PersonalNoteCategory;
  createdAt: string;
  updatedAt: string;
}

/**
 * A recurring local-time ritual (standup, planning, refinement…) that never
 * gets a Jira ticket. Definitions are global; each working day the matching
 * events are offered as a soft suggestion the user confirms, skips or adjusts.
 * Stored locally only — confirmed time counts as local tracked time and is
 * never synced to Jira.
 */
export interface RecurringEvent {
  id: string;
  title: string;
  /** ISO weekdays the event recurs on (1 = Monday … 7 = Sunday). */
  daysOfWeek: WeekdayNumber[];
  /** Local clock time the event happens at, "HH:MM". */
  localTime: string;
  durationMinutes: number;
  defaultNote: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RecurringOccurrenceStatus = "confirmed" | "skipped";

/**
 * Per-date resolution of a {@link RecurringEvent}. Stored per week (like
 * personal notes). A confirmed occurrence may override the event's default
 * duration and note for that single day.
 */
export interface RecurringOccurrence {
  eventId: string;
  weekKey: string;
  dateKey: string;
  status: RecurringOccurrenceStatus;
  timeSpentSeconds?: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/** A confirmed recurring occurrence resolved against its event, for rendering. */
export interface RecurringEntry {
  eventId: string;
  dateKey: string;
  title: string;
  localTime: string;
  timeSpentSeconds: number;
  note?: string;
}

/** A recurring event scheduled on a day but not yet confirmed or skipped. */
export interface PendingRecurringOccurrence {
  eventId: string;
  dateKey: string;
  title: string;
  localTime: string;
  defaultDurationMinutes: number;
  defaultNote: string;
}

export interface TicketsRequest {
  settings: AppSettings;
  /** Defaults to true to preserve the focused, low-volume ticket query. */
  assignedOnly?: boolean;
}

export interface TicketsResult {
  fetchedAt: string;
  accountId: string;
  inProgress: JiraTicket[];
  recentlyClosed: JiraTicket[];
}

export type TicketSortMode = "createdAsc" | "createdDesc";

export interface SearchTicketsRequest {
  settings: AppSettings;
  query: string;
  limit?: number;
  sortMode?: TicketSortMode;
  assignedOnly?: boolean;
  allowEmptyQuery?: boolean;
}

export interface SearchTicketsResult {
  query: string;
  issues: JiraTicket[];
}

export interface IssueDetailsRequest {
  settings: AppSettings;
  issueKey: string;
}

export type IssueDetailsResult = JiraIssueDetails;

export interface AddWorklogRequest {
  settings: AppSettings;
  issueKey: string;
  timeSpentSeconds: number;
  startedISO: string;
  comment?: string;
}

export interface AddWorklogResult {
  ok: boolean;
  worklogId: string;
  issueKey: string;
  timeSpentSeconds: number;
}

export interface UpdateWorklogRequest {
  settings: AppSettings;
  issueKey: string;
  worklogId: string;
  timeSpentSeconds: number;
  startedISO: string;
  comment?: string;
}

export interface UpdateWorklogResult {
  ok: boolean;
  worklogId: string;
  issueKey: string;
  timeSpentSeconds: number;
}

export interface DeleteWorklogRequest {
  settings: AppSettings;
  issueKey: string;
  worklogId: string;
}

export interface DeleteWorklogResult {
  ok: boolean;
  worklogId: string;
  issueKey: string;
}

export interface SyncRequest {
  settings: AppSettings;
  weekStartISO: string;
  weekEndExclusiveISO: string;
  weekKey: string;
}

export type JiraActivitySyncRequest = SyncRequest;

export interface BitbucketReviewSyncRequest {
  settings: AppSettings;
  weekStartISO: string;
  weekEndExclusiveISO: string;
  weekKey: string;
}

export interface ReminderSchedulePayload {
  settings: AppSettings;
  weekKey: string;
  skippedDates: string[];
  remainingWeekHours: number;
  todayDateKey: string;
}

export type ReminderScheduleReason =
  | "scheduled"
  | "disabled"
  | "complete"
  | "unsupported"
  | "non-current-week"
  | "no-working-day";

export interface ReminderScheduleResult {
  scheduled: boolean;
  fireAt?: string;
  reason: ReminderScheduleReason;
  message?: string;
}

export type AppReleaseDownloadPlatform = "linux" | "macos" | "windows";

export interface AppReleaseInfo {
  version: string;
  releaseName?: string;
  releaseNotes?: string;
  releasePageUrl: string;
  downloadUrl?: string;
  downloadName?: string;
  downloadPlatform?: AppReleaseDownloadPlatform;
  publishedAt?: string;
}

export interface AppReleaseHistoryResult {
  currentVersion: string;
  checkedAt: string;
  releases: AppReleaseInfo[];
  error?: string;
}

export interface AppUpdateInfo {
  currentVersion: string;
  latestVersion?: string;
  releaseName?: string;
  releaseNotes?: string;
  releasePageUrl: string;
  downloadUrl?: string;
  downloadName?: string;
  downloadPlatform?: AppReleaseDownloadPlatform;
  publishedAt?: string;
  checkedAt: string;
  updateAvailable: boolean;
  error?: string;
  autoUpdate?: AppAutoUpdateState;
}

export interface OpenReleasePageResult {
  ok: boolean;
  url: string;
}

export type OpenCursorPromptResult = { ok: true; url: string } | { ok: false; error: string };

export type AppAutoUpdatePlatform = "macos" | "linux-appimage";

export type AppAutoUpdatePhase =
  | "unsupported"
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "not-available"
  | "error";

export interface AppAutoUpdateProgress {
  percent?: number;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
}

export interface AppAutoUpdateState {
  supported: boolean;
  phase: AppAutoUpdatePhase;
  platform?: AppAutoUpdatePlatform;
  reason?: string;
  progress?: AppAutoUpdateProgress;
  error?: string;
}

export interface AppAutoUpdateActionResult {
  ok: boolean;
  message: string;
  state: AppAutoUpdateState;
  updateInfo?: AppUpdateInfo;
}

/**
 * Local-AI (Ollama) IPC contracts. All calls go through the Electron main process so
 * requests to `localhost:11434` are not subject to renderer CORS, and the key-less,
 * on-device contract stays explicit. Every call degrades gracefully: on any failure the
 * caller falls back to the deterministic reconstruction.
 */
export interface OllamaListModelsRequest {
  endpoint: string;
}

export interface OllamaListModelsResult {
  ok: boolean;
  /** Pulled model tags, e.g. ["llama3.1:8b", "qwen2.5-coder:7b"]. */
  models: string[];
  message?: string;
}

export interface OllamaGenerateRequest {
  endpoint: string;
  model: string;
  prompt: string;
  system?: string;
  /** When "json", asks Ollama to constrain output to a JSON object. */
  format?: "json";
}

export interface OllamaGenerateResult {
  ok: boolean;
  /** Raw model completion text (JSON when `format: "json"` was requested). */
  response?: string;
  message?: string;
}

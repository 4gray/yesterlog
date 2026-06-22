export type WeekdayNumber = 1 | 2 | 3 | 4 | 5;

export interface AppSettings {
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  weeklyTargetHours: number;
  workingDays: WeekdayNumber[];
  reminderTime: string;
  remindersEnabled: boolean;
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
  displayName?: string;
  trackedSeconds: number;
  issueCount: number;
  worklogCount: number;
  daySummaries: Record<string, SyncDayBucket>;
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
}

export interface JiraConnectionResult {
  ok: boolean;
  message: string;
  accountId?: string;
  displayName?: string;
}

export type TicketStatusCategory = "new" | "indeterminate" | "done" | "unknown";

export interface JiraTicket {
  id: string;
  key: string;
  summary: string;
  projectKey: string;
  projectName: string;
  statusName: string;
  statusCategory: TicketStatusCategory;
  loggedSecondsTotal: number;
  issueType?: JiraIssueTypeInfo;
  epic?: JiraEpicInfo;
  url: string;
}

export interface PersonalNote {
  id: string;
  weekKey: string;
  dateKey: string;
  text: string;
  timeSpentSeconds: number;
  startedISO: string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketsRequest {
  settings: AppSettings;
}

export interface TicketsResult {
  fetchedAt: string;
  accountId: string;
  inProgress: JiraTicket[];
  recentlyClosed: JiraTicket[];
}

export interface SearchTicketsRequest {
  settings: AppSettings;
  query: string;
  limit?: number;
}

export interface SearchTicketsResult {
  query: string;
  issues: JiraTicket[];
}

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

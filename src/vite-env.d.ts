/// <reference types="vite/client" />

import type {
  AddWorklogRequest,
  AddWorklogResult,
  AiGenerateRequest,
  AiGenerateResult,
  AiListModelsRequest,
  AiListModelsResult,
  AppSettings,
  AppUpdateInfo,
  AppAutoUpdateActionResult,
  AppAutoUpdateState,
  AppReleaseHistoryResult,
  BitbucketConnectionResult,
  BitbucketReviewSyncRequest,
  BitbucketReviewSyncResult,
  DeleteWorklogRequest,
  DeleteWorklogResult,
  IssueDetailsRequest,
  IssueDetailsResult,
  JiraActivitySyncResult,
  JiraConnectionResult,
  OpenCursorPromptResult,
  OpenReleasePageResult,
  ReminderSchedulePayload,
  ReminderScheduleResult,
  SearchTicketsRequest,
  SearchTicketsResult,
  SyncRequest,
  SyncResult,
  TicketsRequest,
  TicketsResult,
  UpdateWorklogRequest,
  UpdateWorklogResult
} from "../shared/types";

interface TimeBroNativeApi {
  testJiraConnection: (settings: AppSettings) => Promise<JiraConnectionResult>;
  testBitbucketConnection: (settings: AppSettings) => Promise<BitbucketConnectionResult>;
  syncJiraWorklogs: (request: SyncRequest) => Promise<SyncResult>;
  syncJiraActivity: (request: SyncRequest) => Promise<JiraActivitySyncResult>;
  syncBitbucketReviews: (request: BitbucketReviewSyncRequest) => Promise<BitbucketReviewSyncResult>;
  fetchAssignedTickets: (request: TicketsRequest) => Promise<TicketsResult>;
  searchJiraTickets: (request: SearchTicketsRequest) => Promise<SearchTicketsResult>;
  fetchJiraIssueDetails: (request: IssueDetailsRequest) => Promise<IssueDetailsResult>;
  addWorklog: (request: AddWorklogRequest) => Promise<AddWorklogResult>;
  updateWorklog: (request: UpdateWorklogRequest) => Promise<UpdateWorklogResult>;
  deleteWorklog: (request: DeleteWorklogRequest) => Promise<DeleteWorklogResult>;
  listAiModels: (request: AiListModelsRequest) => Promise<AiListModelsResult>;
  generateWithAi: (request: AiGenerateRequest) => Promise<AiGenerateResult>;
  scheduleReminder: (payload: ReminderSchedulePayload) => Promise<ReminderScheduleResult>;
  getUpdateInfo: () => Promise<AppUpdateInfo>;
  getReleaseHistory?: () => Promise<AppReleaseHistoryResult>;
  downloadUpdate: () => Promise<AppAutoUpdateActionResult>;
  installUpdate: () => Promise<AppAutoUpdateActionResult>;
  onAutoUpdateState?: (callback: (state: AppAutoUpdateState) => void) => () => void;
  openReleasePage: (url?: string) => Promise<OpenReleasePageResult>;
  openCursorPrompt?: (url: string) => Promise<OpenCursorPromptResult>;
}

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string;
}

declare global {
  interface Window {
    timeBro?: TimeBroNativeApi;
    jiraWeekTracker?: TimeBroNativeApi;
  }
}

/// <reference types="vite/client" />

import type { PrAnalyticsRequest, PrAnalyticsRepository, PrAnalyticsProgress } from "../shared/prAnalytics";

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
  BitbucketPullRequestDetailsRequest,
  BitbucketPullRequestDetailsResult,
  BitbucketReviewSyncRequest,
  BitbucketReviewSyncResult,
  DeleteWorklogRequest,
  DeleteWorklogResult,
  IssueDetailsRequest,
  IssueDetailsResult,
  JiraActivitySyncResult,
  JiraConnectionResult,
  MoveWorklogRequest,
  MoveWorklogResult,
  OpenCursorPromptResult,
  OpenReleasePageResult,
  ReminderSchedulePayload,
  ReminderScheduleResult,
  ResolveBitbucketPullRequestTaskRequest,
  ResolveBitbucketPullRequestTaskResult,
  SearchTicketsRequest,
  SearchTicketsResult,
  SyncRequest,
  SyncResult,
  TicketsRequest,
  TicketsResult,
  UpdateWorklogRequest,
  UpdateWorklogResult
} from "../shared/types";

interface YesterlogNativeApi {
  syncPrAnalytics?: (request: PrAnalyticsRequest) => Promise<PrAnalyticsRepository>;
  cancelPrAnalytics?: (requestId: string) => Promise<void>;
  onPrAnalyticsProgress?: (callback: (value: PrAnalyticsProgress) => void) => () => void;
  testJiraConnection: (settings: AppSettings) => Promise<JiraConnectionResult>;
  testBitbucketConnection: (settings: AppSettings) => Promise<BitbucketConnectionResult>;
  syncJiraWorklogs: (request: SyncRequest) => Promise<SyncResult>;
  syncJiraActivity: (request: SyncRequest) => Promise<JiraActivitySyncResult>;
  syncBitbucketReviews: (request: BitbucketReviewSyncRequest) => Promise<BitbucketReviewSyncResult>;
  fetchBitbucketPullRequestDetails: (
    request: BitbucketPullRequestDetailsRequest
  ) => Promise<BitbucketPullRequestDetailsResult>;
  setBitbucketPullRequestTaskState: (
    request: ResolveBitbucketPullRequestTaskRequest
  ) => Promise<ResolveBitbucketPullRequestTaskResult>;
  fetchAssignedTickets: (request: TicketsRequest) => Promise<TicketsResult>;
  searchJiraTickets: (request: SearchTicketsRequest) => Promise<SearchTicketsResult>;
  fetchJiraIssueDetails: (request: IssueDetailsRequest) => Promise<IssueDetailsResult>;
  addWorklog: (request: AddWorklogRequest) => Promise<AddWorklogResult>;
  updateWorklog: (request: UpdateWorklogRequest) => Promise<UpdateWorklogResult>;
  deleteWorklog: (request: DeleteWorklogRequest) => Promise<DeleteWorklogResult>;
  moveWorklog: (request: MoveWorklogRequest) => Promise<MoveWorklogResult>;
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
    yesterlog?: YesterlogNativeApi;
  }
}

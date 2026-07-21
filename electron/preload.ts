import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type {
  AddWorklogRequest,
  AddWorklogResult,
  AiGenerateRequest,
  AiGenerateResult,
  AiListModelsRequest,
  AiListModelsResult,
  AppAutoUpdateActionResult,
  AppAutoUpdateState,
  AppReleaseHistoryResult,
  AppSettings,
  AppUpdateInfo,
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

const timeBroApi = {
  testJiraConnection: (settings: AppSettings): Promise<JiraConnectionResult> => {
    return ipcRenderer.invoke("jira:test-connection", settings);
  },
  testBitbucketConnection: (settings: AppSettings): Promise<BitbucketConnectionResult> => {
    return ipcRenderer.invoke("bitbucket:test-connection", settings);
  },
  syncJiraWorklogs: (request: SyncRequest): Promise<SyncResult> => {
    return ipcRenderer.invoke("jira:sync-worklogs", request);
  },
  syncJiraActivity: (request: SyncRequest): Promise<JiraActivitySyncResult> => {
    return ipcRenderer.invoke("jira:sync-activity", request);
  },
  syncBitbucketReviews: (request: BitbucketReviewSyncRequest): Promise<BitbucketReviewSyncResult> => {
    return ipcRenderer.invoke("bitbucket:sync-reviews", request);
  },
  fetchAssignedTickets: (request: TicketsRequest): Promise<TicketsResult> => {
    return ipcRenderer.invoke("jira:fetch-tickets", request);
  },
  searchJiraTickets: (request: SearchTicketsRequest): Promise<SearchTicketsResult> => {
    return ipcRenderer.invoke("jira:search-tickets", request);
  },
  fetchJiraIssueDetails: (request: IssueDetailsRequest): Promise<IssueDetailsResult> => {
    return ipcRenderer.invoke("jira:fetch-issue-details", request);
  },
  addWorklog: (request: AddWorklogRequest): Promise<AddWorklogResult> => {
    return ipcRenderer.invoke("jira:add-worklog", request);
  },
  updateWorklog: (request: UpdateWorklogRequest): Promise<UpdateWorklogResult> => {
    return ipcRenderer.invoke("jira:update-worklog", request);
  },
  deleteWorklog: (request: DeleteWorklogRequest): Promise<DeleteWorklogResult> => {
    return ipcRenderer.invoke("jira:delete-worklog", request);
  },
  listAiModels: (request: AiListModelsRequest): Promise<AiListModelsResult> => {
    return ipcRenderer.invoke("ai:list-models", request);
  },
  generateWithAi: (request: AiGenerateRequest): Promise<AiGenerateResult> => {
    return ipcRenderer.invoke("ai:generate", request);
  },
  scheduleReminder: (payload: ReminderSchedulePayload): Promise<ReminderScheduleResult> => {
    return ipcRenderer.invoke("reminder:schedule", payload);
  },
  getUpdateInfo: (): Promise<AppUpdateInfo> => {
    return ipcRenderer.invoke("app:get-update-info");
  },
  getReleaseHistory: (): Promise<AppReleaseHistoryResult> => {
    return ipcRenderer.invoke("app:get-release-history");
  },
  downloadUpdate: (): Promise<AppAutoUpdateActionResult> => {
    return ipcRenderer.invoke("app:download-update");
  },
  installUpdate: (): Promise<AppAutoUpdateActionResult> => {
    return ipcRenderer.invoke("app:install-update");
  },
  onAutoUpdateState: (callback: (state: AppAutoUpdateState) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, state: AppAutoUpdateState) => callback(state);
    ipcRenderer.on("app:auto-update-state", listener);
    return () => ipcRenderer.removeListener("app:auto-update-state", listener);
  },
  openReleasePage: (url?: string): Promise<OpenReleasePageResult> => {
    return ipcRenderer.invoke("app:open-release-page", url);
  },
  openCursorPrompt: (url: string): Promise<OpenCursorPromptResult> => {
    return ipcRenderer.invoke("app:open-cursor-prompt", url);
  }
};

contextBridge.exposeInMainWorld("timeBro", timeBroApi);
contextBridge.exposeInMainWorld("jiraWeekTracker", timeBroApi);

/// <reference types="vite/client" />

import type {
  AddWorklogRequest,
  AddWorklogResult,
  AppSettings,
  DeleteWorklogRequest,
  DeleteWorklogResult,
  JiraConnectionResult,
  ReminderSchedulePayload,
  ReminderScheduleResult,
  SyncRequest,
  SyncResult,
  TicketsRequest,
  TicketsResult,
  UpdateWorklogRequest,
  UpdateWorklogResult
} from "../shared/types";

interface TimeBroNativeApi {
  testJiraConnection: (settings: AppSettings) => Promise<JiraConnectionResult>;
  syncJiraWorklogs: (request: SyncRequest) => Promise<SyncResult>;
  fetchAssignedTickets: (request: TicketsRequest) => Promise<TicketsResult>;
  addWorklog: (request: AddWorklogRequest) => Promise<AddWorklogResult>;
  updateWorklog: (request: UpdateWorklogRequest) => Promise<UpdateWorklogResult>;
  deleteWorklog: (request: DeleteWorklogRequest) => Promise<DeleteWorklogResult>;
  scheduleReminder: (payload: ReminderSchedulePayload) => Promise<ReminderScheduleResult>;
}

declare global {
  interface Window {
    timeBro?: TimeBroNativeApi;
    jiraWeekTracker?: TimeBroNativeApi;
  }
}

/// <reference types="vite/client" />

import type {
  AddWorklogRequest,
  AddWorklogResult,
  AppSettings,
  JiraConnectionResult,
  ReminderSchedulePayload,
  SyncRequest,
  SyncResult,
  TicketsRequest,
  TicketsResult
} from "../shared/types";

declare global {
  interface Window {
    jiraWeekTracker?: {
      testJiraConnection: (settings: AppSettings) => Promise<JiraConnectionResult>;
      syncJiraWorklogs: (request: SyncRequest) => Promise<SyncResult>;
      fetchAssignedTickets: (request: TicketsRequest) => Promise<TicketsResult>;
      addWorklog: (request: AddWorklogRequest) => Promise<AddWorklogResult>;
      scheduleReminder: (
        payload: ReminderSchedulePayload
      ) => Promise<{ scheduled: boolean; fireAt?: string }>;
    };
  }
}

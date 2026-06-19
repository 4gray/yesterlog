import { contextBridge, ipcRenderer } from "electron";
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

contextBridge.exposeInMainWorld("jiraWeekTracker", {
  testJiraConnection: (settings: AppSettings): Promise<JiraConnectionResult> => {
    return ipcRenderer.invoke("jira:test-connection", settings);
  },
  syncJiraWorklogs: (request: SyncRequest): Promise<SyncResult> => {
    return ipcRenderer.invoke("jira:sync-worklogs", request);
  },
  fetchAssignedTickets: (request: TicketsRequest): Promise<TicketsResult> => {
    return ipcRenderer.invoke("jira:fetch-tickets", request);
  },
  addWorklog: (request: AddWorklogRequest): Promise<AddWorklogResult> => {
    return ipcRenderer.invoke("jira:add-worklog", request);
  },
  scheduleReminder: (payload: ReminderSchedulePayload): Promise<{ scheduled: boolean; fireAt?: string }> => {
    return ipcRenderer.invoke("reminder:schedule", payload);
  }
});

import { contextBridge, ipcRenderer } from "electron";
import type {
  AddWorklogRequest,
  AddWorklogResult,
  AppSettings,
  DeleteWorklogRequest,
  DeleteWorklogResult,
  JiraConnectionResult,
  ReminderSchedulePayload,
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
  syncJiraWorklogs: (request: SyncRequest): Promise<SyncResult> => {
    return ipcRenderer.invoke("jira:sync-worklogs", request);
  },
  fetchAssignedTickets: (request: TicketsRequest): Promise<TicketsResult> => {
    return ipcRenderer.invoke("jira:fetch-tickets", request);
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
  scheduleReminder: (payload: ReminderSchedulePayload): Promise<{ scheduled: boolean; fireAt?: string }> => {
    return ipcRenderer.invoke("reminder:schedule", payload);
  }
};

contextBridge.exposeInMainWorld("timeBro", timeBroApi);
contextBridge.exposeInMainWorld("jiraWeekTracker", timeBroApi);

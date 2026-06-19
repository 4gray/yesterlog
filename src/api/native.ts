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
} from "../../shared/types";

export const nativeApi = {
  testJiraConnection(settings: AppSettings): Promise<JiraConnectionResult> {
    if (!window.jiraWeekTracker) {
      return Promise.resolve({
        ok: false,
        message: settings.jiraBaseUrl
          ? "Open the Electron app to test Jira credentials."
          : "Add your Jira settings before testing."
      });
    }

    return window.jiraWeekTracker.testJiraConnection(settings);
  },

  syncJiraWorklogs(request: SyncRequest): Promise<SyncResult> {
    if (!window.jiraWeekTracker) {
      return Promise.reject(new Error("Open the Electron app to sync Jira worklogs."));
    }

    return window.jiraWeekTracker.syncJiraWorklogs(request);
  },

  fetchAssignedTickets(request: TicketsRequest): Promise<TicketsResult> {
    if (!window.jiraWeekTracker) {
      return Promise.resolve({
        fetchedAt: new Date().toISOString(),
        accountId: "",
        inProgress: [],
        recentlyClosed: []
      });
    }

    return window.jiraWeekTracker.fetchAssignedTickets(request);
  },

  addWorklog(request: AddWorklogRequest): Promise<AddWorklogResult> {
    if (!window.jiraWeekTracker) {
      return Promise.reject(new Error("Open the Electron app to log time to Jira."));
    }

    return window.jiraWeekTracker.addWorklog(request);
  },

  scheduleReminder(payload: ReminderSchedulePayload) {
    if (!window.jiraWeekTracker) {
      return Promise.resolve({ scheduled: false });
    }

    return window.jiraWeekTracker.scheduleReminder(payload);
  }
};

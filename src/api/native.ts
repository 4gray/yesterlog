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
} from "../../shared/types";

const getNativeBridge = () => window.timeBro ?? window.jiraWeekTracker;

export const nativeApi = {
  testJiraConnection(settings: AppSettings): Promise<JiraConnectionResult> {
    const bridge = getNativeBridge();

    if (!bridge) {
      return Promise.resolve({
        ok: false,
        message: settings.jiraBaseUrl
          ? "Open the Electron app to test Jira credentials."
          : "Add your Jira settings before testing."
      });
    }

    return bridge.testJiraConnection(settings);
  },

  syncJiraWorklogs(request: SyncRequest): Promise<SyncResult> {
    const bridge = getNativeBridge();

    if (!bridge) {
      return Promise.reject(new Error("Open the Electron app to sync Jira worklogs."));
    }

    return bridge.syncJiraWorklogs(request);
  },

  fetchAssignedTickets(request: TicketsRequest): Promise<TicketsResult> {
    const bridge = getNativeBridge();

    if (!bridge) {
      return Promise.resolve({
        fetchedAt: new Date().toISOString(),
        accountId: "",
        inProgress: [],
        recentlyClosed: []
      });
    }

    return bridge.fetchAssignedTickets(request);
  },

  addWorklog(request: AddWorklogRequest): Promise<AddWorklogResult> {
    const bridge = getNativeBridge();

    if (!bridge) {
      return Promise.reject(new Error("Open the Electron app to log time to Jira."));
    }

    return bridge.addWorklog(request);
  },

  updateWorklog(request: UpdateWorklogRequest): Promise<UpdateWorklogResult> {
    const bridge = getNativeBridge();

    if (!bridge) {
      return Promise.reject(new Error("Open the Electron app to edit Jira worklogs."));
    }

    return bridge.updateWorklog(request);
  },

  deleteWorklog(request: DeleteWorklogRequest): Promise<DeleteWorklogResult> {
    const bridge = getNativeBridge();

    if (!bridge) {
      return Promise.reject(new Error("Open the Electron app to delete Jira worklogs."));
    }

    return bridge.deleteWorklog(request);
  },

  scheduleReminder(payload: ReminderSchedulePayload) {
    const bridge = getNativeBridge();

    if (!bridge) {
      return Promise.resolve({ scheduled: false });
    }

    return bridge.scheduleReminder(payload);
  }
};

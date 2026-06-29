import type {
  AddWorklogRequest,
  AddWorklogResult,
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
  JiraConnectionResult,
  OllamaGenerateRequest,
  OllamaGenerateResult,
  OllamaListModelsRequest,
  OllamaListModelsResult,
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
} from "../../shared/types";
import { GITHUB_RELEASES_URL, getSafeReleaseUrl } from "../../shared/releases";

const getNativeBridge = () => window.timeBro ?? window.jiraWeekTracker;
type NativeBridge = NonNullable<ReturnType<typeof getNativeBridge>>;
type NativeBridgeMethod = keyof NativeBridge;

const getNativeBridgeWithMethod = <Method extends NativeBridgeMethod>(method: Method) => {
  const bridges = [window.timeBro, window.jiraWeekTracker];
  return bridges.find((bridge): bridge is NativeBridge & Required<Pick<NativeBridge, Method>> => {
    if (!bridge) {
      return false;
    }

    return typeof bridge[method] === "function";
  });
};

const rendererPreviewVersion = import.meta.env.VITE_APP_VERSION || "unknown";

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

  testBitbucketConnection(settings: AppSettings): Promise<BitbucketConnectionResult> {
    const bridge = getNativeBridge();

    if (!bridge) {
      const configured = Boolean(
        settings.bitbucketEmail.trim() &&
          settings.bitbucketApiToken.trim() &&
          settings.bitbucketWorkspace.trim() &&
          settings.bitbucketRepositories.trim()
      );

      return Promise.resolve({
        ok: configured,
        message: configured
          ? "Renderer preview cannot reach Bitbucket; open the Electron app to verify the token."
          : "Add your Bitbucket settings before testing."
      });
    }

    return bridge.testBitbucketConnection(settings);
  },

  syncJiraWorklogs(request: SyncRequest): Promise<SyncResult> {
    const bridge = getNativeBridge();

    if (!bridge) {
      return Promise.reject(new Error("Open the Electron app to sync Jira worklogs."));
    }

    return bridge.syncJiraWorklogs(request);
  },

  syncBitbucketReviews(request: BitbucketReviewSyncRequest): Promise<BitbucketReviewSyncResult> {
    const bridge = getNativeBridgeWithMethod("syncBitbucketReviews");

    if (!bridge) {
      const hasStaleBridge = Boolean(getNativeBridge());
      return Promise.reject(
        new Error(
          hasStaleBridge
            ? "Restart TimeBro to finish enabling Bitbucket review sync. The current window is using an older native bridge."
            : "Open the Electron app to sync Bitbucket review sessions."
        )
      );
    }

    return bridge.syncBitbucketReviews(request);
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

  searchJiraTickets(request: SearchTicketsRequest): Promise<SearchTicketsResult> {
    const bridge = getNativeBridge();

    if (!bridge) {
      return Promise.resolve({
        query: request.query.trim(),
        issues: []
      });
    }

    return bridge.searchJiraTickets(request);
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

  listOllamaModels(request: OllamaListModelsRequest): Promise<OllamaListModelsResult> {
    const bridge = getNativeBridgeWithMethod("listOllamaModels");

    if (!bridge) {
      return Promise.resolve({
        ok: false,
        models: [],
        message: "Open the Electron app to reach a local Ollama model."
      });
    }

    return bridge.listOllamaModels(request);
  },

  generateWithOllama(request: OllamaGenerateRequest): Promise<OllamaGenerateResult> {
    const bridge = getNativeBridgeWithMethod("generateWithOllama");

    if (!bridge) {
      return Promise.resolve({
        ok: false,
        message: "Open the Electron app to reach a local Ollama model."
      });
    }

    return bridge.generateWithOllama(request);
  },

  scheduleReminder(payload: ReminderSchedulePayload): Promise<ReminderScheduleResult> {
    const bridge = getNativeBridge();

    if (!bridge) {
      return Promise.resolve({
        scheduled: false,
        reason: "unsupported"
      });
    }

    return bridge.scheduleReminder(payload);
  },

  getUpdateInfo(): Promise<AppUpdateInfo> {
    const bridge = getNativeBridge();

    if (!bridge) {
      return Promise.resolve({
        currentVersion: rendererPreviewVersion,
        releasePageUrl: GITHUB_RELEASES_URL,
        checkedAt: new Date().toISOString(),
        updateAvailable: false,
        error: "Open the Electron app to check GitHub Releases."
      });
    }

    return bridge.getUpdateInfo();
  },

  getReleaseHistory(): Promise<AppReleaseHistoryResult> {
    const bridge = getNativeBridgeWithMethod("getReleaseHistory");

    if (!bridge) {
      return Promise.resolve({
        currentVersion: rendererPreviewVersion,
        checkedAt: new Date().toISOString(),
        releases: [],
        error: "Open the Electron app to fetch GitHub release history."
      });
    }

    return bridge.getReleaseHistory();
  },

  downloadUpdate(): Promise<AppAutoUpdateActionResult> {
    const bridge = getNativeBridgeWithMethod("downloadUpdate");

    if (!bridge) {
      return Promise.resolve({
        ok: false,
        message: "Open the packaged Electron app to install updates automatically.",
        state: {
          supported: false,
          phase: "unsupported",
          reason: "Automatic installation is not available in renderer preview."
        }
      });
    }

    return bridge.downloadUpdate();
  },

  installUpdate(): Promise<AppAutoUpdateActionResult> {
    const bridge = getNativeBridgeWithMethod("installUpdate");

    if (!bridge) {
      return Promise.resolve({
        ok: false,
        message: "Open the packaged Electron app to install updates automatically.",
        state: {
          supported: false,
          phase: "unsupported",
          reason: "Automatic installation is not available in renderer preview."
        }
      });
    }

    return bridge.installUpdate();
  },

  onAutoUpdateState(callback: (state: AppAutoUpdateState) => void): (() => void) {
    const bridge = getNativeBridgeWithMethod("onAutoUpdateState");
    return bridge?.onAutoUpdateState?.(callback) ?? (() => undefined);
  },

  openReleasePage(url?: string): Promise<OpenReleasePageResult> {
    const bridge = getNativeBridge();
    const releaseUrl = getSafeReleaseUrl(url);

    if (!bridge) {
      window.open(releaseUrl, "_blank", "noopener,noreferrer");
      return Promise.resolve({
        ok: true,
        url: releaseUrl
      });
    }

    return bridge.openReleasePage(releaseUrl);
  }
};

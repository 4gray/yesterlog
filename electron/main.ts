import { app, BrowserWindow, dialog, ipcMain, screen, shell } from "electron";
import { autoUpdater } from "electron-updater";
import path from "node:path";
import { syncBitbucketReviewSessions, testBitbucketConnection } from "./bitbucket";
import {
  addWorklog,
  deleteWorklog,
  fetchAssignedTickets,
  fetchJiraIssueDetails,
  searchJiraTickets,
  syncJiraActivity,
  testJiraConnection,
  syncJiraWorklogs,
  updateWorklog
} from "./jira";
import { generateWithAi, listAiModels } from "./aiProvider";
import { scheduleReminder } from "./reminders";
import {
  checkForAppUpdate,
  createAppAutoUpdater,
  fetchAppReleaseHistory,
  getAutoUpdateCapability,
  type AppAutoUpdaterAdapter,
  type AppAutoUpdaterService
} from "./updates";
import { getWindowStateOptions, MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH, trackWindowState } from "./windowState";
import { getSafeReleaseUrl } from "../shared/releases";
import { isCursorPromptDeeplink } from "../shared/cursorDeeplink";
import type {
  AddWorklogRequest,
  AiGenerateRequest,
  AiListModelsRequest,
  AppSettings,
  BitbucketReviewSyncRequest,
  DeleteWorklogRequest,
  IssueDetailsRequest,
  OpenCursorPromptResult,
  OpenReleasePageResult,
  ReminderSchedulePayload,
  SearchTicketsRequest,
  SyncRequest,
  TicketsRequest,
  UpdateWorklogRequest
} from "../shared/types";

let mainWindow: BrowserWindow | undefined;
let appAutoUpdater: AppAutoUpdaterService | undefined;

const sendAutoUpdateState = (state: ReturnType<AppAutoUpdaterService["getState"]>) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("app:auto-update-state", state);
};

const getAppAutoUpdater = () => {
  if (!appAutoUpdater) {
    appAutoUpdater = createAppAutoUpdater(
      autoUpdater as unknown as AppAutoUpdaterAdapter,
      getAutoUpdateCapability(process.platform, app.isPackaged, process.env),
      sendAutoUpdateState
    );
  }

  return appAutoUpdater;
};

const getWindowIconPath = () => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "icon.png");
  }

  return path.join(__dirname, "../../build/icon.png");
};

const createWindow = async () => {
  const userDataPath = app.getPath("userData");
  const windowStateOptions = getWindowStateOptions(userDataPath, screen.getAllDisplays());

  mainWindow = new BrowserWindow({
    ...windowStateOptions,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    title: "TimeBro",
    backgroundColor: "#fdfdfb",
    icon: getWindowIconPath(),
    autoHideMenuBar: process.platform === "linux",
    show: false,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (process.platform === "linux") {
    mainWindow.setMenu(null);
  }

  trackWindowState(mainWindow, userDataPath);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const targetUrl = new URL(url);
    const appUrl = process.env.VITE_DEV_SERVER_URL ?? "file://";

    if (!url.startsWith(appUrl) && targetUrl.protocol.startsWith("http")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Fired when the renderer's beforeunload guard tries to block a close/reload
  // (active only while settings have unsaved changes). Confirm before letting
  // the window go — calling preventDefault() here ALLOWS the unload to proceed.
  mainWindow.webContents.on("will-prevent-unload", (event) => {
    const choice = dialog.showMessageBoxSync(mainWindow!, {
      type: "warning",
      buttons: ["Leave", "Stay"],
      defaultId: 1,
      cancelId: 1,
      title: "Unsaved settings changes",
      message: "Leave with unsaved settings?",
      detail: "Your settings changes haven't been saved yet and will be lost if you leave."
    });

    if (choice === 0) {
      event.preventDefault();
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
    return;
  }

  await mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
};

ipcMain.handle("jira:test-connection", (_event, settings: AppSettings) => {
  return testJiraConnection(settings);
});

ipcMain.handle("jira:sync-worklogs", (_event, request: SyncRequest) => {
  return syncJiraWorklogs(request);
});

ipcMain.handle("jira:sync-activity", (_event, request: SyncRequest) => {
  return syncJiraActivity(request);
});

ipcMain.handle("jira:fetch-tickets", (_event, request: TicketsRequest) => {
  return fetchAssignedTickets(request);
});

ipcMain.handle("jira:search-tickets", (_event, request: SearchTicketsRequest) => {
  return searchJiraTickets(request);
});

ipcMain.handle("jira:fetch-issue-details", (_event, request: IssueDetailsRequest) => {
  return fetchJiraIssueDetails(request);
});

ipcMain.handle("jira:add-worklog", (_event, request: AddWorklogRequest) => {
  return addWorklog(request);
});

ipcMain.handle("jira:update-worklog", (_event, request: UpdateWorklogRequest) => {
  return updateWorklog(request);
});

ipcMain.handle("jira:delete-worklog", (_event, request: DeleteWorklogRequest) => {
  return deleteWorklog(request);
});

ipcMain.handle("bitbucket:test-connection", (_event, settings: AppSettings) => {
  return testBitbucketConnection(settings);
});

ipcMain.handle("bitbucket:sync-reviews", (_event, request: BitbucketReviewSyncRequest) => {
  return syncBitbucketReviewSessions(request);
});

ipcMain.handle("ai:list-models", (_event, request: AiListModelsRequest) => {
  return listAiModels(request);
});

ipcMain.handle("ai:generate", (_event, request: AiGenerateRequest) => {
  return generateWithAi(request);
});

ipcMain.handle("reminder:schedule", (_event, payload: ReminderSchedulePayload) => {
  return scheduleReminder(payload);
});

ipcMain.handle("app:get-update-info", () => {
  const updater = getAppAutoUpdater();
  return checkForAppUpdate(app.getVersion(), fetch, process.platform, updater.getState(), process.env).then((info) =>
    updater.decorateUpdateInfo(info)
  );
});

ipcMain.handle("app:get-release-history", () => {
  return fetchAppReleaseHistory(app.getVersion(), fetch, process.platform, process.env);
});

ipcMain.handle("app:download-update", () => {
  return getAppAutoUpdater().downloadUpdate();
});

ipcMain.handle("app:install-update", () => {
  return getAppAutoUpdater().installUpdate();
});

ipcMain.handle("app:open-release-page", async (_event, url?: string): Promise<OpenReleasePageResult> => {
  const releaseUrl = getSafeReleaseUrl(url);
  await shell.openExternal(releaseUrl);
  return {
    ok: true,
    url: releaseUrl
  };
});

ipcMain.handle("app:open-cursor-prompt", async (_event, url: unknown): Promise<OpenCursorPromptResult> => {
  // Only ever hand a genuine Cursor prompt deeplink to the OS — never an
  // arbitrary scheme the renderer might have been tricked into passing.
  if (!isCursorPromptDeeplink(url)) {
    return { ok: false, error: "Not a valid Cursor deeplink." };
  }

  try {
    await shell.openExternal(url);
    return { ok: true, url };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to open Cursor."
    };
  }
});

app.whenReady().then(async () => {
  app.setAppUserModelId("local.timebro");
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

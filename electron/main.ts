import { app, BrowserWindow, ipcMain, screen, shell } from "electron";
import path from "node:path";
import { syncBitbucketReviewSessions, testBitbucketConnection } from "./bitbucket";
import {
  addWorklog,
  deleteWorklog,
  fetchAssignedTickets,
  searchJiraTickets,
  testJiraConnection,
  syncJiraWorklogs,
  updateWorklog
} from "./jira";
import { scheduleReminder } from "./reminders";
import { checkForAppUpdate } from "./updates";
import { getWindowStateOptions, MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH, trackWindowState } from "./windowState";
import { getSafeReleaseUrl } from "../shared/releases";
import type {
  AddWorklogRequest,
  AppSettings,
  BitbucketReviewSyncRequest,
  DeleteWorklogRequest,
  OpenReleasePageResult,
  ReminderSchedulePayload,
  SearchTicketsRequest,
  SyncRequest,
  TicketsRequest,
  UpdateWorklogRequest
} from "../shared/types";

let mainWindow: BrowserWindow | undefined;

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

ipcMain.handle("jira:fetch-tickets", (_event, request: TicketsRequest) => {
  return fetchAssignedTickets(request);
});

ipcMain.handle("jira:search-tickets", (_event, request: SearchTicketsRequest) => {
  return searchJiraTickets(request);
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

ipcMain.handle("reminder:schedule", (_event, payload: ReminderSchedulePayload) => {
  return scheduleReminder(payload);
});

ipcMain.handle("app:get-update-info", () => {
  return checkForAppUpdate(app.getVersion());
});

ipcMain.handle("app:open-release-page", async (_event, url?: string): Promise<OpenReleasePageResult> => {
  const releaseUrl = getSafeReleaseUrl(url);
  await shell.openExternal(releaseUrl);
  return {
    ok: true,
    url: releaseUrl
  };
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

import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { addWorklog, fetchAssignedTickets, testJiraConnection, syncJiraWorklogs } from "./jira";
import { scheduleReminder } from "./reminders";
import type {
  AddWorklogRequest,
  AppSettings,
  ReminderSchedulePayload,
  SyncRequest,
  TicketsRequest
} from "../shared/types";

let mainWindow: BrowserWindow | undefined;

const getWindowIconPath = () => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "icon.png");
  }

  return path.join(__dirname, "../../build/icon.png");
};

const createWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1040,
    minHeight: 720,
    title: "Jira Week Tracker",
    backgroundColor: "#fdfdfb",
    icon: getWindowIconPath(),
    show: false,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

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

  await mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
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

ipcMain.handle("jira:add-worklog", (_event, request: AddWorklogRequest) => {
  return addWorklog(request);
});

ipcMain.handle("reminder:schedule", (_event, payload: ReminderSchedulePayload) => {
  return scheduleReminder(payload);
});

app.whenReady().then(async () => {
  app.setAppUserModelId("local.jira-week-tracker");
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

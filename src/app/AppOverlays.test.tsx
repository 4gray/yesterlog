// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUpdateInfo } from "../../shared/types";
import { AppOverlays, type AppOverlaysProps } from "./AppOverlays";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../components/TimeEntryModalLayer", () => ({
  TimeEntryModalLayer: ({ addModalDate, editingWorklog, editingPersonalNote }: Partial<AppOverlaysProps>) => (
    <section
      data-testid="time-entry-modal-layer"
      data-add={String(Boolean(addModalDate))}
      data-worklog={String(Boolean(editingWorklog))}
      data-note={String(Boolean(editingPersonalNote))}
    />
  )
}));

vi.mock("../components/ReleaseNotesDialog", () => ({
  ReleaseNotesDialog: ({
    updateInfo,
    onClose,
    onDownload,
    onOpenReleasePage
  }: {
    updateInfo: AppUpdateInfo;
    onClose: () => void;
    onDownload: (info: AppUpdateInfo) => void;
    onOpenReleasePage: (url?: string) => void;
  }) => (
    <section data-testid="release-notes-dialog">
      <span>{updateInfo.latestVersion}</span>
      <button type="button" onClick={onClose}>
        close
      </button>
      <button type="button" onClick={() => onDownload(updateInfo)}>
        download
      </button>
      <button type="button" onClick={() => onOpenReleasePage(updateInfo.releasePageUrl)}>
        github
      </button>
    </section>
  )
}));

vi.mock("../components/SnackbarStack", () => ({
  SnackbarStack: ({
    notifications,
    onDismiss
  }: {
    notifications: AppOverlaysProps["notifications"];
    onDismiss: AppOverlaysProps["onDismissNotification"];
  }) => (
    <section data-testid="snackbar-stack">
      <span>{notifications.length}</span>
      {notifications[0] && (
        <button type="button" onClick={() => onDismiss(notifications[0].id)}>
          dismiss
        </button>
      )}
    </section>
  )
}));

const updateInfo: AppUpdateInfo = {
  currentVersion: "1.3.2",
  latestVersion: "1.4.0",
  releasePageUrl: "https://github.com/4gray/time-bro/releases/tag/v1.4.0",
  downloadUrl: "https://github.com/4gray/time-bro/releases/download/v1.4.0/TimeBro.dmg",
  checkedAt: "2026-06-24T12:00:00.000Z",
  updateAvailable: true
};

const noop = () => undefined;
const asyncFalse = async () => false;

const baseProps = (): AppOverlaysProps => ({
  addModalDate: undefined,
  editingWorklog: undefined,
  editingPersonalNote: undefined,
  dateOptions: ["2026-06-15"],
  ticketOptions: [],
  isConfigured: true,
  isLogging: false,
  isDeletingWorklog: false,
  logError: undefined,
  onCloseAddTime: noop,
  onCloseEditingWorklog: noop,
  onCloseEditingPersonalNote: noop,
  onAddWorklog: asyncFalse,
  onUpdateWorklog: asyncFalse,
  onDeleteWorklog: asyncFalse,
  onSearchTickets: undefined,
  onAddPersonalNote: asyncFalse,
  onUpdatePersonalNote: asyncFalse,
  onDeletePersonalNote: asyncFalse,
  getRecurringCandidates: () => [],
  onLogRecurring: asyncFalse,
  releaseNotesDialogInfo: undefined,
  onCloseReleaseNotes: noop,
  onDownloadUpdate: noop,
  onOpenReleasePage: noop,
  notifications: [],
  onDismissNotification: noop
});

let container: HTMLDivElement;
let root: Root;

const renderOverlays = (props: Partial<AppOverlaysProps> = {}) => {
  act(() => {
    root.render(<AppOverlays {...baseProps()} {...props} />);
  });
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("AppOverlays", () => {
  it("always renders the time entry layer and snackbar stack", () => {
    renderOverlays({ addModalDate: new Date(2026, 5, 18, 10) });

    expect(container.querySelector("[data-testid='time-entry-modal-layer']")?.getAttribute("data-add")).toBe("true");
    expect(container.querySelector("[data-testid='snackbar-stack']")?.textContent).toBe("0");
    expect(container.querySelector("[data-testid='release-notes-dialog']")).toBeNull();
  });

  it("renders release notes when dialog info is available and wires actions", () => {
    const onCloseReleaseNotes = vi.fn();
    const onDownloadUpdate = vi.fn();
    const onOpenReleasePage = vi.fn();
    renderOverlays({
      releaseNotesDialogInfo: updateInfo,
      onCloseReleaseNotes,
      onDownloadUpdate,
      onOpenReleasePage
    });

    expect(container.querySelector("[data-testid='release-notes-dialog']")?.textContent).toContain("1.4.0");

    act(() => {
      container.querySelectorAll("button")[0]?.click();
      container.querySelectorAll("button")[1]?.click();
      container.querySelectorAll("button")[2]?.click();
    });

    expect(onCloseReleaseNotes).toHaveBeenCalledTimes(1);
    expect(onDownloadUpdate).toHaveBeenCalledWith(updateInfo);
    expect(onOpenReleasePage).toHaveBeenCalledWith(updateInfo.releasePageUrl);
  });

  it("passes notifications to the snackbar stack", () => {
    const onDismissNotification = vi.fn();
    renderOverlays({
      notifications: [{ id: 7, kind: "success", message: "Saved" }],
      onDismissNotification
    });

    expect(container.querySelector("[data-testid='snackbar-stack']")?.textContent).toContain("1");

    act(() => {
      container.querySelector("button")?.click();
    });

    expect(onDismissNotification).toHaveBeenCalledWith(7);
  });
});

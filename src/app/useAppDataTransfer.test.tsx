// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { useAppDataTransfer } from "./useAppDataTransfer";
import { DataTransferDialog } from "../components/DataTransferDialog";
import { BACKUP_STORE_KEYS, BACKUP_DB_VERSION, type AppBackup } from "../domain/backup";
import { beginDataTransfer, endDataTransfer } from "../storage/dataTransfer";
import { createBackupSnapshot, restoreBackupSnapshot } from "../storage/db";

vi.mock("../storage/db", () => ({ createBackupSnapshot: vi.fn(), restoreBackupSnapshot: vi.fn() }));
vi.mock("../storage/dataTransfer", () => ({ beginDataTransfer: vi.fn(), endDataTransfer: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const backup: AppBackup = {
  format: "yesterlog-backup", version: 1, appVersion: "3.4.0", dbVersion: BACKUP_DB_VERSION,
  exportedAt: "2026-06-18T12:00:00Z", preferences: {},
  stores: Object.fromEntries(Object.keys(BACKUP_STORE_KEYS).map((name) => [name, [] as Record<string, unknown>[]])) as AppBackup["stores"]
};
let root: Root, host: HTMLDivElement, transfer: ReturnType<typeof useAppDataTransfer>;
const showError = vi.fn(), showSuccess = vi.fn(), discardSettings = vi.fn();
let options = { isDemo: false, isDirty: false, isBusy: false, showError, showSuccess, discardSettings };
function Harness() {
  transfer = useAppDataTransfer(options);
  return <DataTransferDialog transfer={transfer} isDirty={options.isDirty} />;
}
function render(overrides: Partial<typeof options> = {}) {
  options = { ...options, ...overrides };
  act(() => root.render(<Harness />));
}
const file = (text = JSON.stringify(backup)) => ({ text: async () => text } as File);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(createBackupSnapshot).mockResolvedValue(backup);
  vi.mocked(restoreBackupSnapshot).mockRejectedValue(new Error("Restore failed; original data preserved."));
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:backup"), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  options = { isDemo: false, isDirty: false, isBusy: false, showError, showSuccess, discardSettings };
  render();
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it("previews the copy and cancels without touching storage", async () => {
  await act(async () => transfer.readBackup(file()));
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain("Jira worklogs");
  expect(host.textContent).toContain("This replaces all data on this computer");
  expect(host.textContent).toContain("Export current data");
  expect(restoreBackupSnapshot).not.toHaveBeenCalled();
  act(() => transfer.close());
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(beginDataTransfer).not.toHaveBeenCalled();
});

it("requires explicit discard of dirty settings before restoring and recovers from a restore failure", async () => {
  render({ isDirty: true });
  await act(async () => transfer.readBackup(file()));
  const restoreButton = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Replace all"))!;
  expect(restoreButton.disabled).toBe(true);
  await act(async () => transfer.restore());
  expect(restoreBackupSnapshot).not.toHaveBeenCalled();
  act(() => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  expect(restoreButton.disabled).toBe(false);
  await act(async () => transfer.restore());
  expect(restoreBackupSnapshot).toHaveBeenCalledOnce();
  expect(discardSettings).not.toHaveBeenCalled();
  expect(endDataTransfer).toHaveBeenCalledOnce();
  expect(transfer.progress).toBeUndefined();
  expect(showError).toHaveBeenCalledWith("Restore failed; original data preserved.");
});

it("does not export unsaved settings or mutate real data in demo mode", async () => {
  render({ isDirty: true });
  await act(async () => transfer.exportBackup());
  expect(showError).toHaveBeenCalledWith(expect.stringContaining("Save or discard"));
  render({ isDemo: true, isDirty: false });
  await act(async () => { await transfer.exportBackup(); await transfer.readBackup(file()); });
  expect(createBackupSnapshot).not.toHaveBeenCalled();
  expect(beginDataTransfer).not.toHaveBeenCalled();
  expect(transfer.backup).toBeUndefined();
});

it("waits for current sync before freezing writes and starting a JSON download", async () => {
  render({ isBusy: true });
  let task!: Promise<void>;
  act(() => { task = transfer.exportBackup(); });
  expect(beginDataTransfer).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Waiting for sync");
  render({ isBusy: false });
  await act(async () => task);
  expect(beginDataTransfer).toHaveBeenCalledOnce();
  expect(createBackupSnapshot).toHaveBeenCalledOnce();
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
  expect(showSuccess).toHaveBeenCalledWith(expect.stringContaining("API tokens are not included"));
  expect(endDataTransfer).toHaveBeenCalledOnce();
});

it("reports invalid JSON without opening a restore preview", async () => {
  await act(async () => transfer.readBackup(file("{broken")));
  expect(showError).toHaveBeenCalledWith("The backup is not valid JSON.");
  expect(transfer.isOpen).toBe(false);
  expect(restoreBackupSnapshot).not.toHaveBeenCalled();
});

it("unfreezes the app when export fails", async () => {
  vi.mocked(createBackupSnapshot).mockRejectedValueOnce(new Error("Could not read database"));
  await act(async () => transfer.exportBackup());
  expect(showError).toHaveBeenCalledWith("Could not read database");
  expect(endDataTransfer).toHaveBeenCalledOnce();
  expect(transfer.isOpen).toBe(false);
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
});

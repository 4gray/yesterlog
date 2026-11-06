import { useCallback, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { parseBackup, type AppBackup } from "../domain/backup";
import { createBackupSnapshot, restoreBackupSnapshot } from "../storage/db";
import { beginDataTransfer, endDataTransfer } from "../storage/dataTransfer";

interface Options {
  isDemo: boolean;
  isDirty: boolean;
  isBusy: boolean;
  discardSettings: () => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

export const useAppDataTransfer = (options: Options) => {
  const current = useRef(options);
  current.current = options;
  const inputRef = useRef<HTMLInputElement>(null);
  const running = useRef(false);
  const [progress, setProgress] = useState<string>();
  const [backup, setBackup] = useState<AppBackup>();
  const [discardDraft, setDiscardDraft] = useState(false);

  const prepare = async () => {
    setProgress("Waiting for sync and local saves…");
    while (current.current.isBusy) await new Promise((resolve) => setTimeout(resolve, 50));
    await beginDataTransfer();
  };

  const exportBackup = async () => {
    if (running.current || options.isDemo) return;
    if (options.isDirty) {
      options.showError("Save or discard your settings changes before exporting a backup.");
      return;
    }
    running.current = true;
    try {
      await prepare();
      setProgress("Exporting all saved data…");
      const data = await createBackupSnapshot(import.meta.env.VITE_APP_VERSION || "unknown", window.localStorage);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `yesterlog-backup-${data.exportedAt.replace(/[:.]/g, "-")}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      options.showSuccess("Full backup download started. API tokens are not included.");
    } catch (error) {
      options.showError(error instanceof Error ? error.message : "Could not export your data.");
    } finally {
      endDataTransfer();
      running.current = false;
      setProgress(undefined);
    }
  };

  const readBackup = async (file: File) => {
    if (running.current || options.isDemo) return;
    running.current = true;
    setProgress("Checking backup…");
    try {
      setBackup(parseBackup(await file.text()));
      setDiscardDraft(false);
    } catch (error) {
      options.showError(error instanceof Error ? error.message : "Could not read this backup.");
    } finally {
      running.current = false;
      setProgress(undefined);
    }
  };

  const restore = async () => {
    if (!backup || running.current || options.isDemo || (options.isDirty && !discardDraft)) return;
    running.current = true;
    let committed = false;
    try {
      await prepare();
      setProgress("Restoring data…");
      await restoreBackupSnapshot(backup);
      committed = true;
      flushSync(() => options.discardSettings());
      window.location.reload();
    } catch (error) {
      options.showError(error instanceof Error ? error.message : "Could not restore your data.");
    } finally {
      // Keep writes frozen after commit, even if reload is delayed or prevented.
      if (!committed) {
        endDataTransfer();
        running.current = false;
        setProgress(undefined);
      }
    }
  };

  const close = useCallback(() => { if (!running.current) setBackup(undefined); }, []);

  return {
    inputRef, backup, progress, discardDraft, setDiscardDraft,
    exportBackup, readBackup, restore,
    openRestore: () => { if (!options.isDemo && !running.current) inputRef.current?.click(); },
    close,
    isOpen: Boolean(backup || progress)
  };
};

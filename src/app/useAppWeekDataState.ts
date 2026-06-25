import { useState } from "react";
import type { PersonalNote, SyncResult } from "../../shared/types";

interface UseAppWeekDataStateOptions {
  demoSyncResult?: SyncResult;
}

export const useAppWeekDataState = ({ demoSyncResult }: UseAppWeekDataStateOptions = {}) => {
  const [syncResult, setSyncResult] = useState<SyncResult | undefined>(() => demoSyncResult);
  const [personalNotes, setPersonalNotes] = useState<PersonalNote[]>([]);

  return {
    syncResult,
    setSyncResult,
    personalNotes,
    setPersonalNotes
  };
};

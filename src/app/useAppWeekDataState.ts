import { useState } from "react";
import type { PersonalNote, SyncResult, WeekOverride, WorklogAllocationPreference } from "../../shared/types";

interface UseAppWeekDataStateOptions {
  demoSyncResult?: SyncResult;
  demoPersonalNotes?: PersonalNote[];
}

export const useAppWeekDataState = ({ demoSyncResult, demoPersonalNotes }: UseAppWeekDataStateOptions = {}) => {
  const [syncResult, setSyncResult] = useState<SyncResult | undefined>(() => demoSyncResult);
  const [personalNotes, setPersonalNotes] = useState<PersonalNote[]>(() => demoPersonalNotes ?? []);
  const [weekOverrides, setWeekOverrides] = useState<WeekOverride[]>([]);
  const [worklogAllocationPreferences, setWorklogAllocationPreferences] = useState<WorklogAllocationPreference[]>([]);

  return {
    syncResult,
    setSyncResult,
    personalNotes,
    setPersonalNotes,
    weekOverrides,
    setWeekOverrides,
    worklogAllocationPreferences,
    setWorklogAllocationPreferences
  };
};

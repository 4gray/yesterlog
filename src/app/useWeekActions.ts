import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { WeekOverride, WeekState } from "../../shared/types";
import { saveWeekOverride as saveWeekOverrideToStorage } from "../storage/db";

export interface WeekActionsStorage {
  saveWeekOverride(override: WeekOverride): Promise<void>;
}

interface UseWeekActionsOptions {
  weekState: WeekState;
  weekOverride: WeekOverride;
  setWeekOverride: Dispatch<SetStateAction<WeekOverride>>;
  isDemo: boolean;
  storage?: WeekActionsStorage;
}

const defaultStorage: WeekActionsStorage = {
  saveWeekOverride: saveWeekOverrideToStorage
};

export const useWeekActions = ({
  weekState,
  weekOverride,
  setWeekOverride,
  isDemo,
  storage = defaultStorage
}: UseWeekActionsOptions) => {
  const handleToggleSkipped = useCallback(
    async (dateKey: string) => {
      const skippedDates = weekOverride.skippedDates.includes(dateKey)
        ? weekOverride.skippedDates.filter((candidate) => candidate !== dateKey)
        : [...weekOverride.skippedDates, dateKey].sort();
      const nextOverride = { weekKey: weekState.weekKey, skippedDates };

      setWeekOverride(nextOverride);
      if (!isDemo) {
        await storage.saveWeekOverride(nextOverride);
      }
    },
    [isDemo, setWeekOverride, storage, weekOverride.skippedDates, weekState.weekKey]
  );

  return {
    handleToggleSkipped
  };
};

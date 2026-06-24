import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { WeekOverride, WeekState } from "../../shared/types";
import { buildWeekCsv } from "../domain/personalNotesCsv";
import { saveWeekOverride as saveWeekOverrideToStorage } from "../storage/db";

export interface WeekActionsStorage {
  saveWeekOverride(override: WeekOverride): Promise<void>;
}

interface UseWeekActionsOptions {
  weekState: WeekState;
  weekOverride: WeekOverride;
  setWeekOverride: Dispatch<SetStateAction<WeekOverride>>;
  isDemo: boolean;
  showSuccess: (message: string) => void;
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
  showSuccess,
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

  const handleExportWeekCsv = useCallback(() => {
    const blob = new Blob([buildWeekCsv(weekState)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `timebro-week-${weekState.weekKey}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showSuccess(`Exported ${weekState.weekRangeLabel} CSV.`);
  }, [showSuccess, weekState]);

  return {
    handleToggleSkipped,
    handleExportWeekCsv
  };
};

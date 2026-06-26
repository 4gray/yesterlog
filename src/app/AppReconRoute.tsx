import type { AppSettings, BitbucketReviewSyncResult, SyncResult } from "../../shared/types";
import { ReconstructView } from "../components/ReconstructView";
import { useReconstruct } from "./useReconstruct";

export interface AppReconRouteProps {
  currentDate: Date;
  settings: AppSettings;
  syncResult?: SyncResult;
  reviewResult?: BitbucketReviewSyncResult;
  dailyTargetHours: number;
  syncState: "synced" | "stale" | "syncing";
  syncLabel: string;
  onSync: () => void;
  onOpenSettings: () => void;
  onLogTime: (date: Date) => void;
}

export const AppReconRoute = ({
  currentDate,
  settings,
  syncResult,
  reviewResult,
  dailyTargetHours,
  syncState,
  syncLabel,
  onSync,
  onOpenSettings,
  onLogTime
}: AppReconRouteProps) => {
  const vm = useReconstruct({ currentDate, settings, syncResult, reviewResult, dailyTargetHours });

  return (
    <ReconstructView
      day={vm.day}
      summary={vm.summary}
      dateLabels={vm.dateLabels}
      aiOn={vm.aiOn}
      aiModel={vm.aiModel}
      isEnhancing={vm.isEnhancing}
      canStepBack={vm.canStepBack}
      canStepForward={vm.canStepForward}
      onStepBack={vm.stepBack}
      onStepForward={vm.stepForward}
      onOpenSettings={onOpenSettings}
      onPrimaryAction={vm.aiOn ? vm.refreshAi : vm.distribute}
      onLogTime={() => onLogTime(vm.selectedDate)}
      syncState={syncState}
      syncLabel={syncLabel}
      onSync={onSync}
      onPlaceSignal={vm.placeSignal}
      onUnplaceSignal={vm.unplaceSignal}
      onPlaceAll={vm.placeAllSignals}
    />
  );
};

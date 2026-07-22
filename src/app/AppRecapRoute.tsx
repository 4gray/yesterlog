import type { AppSettings, RecapInterval, RecurringEvent, SavedRecap } from "../../shared/types";
import { RecapView } from "../components/RecapView";
import { useRecapWorkspace } from "./useRecapWorkspace";
import type { RecapEvidenceInput } from "../domain/recapWorkspace";

export interface AppRecapRouteProps {
  currentDate: Date;
  settings: AppSettings;
  recurringEvents: RecurringEvent[];
  isDemo: boolean;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  onOpenCalendar: (interval: RecapInterval) => void;
  demoEvidence?: Pick<RecapEvidenceInput, "syncResults" | "reviewResults" | "activityResults" | "personalNotes">;
  seedSavedRecaps?: SavedRecap[];
  onSavedRecap?: (saved: SavedRecap) => void;
}

export const AppRecapRoute = ({ currentDate, settings, recurringEvents, isDemo, onSuccess, onError, onOpenCalendar, demoEvidence, seedSavedRecaps, onSavedRecap }: AppRecapRouteProps) => {
  const workspace = useRecapWorkspace({ currentDate, settings, recurringEvents, isDemo, onSuccess, onError, demoEvidence, seedSavedRecaps, onSavedRecap });
  return <RecapView workspace={workspace} onOpenCalendar={() => onOpenCalendar(workspace.interval)} />;
};

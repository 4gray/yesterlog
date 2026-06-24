import { useState } from "react";
import type { AppView } from "../components/Sidebar";

interface UseAppShellStateOptions {
  initialView?: AppView;
  isDemo: boolean;
}

export const useAppShellState = ({ initialView, isDemo }: UseAppShellStateOptions) => {
  const [view, setView] = useState<AppView>(() => initialView ?? "week");
  const [isBooting, setIsBooting] = useState(() => !isDemo);

  return {
    view,
    setView,
    isBooting,
    setIsBooting
  };
};

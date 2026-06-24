import { useMemo } from "react";
import { getDemoConfig } from "../demo/config";
import { createDemoScenario } from "../demo/fixtures";
import { useLiveDate } from "./useLiveDate";

export const useDemoScenario = () => {
  const demoConfig = useMemo(() => getDemoConfig(), []);
  const demoScenario = useMemo(() => (demoConfig ? createDemoScenario(demoConfig) : undefined), [demoConfig]);
  const currentDate = useLiveDate(demoScenario?.today);

  return {
    currentDate,
    demoConfig,
    demoScenario,
    isDemo: Boolean(demoScenario)
  };
};

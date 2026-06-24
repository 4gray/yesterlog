import { useState } from "react";
import type { AppSettings } from "../../shared/types";
import type { DemoScenario } from "../demo/fixtures";
import { DEFAULT_SETTINGS } from "../domain/week";

interface UseAppSettingsStateOptions {
  demoScenario?: Pick<DemoScenario, "settings">;
}

export const useAppSettingsState = ({ demoScenario }: UseAppSettingsStateOptions) => {
  const [settings, setSettings] = useState<AppSettings>(() => demoScenario?.settings ?? DEFAULT_SETTINGS);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings>(() => demoScenario?.settings ?? DEFAULT_SETTINGS);

  return {
    settings,
    setSettings,
    settingsDraft,
    setSettingsDraft
  };
};

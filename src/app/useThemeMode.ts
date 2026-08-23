import { useCallback, useEffect, useState } from "react";
import type { ThemeMode } from "../components/Sidebar";

export const THEME_STORAGE_KEY = "yesterlog-theme";

const LIGHT_MEDIA_QUERY = "(prefers-color-scheme: light)";

const readStoredTheme = () => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
};

const getSystemLightPreference = () =>
  typeof window !== "undefined" && window.matchMedia?.(LIGHT_MEDIA_QUERY).matches === true;

interface UseThemeModeOptions {
  initialTheme?: ThemeMode;
  persist?: boolean;
}

export const useThemeMode = ({ initialTheme, persist = true }: UseThemeModeOptions = {}) => {
  const [selectedTheme, setSelectedTheme] = useState<ThemeMode | null>(() => initialTheme ?? readStoredTheme());
  const [systemLight, setSystemLight] = useState(getSystemLightPreference);

  const effectiveTheme: ThemeMode = selectedTheme ?? (systemLight ? "light" : "dark");

  // The resolved theme class is always applied (system preference included), so
  // the stylesheets need exactly one light block — :root.theme-light — instead
  // of a duplicated @media (prefers-color-scheme) branch. index.html applies
  // the same class pre-paint to avoid a first-frame flash.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("theme-light", "theme-dark");
    root.classList.add(effectiveTheme === "light" ? "theme-light" : "theme-dark");
  }, [effectiveTheme]);

  useEffect(() => {
    const mq = window.matchMedia?.(LIGHT_MEDIA_QUERY);
    if (!mq) {
      return undefined;
    }
    const onChange = () => setSystemLight(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const selectTheme = useCallback(
    (next: ThemeMode) => {
      if (persist) {
        try {
          localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {
          /* ignore persistence failures */
        }
      }
      setSelectedTheme(next);
    },
    [persist]
  );

  return {
    selectedTheme,
    effectiveTheme,
    selectTheme
  };
};

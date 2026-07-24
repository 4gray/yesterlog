import { REPORT_TABS, type AppView, type ReportTab, type ThemeMode } from "../components/Sidebar";
import { fromLocalDateKey } from "../utils/date";

export interface DemoConfig {
  enabled: true;
  view: AppView;
  reportTab: ReportTab;
  theme: ThemeMode;
  seed: string;
  today: Date;
  updateAvailable: boolean;
}

const DEFAULT_SEED = "release";
const DEFAULT_TODAY_KEY = "2026-06-17";
const VIEWS: AppView[] = [
  "today",
  "week",
  "month",
  "recon",
  "review",
  "tickets",
  "notes",
  "reports",
  "recap",
  "settings"
];
const THEMES: ThemeMode[] = ["light", "dark"];
const REPORT_TAB_IDS: ReportTab[] = REPORT_TABS.map((tab) => tab.id);

const isAppView = (value: string | null): value is AppView => Boolean(value && VIEWS.includes(value as AppView));
const isThemeMode = (value: string | null): value is ThemeMode => Boolean(value && THEMES.includes(value as ThemeMode));
const isReportTab = (value: string | null): value is ReportTab =>
  Boolean(value && REPORT_TAB_IDS.includes(value as ReportTab));

const parseDemoToday = (value: string | null) => {
  const dateOnly = value ?? DEFAULT_TODAY_KEY;

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    const date = fromLocalDateKey(dateOnly);
    date.setHours(14, 30, 0, 0);
    return date;
  }

  const parsed = new Date(dateOnly);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  const fallback = fromLocalDateKey(DEFAULT_TODAY_KEY);
  fallback.setHours(14, 30, 0, 0);
  return fallback;
};

export const getDemoConfig = (): DemoConfig | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }

  const params = new URLSearchParams(window.location.search);
  const demoValue = params.get("demo");
  const enabled = params.has("demo") && demoValue !== "0" && demoValue !== "false";

  if (!enabled) {
    return undefined;
  }

  const view = params.get("view");
  const reportTab = params.get("reportTab");
  const theme = params.get("theme");
  const update = params.get("update");

  return {
    enabled: true,
    view: isAppView(view) ? view : "week",
    reportTab: isReportTab(reportTab) ? reportTab : "summary",
    theme: isThemeMode(theme) ? theme : "dark",
    seed: params.get("seed")?.trim() || DEFAULT_SEED,
    today: parseDemoToday(params.get("today")),
    updateAvailable: update === "available"
  };
};

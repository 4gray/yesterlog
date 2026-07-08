import type { ReactNode } from "react";
import { Sidebar, type AppView, type ReportTab, type ThemeMode } from "../components/Sidebar";
import type { AppSyncState } from "./useSyncControls";

export interface AppShellFrameProps {
  children: ReactNode;
  overlays: ReactNode;
  isDemo: boolean;
  isBooting: boolean;
  theme: ThemeMode;
  view: AppView;
  reportTab: ReportTab;
  sidebarCollapsed: boolean;
  onViewChange: (view: AppView) => void;
  onReportTabChange: (tab: ReportTab) => void;
  onToggleSidebarCollapsed: () => void;
  syncLabel: string;
  syncState: AppSyncState;
  showReview: boolean;
  settingsDirty: boolean;
}

export const AppShellFrame = ({
  children,
  overlays,
  isDemo,
  isBooting,
  theme,
  view,
  reportTab,
  sidebarCollapsed,
  onViewChange,
  onReportTabChange,
  onToggleSidebarCollapsed,
  syncLabel,
  syncState,
  showReview,
  settingsDirty
}: AppShellFrameProps) => (
  <div
    className="app-shell"
    data-demo={isDemo ? "true" : undefined}
    data-screenshot-ready={isBooting ? "false" : "true"}
    data-theme={theme}
    data-view={view}
  >
    <div className="shell-body">
      <Sidebar
        view={view}
        reportTab={reportTab}
        collapsed={sidebarCollapsed}
        onViewChange={onViewChange}
        onReportTabChange={onReportTabChange}
        onToggleCollapse={onToggleSidebarCollapsed}
        syncLabel={syncLabel}
        syncState={syncState}
        showReview={showReview}
        settingsDirty={settingsDirty}
      />

      {children}
    </div>

    {overlays}
  </div>
);

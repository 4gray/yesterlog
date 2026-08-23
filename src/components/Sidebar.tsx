import { Fragment, type ReactNode } from "react";
import type { AppSyncState } from "../app/useSyncControls";
import { Tooltip } from "./Tooltip";
import {
  Calendar,
  CalendarDays,
  ChevronsLeft,
  GitPullRequest,
  History,
  LineChart,
  NotebookPen,
  Settings,
  Sparkles,
  Sun,
  Tag
} from "lucide-react";

const SYNC_DOT_STATE: Record<AppSyncState, string> = {
  synced: "",
  syncing: "is-syncing",
  stale: "is-stale",
  offline: "is-offline"
};

export type AppView =
  | "today"
  | "week"
  | "month"
  | "recon"
  | "review"
  | "tickets"
  | "notes"
  | "reports"
  | "recap"
  | "settings";
export type ReportTab = "summary" | "composition" | "focus" | "trends" | "reviews";
export type ThemeMode = "light" | "dark";

const NAV: Array<{ id: Exclude<AppView, "settings">; label: string; Icon: typeof Sun }> = [
  { id: "today", label: "TODAY", Icon: Sun },
  { id: "week", label: "WEEK", Icon: Calendar },
  { id: "month", label: "MONTH", Icon: CalendarDays },
  { id: "recon", label: "RECONSTRUCT", Icon: History },
  { id: "review", label: "REVIEW", Icon: GitPullRequest },
  { id: "tickets", label: "TICKETS", Icon: Tag },
  { id: "notes", label: "NOTES", Icon: NotebookPen },
  { id: "reports", label: "REPORTS", Icon: LineChart },
  { id: "recap", label: "RECAP", Icon: Sparkles }
];

/** Visible primary-nav views in sidebar order — drives the ⌘1…⌘9 shortcuts. */
export const getVisibleNavViews = (showReview: boolean) =>
  NAV.filter((item) => item.id !== "review" || showReview).map(({ id, label }) => ({ id, label }));

/** Reports sub-pages, in sidebar order. Estimates is intentionally deferred. */
export const REPORT_TABS: Array<{ id: ReportTab; label: string }> = [
  { id: "summary", label: "Summary" },
  { id: "composition", label: "Composition" },
  { id: "focus", label: "Focus" },
  { id: "trends", label: "Trends" },
  { id: "reviews", label: "Code review" }
];

interface SidebarProps {
  view: AppView;
  collapsed: boolean;
  onViewChange: (view: AppView) => void;
  onToggleCollapse: () => void;
  syncLabel: string;
  syncState: AppSyncState;
  showReview: boolean;
  settingsDirty: boolean;
}

export const Sidebar = ({
  view,
  collapsed,
  onViewChange,
  onToggleCollapse,
  syncLabel,
  syncState,
  showReview,
  settingsDirty
}: SidebarProps) => {
  const visibleNav = NAV.filter((item) => item.id !== "review" || showReview);

  // Icon-only rail: labels are invisible, so each control gets a side tooltip.
  const withRailTip = (node: ReactNode, text: string) =>
    collapsed ? (
      <Tooltip text={text} placement="right">
        {node}
      </Tooltip>
    ) : (
      node
    );

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`} aria-label="Primary">
      <nav className="sb-nav">
        {visibleNav.map(({ id, label, Icon }) => (
          <Fragment key={id}>
            {withRailTip(
              <button
                type="button"
                className={`nav-item ${view === id ? "active" : ""}`}
                aria-current={view === id ? "page" : undefined}
                // Explicit name: the visual label is display:none in the mobile
                // layout, which would otherwise leave the button nameless.
                aria-label={label}
                onClick={() => onViewChange(id)}
              >
                <Icon size={18} />
                <span className="nav-label">{label}</span>
              </button>,
              label
            )}
          </Fragment>
        ))}
      </nav>

      <div className="sb-spacer" />

      {withRailTip(
        <button
          type="button"
          className={`nav-item ${view === "settings" ? "active" : ""}`}
          aria-label="SETTINGS"
          onClick={() => onViewChange("settings")}
        >
          <Settings size={18} />
          <span className="nav-label">SETTINGS</span>
          {settingsDirty && <span className="nav-dot" aria-label="Unsaved changes" />}
        </button>,
        settingsDirty ? "SETTINGS · UNSAVED CHANGES" : "SETTINGS"
      )}

      {withRailTip(
        <button type="button" className="nav-item sb-collapse" onClick={onToggleCollapse}>
          <ChevronsLeft className="collapse-ic" size={18} />
          <span className="nav-label">COLLAPSE</span>
        </button>,
        "EXPAND SIDEBAR"
      )}

      <div className="sb-synced" title="Sync status">
        <span className={`sb-dot ${SYNC_DOT_STATE[syncState]}`} />
        <span className="nav-label sb-synced-label">{syncLabel}</span>
      </div>
    </aside>
  );
};

import { Fragment } from "react";
import type { AppSyncState } from "../app/useSyncControls";
import {
  Calendar,
  CalendarDays,
  ChevronsLeft,
  GitPullRequest,
  History,
  LineChart,
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

export type AppView = "today" | "week" | "month" | "recon" | "review" | "tickets" | "reports" | "recap" | "settings";
export type ReportTab = "summary" | "composition" | "focus" | "trends" | "reviews";
export type ThemeMode = "light" | "dark";

const NAV: Array<{ id: Exclude<AppView, "settings">; label: string; Icon: typeof Sun }> = [
  { id: "today", label: "TODAY", Icon: Sun },
  { id: "week", label: "WEEK", Icon: Calendar },
  { id: "month", label: "MONTH", Icon: CalendarDays },
  { id: "recon", label: "RECONSTRUCT", Icon: History },
  { id: "review", label: "REVIEW", Icon: GitPullRequest },
  { id: "tickets", label: "TICKETS", Icon: Tag },
  { id: "reports", label: "REPORTS", Icon: LineChart },
  { id: "recap", label: "RECAP", Icon: Sparkles }
];

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
  reportTab: ReportTab;
  collapsed: boolean;
  onViewChange: (view: AppView) => void;
  onReportTabChange: (tab: ReportTab) => void;
  onToggleCollapse: () => void;
  syncLabel: string;
  syncState: AppSyncState;
  showReview: boolean;
  settingsDirty: boolean;
}

export const Sidebar = ({
  view,
  reportTab,
  collapsed,
  onViewChange,
  onReportTabChange,
  onToggleCollapse,
  syncLabel,
  syncState,
  showReview,
  settingsDirty
}: SidebarProps) => {
  const visibleNav = NAV.filter((item) => item.id !== "review" || showReview);
  // The sub-nav sits directly under the (last) REPORTS row while Reports is the
  // active section and the sidebar is expanded — collapsed hides all labels.
  const showReportSub = view === "reports" && !collapsed;

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`} aria-label="Primary">
      <nav className="sb-nav">
        {visibleNav.map(({ id, label, Icon }) => (
          <Fragment key={id}>
            <button
              type="button"
              className={`nav-item ${view === id ? "active" : ""}`}
              aria-current={view === id ? "page" : undefined}
              onClick={() => onViewChange(id)}
              title={label}
            >
              <Icon size={18} />
              <span className="nav-label">{label}</span>
            </button>
            {id === "reports" && showReportSub ? (
              <div className="report-subnav" role="tablist" aria-label="Reports pages">
                {REPORT_TABS.filter((tab) => tab.id !== "reviews" || showReview).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    className={`report-subnav-item ${reportTab === tab.id ? "active" : ""}`}
                    aria-selected={reportTab === tab.id}
                    onClick={() => onReportTabChange(tab.id)}
                  >
                    <span className="report-subnav-dot" />
                    <span className="nav-label">{tab.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </Fragment>
        ))}
      </nav>

      <div className="sb-spacer" />

      <button
        type="button"
        className={`nav-item ${view === "settings" ? "active" : ""}`}
        onClick={() => onViewChange("settings")}
        title={settingsDirty ? "Settings · unsaved changes" : "Settings"}
      >
        <Settings size={18} />
        <span className="nav-label">SETTINGS</span>
        {settingsDirty && <span className="nav-dot" aria-label="Unsaved changes" />}
      </button>

      <button type="button" className="nav-item sb-collapse" onClick={onToggleCollapse} title="Collapse sidebar">
        <ChevronsLeft className="collapse-ic" size={18} />
        <span className="nav-label">COLLAPSE</span>
      </button>

      <div className="sb-synced" title="Sync status">
        <span className={`sb-dot ${SYNC_DOT_STATE[syncState]}`} />
        <span className="nav-label sb-synced-label">{syncLabel}</span>
      </div>
    </aside>
  );
};

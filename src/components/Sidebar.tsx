import {
  Calendar,
  CalendarDays,
  ChevronsLeft,
  GitPullRequest,
  History,
  LineChart,
  Settings,
  Sun,
  Tag
} from "lucide-react";

export type AppView = "today" | "week" | "month" | "recon" | "review" | "tickets" | "reports" | "settings";
export type ThemeMode = "light" | "dark";

const NAV: Array<{ id: Exclude<AppView, "settings">; label: string; Icon: typeof Sun }> = [
  { id: "today", label: "TODAY", Icon: Sun },
  { id: "week", label: "WEEK", Icon: Calendar },
  { id: "month", label: "MONTH", Icon: CalendarDays },
  { id: "recon", label: "RECONSTRUCT", Icon: History },
  { id: "review", label: "REVIEW", Icon: GitPullRequest },
  { id: "tickets", label: "TICKETS", Icon: Tag },
  { id: "reports", label: "REPORTS", Icon: LineChart }
];

interface SidebarProps {
  view: AppView;
  collapsed: boolean;
  onViewChange: (view: AppView) => void;
  onToggleCollapse: () => void;
  syncLabel: string;
  syncState: "synced" | "stale" | "syncing";
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

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`} aria-label="Primary">
      <nav className="sb-nav">
        {visibleNav.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`nav-item ${view === id ? "active" : ""}`}
            aria-current={view === id ? "page" : undefined}
            onClick={() => onViewChange(id)}
            title={label}
          >
            <Icon size={18} />
            <span className="nav-label">{label}</span>
          </button>
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
        <span className={`sb-dot ${syncState === "syncing" ? "is-syncing" : syncState === "stale" ? "is-stale" : ""}`} />
        <span className="nav-label sb-synced-label">{syncLabel}</span>
      </div>
    </aside>
  );
};

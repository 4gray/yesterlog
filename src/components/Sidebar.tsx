import { Calendar, ChevronsLeft, GitPullRequest, LineChart, Settings, Sun, Tag } from "lucide-react";

export type AppView = "today" | "week" | "review" | "tickets" | "reports" | "settings";
export type ThemeMode = "light" | "dark";

const NAV: Array<{ id: Exclude<AppView, "settings">; label: string; Icon: typeof Sun }> = [
  { id: "today", label: "TODAY", Icon: Sun },
  { id: "week", label: "WEEK", Icon: Calendar },
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
}

export const Sidebar = ({
  view,
  collapsed,
  onViewChange,
  onToggleCollapse,
  syncLabel,
  syncState,
  showReview
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
        title="Settings"
      >
        <Settings size={18} />
        <span className="nav-label">SETTINGS</span>
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

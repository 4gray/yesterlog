import type { ReactNode } from "react";

export interface EmptyStateProps {
  /** Optional lucide icon element, rendered dimmed above the title. */
  icon?: ReactNode;
  title: string;
  /** One short sentence: what this means or how to populate it. */
  hint?: string;
  /** Optional action, typically a <Button>. */
  action?: ReactNode;
  className?: string;
}

/**
 * The one empty state: icon + title + hint + optional action, centered.
 * Replaces the two dozen ad-hoc *-empty classes as views migrate.
 */
export const EmptyState = ({ icon, title, hint, action, className }: EmptyStateProps) => (
  <div className={className ? `empty-state ${className}` : "empty-state"}>
    {icon ? <div className="empty-state-icon">{icon}</div> : null}
    <p className="empty-state-title">{title}</p>
    {hint ? <p className="empty-state-hint">{hint}</p> : null}
    {action ? <div className="empty-state-action">{action}</div> : null}
  </div>
);

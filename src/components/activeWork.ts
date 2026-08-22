import type { JiraTicket } from "../../shared/types";

/** Accent palette shared with the week grid — stable per ticket key.
 *  Values are the theme-aware --ticket-N tokens from styles/base.css. */
export interface DockColor {
  seg: string;
  text: string;
}

export const DOCK_PALETTE: readonly DockColor[] = [
  { seg: "var(--ticket-1)", text: "var(--ticket-1-text)" },
  { seg: "var(--ticket-2)", text: "var(--ticket-2-text)" },
  { seg: "var(--ticket-3)", text: "var(--ticket-3-text)" },
  { seg: "var(--ticket-4)", text: "var(--ticket-4-text)" },
  { seg: "var(--ticket-5)", text: "var(--ticket-5-text)" },
  { seg: "var(--ticket-6)", text: "var(--ticket-6-text)" }
];

/** Assigns a stable color to each ticket key in list order. */
export const buildDockColorMap = (tickets: JiraTicket[]) => {
  const map = new Map<string, DockColor>();
  let index = 0;
  for (const ticket of tickets) {
    if (!map.has(ticket.key)) {
      map.set(ticket.key, DOCK_PALETTE[index % DOCK_PALETTE.length]);
      index += 1;
    }
  }
  return map;
};

export type DockStatusTone = "progress" | "review" | "done" | "new";

const REVIEW_PATTERN = /review|qa|verif|test/i;

/** Derives a compact status pill (tone + label) from real Jira status fields. */
export const getDockStatus = (ticket: JiraTicket): { tone: DockStatusTone; label: string } => {
  const label = ticket.statusName?.trim() || "Unknown";

  if (ticket.statusCategory === "done") {
    return { tone: "done", label };
  }
  if (REVIEW_PATTERN.test(ticket.statusName ?? "")) {
    return { tone: "review", label };
  }
  if (ticket.statusCategory === "new") {
    return { tone: "new", label };
  }
  return { tone: "progress", label };
};

const RELATIVE_DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" }
];

/**
 * Short, human relative time like "12m ago" / "3d ago" used for the card's
 * created-time meta. Returns undefined when the timestamp is missing/invalid.
 */
export const formatRelativeTime = (isoTimestamp?: string, now: Date = new Date()): string | undefined => {
  if (!isoTimestamp) {
    return undefined;
  }
  const time = Date.parse(isoTimestamp);
  if (!Number.isFinite(time)) {
    return undefined;
  }

  let duration = (time - now.getTime()) / 1000;
  if (Math.abs(duration) < 45) {
    return "just now";
  }

  for (const division of RELATIVE_DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      const value = Math.round(duration);
      const unit = division.unit[0]; // s, m, h, d, w, m(onth), y
      const label = division.unit === "month" ? "mo" : unit;
      const magnitude = Math.abs(value);
      return value < 0 ? `${magnitude}${label} ago` : `in ${magnitude}${label}`;
    }
    duration /= division.amount;
  }

  return undefined;
};

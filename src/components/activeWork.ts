import type { JiraTicket } from "../../shared/types";

/** Accent palette shared with the week grid — stable per ticket key. */
export const DOCK_PALETTE = [
  { seg: "#5b8cff", text: "#8fb0ff" },
  { seg: "#3bb7a8", text: "#6bd0c2" },
  { seg: "#9d7bf0", text: "#bda6f5" },
  { seg: "#e0a44a", text: "#edc488" },
  { seg: "#3ecf8e", text: "#7fe3b6" },
  { seg: "#e87f9b", text: "#f3a8bd" }
] as const;

export type DockColor = (typeof DOCK_PALETTE)[number];

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

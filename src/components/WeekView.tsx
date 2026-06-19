import { Loader2, MessageSquare, Plus, RotateCw } from "lucide-react";
import type { DayTrackingSummary, JiraWorklog, SyncResult, WeekState } from "../../shared/types";
import {
  formatHours,
  formatWeekRangeCompact,
  fromLocalDateKey,
  getIsoWeekNumber,
  toLocalDateKey
} from "../utils/date";
import { TicketKeyLink } from "./TicketKeyLink";

interface WeekViewProps {
  weekState: WeekState;
  syncResult?: SyncResult;
  isSyncing: boolean;
  onSync: () => void;
  onPreviousWeek: () => void;
  onCurrentWeek: () => void;
  onNextWeek: () => void;
  onAddTime: (date?: Date) => void;
  onToggleSkipped: (dateKey: string) => void;
}

const PALETTE = [
  { seg: "#5b8cff", text: "#8fb0ff" },
  { seg: "#3bb7a8", text: "#6bd0c2" },
  { seg: "#9d7bf0", text: "#bda6f5" },
  { seg: "#e0a44a", text: "#edc488" },
  { seg: "#3ecf8e", text: "#7fe3b6" },
  { seg: "#e87f9b", text: "#f3a8bd" }
];

const RING_RADIUS = 33;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const pad = (value: number) => String(value).padStart(2, "0");
const hm = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

// Stable color per ticket key, assigned in order of first appearance this week.
const buildColorMap = (days: DayTrackingSummary[]) => {
  const map = new Map<string, (typeof PALETTE)[number]>();
  let index = 0;
  for (const day of days) {
    for (const issue of day.issues) {
      if (!map.has(issue.key)) {
        map.set(issue.key, PALETTE[index % PALETTE.length]);
        index += 1;
      }
    }
  }
  return map;
};

const DayColumn = ({
  day,
  todayKey,
  colorOf,
  worklogsByKey,
  onAddTime,
  onToggleSkipped
}: {
  day: DayTrackingSummary;
  todayKey: string;
  colorOf: (key: string) => (typeof PALETTE)[number];
  worklogsByKey: Map<string, JiraWorklog[]>;
  onAddTime: (date?: Date) => void;
  onToggleSkipped: (dateKey: string) => void;
}) => {
  const date = fromLocalDateKey(day.dateKey);
  const isFuture = day.dateKey > todayKey;
  const totalLogged = day.issues.reduce((sum, issue) => sum + issue.loggedSeconds / 3600, 0);
  const remaining = Math.max(day.targetHours - totalLogged, 0);
  const emptyColor = isFuture ? "var(--line-soft)" : "var(--line)";

  const trackedClass =
    day.targetHours > 0 && day.trackedHours >= day.targetHours
      ? "is-complete"
      : day.trackedHours > 0
        ? "is-partial"
        : isFuture
          ? "is-future"
          : "is-empty";

  return (
    <div className={`day-col ${day.isToday ? "is-today" : ""} ${isFuture ? "is-future" : ""} ${day.isSkipped ? "is-skipped" : ""}`}>
      <div className="day-col-head">
        <div>
          <div className="day-name">{day.isToday ? "TODAY" : day.weekdayName.slice(0, 3).toUpperCase()}</div>
          <div className="day-date">{date.getDate()}</div>
        </div>
        {!day.isSkipped && (
          <button
            type="button"
            className={`day-add ${day.isToday ? "is-today" : ""}`}
            onClick={() => onAddTime(date)}
            title="Log time"
            aria-label={`Log time for ${day.weekdayName}`}
          >
            <Plus size={14} strokeWidth={day.isToday ? 2.6 : 2.3} />
          </button>
        )}
      </div>

      {day.isSkipped ? (
        <>
          <div className="day-vacation">OFF · VACATION</div>
          <div className="day-spacer" />
        </>
      ) : (
        <>
          <div className="day-hours">
            <span className={`tracked ${trackedClass}`}>{formatHours(day.trackedHours)}</span>
            <span className="target">/ {formatHours(day.targetHours)}</span>
          </div>

          <div className="seg-bar">
            {day.issues.map((issue) => (
              <span
                key={issue.key}
                className="seg"
                style={{ flexGrow: Math.max(issue.loggedSeconds / 3600, 0.001), background: colorOf(issue.key).seg }}
              />
            ))}
            {remaining > 0.01 && <span className="seg" style={{ flexGrow: remaining, background: emptyColor }} />}
            {totalLogged < 0.01 && <span className="seg" style={{ flexGrow: day.targetHours || 8, background: emptyColor }} />}
          </div>

          {day.issues.length > 0 ? (
            <div className="day-logs">
              {day.issues.map((issue) => {
                const color = colorOf(issue.key);
                const logs = worklogsByKey.get(issue.key) ?? [];
                const comments = issue.comments?.length
                  ? issue.comments
                  : Array.from(new Set(logs.map((log) => log.comment).filter((comment): comment is string => Boolean(comment))));
                const range = logs.length
                  ? `${hm(new Date(Math.min(...logs.map((log) => new Date(log.started).getTime()))))} — ${hm(
                      new Date(
                        Math.max(...logs.map((log) => new Date(log.started).getTime() + log.timeSpentSeconds * 1000))
                      )
                    )}`
                  : undefined;

                return (
                  <div className={`wl day-log ${comments.length ? "has-pop" : ""}`} key={issue.key}>
                    <div className="day-log-head">
                      <span className="seg-dot" style={{ background: color.seg }} />
                      <TicketKeyLink
                        issueKey={issue.key}
                        url={issue.url}
                        issueType={issue.issueType}
                        keyClassName="day-log-key"
                        style={{ color: color.text }}
                      />
                      <span className="day-log-spacer" />
                      {comments.length > 0 && <MessageSquare size={12} stroke="#6b7280" strokeWidth={1.8} />}
                      <span className="day-log-dur">{formatHours(issue.loggedSeconds / 3600)}</span>
                    </div>
                    <div className="day-log-summary">{issue.summary}</div>

                    {comments.length > 0 && (
                      <div className="wl-pop">
                        <div className="wl-pop-head">
                          <span className="seg-dot" style={{ background: color.seg }} />
                          <TicketKeyLink
                            issueKey={issue.key}
                            url={issue.url}
                            issueType={issue.issueType}
                            keyClassName="day-log-key"
                            style={{ color: color.text }}
                          />
                          <span className="day-log-spacer" />
                          <span className="wl-pop-dur">{formatHours(issue.loggedSeconds / 3600)}</span>
                        </div>
                        <div className="wl-pop-summary">{issue.summary}</div>
                        {range && <div className="wl-pop-range">{range}</div>}
                        {comments.map((comment, index) => (
                          <div className="wl-pop-comment" key={`${issue.key}-comment-${index}`}>
                            <MessageSquare size={12} stroke="#5d636f" strokeWidth={1.7} />
                            <span>{comment}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="day-spacer" />
            </div>
          ) : day.isToday ? (
            <>
              <div className="day-spacer" />
              <button type="button" className="day-cta" onClick={() => onAddTime(date)}>
                <span className="day-cta-title">
                  Log time
                  <br />
                  for today
                </span>
                <span className="kbd">⌘K</span>
              </button>
            </>
          ) : isFuture ? (
            <>
              <div className="day-upcoming">UPCOMING</div>
              <div className="day-spacer" />
            </>
          ) : (
            <div className="day-spacer" />
          )}
        </>
      )}

      {day.isConfiguredWorkingDay && (
        <button
          type="button"
          className="day-skip"
          onClick={() => onToggleSkipped(day.dateKey)}
          aria-pressed={day.isSkipped}
        >
          {day.isSkipped ? "↩ Restore day" : "+ Mark vacation"}
        </button>
      )}
    </div>
  );
};

export const WeekView = ({
  weekState,
  syncResult,
  isSyncing,
  onSync,
  onPreviousWeek,
  onCurrentWeek,
  onNextWeek,
  onAddTime,
  onToggleSkipped
}: WeekViewProps) => {
  const weekStart = fromLocalDateKey(weekState.weekKey);
  const weekNumber = getIsoWeekNumber(weekStart);
  const rangeLabel = formatWeekRangeCompact(weekStart);
  const todayKey = toLocalDateKey(new Date());
  const pct =
    weekState.weeklyTargetHours > 0
      ? Math.min((weekState.trackedWeekHours / weekState.weeklyTargetHours) * 100, 100)
      : 0;
  const dashOffset = RING_CIRCUMFERENCE * (1 - pct / 100);
  const colorMap = buildColorMap(weekState.days);
  const colorOf = (key: string) => colorMap.get(key) ?? PALETTE[0];

  return (
    <div className="view">
      <div className="week-header">
        <div className="week-headline">
          <div className="ring" aria-label={`${Math.round(pct)} percent of weekly target`}>
            <svg width="78" height="78" viewBox="0 0 78 78" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="39" cy="39" r={RING_RADIUS} fill="none" stroke="var(--line)" strokeWidth="7" />
              <circle
                cx="39"
                cy="39"
                r={RING_RADIUS}
                fill="none"
                stroke="var(--blue)"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
              />
            </svg>
            <div className="ring-label">
              {Math.round(pct)}
              <span className="ring-pct">%</span>
            </div>
          </div>
          <div>
            <div className="week-meta-label">
              WEEK {weekNumber} — {rangeLabel}
            </div>
            <div className="week-figure">
              {formatHours(weekState.remainingWeekHours)}
              <span className="unit"> left</span>
              <span className="week-figure-sub">
                {" "}
                · {formatHours(weekState.trackedWeekHours)} / {formatHours(weekState.weeklyTargetHours)}
              </span>
            </div>
          </div>
        </div>

        <div className="week-actions">
          <button type="button" className="sync-button" onClick={onSync} disabled={isSyncing} title="Sync with Jira">
            {isSyncing ? <Loader2 className="spin" size={14} /> : <RotateCw size={14} strokeWidth={2} />}
            SYNC
          </button>
          <button type="button" className="add-time-button" onClick={() => onAddTime()}>
            <Plus size={14} strokeWidth={2.6} />
            ADD TIME
          </button>
          <div className="week-divider" />
          <button type="button" className="week-nav-arrow" onClick={onPreviousWeek} aria-label="Previous week">
            ‹
          </button>
          <button type="button" className="pill" onClick={onCurrentWeek}>
            THIS WEEK
          </button>
          <button type="button" className="week-nav-arrow" onClick={onNextWeek} aria-label="Next week">
            ›
          </button>
        </div>
      </div>

      <div className="week-grid">
        {weekState.days.map((day) => {
          const worklogsByKey = new Map<string, JiraWorklog[]>();
          for (const log of syncResult?.daySummaries[day.dateKey]?.worklogs ?? []) {
            const list = worklogsByKey.get(log.issueKey) ?? [];
            list.push(log);
            worklogsByKey.set(log.issueKey, list);
          }
          return (
            <DayColumn
              key={day.dateKey}
              day={day}
              todayKey={todayKey}
              colorOf={colorOf}
              worklogsByKey={worklogsByKey}
              onAddTime={onAddTime}
              onToggleSkipped={onToggleSkipped}
            />
          );
        })}
      </div>
    </div>
  );
};

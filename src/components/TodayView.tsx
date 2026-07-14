import { useMemo } from "react";
import type {
  AppSettings,
  DayTrackingSummary,
  JiraTicket,
  JiraWorklog,
  PendingRecurringOccurrence,
  PersonalNote,
  RecurringEntry
} from "../../shared/types";
import type { RecurringConfirmPayload } from "../app/useRecurringActions";
import { formatClock, formatDuration, formatHours } from "../utils/date";
import { activitySegments } from "../domain/activity";
import { getWorklogDisplaySeconds } from "../domain/worklogAllocation";
import { buildGhostItems } from "../domain/dayCalendar";
import type { ReconstructSignal } from "../domain/reconstruct";
import { DayRing } from "./DayRing";
import { RecapCard } from "./RecapCard";
import { TimeSplit } from "./TimeSplit";
import { TicketKeyLink } from "./TicketKeyLink";
import { DayCalendar } from "./DayCalendar";
import type { AddTimePrefill } from "./AddTimeModal";
import { ActiveWorkDock } from "./ActiveWorkDock";
import { useActiveWorkDock } from "./useActiveWorkDock";

interface TodayViewProps {
  date: Date;
  /** Loaded tickets — used to hydrate a ghost's ticket on promote. */
  ticketOptions: JiraTicket[];
  todayWorklogs: JiraWorklog[];
  /** Detected-but-unlogged activity for the calendar ghost layer. */
  detectedSignals: ReconstructSignal[];
  personalNotes: PersonalNote[];
  /** Today's confirmed recurring rituals — rendered as committed calendar blocks. */
  recurringEntries: RecurringEntry[];
  /** Today's scheduled-but-unconfirmed rituals — rendered as confirm/skip suggestion blocks. */
  pendingRecurring: PendingRecurringOccurrence[];
  todayTrackedHours: number;
  dailyTargetHours: number;
  touchedNotLogged: JiraTicket[];
  dockTickets?: JiraTicket[];
  activeTicketCount?: number;
  /** Previous working day's summary, for the rail recap card. */
  recapDaySummary?: DayTrackingSummary;
  /** App settings — the recap card reads the optional AI-polish config. */
  settings: AppSettings;
  reminderTime: string;
  remindersEnabled: boolean;
  /** Open the Add-Time popup, prefilled (empty-slot time, a rail ticket, or a ghost). */
  onCreateAt: (prefill: AddTimePrefill) => void;
  /** Commit a calendar drag move/resize to an existing worklog (optimistic). */
  onMoveWorklog: (worklog: JiraWorklog, patch: { startedISO: string; timeSpentSeconds: number }) => Promise<boolean>;
  /** Confirm a pending recurring ritual from the calendar (defaults, like the Week card). */
  onConfirmRecurring: (payload: RecurringConfirmPayload) => Promise<boolean> | void;
  /** Skip a pending recurring ritual for the day. */
  onSkipRecurring: (eventId: string, dateKey: string) => Promise<boolean> | void;
  onEditWorklog: (worklog: JiraWorklog) => void;
  onEditPersonalNote: (note: PersonalNote) => void;
}

const pad = (value: number) => String(value).padStart(2, "0");

export const TodayView = ({
  date,
  ticketOptions,
  todayWorklogs,
  detectedSignals,
  personalNotes,
  recurringEntries,
  pendingRecurring,
  todayTrackedHours,
  dailyTargetHours,
  touchedNotLogged,
  dockTickets = [],
  activeTicketCount,
  recapDaySummary,
  settings,
  reminderTime,
  remindersEnabled,
  onCreateAt,
  onMoveWorklog,
  onConfirmRecurring,
  onSkipRecurring,
  onEditWorklog,
  onEditPersonalNote
}: TodayViewProps) => {
  // Memoized so the ghosts array keeps its identity across unrelated re-renders — a fresh
  // array would defeat DayCalendar's `layoutColumns` memo keyed on it.
  const ghosts = useMemo(
    () => buildGhostItems(detectedSignals, new Set(todayWorklogs.map((worklog) => worklog.issueKey))),
    [detectedSignals, todayWorklogs]
  );

  const promoteGhost = (signal: ReconstructSignal, startedISO: string) => {
    // Prefer the fully-hydrated ticket if it's loaded; otherwise synthesize a minimal one
    // from the signal so the popup preselects the DETECTED ticket, not a stale default.
    const ticket =
      signal.key === ""
        ? undefined
        : ticketOptions.find((option) => option.key === signal.key) ?? {
            id: signal.key,
            key: signal.key,
            summary: signal.title,
            projectKey: signal.key.split("-")[0] ?? "",
            projectName: "",
            statusName: "",
            statusCategory: "unknown" as const,
            loggedSecondsTotal: 0,
            url: ""
          };
    onCreateAt({
      ticket,
      startedISO,
      timeSpentSeconds: signal.durationMinutes * 60,
      comment: signal.naiveDescription
    });
  };
  // Stable across renders (keyed on the incoming date) so DayCalendar's date-derived
  // callbacks don't churn.
  const todayDate = useMemo(() => new Date(date), [date]);
  const remainingHours = Math.max(dailyTargetHours - todayTrackedHours, 0);
  const meterPct = dailyTargetHours > 0 ? Math.min((todayTrackedHours / dailyTargetHours) * 100, 100) : 0;
  const trackedH = Math.floor(todayTrackedHours);
  const trackedM = Math.round((todayTrackedHours - trackedH) * 60);
  const { open: dockOpen, shownCount: dockShown, toggleOpen: toggleDock, loadMore: loadMoreDock } = useActiveWorkDock(
    dockTickets.length
  );

  // The day's three rings. Tickets come from worklogs; notes split by category
  // (meeting-tagged ones join the recurring rituals in Meetings, the rest are
  // firefighting); recurring meetings are the tracked remainder on top.
  const ticketSeconds = todayWorklogs.reduce((sum, worklog) => sum + getWorklogDisplaySeconds(worklog), 0);
  const meetingNoteSeconds = personalNotes.reduce(
    (sum, note) => sum + (note.category === "meeting" ? note.timeSpentSeconds : 0),
    0
  );
  const fireSeconds = personalNotes.reduce(
    (sum, note) => sum + (note.category === "meeting" ? 0 : note.timeSpentSeconds),
    0
  );
  const recurringSeconds = Math.max(0, todayTrackedHours * 3600 - ticketSeconds - meetingNoteSeconds - fireSeconds);
  const meetingSeconds = recurringSeconds + meetingNoteSeconds;
  const ringSegments = activitySegments({ ticket: ticketSeconds, meeting: meetingSeconds, fire: fireSeconds });

  // Billable (Jira worklogs) vs local (meetings + firefighting) — what's
  // official versus what still needs to land in Jira.
  const billableHours = ticketSeconds / 3600;
  const localHours = Math.max(todayTrackedHours - billableHours, 0);

  return (
    <div className="view today-view">
      <div className="today-header">
        <div className="week-headline">
          <DayRing
            className="day-ring--hero"
            segments={ringSegments}
            targetHours={dailyTargetHours}
            size={88}
            stroke={11}
            ariaLabel={`${Math.round(meterPct)} percent of daily target`}
          >
            <span className="day-ring-num">{todayDate.getDate()}</span>
          </DayRing>
          <div>
            <div className="eyebrow">
              {new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" })
                .format(todayDate)
                .toUpperCase()}
            </div>
            <div className="today-figure-row">
              <div className="big-figure">
                {trackedH}
                <span className="unit">h</span>
                {pad(trackedM)}
                <span className="unit">m</span>
              </div>
              <div className="today-meta">
                <div className="today-meta-label">LOGGED OF {formatHours(dailyTargetHours)}</div>
                <div className="meter-text">{formatClock(remainingHours * 3600)} left</div>
              </div>
            </div>
            {todayTrackedHours > 0.01 && (
              <TimeSplit
                billableHours={billableHours}
                localHours={localHours}
                size="lg"
                className="today-split"
              />
            )}
            <div className="ring-legend today-ring-legend">
              {ringSegments.map((segment) => (
                <span key={segment.key} className={`ring-legend-item${segment.hours <= 0 ? " is-zero" : ""}`}>
                  <span className="ring-legend-dot" style={{ background: segment.color }} />
                  {segment.label}
                  <span className="ring-legend-hours">{formatDuration(segment.hours)}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="today-body">
        <DayCalendar
          date={todayDate}
          now={todayDate}
          worklogs={todayWorklogs}
          notes={personalNotes}
          recurring={recurringEntries}
          pending={pendingRecurring}
          ghosts={ghosts}
          onCreateAt={onCreateAt}
          onMoveWorklog={onMoveWorklog}
          onPromoteGhost={promoteGhost}
          onConfirmRecurring={onConfirmRecurring}
          onSkipRecurring={onSkipRecurring}
          onEditWorklog={onEditWorklog}
          onEditPersonalNote={onEditPersonalNote}
        />

        <aside className="today-rail">
          <RecapCard daySummary={recapDaySummary} settings={settings} />
          <div className="rail-label">TOUCHED TODAY · NOT LOGGED</div>
          <div>
            {touchedNotLogged.length === 0 ? (
              <div className="empty-note" style={{ padding: "14px 0" }}>
                Everything assigned is logged.
              </div>
            ) : (
              touchedNotLogged.slice(0, 4).map((ticket) => (
                <div className="touched" key={ticket.key}>
                  <div className="touched-main">
                    <TicketKeyLink
                      issueKey={ticket.key}
                      url={ticket.url}
                      issueType={ticket.issueType}
                      epic={ticket.epic}
                      keyClassName={`touched-key ${ticket.projectKey === "FTDM" ? "" : "is-amber"}`}
                    />
                    <div className="touched-meta">{ticket.statusName}</div>
                  </div>
                  <button
                    type="button"
                    className="touched-add"
                    aria-label={`Log ${ticket.key}`}
                    onClick={() => onCreateAt({ ticket })}
                  >
                    +
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="reminder-card">
            <div className="reminder-card-label">{remindersEnabled ? `REMINDER · ${reminderTime}` : "REMINDER · OFF"}</div>
            <div className="reminder-card-copy">
              {remindersEnabled
                ? "Fires only if today is still under target on a working day."
                : "Enable a daily nudge from settings."}
            </div>
          </div>
        </aside>
      </div>

      <ActiveWorkDock
        tickets={dockTickets}
        activeCount={activeTicketCount ?? dockTickets.length}
        open={dockOpen}
        shownCount={dockShown}
        draggingKey={null}
        now={todayDate}
        interaction="select"
        onToggleOpen={toggleDock}
        onLoadMore={loadMoreDock}
        onActivateCard={(ticket) => onCreateAt({ ticket })}
      />
    </div>
  );
};

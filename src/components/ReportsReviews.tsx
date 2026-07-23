import { useMemo } from "react";
import type {
  BitbucketReviewSyncResult,
  JiraIssueTypeInfo,
  WeekState
} from "../../shared/types";
import {
  buildReportsReview,
  type ReviewEffortBreakdown,
  type ReviewReportPullRequest
} from "../domain/reportsReview";
import { formatDuration, fromLocalDateKey } from "../utils/date";
import { TicketKeyLink } from "./TicketKeyLink";
import {
  LegendChip,
  ReportEmpty,
  ReportPageHeader,
  ReportPanel
} from "./reportsShared";
import { WeekNavigator } from "./WeekNavigator";

interface ReportsReviewsProps {
  weekState: WeekState;
  result?: BitbucketReviewSyncResult;
  issueUrlsByKey: Record<string, string>;
  issueTypesByKey: Record<string, JiraIssueTypeInfo>;
  onPreviousWeek: () => void;
  onCurrentWeek: () => void;
  onNextWeek: () => void;
}

const formatSeconds = (seconds: number) => formatDuration(seconds / 3600);

export const formatReviewEffortOrigin = (effort: ReviewEffortBreakdown) => {
  const parts: string[] = [];
  if (effort.loggedSeconds > 0) {
    parts.push(`${formatSeconds(effort.loggedSeconds)} logged`);
  }
  if (effort.estimatedSeconds > 0) {
    parts.push(`${formatSeconds(effort.estimatedSeconds)} estimated`);
  }
  return parts.join(" + ") || "no review effort";
};

const ReviewState = ({ value }: { value: ReviewReportPullRequest["reviewStateLabel"] }) => (
  <span className={`review-report-state is-${value.toLowerCase()}`}>{value}</span>
);

const ReviewTicket = ({
  pullRequest,
  issueUrlsByKey,
  issueTypesByKey
}: {
  pullRequest: ReviewReportPullRequest;
  issueUrlsByKey: Record<string, string>;
  issueTypesByKey: Record<string, JiraIssueTypeInfo>;
}) =>
  pullRequest.jiraIssueKey ? (
    <TicketKeyLink
      issueKey={pullRequest.jiraIssueKey}
      url={issueUrlsByKey[pullRequest.jiraIssueKey]}
      issueType={issueTypesByKey[pullRequest.jiraIssueKey]}
      keyClassName="review-report-ticket-key"
    />
  ) : (
    <span className="review-report-no-ticket">NO JIRA KEY</span>
  );

const PullRequestMeta = ({ pullRequest }: { pullRequest: ReviewReportPullRequest }) => (
  <div className="review-report-pr-meta">
    <span>{pullRequest.repositoryName}</span>
    {pullRequest.pullRequestAuthorDisplayName ? (
      <span>author: {pullRequest.pullRequestAuthorDisplayName}</span>
    ) : null}
    {pullRequest.sessionCount > 1 ? <span>{pullRequest.sessionCount} sessions</span> : null}
  </div>
);

export const ReportsReviews = ({
  weekState,
  result,
  issueUrlsByKey,
  issueTypesByKey,
  onPreviousWeek,
  onCurrentWeek,
  onNextWeek
}: ReportsReviewsProps) => {
  const report = useMemo(() => buildReportsReview(result), [result]);
  const navigator = (
    <WeekNavigator
      onPreviousWeek={onPreviousWeek}
      onCurrentWeek={onCurrentWeek}
      onNextWeek={onNextWeek}
    />
  );
  const header = (
    <ReportPageHeader
      eyebrow="REPORTS / CODE REVIEW"
      figure={result ? formatSeconds(report.peerReview.totalSeconds) : "—"}
      unit={result ? "review effort" : undefined}
      accent="var(--purple)"
      caption={
        result
          ? `${formatReviewEffortOrigin(report.peerReview)} from Bitbucket`
          : "sync Bitbucket reviews for this week"
      }
      controls={navigator}
    />
  );

  if (!result) {
    return (
      <>
        {header}
        <div className="report-body">
          <ReportEmpty>
            No Bitbucket review snapshot for this week. Open Review and sync to populate this
            read-only report.
          </ReportEmpty>
        </div>
      </>
    );
  }

  const reportDays = new Map(report.days.map((day) => [day.dateKey, day]));
  const dateKeys = Array.from(
    new Set([...weekState.days.map((day) => day.dateKey), ...report.days.map((day) => day.dateKey)])
  ).sort();
  const maxDaySeconds = Math.max(
    1,
    ...dateKeys.map((dateKey) => reportDays.get(dateKey)?.totalSeconds ?? 0)
  );

  return (
    <>
      {header}

      <div className="kpi-row review-report-kpis">
        <div className="kpi">
          <div className="kpi-label">PRS REVIEWED</div>
          <div className="kpi-value">{report.reviewedPullRequestCount}</div>
          <div className="kpi-note">reviewed by you</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">COMMENTS BY YOU</div>
          <div className="kpi-value">{report.commentsByYou}</div>
          <div className="kpi-note">on reviewed PRs</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">AVG PER PR</div>
          <div className="kpi-value">{formatSeconds(report.averageSecondsPerReviewedPr)}</div>
          <div className="kpi-note">logged and estimated effort</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">OWN PR FOLLOW-UP</div>
          <div className="kpi-value">{formatSeconds(report.ownPrFollowUp.totalSeconds)}</div>
          <div className="kpi-note">
            {report.ownPullRequestCount} {report.ownPullRequestCount === 1 ? "PR" : "PRs"}
          </div>
        </div>
      </div>

      <div className="report-body review-report-body">
        {!report.hasData ? (
          <ReportEmpty>No Bitbucket review activity was found for this week.</ReportEmpty>
        ) : (
          <>
            <div className="report-columns review-report-overview">
              <ReportPanel
                className="is-wide"
                title="REVIEW EFFORT BY DAY"
                legend={
                  <>
                    <LegendChip color="var(--purple)">peer review</LegendChip>
                    <LegendChip hatched>own PR follow-up</LegendChip>
                  </>
                }
              >
                <div className="review-report-days">
                  {dateKeys.map((dateKey) => {
                    const date = fromLocalDateKey(dateKey);
                    const day = reportDays.get(dateKey);
                    const peerSeconds = day?.peerReview.totalSeconds ?? 0;
                    const ownSeconds = day?.ownPrFollowUp.totalSeconds ?? 0;
                    const totalSeconds = peerSeconds + ownSeconds;
                    const peerWidth = (peerSeconds / maxDaySeconds) * 100;
                    const ownWidth = (ownSeconds / maxDaySeconds) * 100;

                    return (
                      <div className="review-report-day" key={dateKey}>
                        <span className="review-report-day-label">
                          {new Intl.DateTimeFormat(undefined, { weekday: "short" })
                            .format(date)
                            .toUpperCase()}
                        </span>
                        <div
                          className={`review-report-day-bar${totalSeconds <= 0 ? " is-empty" : ""}`}
                          aria-label={`${dateKey}: ${formatSeconds(peerSeconds)} peer review, ${formatSeconds(ownSeconds)} own PR follow-up`}
                        >
                          {peerSeconds > 0 ? (
                            <span
                              className="review-report-day-peer"
                              style={{ width: `${peerWidth}%` }}
                            />
                          ) : null}
                          {ownSeconds > 0 ? (
                            <span
                              className="review-report-day-own"
                              style={{ width: `${ownWidth}%` }}
                            />
                          ) : null}
                        </div>
                        <span className="review-report-day-value">
                          {totalSeconds > 0 ? formatSeconds(totalSeconds) : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </ReportPanel>

              <ReportPanel title="MOST INVOLVED" aux="BY EFFORT">
                {report.mostInvolved ? (
                  <div className="review-report-most">
                    <div className="review-report-most-top">
                      <a
                        href={report.mostInvolved.pullRequestUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="review-report-pr-link"
                      >
                        PR #{report.mostInvolved.pullRequestId}
                      </a>
                      <ReviewState value={report.mostInvolved.reviewStateLabel} />
                    </div>
                    <div className="review-report-most-title">
                      {report.mostInvolved.pullRequestTitle}
                    </div>
                    <PullRequestMeta pullRequest={report.mostInvolved} />
                    <div className="review-report-most-stats">
                      <div>
                        <strong>{formatSeconds(report.mostInvolved.totalSeconds)}</strong>
                        <span>{formatReviewEffortOrigin(report.mostInvolved)}</span>
                      </div>
                      <div>
                        <strong>{report.mostInvolved.commentCount}</strong>
                        <span>comments by you</span>
                      </div>
                    </div>
                    <div className="review-report-most-foot">
                      <ReviewTicket
                        pullRequest={report.mostInvolved}
                        issueUrlsByKey={issueUrlsByKey}
                        issueTypesByKey={issueTypesByKey}
                      />
                      <span
                        className={`review-report-confidence is-${report.mostInvolved.confidence}`}
                      >
                        {report.mostInvolved.confidence.toUpperCase()} CONFIDENCE
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="empty-note">
                    This week only contains activity on your own pull requests.
                  </div>
                )}
              </ReportPanel>
            </div>

            <ReportPanel
              className="review-report-pr-panel"
              title="PULL REQUEST ACTIVITY"
              aux={`${report.reviewedPullRequestCount} reviewed / ${report.ownPullRequestCount} own PR`}
            >
              <div className="review-report-pr-list">
                {report.pullRequests.map((pullRequest) => (
                  <div className="review-report-pr-row" key={pullRequest.id}>
                    <div className="review-report-pr-identity">
                      <a
                        href={pullRequest.pullRequestUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="review-report-pr-link"
                      >
                        PR #{pullRequest.pullRequestId}
                      </a>
                      <ReviewState value={pullRequest.reviewStateLabel} />
                      <span className="review-report-pr-kind">
                        {pullRequest.isOwnPullRequest ? "OWN PR" : "REVIEWED"}
                      </span>
                    </div>
                    <div className="review-report-pr-copy">
                      <div className="review-report-pr-title">{pullRequest.pullRequestTitle}</div>
                      <PullRequestMeta pullRequest={pullRequest} />
                    </div>
                    <div className="review-report-pr-ticket">
                      <ReviewTicket
                        pullRequest={pullRequest}
                        issueUrlsByKey={issueUrlsByKey}
                        issueTypesByKey={issueTypesByKey}
                      />
                    </div>
                    <div className="review-report-pr-comments">
                      <strong>{pullRequest.commentCount}</strong>
                      <span>comments by you</span>
                    </div>
                    <span
                      className={`review-report-confidence is-${pullRequest.confidence}`}
                    >
                      {pullRequest.confidence.toUpperCase()}
                    </span>
                    <div className="review-report-pr-effort">
                      <strong>{formatSeconds(pullRequest.totalSeconds)}</strong>
                      <span>{formatReviewEffortOrigin(pullRequest)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </ReportPanel>

            <div className="review-report-honesty">
              Review effort is evidence from Bitbucket and is not added to weekly tracked time.
              Logged review work already appears through Jira worklogs.
            </div>
          </>
        )}
      </div>
    </>
  );
};

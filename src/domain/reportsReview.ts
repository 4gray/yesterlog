import type {
  BitbucketReviewConfidence,
  BitbucketReviewSession,
  BitbucketReviewSyncResult
} from "../../shared/types";

export interface ReviewEffortBreakdown {
  loggedSeconds: number;
  estimatedSeconds: number;
  totalSeconds: number;
}

export interface ReviewReportDay {
  dateKey: string;
  peerReview: ReviewEffortBreakdown;
  ownPrFollowUp: ReviewEffortBreakdown;
  totalSeconds: number;
}

export interface ReviewReportPullRequest extends ReviewEffortBreakdown {
  id: string;
  workspace: string;
  repositorySlug: string;
  repositoryName: string;
  pullRequestId: number;
  pullRequestTitle: string;
  pullRequestUrl: string;
  pullRequestState: string;
  pullRequestAuthorDisplayName?: string;
  isOwnPullRequest: boolean;
  jiraIssueKey?: string;
  reviewStateLabel: BitbucketReviewSession["reviewStateLabel"];
  confidence: BitbucketReviewConfidence;
  commentCount: number;
  activityCount: number;
  sessionCount: number;
  firstDateKey: string;
  lastDateKey: string;
  effortOrigin: "logged" | "estimated" | "mixed";
}

export interface ReportsReviewData {
  hasData: boolean;
  peerReview: ReviewEffortBreakdown;
  ownPrFollowUp: ReviewEffortBreakdown;
  reviewedPullRequestCount: number;
  ownPullRequestCount: number;
  commentsByYou: number;
  averageSecondsPerReviewedPr: number;
  days: ReviewReportDay[];
  pullRequests: ReviewReportPullRequest[];
  mostInvolved?: ReviewReportPullRequest;
}

const EMPTY_EFFORT = (): ReviewEffortBreakdown => ({
  loggedSeconds: 0,
  estimatedSeconds: 0,
  totalSeconds: 0
});

const addEffort = (target: ReviewEffortBreakdown, effort: ReviewEffortBreakdown) => {
  target.loggedSeconds += effort.loggedSeconds;
  target.estimatedSeconds += effort.estimatedSeconds;
  target.totalSeconds += effort.totalSeconds;
};

const safeSeconds = (value: number | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : undefined;

/**
 * Logged Jira duration is authoritative. Older cached logged sessions may not
 * have saved it, so their original-at-log estimate remains estimate-backed.
 */
export const reviewSessionEffort = (session: BitbucketReviewSession): ReviewEffortBreakdown => {
  const loggedSeconds =
    session.status === "logged" ? safeSeconds(session.logged?.timeSpentSeconds) : undefined;

  if (loggedSeconds !== undefined) {
    return {
      loggedSeconds,
      estimatedSeconds: 0,
      totalSeconds: loggedSeconds
    };
  }

  const estimatedSeconds =
    safeSeconds(
      session.status === "logged"
        ? session.logged?.estimatedSecondsAtLog ?? session.estimatedSeconds
        : session.estimatedSeconds
    ) ?? 0;

  return {
    loggedSeconds: 0,
    estimatedSeconds,
    totalSeconds: estimatedSeconds
  };
};

const confidenceRank: Record<BitbucketReviewConfidence, number> = {
  low: 0,
  medium: 1,
  high: 2
};

const lowerConfidence = (
  left: BitbucketReviewConfidence,
  right: BitbucketReviewConfidence
): BitbucketReviewConfidence => (confidenceRank[left] <= confidenceRank[right] ? left : right);

const effortOrigin = (effort: ReviewEffortBreakdown): ReviewReportPullRequest["effortOrigin"] => {
  if (effort.loggedSeconds > 0 && effort.estimatedSeconds > 0) {
    return "mixed";
  }
  return effort.loggedSeconds > 0 ? "logged" : "estimated";
};

const sessionTimestamp = (session: BitbucketReviewSession) => {
  const value = new Date(session.startedISO).getTime();
  return Number.isFinite(value) ? value : 0;
};

const pullRequestKey = (session: BitbucketReviewSession) =>
  `${session.workspace}/${session.repositorySlug}#${session.pullRequestId}`;

const comparePullRequests = (
  left: ReviewReportPullRequest,
  right: ReviewReportPullRequest
) =>
  right.totalSeconds - left.totalSeconds ||
  right.commentCount - left.commentCount ||
  left.repositoryName.localeCompare(right.repositoryName) ||
  left.pullRequestId - right.pullRequestId;

export const buildReportsReview = (
  result?: BitbucketReviewSyncResult
): ReportsReviewData => {
  const peerReview = EMPTY_EFFORT();
  const ownPrFollowUp = EMPTY_EFFORT();
  const days = new Map<string, ReviewReportDay>();
  const grouped = new Map<
    string,
    {
      row: ReviewReportPullRequest;
      latestTimestamp: number;
    }
  >();

  for (const session of result?.sessions ?? []) {
    const effort = reviewSessionEffort(session);
    const day =
      days.get(session.dateKey) ??
      {
        dateKey: session.dateKey,
        peerReview: EMPTY_EFFORT(),
        ownPrFollowUp: EMPTY_EFFORT(),
        totalSeconds: 0
      };

    if (session.isPullRequestAuthor) {
      addEffort(ownPrFollowUp, effort);
      addEffort(day.ownPrFollowUp, effort);
    } else {
      addEffort(peerReview, effort);
      addEffort(day.peerReview, effort);
    }
    day.totalSeconds += effort.totalSeconds;
    days.set(session.dateKey, day);

    const id = pullRequestKey(session);
    const existing = grouped.get(id);
    const latestTimestamp = sessionTimestamp(session);
    if (!existing) {
      grouped.set(id, {
        latestTimestamp,
        row: {
          id,
          workspace: session.workspace,
          repositorySlug: session.repositorySlug,
          repositoryName: session.repositoryName,
          pullRequestId: session.pullRequestId,
          pullRequestTitle: session.pullRequestTitle,
          pullRequestUrl: session.pullRequestUrl,
          pullRequestState: session.pullRequestState,
          pullRequestAuthorDisplayName: session.pullRequestAuthorDisplayName,
          isOwnPullRequest: Boolean(session.isPullRequestAuthor),
          jiraIssueKey: session.jiraIssueKey,
          reviewStateLabel: session.reviewStateLabel,
          confidence: session.confidence,
          commentCount: session.commentCount,
          activityCount: session.activityCount,
          sessionCount: 1,
          firstDateKey: session.dateKey,
          lastDateKey: session.dateKey,
          ...effort,
          effortOrigin: effortOrigin(effort)
        }
      });
      continue;
    }

    addEffort(existing.row, effort);
    existing.row.commentCount += session.commentCount;
    existing.row.activityCount += session.activityCount;
    existing.row.sessionCount += 1;
    existing.row.firstDateKey =
      session.dateKey < existing.row.firstDateKey ? session.dateKey : existing.row.firstDateKey;
    existing.row.lastDateKey =
      session.dateKey > existing.row.lastDateKey ? session.dateKey : existing.row.lastDateKey;
    existing.row.confidence = lowerConfidence(existing.row.confidence, session.confidence);
    existing.row.effortOrigin = effortOrigin(existing.row);

    if (latestTimestamp >= existing.latestTimestamp) {
      existing.latestTimestamp = latestTimestamp;
      existing.row.pullRequestTitle = session.pullRequestTitle;
      existing.row.pullRequestUrl = session.pullRequestUrl;
      existing.row.pullRequestState = session.pullRequestState;
      existing.row.pullRequestAuthorDisplayName = session.pullRequestAuthorDisplayName;
      existing.row.isOwnPullRequest = Boolean(session.isPullRequestAuthor);
      existing.row.jiraIssueKey = session.jiraIssueKey ?? existing.row.jiraIssueKey;
      existing.row.reviewStateLabel = session.reviewStateLabel;
    }
  }

  const pullRequests = [...grouped.values()].map(({ row }) => row).sort(comparePullRequests);
  const reviewed = pullRequests.filter((pullRequest) => !pullRequest.isOwnPullRequest);
  const own = pullRequests.filter((pullRequest) => pullRequest.isOwnPullRequest);

  return {
    hasData: pullRequests.length > 0,
    peerReview,
    ownPrFollowUp,
    reviewedPullRequestCount: reviewed.length,
    ownPullRequestCount: own.length,
    commentsByYou: reviewed.reduce((total, pullRequest) => total + pullRequest.commentCount, 0),
    averageSecondsPerReviewedPr:
      reviewed.length > 0 ? Math.round(peerReview.totalSeconds / reviewed.length) : 0,
    days: [...days.values()].sort((left, right) => left.dateKey.localeCompare(right.dateKey)),
    pullRequests,
    mostInvolved: reviewed[0]
  };
};

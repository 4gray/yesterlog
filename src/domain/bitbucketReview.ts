import type {
  AppSettings,
  BitbucketLoggedReview,
  BitbucketReviewSession,
  BitbucketReviewSyncResult,
  BitbucketReviewTargetMode
} from "../../shared/types";

const ISSUE_KEY_RE = /^[A-Z][A-Z0-9]+-\d+$/;

export const isBitbucketConfigured = (settings: AppSettings) =>
  Boolean(
    settings.bitbucketEmail.trim() &&
      settings.bitbucketApiToken.trim() &&
      settings.bitbucketWorkspace.trim() &&
      getBitbucketRepositorySlugs(settings).length > 0
  );

export const getBitbucketRepositorySlugs = (settings: Pick<AppSettings, "bitbucketRepositories">) =>
  Array.from(
    new Set(
      settings.bitbucketRepositories
        .split(/[\n,]+/)
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );

export const getReviewTargetIssueKey = (
  session: BitbucketReviewSession,
  settings: AppSettings,
  targetMode: BitbucketReviewTargetMode
) => {
  const issueKey =
    targetMode === "review-bucket" ? settings.bitbucketReviewBucketIssueKey.trim() : session.jiraIssueKey?.trim();
  const normalized = issueKey?.toUpperCase();
  return normalized && ISSUE_KEY_RE.test(normalized) ? normalized : undefined;
};

export const buildReviewWorklogComment = (session: BitbucketReviewSession) => {
  const lines = [`Reviewed Bitbucket PR #${session.pullRequestId}: ${session.pullRequestTitle}`];

  if (session.pullRequestUrl) {
    lines.push(session.pullRequestUrl);
  }

  const activity = [
    session.commentCount > 0 ? `${session.commentCount} ${session.commentCount === 1 ? "comment" : "comments"}` : "",
    session.reviewStateLabel.toLowerCase().replace("_", " ")
  ].filter(Boolean);

  if (activity.length > 0) {
    lines.push(`Review activity: ${activity.join(", ")}.`);
  }

  return lines.join("\n");
};

export const getReviewSessionLoggedMap = (result?: BitbucketReviewSyncResult) => {
  const logged = new Map<string, BitbucketLoggedReview>();

  for (const session of result?.sessions ?? []) {
    if (session.logged) {
      logged.set(session.id, session.logged);
    }
  }

  return logged;
};

export const mergeReviewSessionStates = (
  fresh: BitbucketReviewSyncResult,
  previous?: BitbucketReviewSyncResult
): BitbucketReviewSyncResult => {
  const logged = getReviewSessionLoggedMap(previous);

  if (logged.size === 0) {
    return fresh;
  }

  return {
    ...fresh,
    sessions: fresh.sessions.map((session) => {
      const previousLogged = logged.get(session.id);
      return previousLogged
        ? {
            ...session,
            status: "logged",
            logged: previousLogged
          }
        : session;
    })
  };
};

export const markReviewSessionsLogged = (
  result: BitbucketReviewSyncResult,
  loggedSessions: Array<{ sessionId: string; logged: BitbucketLoggedReview }>
): BitbucketReviewSyncResult => {
  const logged = new Map(loggedSessions.map((item) => [item.sessionId, item.logged]));

  return {
    ...result,
    sessions: result.sessions.map((session) => {
      const nextLogged = logged.get(session.id);
      return nextLogged
        ? {
            ...session,
            status: "logged",
            logged: nextLogged
          }
        : session;
    })
  };
};

export const getReviewStats = (result?: BitbucketReviewSyncResult) => {
  const sessions = result?.sessions ?? [];
  const unlogged = sessions.filter((session) => session.status !== "logged");
  const estimatedSeconds = sessions.reduce((sum, session) => sum + session.estimatedSeconds, 0);
  const unloggedSeconds = unlogged.reduce((sum, session) => sum + session.estimatedSeconds, 0);
  const reviewedPullRequests = new Set(sessions.map((session) => `${session.repositorySlug}#${session.pullRequestId}`));
  const repositories = new Set(sessions.map((session) => session.repositorySlug));

  return {
    sessionCount: sessions.length,
    unloggedCount: unlogged.length,
    estimatedSeconds,
    unloggedSeconds,
    reviewedPullRequestCount: reviewedPullRequests.size,
    repositoryCount: repositories.size,
    averageSecondsPerSession: sessions.length > 0 ? Math.round(estimatedSeconds / sessions.length) : 0
  };
};

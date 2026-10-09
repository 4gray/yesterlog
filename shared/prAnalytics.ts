import type { AppSettings } from "./types";

// An asterisk cannot collide with a Bitbucket repository slug.
export const ALL_ANALYTICS_REPOSITORIES = "*";

export interface PrAnalyticsUser {
  accountId?: string;
  uuid?: string;
  displayName?: string;
}
export const analyticsUserKey = (user: PrAnalyticsUser) => user.accountId || user.uuid || "";
export const sameAnalyticsUser = (a: PrAnalyticsUser, b: PrAnalyticsUser) =>
  Boolean(
    (a.accountId && b.accountId && a.accountId === b.accountId) || (a.uuid && b.uuid && a.uuid === b.uuid)
  );
export const analyticsRepositories = (value: string) => [
  ...new Set(
    value
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  )
];
export const analyticsConnectionKey = (
  settings: Pick<AppSettings, "bitbucketEmail" | "bitbucketWorkspace">
) =>
  JSON.stringify([
    settings.bitbucketEmail.trim().toLowerCase(),
    settings.bitbucketWorkspace.trim().toLowerCase()
  ]);

export interface PrAnalyticsComment {
  id: number;
  createdAt: string;
  author: PrAnalyticsUser;
}
export interface PrAnalyticsPullRequest {
  key: string;
  id: number;
  repository: string;
  title: string;
  url: string;
  state: string;
  draft: boolean;
  author: PrAnalyticsUser;
  createdAt?: string;
  updatedAt?: string;
  mergedAt?: string;
  firstResponseAt?: string;
  comments: PrAnalyticsComment[];
  activityComplete: boolean;
  commentsComplete: boolean;
  /** A complete activity feed can still lack a trustworthy merge transition. */
  mergeTimeMissing: boolean;
  fetchedAt?: string;
  /** Sanitized continuation checkpoint, discarded after the full history is read. */
  history?: {
    startedAt: string;
    activityNext: string | null;
    commentsNext: string | null;
    mergedAt?: string;
    firstResponseAt?: string;
    comments: PrAnalyticsComment[];
  };
}
export interface PrAnalyticsRepository {
  workspace: string;
  repository: string;
  user: PrAnalyticsUser;
  rangeStart: string;
  rangeEnd: string;
  syncedAt: string;
  listComplete: boolean;
  complete: boolean;
  pullRequests: PrAnalyticsPullRequest[];
  warnings: string[];
  /** null marks a completed state scan; URLs are revalidated before using auth. */
  scanCursors?: Record<string, string | null>;
}
export interface PrAnalyticsRequest {
  settings: AppSettings;
  repository: string;
  rangeStart: string;
  rangeEnd: string;
  requestId: string;
  previous?: PrAnalyticsRepository;
}
export interface PrAnalyticsProgress {
  requestId: string;
  repository: string;
  scanned: number;
  enriched: number;
  requests: number;
}
export interface PrAnalyticsCache {
  cacheKey: string;
  accountKey: string;
  repositories: PrAnalyticsRepository[];
}

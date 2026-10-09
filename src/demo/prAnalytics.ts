import {
  analyticsRepositories,
  type PrAnalyticsRepository,
  type PrAnalyticsPullRequest
} from "../../shared/prAnalytics";
import type { AppSettings } from "../../shared/types";
import { addDays } from "../utils/date";
import type { AnalyticsRange } from "../domain/prAnalytics";

/** Deterministic preview only. Never saved to the real analytics cache. */
export function demoPrAnalytics(settings: AppSettings, range: AnalyticsRange): PrAnalyticsRepository[] {
  const me = { accountId: "demo-me", displayName: "Alex Morgan" };
  const peer = { accountId: "demo-peer", displayName: "Sam Chen" };
  const titles = [
    "Add repository search",
    "Keep drafts after reconnect",
    "Improve review notifications",
    "Handle expired sessions",
    "Simplify project navigation",
    "Fix timezone boundaries",
    "Cache recent activity",
    "Polish keyboard navigation"
  ];
  return analyticsRepositories(settings.bitbucketRepositories).map((repository, r) => {
    const pullRequests: PrAnalyticsPullRequest[] = [];
    const days = Math.ceil((+range.end - +range.start) / 86400000);
    for (let i = -4; i < days; i++) {
      if ((i + r + 7) % 7 > 3) continue;
      const created = addDays(range.start, i);
      created.setHours(9 + ((i + 100) % 7));
      const merge = new Date(+created + (8 + ((i + 100) % 9) * 10 + r * 6) * 3600000);
      const response = new Date(+created + (1 + ((i + 100) % 12)) * 3600000);
      const id = i + 500;
      const merged = merge < range.end && (i + 100) % 11 !== 0;
      const comments = Array.from({ length: ((i + 100) % 5) + 1 }, (_, j) => ({
        id: j + 1,
        createdAt: new Date(+response + j * 1800000).toISOString(),
        author: j % 2 ? me : peer
      })).filter((c) => new Date(c.createdAt) < range.end);
      pullRequests.push({
        key: JSON.stringify([settings.bitbucketWorkspace, repository, id]),
        id,
        repository,
        title: titles[(i + r + 104) % titles.length],
        url: `https://bitbucket.org/${settings.bitbucketWorkspace}/${repository}/pull-requests/${id}`,
        state: merged ? "MERGED" : "OPEN",
        draft: !merged && i % 3 === 0,
        author: i % 3 === 0 ? peer : me,
        createdAt: created.toISOString(),
        updatedAt: (merged ? merge : created).toISOString(),
        mergedAt: merged ? merge.toISOString() : undefined,
        firstResponseAt: response < range.end ? response.toISOString() : undefined,
        comments,
        activityComplete: true,
        commentsComplete: true,
        mergeTimeMissing: false
      });
    }
    return {
      workspace: settings.bitbucketWorkspace,
      repository,
      user: me,
      rangeStart: range.start.toISOString(),
      rangeEnd: range.end.toISOString(),
      syncedAt: range.end.toISOString(),
      listComplete: true,
      complete: true,
      pullRequests,
      warnings: []
    };
  });
}

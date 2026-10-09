import { afterEach, describe, expect, it, vi } from "vitest";
import { syncPrAnalytics } from "./bitbucketAnalytics";
import { DEFAULT_SETTINGS } from "../src/domain/week";
import type { PrAnalyticsRequest } from "../shared/prAnalytics";

const request: PrAnalyticsRequest = {
  settings: {
    ...DEFAULT_SETTINGS,
    bitbucketEmail: "test@example.test",
    bitbucketApiToken: "test-token",
    bitbucketWorkspace: "team",
    bitbucketRepositories: "repo"
  },
  repository: "repo",
  rangeStart: "2026-06-01T00:00:00Z",
  rangeEnd: "2026-07-01T00:00:00Z",
  requestId: "request"
};
const me = { account_id: "me", uuid: "{me}", display_name: "Same name" };
const peer = { account_id: "peer", uuid: "{peer}", display_name: "Same name" };
const raw = {
  id: 1,
  title: "PR",
  state: "MERGED",
  author: me,
  created_on: "2026-05-20T10:00:00Z",
  updated_on: "2026-06-28T12:00:00Z"
};
const base = "https://api.bitbucket.org/2.0/repositories/team/repo/pullrequests";
const json = (data: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers });
function api(handler?: (url: URL, init?: RequestInit) => Response | undefined) {
  return vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      const handled = handler?.(url, init);
      if (handled) return handled;
      if (url.pathname === "/2.0/user") return json(me);
      if (url.pathname.endsWith("/activity"))
        return json({
          values: [
            { update: { date: "2026-06-28T12:00:00Z", state: "MERGED" } },
            { update: { date: "2026-06-03T10:00:00Z", state: "MERGED" } },
            { approval: { date: "2026-05-22T10:00:00Z", user: peer } }
          ]
        });
      if (url.pathname.endsWith("/comments")) return json({ values: [] });
      return json({
        values: url.searchParams.get("state") === "MERGED" ? [raw] : []
      });
    })
  );
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("Bitbucket analytics collector", () => {
  it("loads activity and comments when Bitbucket rejects history pages larger than 50", async () => {
    api((url) =>
      /\/(activity|comments)$/.test(url.pathname) && Number(url.searchParams.get("pagelen")) > 50
        ? json({ error: { message: "Invalid pagelen" } }, 400)
        : undefined
    );
    const result = await syncPrAnalytics(request);
    expect(result.complete).toBe(true);
    expect(result.pullRequests[0]).toMatchObject({
      activityComplete: true,
      commentsComplete: true,
      mergedAt: "2026-06-03T10:00:00.000Z"
    });
  });

  it("recovers an oversized history cursor cached by an earlier app version", async () => {
    api((url) => url.pathname.endsWith("/activity") ? json({}, 400) : undefined);
    const previous = await syncPrAnalytics(request);
    previous.pullRequests[0].history!.activityNext = `${base}/1/activity?pagelen=100`;
    previous.pullRequests[0].history!.commentsNext = `${base}/1/comments?pagelen=100`;
    api((url) =>
      /\/(activity|comments)$/.test(url.pathname) && Number(url.searchParams.get("pagelen")) > 50
        ? json({ error: { message: "Invalid pagelen" } }, 400)
        : undefined
    );
    const result = await syncPrAnalytics({ ...request, previous });
    expect(result.complete).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.pullRequests[0].history).toBeUndefined();
  });

  it("identifies the failing feed without retaining private response bodies or claiming merge events are absent", async () => {
    api((url) => url.pathname.endsWith("/activity")
      ? json({ error: { message: "Synthetic private response content" } }, 400)
      : undefined);
    const result = await syncPrAnalytics(request);
    expect(result.warnings).toEqual([
      "Bitbucket request failed (400) while loading PR activity. Refresh to retry incomplete history."
    ]);
    expect(result.pullRequests[0].activityComplete).toBe(false);
  });

  it("reads all four states and uses the first dated merge, never last update", async () => {
    api();
    const result = await syncPrAnalytics(request);
    expect(result.complete).toBe(true);
    expect(result.pullRequests[0]).toMatchObject({
      mergedAt: "2026-06-03T10:00:00.000Z",
      firstResponseAt: "2026-05-22T10:00:00.000Z"
    });
    const urls = vi.mocked(fetch).mock.calls.map(([u]) => new URL(String(u)));
    expect(urls.filter((u) => u.searchParams.has("state")).map((u) => u.searchParams.get("state"))).toEqual([
      "OPEN",
      "MERGED",
      "DECLINED",
      "SUPERSEDED"
    ]);
    expect(
      vi.mocked(fetch).mock.calls.every(([, options]) => !options?.method || options.method === "GET")
    ).toBe(true);
  });
  it("follows list/comment/activity pagination and includes replies and resolved comments once", async () => {
    api((url) => {
      if (url.pathname.endsWith("/activity"))
        return url.searchParams.has("page")
          ? json({
              values: [{ update: { date: "2026-06-03T10:00:00Z", state: "MERGED" } }]
            })
          : json({ values: [], next: `${base}/1/activity?page=2` });
      if (url.pathname.endsWith("/comments"))
        return json({
          values: url.searchParams.has("page")
            ? [
                {
                  id: 2,
                  created_on: "2026-05-21T11:00:00Z",
                  user: peer,
                  parent: { id: 1 },
                  resolution: {}
                }
              ]
            : [
                { id: 1, created_on: "2026-05-21T10:00:00Z", user: me },
                { id: 3, deleted: true },
                { id: 4, pending: true },
                { id: 2, created_on: "2026-05-21T11:00:00Z", user: peer }
              ],
          ...(url.searchParams.has("page") ? {} : { next: `${base}/1/comments?page=2` })
        });
      if (url.searchParams.get("state") === "MERGED")
        return json({
          values: [raw],
          ...(url.searchParams.has("page") ? {} : { next: `${base}?state=MERGED&page=2` })
        });
    });
    const result = await syncPrAnalytics(request);
    expect(result.complete).toBe(true);
    expect(result.pullRequests).toHaveLength(1);
    expect(result.pullRequests[0].comments).toHaveLength(2);
    expect(result.pullRequests[0].firstResponseAt).toBe("2026-05-21T11:00:00.000Z");
  });
  it("rejects foreign pagination without sending credentials", async () => {
    api((url) =>
      url.pathname.endsWith("/comments")
        ? json({ values: [], next: "https://other.example/history" })
        : undefined
    );
    const result = await syncPrAnalytics(request);
    expect(result.complete).toBe(false);
    expect(result.pullRequests[0].commentsComplete).toBe(false);
    expect(result.warnings.join(" ")).toContain("unsafe");
    expect(
      vi.mocked(fetch).mock.calls.every(([u]) => new URL(String(u)).origin === "https://api.bitbucket.org")
    ).toBe(true);
  });
  it("does not invent a merge date when history lacks a merge event", async () => {
    api((url) => (url.pathname.endsWith("/activity") ? json({ values: [] }) : undefined));
    const result = await syncPrAnalytics(request);
    expect(result.pullRequests[0].mergedAt).toBeUndefined();
    expect(result.pullRequests[0].mergeTimeMissing).toBe(true);
    expect(result.complete).toBe(false);
  });
  it("does not mistake an author's own comments or unknown actors for a peer response", async () => {
    api((url) =>
      url.pathname.endsWith("/activity")
        ? json({ values: [] })
        : url.pathname.endsWith("/comments")
          ? json({
              values: [
                { id: 1, created_on: "2026-06-02T00:00:00Z", user: me },
                {
                  id: 2,
                  created_on: "2026-06-02T01:00:00Z",
                  user: { display_name: "Peer" }
                }
              ]
            })
          : undefined
    );
    expect((await syncPrAnalytics(request)).pullRequests[0].firstResponseAt).toBeUndefined();
  });
  it("retries 429, respects a long Retry-After by stopping, and does not retry authentication", async () => {
    let calls = 0;
    api((url) =>
      url.pathname === "/2.0/user" && calls++ === 0 ? json({}, 429, { "Retry-After": "0" }) : undefined
    );
    expect((await syncPrAnalytics(request)).complete).toBe(true);
    api(() => json({}, 429, { "Retry-After": "120" }));
    await expect(syncPrAnalytics(request)).rejects.toThrow("rate limit");
    expect(fetch).toHaveBeenCalledTimes(1);
    api(() => json({}, 401));
    await expect(syncPrAnalytics(request)).rejects.toThrow("access denied");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("keeps a failed state partial and resumes its pagination on the next refresh", async () => {
    api((url) =>
      url.searchParams.get("state") === "MERGED"
        ? url.searchParams.has("page")
          ? json({}, 404)
          : json({ values: [raw], next: `${base}?state=MERGED&page=2` })
        : undefined
    );
    const partial = await syncPrAnalytics(request);
    expect(partial.listComplete).toBe(false);
    expect(partial.scanCursors?.MERGED).toContain("page=2");
    api((url) => (url.searchParams.get("page") === "2" ? json({ values: [{ ...raw, id: 2 }] }) : undefined));
    const resumed = await syncPrAnalytics({ ...request, previous: partial });
    expect(resumed.listComplete).toBe(true);
    expect(resumed.pullRequests).toHaveLength(2);
    expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).includes("state=OPEN"))).toBe(false);
  });
  it("reuses fresh detail cache and ignores it after the authenticated account changes", async () => {
    api();
    const previous = await syncPrAnalytics(request);
    api();
    await syncPrAnalytics({ ...request, previous });
    expect(vi.mocked(fetch).mock.calls).toHaveLength(5);
    api((url) => (url.pathname === "/2.0/user" ? json(peer) : undefined));
    const next = await syncPrAnalytics({ ...request, previous });
    expect(next.user.accountId).toBe("peer");
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(5);
  });
  it("reconciles unchanged PRs again after 24 hours", async () => {
    api();
    const previous = await syncPrAnalytics(request);
    previous.pullRequests[0].fetchedAt = "2020-01-01T00:00:00Z";
    api();
    await syncPrAnalytics({ ...request, previous });
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(5);
  });
  it("returns explicit partial evidence after cancellation", async () => {
    const controller = new AbortController();
    api((url) => {
      if (url.pathname.endsWith("/activity")) controller.abort();
      return undefined;
    });
    const result = await syncPrAnalytics(request, controller.signal);
    expect(result.complete).toBe(false);
    expect(result.warnings.join(" ")).toContain("cancelled");
  });
  it("resumes inside a large PR after the request budget without caching comment bodies", async () => {
    api((url) => {
      if (!url.pathname.endsWith("/comments")) return undefined;
      const page = Number(url.searchParams.get("page") || 1);
      return json({
        values: [
          {
            id: page,
            created_on: "2026-06-02T00:00:00Z",
            user: peer,
            content: { raw: "never persist this body" }
          }
        ],
        ...(page < 460 ? { next: `${base}/1/comments?page=${page + 1}` } : {})
      });
    });
    const partial = await syncPrAnalytics(request);
    expect(partial.complete).toBe(false);
    expect(vi.mocked(fetch).mock.calls).toHaveLength(450);
    expect(partial.pullRequests[0].history?.comments.length).toBeGreaterThan(400);
    expect(JSON.stringify(partial)).not.toContain("never persist");
    vi.mocked(fetch).mockClear();
    const complete = await syncPrAnalytics({ ...request, previous: partial });
    expect(complete.complete).toBe(true);
    expect(complete.pullRequests[0].comments).toHaveLength(460);
    expect(complete.pullRequests[0].history).toBeUndefined();
    expect(vi.mocked(fetch).mock.calls.length).toBeLessThan(30);
  });

  it("does not call failed auth repeatedly for every PR", async () => {
    api((url) => {
      if (url.pathname.endsWith("/activity")) return json({}, 403);
      if (url.searchParams.get("state") === "MERGED")
        return json({ values: [raw, { ...raw, id: 2 }, { ...raw, id: 3 }] });
    });
    const result = await syncPrAnalytics(request);
    expect(result.complete).toBe(false);
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("/activity"))).toHaveLength(1);
  });
  it("leaves a response unknown when actor and author IDs cannot be compared", async () => {
    api((url) => {
      if (url.searchParams.get("state") === "MERGED") return json({ values: [{ ...raw, author: { uuid: "{me}" } }] });
      if (url.pathname.endsWith("/activity")) return json({ values: [{ approval: { date: "2026-06-02T00:00:00Z", user: { account_id: "me" } } }] });
    });
    expect((await syncPrAnalytics(request)).pullRequests[0].firstResponseAt).toBeUndefined();
  });

});

it("accepts a report year plus its comparison history but rejects unbounded scans", async () => {
  api();
  const result = await syncPrAnalytics({ ...request, rangeStart: "2024-07-01T00:00:00Z" });
  expect(result.rangeStart).toBe("2024-07-01T00:00:00Z");
  await expect(syncPrAnalytics({ ...request, rangeStart: "2020-01-01T00:00:00Z" })).rejects.toThrow("at most two years");
});

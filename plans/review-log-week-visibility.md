# Review worklogs visible in Week/Today immediately

## Problem

Logging review sessions from the Code Review view wrote to Jira and queued a background delta
sync, but never merged the created worklogs into the in-memory week cache. Week and Today render
from that cache, so the entry stayed invisible until a manual Sync (or until the delta sync caught
up, which Jira's search index can delay). Every other write path (Add Time, dock quick log, drag
move/resize, edit, delete, multi-day booking) already merges optimistically through
`src/domain/syncResult.ts` and re-merges in the sync `reconcile` hook.

## Fix

- `useBitbucketReviewLogging` now receives `syncResult`, `onSyncResult`, `saveSyncResult` and a
  `resolveTicket` lookup. After the Jira writes it merges each created worklog with
  `mergeCreatedWorklogIntoSyncResult`, publishes the optimistic result, caches it, and passes a
  `reconcile` that re-merges the same worklogs after the delta sync.
- Ticket metadata for the entry: the dock/recent ticket when known, otherwise the issue summary
  already in the week cache, otherwise a stub (`Code review`, Jira browse link) that the next sync
  replaces because an existing worklog id wins in the merge.

## Audit of the other paths (2026-10-09)

- Add Time / Today / dock quick log / Timeline create: `handleAddWorklog` merges + reconciles.
- Multi-day booking: `handleAddWorklogs` merges + reconciles.
- Edit / move / delete: `mergeUpdated…`, `mergeMoved…`, `removeWorklog…` paths exist.
- Today and Week read the same `syncResult`, so an entry added in one is in the other.
- Month: the visible week comes from live week state; other weeks reload from IndexedDB each time
  the view opens, and every write path saves the cache. No stale case found.
- Demo mode returns early in every path and never touches the cache; this fix is unit-tested, not
  reproducible in the demo seed.

## Verification

- `npm run test`: 147 files, 1043 tests (2 new review-logging cases: optimistic merge with known and
  stub tickets, reconcile after sync).
- `npm run build`: passed.

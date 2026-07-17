import { describe, expect, it } from "vitest";
import type { SyncResult } from "../../shared/types";
import { resolveRelativeSyncLabel, SYNC_DOT_STATE } from "./syncStatus";

const NOW = new Date(2026, 5, 17, 12, 0, 0);
const syncedAt = (date: Date) => ({ syncedAt: date.toISOString() }) as SyncResult;

describe("resolveRelativeSyncLabel", () => {
  it("reports elapsed time since the last sync", () => {
    expect(resolveRelativeSyncLabel("synced", NOW, syncedAt(new Date(2026, 5, 17, 11, 58, 0)))).toBe("SYNCED 2M AGO");
    expect(resolveRelativeSyncLabel("synced", NOW, syncedAt(new Date(2026, 5, 15, 12, 0, 0)))).toBe("SYNCED 2D AGO");
  });

  it("collapses a sub-minute sync to 'just now'", () => {
    expect(resolveRelativeSyncLabel("synced", NOW, syncedAt(new Date(2026, 5, 17, 11, 59, 30)))).toBe(
      "SYNCED JUST NOW"
    );
  });

  it("never reads a future sync stamp as 'in 38m'", () => {
    // Clock skew or seeded fixtures can stamp a sync ahead of now.
    expect(resolveRelativeSyncLabel("synced", NOW, syncedAt(new Date(2026, 5, 17, 12, 38, 0)))).toBe("SYNCED JUST NOW");
  });

  it("reports syncing and offline without touching the timestamp", () => {
    expect(resolveRelativeSyncLabel("syncing", NOW, syncedAt(new Date(2026, 5, 17, 11, 58, 0)))).toBe("SYNCING…");
    expect(resolveRelativeSyncLabel("offline", NOW, syncedAt(new Date(2026, 5, 17, 11, 58, 0)))).toBe("OFFLINE");
  });

  it("reports never-synced and unparseable timestamps as NOT SYNCED", () => {
    expect(resolveRelativeSyncLabel("stale", NOW, undefined)).toBe("NOT SYNCED");
    expect(resolveRelativeSyncLabel("synced", NOW, { syncedAt: "not-a-date" } as SyncResult)).toBe("NOT SYNCED");
  });
});

describe("SYNC_DOT_STATE", () => {
  it("gives every sync state its own modifier class", () => {
    // A state with no class silently renders the default green "healthy" dot.
    expect(SYNC_DOT_STATE).toEqual({
      synced: "is-synced",
      syncing: "is-syncing",
      stale: "is-stale",
      offline: "is-offline"
    });
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import { ReconstructView } from "./ReconstructView";
import {
  buildReconstructDay,
  getReconstructSummary,
  type ReconstructDay,
  type ReconstructInput
} from "../domain/reconstruct";

const baseInput = (overrides: Partial<ReconstructInput> = {}): ReconstructInput => ({
  dateKey: "2026-06-17",
  weekdayIso: 3,
  isToday: false,
  workingDays: [1, 2, 3, 4, 5],
  targetMinutes: 480,
  worklogs: [
    { issueKey: "TBRO-100", issueSummary: "Daily standup", startedISO: "2026-06-17T13:00:00", timeSpentSeconds: 75 * 60 }
  ],
  reviewSessions: [
    {
      id: "s1",
      jiraIssueKey: "TBRO-395",
      pullRequestId: 511,
      pullRequestTitle: "schema migration",
      repositoryName: "web-app",
      startedISO: "2026-06-17T09:00:00",
      endedISO: "2026-06-17T10:40:00",
      estimatedSeconds: 100 * 60,
      commentCount: 9,
      confidence: "high"
    }
  ],
  ...overrides
});

const withDrafts = (day: ReconstructDay): ReconstructDay => ({
  ...day,
  rows: day.rows.map((row) => (row.kind === "filled" ? { ...row, aiDraft: "Reviewed the schema migration PR." } : row))
});

const render = (overrides: Partial<ComponentProps<typeof ReconstructView>> = {}) => {
  const day = overrides.day ?? buildReconstructDay(baseInput());
  return renderToStaticMarkup(
    <ReconstructView
      day={day}
      summary={overrides.summary ?? getReconstructSummary(day)}
      dateLabels={{ longLabel: "WEDNESDAY 17 JUNE", shortLabel: "WED 17 JUN" }}
      aiOn={false}
      aiProvider="ollama"
      aiModel="llama3.1:8b"
      isEnhancing={false}
      canStepBack
      canStepForward={false}
      onStepBack={() => undefined}
      onStepForward={() => undefined}
      onOpenSettings={() => undefined}
      onPrimaryAction={() => undefined}
      onStopAi={() => undefined}
      onLogTime={() => undefined}
      syncState="synced"
      syncLabel="SYNCED 6:47 PM"
      onSync={() => undefined}
      onPlaceSignal={() => undefined}
      onUnplaceSignal={() => undefined}
      onPlaceAll={() => undefined}
      onAdjustDuration={() => undefined}
      {...overrides}
    />
  );
};

describe("ReconstructView", () => {
  it("renders the header total, date and signals for an active day", () => {
    const markup = render();
    expect(markup).toContain("RECONSTRUCT — WEDNESDAY 17 JUNE");
    expect(markup).toContain("WED 17 JUN");
    expect(markup).toContain("TBRO-395");
    expect(markup).toContain("WORKING DAY");
  });

  it("shows unplaced signals as draggable cards with place actions", () => {
    const day = buildReconstructDay(baseInput(), {}); // nothing placed yet → all in the rail
    expect(day.unplacedSignalIds.length).toBeGreaterThan(0);
    const markup = render({ day });
    expect(markup).toContain('draggable="true"'); // rail cards are draggable
    expect(markup).toContain(">Place<"); // per-card place action
    expect(markup).toContain("Place everything"); // bulk place
    expect(markup).toContain("Drag a card onto an hour");
  });

  it("invites connecting a model when AI is off (the LLM mention requirement)", () => {
    const markup = render({ aiOn: false });
    expect(markup).toContain("AI is off");
    expect(markup).toContain("SET UP AI");
    expect(markup).toContain("AI OFF");
    expect(markup).toContain("Auto-distribute");
    expect(markup).not.toContain("DRAFTED");
  });

  it("shows on-device drafting affordances when Ollama is on", () => {
    const day = withDrafts(buildReconstructDay(baseInput()));
    const markup = render({ day, aiOn: true });
    expect(markup).toContain("on-device by llama3.1:8b");
    expect(markup).toContain("never leave this machine");
    expect(markup).toContain("DRAFTED · llama3.1");
    expect(markup).toContain("Reviewed the schema migration PR.");
    expect(markup).toContain("Auto-draft all");
    expect(markup).toContain("is-ai-drafted"); // AI rows are clearly highlighted
  });

  it("frames drafting as cloud (not on-device) when a CLI provider is active", () => {
    const day = withDrafts(buildReconstructDay(baseInput()));
    const markup = render({ day, aiOn: true, aiProvider: "claude-cli", aiModel: "sonnet" });
    expect(markup).toContain("via the claude CLI");
    expect(markup).toContain("Anthropic’s cloud");
    expect(markup).not.toContain("never leave this machine");
    expect(markup).not.toContain("localhost:11434");
  });

  it("offers a Stop control while a draft is in flight", () => {
    const markup = render({ aiOn: true, isEnhancing: true });
    expect(markup).toContain("Stop drafting");
    expect(markup).not.toContain("Auto-draft all");
  });

  it("shows a syncing state instead of an empty one while a sync is in flight", () => {
    const day = buildReconstructDay(baseInput({ worklogs: [], reviewSessions: [] }));
    const markup = render({ day, syncState: "syncing" });
    expect(markup).toContain("Syncing your activity");
    expect(markup).not.toContain("already reflected in a Jira worklog");
  });

  it("offers a Sync now action when nothing has synced yet", () => {
    const day = buildReconstructDay(baseInput({ worklogs: [], reviewSessions: [] }));
    const markup = render({ day, syncState: "stale" });
    expect(markup).toContain("Not synced yet");
    expect(markup).toContain("Sync now");
  });

  it("renders local locked rows as local accounted time, not Jira time", () => {
    const day = buildReconstructDay(
      baseInput({
        worklogs: [],
        reviewSessions: [],
        localEntries: [
          {
            id: "note-1",
            source: "personal-note",
            title: "Planning without a ticket",
            startedISO: "2026-06-17T10:00:00",
            timeSpentSeconds: 45 * 60,
            note: "Private planning notes"
          }
        ]
      })
    );
    const markup = render({ day });
    expect(markup).toContain("Planning without a ticket");
    expect(markup).toContain("private note · 45m");
    expect(markup).toContain(">local<");
    expect(markup).toContain("45m</span> local/private");
  });

  it("renders a calm weekend rest state with a log-anyway escape hatch", () => {
    const day = buildReconstructDay(baseInput({ weekdayIso: 6, worklogs: [], reviewSessions: [] }));
    const markup = render({ day });
    expect(markup).toContain("Enjoy the weekend");
    expect(markup).toContain("LOG TIME ANYWAY");
    expect(markup).toContain("WEEKEND");
  });

  it("renders a complete day without nagging", () => {
    const day = buildReconstructDay(
      baseInput({
        reviewSessions: [],
        worklogs: [
          { issueKey: "A", issueSummary: "Work", startedISO: "2026-06-17T09:00:00", timeSpentSeconds: 480 * 60 }
        ]
      })
    );
    const markup = render({ day });
    expect(markup).toContain("Everything is logged");
    expect(markup).toContain("already in Jira");
  });

  it("does not call a local-only complete day Jira-logged", () => {
    const day = buildReconstructDay(
      baseInput({
        worklogs: [],
        reviewSessions: [],
        localEntries: [
          {
            id: "note-1",
            source: "personal-note",
            title: "Private focus day",
            startedISO: "2026-06-17T09:00:00",
            timeSpentSeconds: 480 * 60,
            note: "Local-only time"
          }
        ]
      })
    );
    const markup = render({ day });
    expect(markup).toContain("Everything is accounted");
    expect(markup).toContain("Jira worklogs and local/private rows cover the target.");
    expect(markup).not.toContain("logged in Jira");
  });
});

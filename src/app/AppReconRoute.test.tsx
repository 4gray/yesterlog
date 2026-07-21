import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import type { AppSettings } from "../../shared/types";
import { buildReconstructDay } from "../domain/reconstruct";
import { AppReconRoute, buildReconstructAddTimePrefill } from "./AppReconRoute";

const settings: AppSettings = {
  jiraBaseUrl: "https://example.atlassian.net",
  jiraEmail: "dev@example.com",
  jiraApiToken: "token",
  bitbucketEmail: "",
  bitbucketApiToken: "",
  bitbucketWorkspace: "",
  bitbucketRepositories: "",
  bitbucketReviewBucketIssueKey: "",
  weeklyTargetHours: 40,
  workingDays: [1, 2, 3, 4, 5],
  reminderTime: "16:30",
  remindersEnabled: true,
  aiEnabled: false,
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "llama3.1:8b"
};

const render = (overrides: Partial<ComponentProps<typeof AppReconRoute>> = {}) =>
  renderToStaticMarkup(
    <AppReconRoute
      currentDate={new Date(2026, 5, 17, 9, 0, 0)}
      settings={settings}
      syncResult={undefined}
      jiraActivityResult={undefined}
      reviewResult={undefined}
      localWeekKey="2026-06-15"
      personalNotes={[]}
      recurringEvents={[]}
      recurringOccurrences={[]}
      dailyTargetHours={8}
      syncState="synced"
      syncLabel="SYNCED 6:47 PM"
      onSync={() => undefined}
      onOpenSettings={() => undefined}
      onLogTime={() => undefined}
      {...overrides}
    />
  );

describe("AppReconRoute", () => {
  it("renders the Reconstruct view for the current day", () => {
    const markup = render();
    expect(markup).toContain("RECONSTRUCT —");
    expect(markup).toContain("WORKING DAY");
  });

  it("surfaces the optional AI call to action when AI is disabled", () => {
    const markup = render();
    expect(markup).toContain("AI is off");
    expect(markup).toContain("SET UP AI");
  });

  it("builds an Add Time prefill from the first reconstructed row", () => {
    const day = buildReconstructDay(
      {
        dateKey: "2026-07-07",
        weekdayIso: 2,
        isToday: false,
        workingDays: [1, 2, 3, 4, 5],
        targetMinutes: 480,
        worklogs: [],
        reviewSessions: [],
        commits: [
          {
            id: "commit-ftdm-426",
            jiraIssueKey: "FTDM-426",
            repositoryName: "web-app",
            primaryMessage: "Create mongo mock data for documents and folders",
            commitCount: 1,
            firstCommitISO: "2026-07-07T09:15:00.000Z",
            lastCommitISO: "2026-07-07T09:55:00.000Z",
            estimatedSeconds: 40 * 60,
            confidence: "high"
          }
        ]
      },
      { "commit-ftdm-426": 10 },
      { "commit-ftdm-426": 40 }
    );

    const prefill = buildReconstructAddTimePrefill(day, settings.jiraBaseUrl);

    expect(prefill?.ticket?.key).toBe("FTDM-426");
    expect(prefill?.ticket?.summary).toBe("Create mongo mock data for documents and folders");
    expect(prefill?.ticket?.url).toBe("https://example.atlassian.net/browse/FTDM-426");
    expect(prefill?.timeSpentSeconds).toBe(40 * 60);
    expect(new Date(prefill?.startedISO ?? "").getHours()).toBe(10);
    expect(prefill?.comment).toContain("Create mongo mock data for documents and folders");
  });
});

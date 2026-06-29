import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import type { AppSettings } from "../../shared/types";
import { AppReconRoute } from "./AppReconRoute";

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

  it("surfaces the optional local-AI call to action when AI is disabled", () => {
    const markup = render();
    expect(markup).toContain("Local AI is off");
    expect(markup).toContain("SET UP LOCAL AI");
  });
});

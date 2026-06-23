import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AppSettings } from "../../shared/types";
import { WelcomeView } from "./WelcomeView";

const settings: AppSettings = {
  jiraBaseUrl: "",
  jiraEmail: "",
  jiraApiToken: "",
  bitbucketEmail: "",
  bitbucketApiToken: "",
  bitbucketWorkspace: "",
  bitbucketRepositories: "",
  bitbucketReviewBucketIssueKey: "",
  weeklyTargetHours: 40,
  workingDays: [1, 2, 3, 4, 5],
  reminderTime: "17:00",
  remindersEnabled: true
};

describe("WelcomeView", () => {
  it("clarifies that Jira setup should use the token option without scopes", () => {
    const markup = renderToStaticMarkup(
      <WelcomeView
        initialSettings={settings}
        isConnected={false}
        connectedSettings={settings}
        onConnect={async () => ({ ok: false, message: "Not connected" })}
        onEnterApp={() => undefined}
      />
    );

    expect(markup).toContain("Create a token");
    expect(markup).toContain("Create token, the option without scopes");
  });

  it("tells previous-version users they can import personal notes from settings later", () => {
    const markup = renderToStaticMarkup(
      <WelcomeView
        initialSettings={settings}
        isConnected={false}
        connectedSettings={settings}
        onConnect={async () => ({ ok: false, message: "Not connected" })}
        onEnterApp={() => undefined}
      />
    );

    expect(markup).toContain("Coming from an older version?");
    expect(markup).toContain("Personal notes can be imported later from Settings.");
  });
});

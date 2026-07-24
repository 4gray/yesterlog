// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../../shared/types";
import { AppNotesRoute, type AppNotesRouteProps } from "./AppNotesRoute";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { receivedProps } = vi.hoisted(() => ({
  receivedProps: [] as Record<string, unknown>[]
}));

vi.mock("../components/NotesWorkspace", () => ({
  NotesWorkspace: (props: Record<string, unknown>) => {
    receivedProps.push(props);
    return <section data-testid="notes-workspace" />;
  }
}));

const settings = {
  jiraBaseUrl: "https://example.atlassian.net",
  jiraEmail: "person@example.com",
  jiraApiToken: "token",
  bitbucketEmail: "",
  bitbucketApiToken: "",
  bitbucketWorkspace: "",
  bitbucketRepositories: "",
  bitbucketReviewBucketIssueKey: "",
  weeklyTargetHours: 40,
  workingDays: [1, 2, 3, 4, 5],
  reminderTime: "17:00",
  remindersEnabled: false,
  aiEnabled: false,
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "llama3.1:8b"
} as AppSettings;

const props: AppNotesRouteProps = {
  settings,
  currentDate: new Date(2026, 5, 17, 12),
  isDemo: false,
  ticketOptions: [],
  tickets: undefined,
  syncResult: undefined,
  reviewResult: undefined,
  searchTickets: async () => [],
  onError: () => undefined
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  receivedProps.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("AppNotesRoute", () => {
  it("passes the notes workspace dependencies through unchanged", () => {
    act(() => {
      root.render(<AppNotesRoute {...props} />);
    });

    expect(container.querySelector("[data-testid='notes-workspace']")).not.toBeNull();
    expect(receivedProps).toHaveLength(1);
    expect(receivedProps[0]).toMatchObject({
      settings,
      currentDate: props.currentDate,
      isDemo: false,
      ticketOptions: [],
      tickets: undefined,
      syncResult: undefined,
      reviewResult: undefined
    });
    expect(receivedProps[0].searchTickets).toBe(props.searchTickets);
    expect(receivedProps[0].onError).toBe(props.onError);
  });
});

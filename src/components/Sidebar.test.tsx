import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Sidebar } from "./Sidebar";

const noop = () => undefined;

const renderSidebar = (showReview: boolean) =>
  renderToStaticMarkup(
    <Sidebar
      view="reports"
      reportTab="summary"
      collapsed={false}
      onViewChange={noop}
      onReportTabChange={noop}
      onToggleCollapse={noop}
      syncLabel="SYNCED"
      syncState="synced"
      showReview={showReview}
      settingsDirty={false}
    />
  );

describe("Sidebar Reports tabs", () => {
  it("shows Code review when Bitbucket is configured", () => {
    expect(renderSidebar(true)).toContain("Code review");
  });

  it("hides Code review for Jira-only usage", () => {
    expect(renderSidebar(false)).not.toContain("Code review");
  });
});

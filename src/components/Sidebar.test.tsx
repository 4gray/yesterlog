import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Sidebar } from "./Sidebar";

const noop = () => undefined;

const renderSidebar = (showReview: boolean) =>
  renderToStaticMarkup(
    <Sidebar
      view="reports"
      collapsed={false}
      onViewChange={noop}
      onToggleCollapse={noop}
      syncLabel="SYNCED"
      syncState="synced"
      showReview={showReview}
      settingsDirty={false}
    />
  );

describe("Sidebar", () => {
  // The Reports sub-tabs moved into ReportsView; the sidebar shows only the
  // primary nav (Review gated on Bitbucket).
  it("shows the Review nav item when Bitbucket is configured", () => {
    expect(renderSidebar(true)).toContain("REVIEW");
    expect(renderSidebar(true)).not.toContain("Code review");
  });

  it("hides the Review nav item for Jira-only usage", () => {
    expect(renderSidebar(false)).not.toContain("REVIEW");
  });
});

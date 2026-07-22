// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { JiraTicket, TicketFilters } from "../../shared/types";
import { TicketsView } from "./TicketsView";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const filters: TicketFilters = {
  assignedOnly: true,
  statusCategories: ["new", "indeterminate", "done"],
  query: "",
  sortMode: "updatedDesc"
};

const ticket: JiraTicket = {
  id: "133470",
  key: "TBRO-397",
  summary: "Restructure the access domain in nx monorepo",
  projectKey: "TBRO",
  projectName: "TimeBro Product",
  statusName: "In Progress",
  statusCategory: "indeterminate",
  loggedSecondsTotal: 0,
  assigneeDisplayName: "Ada Lovelace",
  issueType: { name: "Sub-task", subtask: true, hierarchyLevel: -1 },
  epic: {
    id: "10000",
    key: "TBRO-300",
    summary: "Explorer",
    url: "https://elevait.atlassian.net/browse/TBRO-300"
  },
  url: "https://elevait.atlassian.net/browse/TBRO-397"
};

describe("TicketsView", () => {
  it("shows Jira link icons next to ticket-list keys", () => {
    const markup = renderToStaticMarkup(
      <TicketsView
        inProgress={[ticket]}
        recentlyClosed={[]}
        favoriteKeys={[ticket.key]}
        hoursByKey={{ [ticket.key]: 2 }}
        weekHoursLogged={2}
        isConfigured={true}
        isLoading={false}
        filters={filters}
        onFiltersChange={() => undefined}
        onToggleFavorite={() => undefined}
        onLog={() => undefined}
      />
    );

    expect(markup).toContain("TBRO-397");
    expect(markup).toContain("https://elevait.atlassian.net/browse/TBRO-397");
    expect(markup).toContain("Open TBRO-397 in Jira");
    expect(markup).toContain("SUB");
    expect(markup).toContain("Epic: Explorer");
    expect(markup).toContain("https://elevait.atlassian.net/browse/TBRO-300");
    expect(markup).toContain("2h logged this week");
    expect(markup).not.toContain("THIS WEEK");
    expect(markup).not.toContain("⌘K SEARCH");
    expect(markup).not.toContain("STATUS: OPEN");
    expect(markup).toContain("Assigned to me");
    expect(markup).toContain("In progress");
    expect(markup).toContain("Done");
    expect(markup).toContain("Jira status: In Progress");
    expect(markup).toContain("Search key, summary, status…");
    expect(markup).toContain("Recently updated");
    expect(markup.match(/Unstar TBRO-397/g)).toHaveLength(1);
  });

  it("shows assignee metadata only while browsing across assignees", () => {
    const scopedMarkup = renderToStaticMarkup(
      <TicketsView
        inProgress={[ticket]}
        recentlyClosed={[]}
        favoriteKeys={[]}
        hoursByKey={{}}
        weekHoursLogged={0}
        isConfigured={true}
        isLoading={false}
        filters={filters}
        onFiltersChange={() => undefined}
        onToggleFavorite={() => undefined}
        onLog={() => undefined}
      />
    );
    const broadMarkup = renderToStaticMarkup(
      <TicketsView
        inProgress={[ticket]}
        recentlyClosed={[]}
        favoriteKeys={[]}
        hoursByKey={{}}
        weekHoursLogged={0}
        isConfigured={true}
        isLoading={false}
        filters={{ ...filters, assignedOnly: false }}
        onFiltersChange={() => undefined}
        onToggleFavorite={() => undefined}
        onLog={() => undefined}
      />
    );

    expect(scopedMarkup).not.toContain("Ada Lovelace");
    expect(broadMarkup).toContain("Ada Lovelace");
  });

  it("emits accessible assignee and multi-status filter changes", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const onFiltersChange = vi.fn();

    act(() => {
      root.render(
        <TicketsView
          inProgress={[ticket]}
          recentlyClosed={[]}
          favoriteKeys={[]}
          hoursByKey={{}}
          weekHoursLogged={0}
          isConfigured={true}
          isLoading={false}
          filters={filters}
          onFiltersChange={onFiltersChange}
          onToggleFavorite={() => undefined}
          onLog={() => undefined}
        />
      );
    });

    const buttons = [...container.querySelectorAll("button")];
    const assignedButton = buttons.find((button) => button.textContent?.includes("Assigned to me"));
    const inProgressButton = buttons.find((button) => button.textContent?.includes("In progress"));

    expect(assignedButton?.getAttribute("aria-pressed")).toBe("true");
    expect(inProgressButton?.getAttribute("aria-pressed")).toBe("true");

    act(() => assignedButton?.click());
    expect(onFiltersChange).toHaveBeenCalledWith({ ...filters, assignedOnly: false });

    act(() => inProgressButton?.click());
    expect(onFiltersChange).toHaveBeenCalledWith({
      ...filters,
      statusCategories: ["new", "done"]
    });

    const searchInput = container.querySelector<HTMLInputElement>('input[aria-label="Search tickets"]');
    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setValue?.call(searchInput, "TBRO-397");
      searchInput?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onFiltersChange).toHaveBeenCalledWith({ ...filters, query: "TBRO-397" });

    const sortSelect = container.querySelector<HTMLSelectElement>('select[aria-label="Sort tickets"]');
    act(() => {
      if (sortSelect) {
        sortSelect.value = "keyAsc";
        sortSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    expect(onFiltersChange).toHaveBeenCalledWith({ ...filters, sortMode: "keyAsc" });

    act(() => root.unmount());
    container.remove();
  });
});

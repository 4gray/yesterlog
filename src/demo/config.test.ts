// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { getDemoConfig } from "./config";

const originalUrl = window.location.href;

afterEach(() => {
  window.history.replaceState({}, "", originalUrl);
});

describe("getDemoConfig Reports tabs", () => {
  it("accepts the Code review report deep-link", () => {
    window.history.replaceState(
      {},
      "",
      "/?demo=1&view=reports&reportTab=reviews&theme=dark&today=2026-06-17"
    );

    expect(getDemoConfig()).toMatchObject({
      view: "reports",
      reportTab: "reviews",
      theme: "dark"
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  CURSOR_DEEPLINK_MAX_LENGTH,
  CURSOR_PROMPT_DEEPLINK_PREFIX,
  buildCursorDeeplink,
  buildCursorPrompt,
  buildCursorPromptDeeplink,
  isCursorPromptDeeplink
} from "./cursorDeeplink";

const decodeDeeplink = (deeplink: string) =>
  decodeURIComponent(deeplink.slice(CURSOR_PROMPT_DEEPLINK_PREFIX.length));

describe("buildCursorPrompt", () => {
  it("frames a complete ticket with instruction, heading, description and Jira link", () => {
    const prompt = buildCursorPrompt({
      key: "TB-22",
      summary: "Wire immediate worklog refresh",
      description: "After logging time the dock should refresh without a manual sync.",
      url: "https://example.atlassian.net/browse/TB-22"
    });

    expect(prompt).toBe(
      [
        "Help me work on this Jira ticket.",
        "TB-22 — Wire immediate worklog refresh",
        "After logging time the dock should refresh without a manual sync.",
        "Jira: https://example.atlassian.net/browse/TB-22"
      ].join("\n\n")
    );
  });

  it("omits the description block when there is no description", () => {
    const prompt = buildCursorPrompt({
      key: "TB-22",
      summary: "Wire immediate worklog refresh",
      url: "https://example.atlassian.net/browse/TB-22"
    });

    expect(prompt).toBe(
      [
        "Help me work on this Jira ticket.",
        "TB-22 — Wire immediate worklog refresh",
        "Jira: https://example.atlassian.net/browse/TB-22"
      ].join("\n\n")
    );
    expect(prompt).not.toContain("\n\n\n");
  });

  it("omits the Jira link when there is no url", () => {
    const prompt = buildCursorPrompt({
      key: "TB-22",
      summary: "Wire immediate worklog refresh",
      description: "Refresh the dock."
    });

    expect(prompt).not.toContain("Jira:");
  });

  it("falls back to the bare key when there is no summary", () => {
    const prompt = buildCursorPrompt({ key: "TB-22", description: "Refresh the dock." });

    expect(prompt).toContain("TB-22");
    expect(prompt).not.toContain("—");
  });

  it("trims surrounding whitespace from each field", () => {
    const prompt = buildCursorPrompt({
      key: "TB-22",
      summary: "  Wire immediate worklog refresh  ",
      description: "  Refresh the dock.  ",
      url: "  https://example.atlassian.net/browse/TB-22  "
    });

    expect(prompt).toContain("TB-22 — Wire immediate worklog refresh");
    expect(prompt).toContain("Refresh the dock.");
    expect(prompt).toContain("Jira: https://example.atlassian.net/browse/TB-22");
  });
});

describe("buildCursorDeeplink", () => {
  it("prefixes the encoded prompt and round-trips back to the original text", () => {
    const prompt = "Help me work on this Jira ticket.\n\nTB-1 — Do the thing & more";
    const deeplink = buildCursorDeeplink(prompt);

    expect(deeplink.startsWith(CURSOR_PROMPT_DEEPLINK_PREFIX)).toBe(true);
    expect(decodeDeeplink(deeplink)).toBe(prompt);
  });

  it("percent-encodes characters that would break the URL", () => {
    const deeplink = buildCursorDeeplink("a b\nc&d=e");

    expect(deeplink).not.toContain(" ");
    expect(deeplink).toContain("%20"); // space
    expect(deeplink).toContain("%0A"); // newline
    expect(deeplink).toContain("%26"); // ampersand
  });

  it("truncates oversized prompts to stay under the deeplink length cap", () => {
    const huge = "x".repeat(20_000);
    const deeplink = buildCursorDeeplink(huge);

    expect(deeplink.length).toBeLessThanOrEqual(CURSOR_DEEPLINK_MAX_LENGTH);
    expect(decodeDeeplink(deeplink).endsWith("(ticket description truncated)")).toBe(true);
  });

  it("keeps multibyte content under the cap after encoding expansion", () => {
    // Each emoji encodes to ~12 chars, so the cap must be measured post-encoding.
    const deeplink = buildCursorDeeplink("🚀".repeat(5_000));

    expect(deeplink.length).toBeLessThanOrEqual(CURSOR_DEEPLINK_MAX_LENGTH);
  });

  it("leaves prompts at the boundary untouched", () => {
    const prompt = "short prompt";
    expect(buildCursorDeeplink(prompt)).toBe(CURSOR_PROMPT_DEEPLINK_PREFIX + encodeURIComponent(prompt));
  });
});

describe("buildCursorPromptDeeplink", () => {
  it("composes the prompt and deeplink for a ticket", () => {
    const deeplink = buildCursorPromptDeeplink({
      key: "TB-22",
      summary: "Refresh the dock",
      url: "https://example.atlassian.net/browse/TB-22"
    });

    expect(isCursorPromptDeeplink(deeplink)).toBe(true);
    expect(decodeDeeplink(deeplink)).toContain("TB-22 — Refresh the dock");
  });
});

describe("isCursorPromptDeeplink", () => {
  it("accepts a well-formed Cursor prompt deeplink", () => {
    expect(isCursorPromptDeeplink(`${CURSOR_PROMPT_DEEPLINK_PREFIX}hello`)).toBe(true);
  });

  it("rejects other schemes and non-strings", () => {
    expect(isCursorPromptDeeplink("https://cursor.com/link/prompt?text=hi")).toBe(false);
    expect(isCursorPromptDeeplink("javascript:alert(1)")).toBe(false);
    expect(isCursorPromptDeeplink("cursor://anysphere.cursor-deeplink/mcp/install")).toBe(false);
    expect(isCursorPromptDeeplink(undefined)).toBe(false);
    expect(isCursorPromptDeeplink(42)).toBe(false);
  });

  it("accepts builder output whose prompt contains URL-significant characters", () => {
    // & = # are encoded into the text value, so they must not trip the guard.
    expect(isCursorPromptDeeplink(buildCursorDeeplink("a & b = c # d"))).toBe(true);
  });

  it("rejects deeplinks that smuggle extra query params or a fragment", () => {
    expect(isCursorPromptDeeplink(`${CURSOR_PROMPT_DEEPLINK_PREFIX}hi&action=install`)).toBe(false);
    expect(isCursorPromptDeeplink(`${CURSOR_PROMPT_DEEPLINK_PREFIX}hi#fragment`)).toBe(false);
  });
});

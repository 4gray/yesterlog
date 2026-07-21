import { describe, expect, it } from "vitest";
import { redactForCloud } from "./redaction";

describe("redactForCloud", () => {
  it("replaces URLs, emails, and @mentions with fixed markers", () => {
    const { text } = redactForCloud("see https://acme.atlassian.net/browse/x, ping jane@acme.io and @bob.smith");
    expect(text).not.toContain("https://");
    expect(text).not.toContain("jane@acme.io");
    expect(text).not.toContain("@bob.smith");
    expect(text).toContain("[redacted-url]");
    expect(text).toContain("[redacted-email]");
    expect(text).toContain("[redacted-user]");
  });

  it("maps ticket keys to stable placeholders and restores them in a response", () => {
    const { text, restore } = redactForCloud("Reviewed FTDM-395 and FTDM-395, then OPS-77.");
    expect(text).not.toContain("FTDM-395");
    expect(text).not.toContain("OPS-77");
    // same key → same placeholder (dedup)
    expect(text).toBe("Reviewed TICKET-1 and TICKET-1, then TICKET-2.");
    expect(restore("Worked on TICKET-1 and TICKET-2.")).toBe("Worked on FTDM-395 and OPS-77.");
  });

  it("restores placeholders case-insensitively (models sometimes lower-case them)", () => {
    const { restore } = redactForCloud("FTDM-42");
    expect(restore("finished ticket-1 today")).toBe("finished FTDM-42 today");
  });

  it("leaves common technical tokens that look like keys untouched", () => {
    const { text } = redactForCloud(
      "Switched to UTF-8 and SHA-256; patched CVE-2024-1234; wired GPT-4; tracked COVID-19."
    );
    expect(text).toBe("Switched to UTF-8 and SHA-256; patched CVE-2024-1234; wired GPT-4; tracked COVID-19.");
  });

  it("replaces reversible tokens (signal ids) with ID-n and restores them", () => {
    const ids = ["acme/checkout-svc#812:2026-06-15", "beta/api#3:2026-06-15"];
    const prompt = `[{"id":"${ids[0]}","key":"FTDM-1"},{"id":"${ids[1]}","key":"OPS-2"}]`;
    const { text, restore } = redactForCloud(prompt, [], ids);

    expect(text).not.toContain("acme/checkout-svc");
    expect(text).not.toContain("beta/api");
    expect(text).toContain("ID-1");
    expect(text).toContain("ID-2");
    // ticket keys in the same payload are still redacted independently
    expect(text).toContain("TICKET-1");
    // the ID placeholder must not be re-eaten by the ticket regex
    expect(text).not.toContain("acme");

    expect(restore('{"id":"ID-1","key":"TICKET-1"}')).toBe(`{"id":"${ids[0]}","key":"FTDM-1"}`);
  });

  it("scrubs caller-supplied literals (repo slugs, workspace), longest match first", () => {
    const { text } = redactForCloud("PR in explorer-web and explorer, workspace acme-corp", [
      "explorer",
      "explorer-web",
      "acme-corp"
    ]);
    expect(text).not.toContain("explorer-web");
    expect(text).not.toContain("acme-corp");
    expect(text).toBe("PR in [redacted] and [redacted], workspace [redacted]");
  });

  it("ignores literals shorter than 4 chars to avoid over-redaction", () => {
    const { text } = redactForCloud("the api and web layers", ["api", "web"]);
    expect(text).toBe("the api and web layers");
  });

  it("reports how much was redacted and is a no-op on clean text", () => {
    const clean = redactForCloud("Refactored the scheduler for clarity.");
    expect(clean.redactedCount).toBe(0);
    expect(clean.text).toBe("Refactored the scheduler for clarity.");
    expect(clean.restore("nothing to restore")).toBe("nothing to restore");

    const dirty = redactForCloud("FTDM-1 https://x.y jane@z.io");
    expect(dirty.redactedCount).toBe(3);
  });
});

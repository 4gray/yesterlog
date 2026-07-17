// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { formatShortcut, isApplePlatform } from "./platform";

const setPlatform = (value: unknown, { modern }: { modern?: string } = {}) => {
  Object.defineProperty(window.navigator, "platform", { value, configurable: true });
  Object.defineProperty(window.navigator, "userAgentData", {
    value: modern ? { platform: modern } : undefined,
    configurable: true
  });
};

afterEach(() => {
  setPlatform("MacIntel");
});

describe("isApplePlatform", () => {
  it("detects Apple platforms", () => {
    setPlatform("MacIntel");
    expect(isApplePlatform()).toBe(true);

    setPlatform("iPhone");
    expect(isApplePlatform()).toBe(true);
  });

  it("rejects Windows and Linux", () => {
    setPlatform("Win32");
    expect(isApplePlatform()).toBe(false);

    setPlatform("Linux x86_64");
    expect(isApplePlatform()).toBe(false);
  });

  it("prefers userAgentData over the deprecated navigator.platform", () => {
    setPlatform("Win32", { modern: "macOS" });
    expect(isApplePlatform()).toBe(true);
  });
});

describe("formatShortcut", () => {
  it("uses ⌘ notation on Apple platforms", () => {
    setPlatform("MacIntel");
    expect(formatShortcut("K")).toBe("⌘K");
    expect(formatShortcut("K", { shift: true })).toBe("⌘⇧K");
  });

  it("spells the modifiers out elsewhere — never ⇧ next to Ctrl", () => {
    setPlatform("Win32");
    expect(formatShortcut("K")).toBe("Ctrl+K");
    expect(formatShortcut("K", { shift: true })).toBe("Ctrl+Shift+K");
  });
});

import { describe, expect, it } from "vitest";
import { buildCodexArgs, combineCodexPrompt, parseCodexResult } from "./codex";

describe("combineCodexPrompt", () => {
  it("prepends the system text when present (Codex has no system-prompt flag)", () => {
    expect(combineCodexPrompt("do the thing", "You are helpful.")).toBe("You are helpful.\n\ndo the thing");
  });

  it("returns the prompt unchanged when there is no system text", () => {
    expect(combineCodexPrompt("do the thing")).toBe("do the thing");
    expect(combineCodexPrompt("do the thing", "   ")).toBe("do the thing");
  });
});

describe("buildCodexArgs", () => {
  it("runs exec read-only, skips the git check, and puts the prompt last", () => {
    const args = buildCodexArgs({}, "the prompt");
    expect(args[0]).toBe("exec");
    expect(args).toContain("--skip-git-repo-check");
    expect(args.slice(args.indexOf("--sandbox"), args.indexOf("--sandbox") + 2)).toEqual([
      "--sandbox",
      "read-only"
    ]);
    expect(args[args.length - 1]).toBe("the prompt");
    expect(args).not.toContain("-m");
  });

  it("passes the model with -m when provided", () => {
    const args = buildCodexArgs({ model: "gpt-5-codex" }, "the prompt");
    expect(args[args.indexOf("-m") + 1]).toBe("gpt-5-codex");
    expect(args[args.length - 1]).toBe("the prompt");
  });
});

describe("parseCodexResult", () => {
  it("returns stdout as the response on a clean exit", () => {
    expect(parseCodexResult("  final message  ", "progress noise", 0, false)).toEqual({
      ok: true,
      response: "final message"
    });
  });

  it("fails on a clean exit with empty output", () => {
    const parsed = parseCodexResult("", "", 0, false);
    expect(parsed.ok).toBe(false);
  });

  it("surfaces a timeout", () => {
    const parsed = parseCodexResult("", "", null, true);
    expect(parsed.ok).toBe(false);
    expect(parsed.message).toMatch(/in time/i);
  });

  it("surfaces the last stderr line on a non-zero exit", () => {
    const parsed = parseCodexResult("", "spawn error\nENOENT: codex binary missing", 1, false);
    expect(parsed).toEqual({ ok: false, message: "ENOENT: codex binary missing" });
  });
});

import { describe, expect, it } from "vitest";
import { buildClaudeArgs, parseClaudeResult } from "./claude";

describe("buildClaudeArgs", () => {
  it("always requests print mode + JSON output and disables tools last", () => {
    const args = buildClaudeArgs({});
    expect(args.slice(0, 3)).toEqual(["-p", "--output-format", "json"]);
    // `--tools ""` is a variadic flag, so it must be the final pair with nothing after it.
    expect(args.slice(-2)).toEqual(["--tools", ""]);
  });

  it("includes the model and system prompt when provided", () => {
    const args = buildClaudeArgs({ model: "sonnet", system: "You are a worklog assistant." });
    expect(args).toContain("--model");
    expect(args[args.indexOf("--model") + 1]).toBe("sonnet");
    expect(args).toContain("--system-prompt");
    expect(args[args.indexOf("--system-prompt") + 1]).toBe("You are a worklog assistant.");
  });

  it("omits the model and system flags when blank", () => {
    const args = buildClaudeArgs({ model: "  ", system: "" });
    expect(args).not.toContain("--model");
    expect(args).not.toContain("--system-prompt");
  });
});

describe("parseClaudeResult", () => {
  it("extracts the `result` field from the JSON wrapper", () => {
    const stdout = JSON.stringify({ type: "result", is_error: false, result: "  shipped ABC-1  " });
    expect(parseClaudeResult(stdout, "", 0, false)).toEqual({ ok: true, response: "shipped ABC-1" });
  });

  it("reports an error when the wrapper flags is_error", () => {
    const stdout = JSON.stringify({ is_error: true, subtype: "error_max_turns", result: "hit the limit" });
    expect(parseClaudeResult(stdout, "", 0, false)).toEqual({ ok: false, message: "hit the limit" });
  });

  it("fails on an empty result", () => {
    const stdout = JSON.stringify({ is_error: false, result: "   " });
    const parsed = parseClaudeResult(stdout, "", 0, false);
    expect(parsed.ok).toBe(false);
  });

  it("falls back to raw stdout when it is not the JSON wrapper on a clean exit", () => {
    expect(parseClaudeResult("plain text answer", "", 0, false)).toEqual({
      ok: true,
      response: "plain text answer"
    });
  });

  it("does NOT treat non-JSON stdout as success when the run failed", () => {
    const parsed = parseClaudeResult("Loading banner…", "boom", 1, false);
    expect(parsed.ok).toBe(false);
    expect(parsed.message).toBe("boom");
  });

  it("does NOT treat non-JSON stdout as success when the run timed out", () => {
    const parsed = parseClaudeResult("partial output", "", null, true);
    expect(parsed.ok).toBe(false);
    expect(parsed.message).toMatch(/in time/i);
  });

  it("surfaces a timeout when there is no output", () => {
    const parsed = parseClaudeResult("", "", null, true);
    expect(parsed.ok).toBe(false);
    expect(parsed.message).toMatch(/in time/i);
  });

  it("surfaces the last stderr line when the process fails with no stdout", () => {
    const parsed = parseClaudeResult("", "warning\nNot logged in", 1, false);
    expect(parsed).toEqual({ ok: false, message: "Not logged in" });
  });
});

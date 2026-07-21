import { describe, expect, it } from "vitest";
import { buildAugmentedPath, resolveCliPath } from "./cli";

describe("buildAugmentedPath", () => {
  it("appends the common dev-CLI install dirs on unix", () => {
    const result = buildAugmentedPath("/usr/bin", "/home/me", "linux").split(":");
    expect(result[0]).toBe("/usr/bin");
    expect(result).toContain("/home/me/.local/bin");
    expect(result).toContain("/opt/homebrew/bin");
  });

  it("de-duplicates while preserving first-seen order", () => {
    const result = buildAugmentedPath("/usr/bin:/opt/homebrew/bin:/usr/bin", "/home/me", "linux").split(":");
    expect(result.filter((dir) => dir === "/usr/bin")).toHaveLength(1);
    expect(result.filter((dir) => dir === "/opt/homebrew/bin")).toHaveLength(1);
  });

  it("uses the Windows separator and does not inject unix dirs", () => {
    const result = buildAugmentedPath("C:\\bin", "C:\\Users\\me", "win32");
    expect(result).toBe("C:\\bin");
  });

  it("tolerates a missing base PATH", () => {
    expect(buildAugmentedPath(undefined, "/home/me", "linux")).toContain("/home/me/.local/bin");
  });
});

describe("resolveCliPath", () => {
  it("trusts an absolute path that points at an executable", async () => {
    // process.execPath (the node binary) is guaranteed to exist and be executable.
    expect(await resolveCliPath(process.execPath)).toBe(process.execPath);
  });

  it("rejects an absolute path that is not executable", async () => {
    expect(await resolveCliPath("/definitely/not/a/real/binary-xyz")).toBeUndefined();
  });

  it("returns undefined for a blank command", async () => {
    expect(await resolveCliPath("   ")).toBeUndefined();
  });
});

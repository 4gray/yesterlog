import { spawn } from "node:child_process";
import { accessSync, constants as fsConstants } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Shared helpers for the CLI-backed AI providers (`claude -p`, `codex exec`). These run
 * in the Electron **main** process because the renderer cannot spawn child processes.
 *
 * The load-bearing problem this file solves: when TimeBro is launched from the macOS
 * dock (or a Linux .desktop launcher) it inherits a minimal PATH — `/usr/bin:/bin:…` —
 * that does NOT include the user's shell PATH, so `claude` (`~/.local/bin`) and `codex`
 * (an nvm bin dir) are invisible. We recover the real PATH from a login shell once and
 * search it, and always let the user pin an absolute path in settings as an escape hatch.
 */

/** Directories a dev CLI is commonly installed into, appended to whatever PATH we have. */
const commonBinDirs = (home: string, platform: NodeJS.Platform): string[] => {
  if (platform === "win32") {
    return [];
  }
  return [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    path.join(home, ".local", "bin"),
    path.join(home, ".bun", "bin"),
    path.join(home, "bin"),
    path.join(home, ".deno", "bin")
  ];
};

/** Merge a base PATH string with the common install dirs, de-duplicated, order-preserving. */
export const buildAugmentedPath = (
  basePath: string | undefined,
  home: string,
  platform: NodeJS.Platform
): string => {
  const separator = platform === "win32" ? ";" : ":";
  const seen = new Set<string>();
  const dirs: string[] = [];
  const push = (dir: string) => {
    const trimmed = dir.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      dirs.push(trimmed);
    }
  };
  (basePath ?? "").split(separator).forEach(push);
  commonBinDirs(home, platform).forEach(push);
  return dirs.join(separator);
};

/** Spawn a process, optionally feed it stdin, and capture stdout/stderr with a hard timeout. */
export interface RunCliOptions {
  input?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}

export interface RunCliResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** Set when the process could not be spawned at all (e.g. ENOENT, EACCES). */
  spawnError?: NodeJS.ErrnoException;
}

export const runCli = (file: string, args: string[], options: RunCliOptions = {}): Promise<RunCliResult> => {
  const { input, timeoutMs = 120_000, env, cwd } = options;
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(file, args, {
        cwd: cwd ?? os.tmpdir(),
        env: env ?? process.env,
        // Only expose a stdin pipe when we have input to send. Leaving an empty pipe open
        // makes some CLIs (e.g. `codex exec`) wait on / append an empty stdin block.
        stdio: [input !== undefined ? "pipe" : "ignore", "pipe", "pipe"]
      });
    } catch (error) {
      resolve({ code: null, stdout: "", stderr: "", timedOut: false, spawnError: error as NodeJS.ErrnoException });
      return;
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    const finish = (result: RunCliResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    // Decode as UTF-8 via the stream's StringDecoder so a multi-byte character split
    // across two data chunks is not corrupted into replacement characters.
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      finish({ code: null, stdout, stderr, timedOut, spawnError: error });
    });
    child.on("close", (code) => {
      finish({ code, stdout, stderr, timedOut });
    });

    if (input !== undefined && child.stdin) {
      child.stdin.on("error", () => {
        // Ignore EPIPE if the child exits before reading stdin.
      });
      child.stdin.write(input);
      child.stdin.end();
    } else {
      child.stdin?.end();
    }
  });
};

/** The PATH we search for CLI binaries — the login-shell PATH once recovered, else augmented. */
let cachedSearchPath: string | undefined;

const looksLikePath = (command: string): boolean =>
  command.includes(path.sep) || (process.platform === "win32" && command.includes("/"));

const isExecutableFile = (candidate: string): boolean => {
  try {
    accessSync(candidate, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * Recover the user's real PATH from their login shell (once per app session). GUI-launched
 * apps miss shims added by nvm/asdf/homebrew in `.zprofile`/`.zshrc`; `-ilc` sources those.
 * Falls back to the augmented process PATH on any failure or on Windows.
 */
const resolveSearchPath = async (): Promise<string> => {
  if (cachedSearchPath !== undefined) {
    return cachedSearchPath;
  }
  const home = os.homedir();
  const fallback = buildAugmentedPath(process.env.PATH, home, process.platform);

  if (process.platform === "win32") {
    cachedSearchPath = fallback;
    return cachedSearchPath;
  }

  const shell = process.env.SHELL || "/bin/zsh";
  try {
    const result = await runCli(shell, ["-ilc", 'echo -n "$PATH"'], { timeoutMs: 2500, input: "" });
    const shellPath = result.stdout.split("\n").map((line) => line.trim()).filter(Boolean).pop();
    cachedSearchPath = shellPath ? buildAugmentedPath(shellPath, home, process.platform) : fallback;
  } catch {
    cachedSearchPath = fallback;
  }
  return cachedSearchPath;
};

/** Reset the cached PATH — test-only seam. */
export const __resetCliPathCache = () => {
  cachedSearchPath = undefined;
};

/**
 * A process env with PATH widened to the recovered search path, so a CLI's own child
 * processes (and any `node`/`bun` shim it relies on) resolve when launched from a GUI app.
 */
export const resolveCliEnv = async (): Promise<NodeJS.ProcessEnv> => {
  const searchPath = await resolveSearchPath();
  return { ...process.env, PATH: searchPath };
};

/**
 * Resolve a configured CLI command to an absolute, executable path.
 * - A value containing a path separator is trusted as-is (the user's explicit override).
 * - A bare name is searched on the recovered PATH plus common install dirs.
 * Returns undefined when nothing executable is found.
 */
export const resolveCliPath = async (command: string): Promise<string | undefined> => {
  const trimmed = command.trim();
  if (!trimmed) {
    return undefined;
  }
  if (looksLikePath(trimmed)) {
    const absolute = path.isAbsolute(trimmed) ? trimmed : path.resolve(trimmed);
    return isExecutableFile(absolute) ? absolute : undefined;
  }

  const searchPath = await resolveSearchPath();
  const separator = process.platform === "win32" ? ";" : ":";
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const dir of searchPath.split(separator)) {
    if (!dir.trim()) {
      continue;
    }
    for (const ext of extensions) {
      const candidate = path.join(dir, `${trimmed}${ext}`);
      if (isExecutableFile(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
};

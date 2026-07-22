#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));

const DEFAULT_VIEWS = ["today", "week", "month", "recon", "review", "tickets", "reports", "recap", "settings"];
const DEFAULT_THEMES = ["dark", "light"];
const DEFAULT_VIEWPORT = "1440x1000";

const parseArgs = (argv) => {
  const options = {
    seed: "release",
    today: "2026-06-17",
    viewport: DEFAULT_VIEWPORT,
    views: DEFAULT_VIEWS,
    themes: DEFAULT_THEMES,
    outDir: path.join(repoRoot, "screenshots", `v${packageJson.version}`),
    fullPage: false,
    headed: false,
    baseUrl: undefined
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--seed" && next) {
      options.seed = next;
      index += 1;
    } else if (arg === "--today" && next) {
      options.today = next;
      index += 1;
    } else if (arg === "--viewport" && next) {
      options.viewport = next;
      index += 1;
    } else if (arg === "--views" && next) {
      options.views = parseList(next, DEFAULT_VIEWS, "views");
      index += 1;
    } else if (arg === "--themes" && next) {
      options.themes = parseList(next, DEFAULT_THEMES, "themes");
      index += 1;
    } else if (arg === "--out" && next) {
      options.outDir = path.resolve(repoRoot, next);
      index += 1;
    } else if (arg === "--url" && next) {
      options.baseUrl = next.replace(/\/+$/, "");
      index += 1;
    } else if (arg === "--full-page") {
      options.fullPage = true;
    } else if (arg === "--headed") {
      options.headed = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown or incomplete option: ${arg}`);
    }
  }

  options.viewportSize = parseViewport(options.viewport);
  return options;
};

const parseList = (value, allowed, label) => {
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const invalid = items.filter((item) => !allowed.includes(item));

  if (items.length === 0 || invalid.length > 0) {
    throw new Error(`Invalid ${label}: ${value}. Allowed values: ${allowed.join(", ")}`);
  }

  return items;
};

const parseViewport = (value) => {
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (!match) {
    throw new Error(`Invalid viewport "${value}". Use WIDTHxHEIGHT, for example ${DEFAULT_VIEWPORT}.`);
  }

  return {
    width: Number(match[1]),
    height: Number(match[2])
  };
};

const printHelp = () => {
  console.log(`Capture TimeBro release screenshots.

Usage:
  npm run screenshots -- [options]

Options:
  --seed <value>        Deterministic fixture seed. Default: release
  --today <date>        Demo date, YYYY-MM-DD or ISO. Default: 2026-06-17
  --viewport <size>     Browser viewport, WIDTHxHEIGHT. Default: ${DEFAULT_VIEWPORT}
  --views <list>        Comma-separated views: ${DEFAULT_VIEWS.join(", ")}
  --themes <list>       Comma-separated themes: ${DEFAULT_THEMES.join(", ")}
  --out <dir>           Output directory. Default: screenshots/v${packageJson.version}
  --url <url>           Reuse an already running renderer URL instead of starting Vite
  --full-page           Capture full-page screenshots instead of the viewport
  --headed              Show the browser while capturing
`);
};

const getFreePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      server.close(() => {
        if (port) {
          resolve(port);
        } else {
          reject(new Error("Unable to reserve a local port."));
        }
      });
    });
  });

const waitForServer = async (baseUrl, child) => {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < 30000) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      throw new Error(`Vite exited before becoming ready with code ${child.exitCode}.`);
    }

    try {
      const response = await fetch(baseUrl, { cache: "no-store" });
      if (response.ok) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${baseUrl}${lastError ? ` (${lastError.message})` : ""}.`);
};

const startVite = async () => {
  const port = await getFreePort();
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(npmCommand, ["run", "dev:renderer", "--", "--port", String(port), "--strictPort"], {
    cwd: repoRoot,
    env: { ...process.env, BROWSER: "none" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const recentOutput = [];
  const remember = (chunk) => {
    recentOutput.push(chunk.toString());
    if (recentOutput.length > 30) {
      recentOutput.shift();
    }
  };

  child.stdout.on("data", remember);
  child.stderr.on("data", remember);

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(baseUrl, child);

  return {
    baseUrl,
    stop: async () => {
      if (child.exitCode !== null) {
        return;
      }
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 2500);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
    recentOutput: () => recentOutput.join("")
  };
};

const assertScreenshotLooksUseful = async (buffer, expectedViewport, fullPage, filePath) => {
  const image = sharp(buffer).removeAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

  if (!fullPage && (info.width !== expectedViewport.width || info.height !== expectedViewport.height)) {
    throw new Error(
      `Unexpected screenshot size for ${filePath}: ${info.width}x${info.height}, expected ${expectedViewport.width}x${expectedViewport.height}.`
    );
  }

  let min = 255;
  let max = 0;
  let sum = 0;
  let sumSquares = 0;
  let count = 0;
  const step = Math.max(3, Math.floor(data.length / 60000) * 3);

  for (let index = 0; index < data.length; index += step) {
    const value = (data[index] + data[index + 1] + data[index + 2]) / 3;
    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
    sumSquares += value * value;
    count += 1;
  }

  const mean = sum / count;
  const variance = sumSquares / count - mean * mean;
  const stddev = Math.sqrt(Math.max(variance, 0));

  if (max - min < 8 || stddev < 3) {
    throw new Error(`Screenshot appears blank or nearly flat: ${filePath}`);
  }
};

const captureOne = async ({ browser, options, baseUrl, view, theme }) => {
  const context = await browser.newContext({
    colorScheme: theme,
    deviceScaleFactor: 1,
    viewport: options.viewportSize
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const params = new URLSearchParams({
    demo: "1",
    view,
    theme,
    seed: options.seed,
    today: options.today
  });
  const url = `${baseUrl}/?${params.toString()}`;
  const fileName = `${theme}-${view}.png`;
  const filePath = path.join(options.outDir, fileName);

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector(`.app-shell[data-screenshot-ready="true"][data-view="${view}"][data-theme="${theme}"]`, {
    timeout: 10000
  });
  await page.waitForFunction((expectedTheme) => {
    return document.documentElement.classList.contains(`theme-${expectedTheme}`);
  }, theme);
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(150);

  const hasViteOverlay = await page.locator("vite-error-overlay").count();
  if (hasViteOverlay > 0) {
    throw new Error(`Vite error overlay rendered for ${theme}/${view}.`);
  }

  const bodyText = (await page.locator("body").innerText()).trim();
  if (bodyText.length < 80) {
    throw new Error(`Page rendered too little text for ${theme}/${view}.`);
  }

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    throw new Error(
      [`Runtime errors for ${theme}/${view}:`, ...consoleErrors, ...pageErrors].filter(Boolean).join("\n")
    );
  }

  const rawBuffer = await page.screenshot({ fullPage: options.fullPage });
  await assertScreenshotLooksUseful(rawBuffer, options.viewportSize, options.fullPage, filePath);
  // Compress to a palette PNG (pngquant-style): flat UI screenshots quantize with no
  // visible loss, keeping the committed docs/release-notes images small.
  const compressed = await sharp(rawBuffer)
    .png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 })
    .toBuffer();
  await writeFile(filePath, compressed);
  await context.close();

  return filePath;
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  await mkdir(options.outDir, { recursive: true });

  let server;
  let browser;

  try {
    if (options.baseUrl) {
      await waitForServer(options.baseUrl);
      server = { baseUrl: options.baseUrl, stop: async () => undefined };
    } else {
      server = await startVite();
    }

    browser = await chromium.launch({ headless: !options.headed });
    const written = [];

    for (const theme of options.themes) {
      for (const view of options.views) {
        const filePath = await captureOne({ browser, options, baseUrl: server.baseUrl, view, theme });
        written.push(filePath);
        console.log(`Saved ${path.relative(repoRoot, filePath)}`);
      }
    }

    console.log(`\nCaptured ${written.length} screenshots in ${path.relative(repoRoot, options.outDir)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Executable doesn't exist") || message.includes("browserType.launch")) {
      console.error("Playwright could not launch Chromium. Run: npx playwright install chromium");
    }
    if (server?.recentOutput) {
      const output = server.recentOutput().trim();
      if (output) {
        console.error(`\nRecent Vite output:\n${output}`);
      }
    }
    console.error(message);
    process.exitCode = 1;
  } finally {
    await browser?.close().catch(() => undefined);
    await server?.stop().catch(() => undefined);
  }
};

await main();

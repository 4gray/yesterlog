import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import { test, before, after } from "node:test";
import { chromium } from "playwright";

const DEFAULT_TODAY = "2026-06-17";
const DEFAULT_SEED = "e2e";
const SERVER_TIMEOUT_MS = 30_000;

let server;
let browser;

const getFreePort = () =>
  new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      listener.close(() => {
        if (port) {
          resolve(port);
        } else {
          reject(new Error("Unable to reserve a local port for the renderer E2E server."));
        }
      });
    });
  });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForServer = async (baseUrl, child) => {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < SERVER_TIMEOUT_MS) {
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

    await wait(250);
  }

  throw new Error(`Timed out waiting for ${baseUrl}${lastError ? ` (${lastError.message})` : ""}.`);
};

const startRenderer = async () => {
  const port = await getFreePort();
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const useProcessGroup = process.platform !== "win32";
  const child = spawn(npmCommand, ["run", "dev:renderer", "--", "--port", String(port), "--strictPort"], {
    cwd: process.cwd(),
    detached: useProcessGroup,
    env: { ...process.env, BROWSER: "none" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const recentOutput = [];
  const remember = (chunk) => {
    recentOutput.push(chunk.toString());
    if (recentOutput.length > 40) {
      recentOutput.shift();
    }
  };

  child.stdout.on("data", remember);
  child.stderr.on("data", remember);

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(baseUrl, child);

  return {
    baseUrl,
    recentOutput: () => recentOutput.join(""),
    stop: async () => {
      if (child.exitCode !== null) {
        return;
      }

      const kill = (signal) => {
        try {
          if (useProcessGroup) {
            process.kill(-child.pid, signal);
          } else {
            child.kill(signal);
          }
        } catch (error) {
          if (error?.code !== "ESRCH") {
            throw error;
          }
        }
      };

      kill("SIGTERM");
      const exited = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), 2500);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve(true);
        });
      });

      if (!exited && child.exitCode === null) {
        kill("SIGKILL");
      }
    }
  };
};

const makeDemoUrl = ({
  view = "week",
  theme = "dark",
  seed = DEFAULT_SEED,
  today = DEFAULT_TODAY,
  update
} = {}) => {
  const params = new URLSearchParams({
    demo: "1",
    view,
    theme,
    seed,
    today
  });
  if (update) {
    params.set("update", update);
  }
  return `${server.baseUrl}/?${params.toString()}`;
};

const installErrorCollectors = (page) => {
  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  return () => {
    assert.deepEqual(
      { consoleErrors, pageErrors },
      { consoleErrors: [], pageErrors: [] },
      "Renderer E2E page emitted runtime errors"
    );
  };
};

const assertHealthyPage = async (page, assertNoRuntimeErrors) => {
  await page.evaluate(() => document.fonts?.ready);
  const health = await page.evaluate(() => ({
    bodyTextLength: document.body.innerText.trim().length,
    hasViteOverlay: document.querySelectorAll("vite-error-overlay").length,
    appShells: document.querySelectorAll(".app-shell").length
  }));

  assert.equal(health.hasViteOverlay, 0, "Vite error overlay should not render");
  assert.equal(health.appShells, 1, "TimeBro app shell should render once");
  assert.ok(health.bodyTextLength > 80, `Expected useful rendered text, got ${health.bodyTextLength} chars`);
  assertNoRuntimeErrors();
};

const waitForDemoReady = async (page, view, theme) => {
  await page.waitForSelector(
    `.app-shell[data-screenshot-ready="true"][data-view="${view}"][data-theme="${theme}"]`,
    { timeout: 10_000 }
  );
};

const waitForView = async (page, view) => {
  await page.waitForSelector(`.app-shell[data-screenshot-ready="true"][data-view="${view}"]`, {
    timeout: 10_000
  });
};

const withDemoPage = async (options, run) => {
  const theme = options.theme ?? "dark";
  const context = await browser.newContext({
    colorScheme: theme,
    deviceScaleFactor: 1,
    viewport: options.viewport ?? { width: 1280, height: 820 }
  });
  const page = await context.newPage();
  const assertNoRuntimeErrors = installErrorCollectors(page);

  try {
    await page.goto(makeDemoUrl(options), { waitUntil: "domcontentloaded" });
    await waitForDemoReady(page, options.view ?? "week", theme);
    await run(page);
    await assertHealthyPage(page, assertNoRuntimeErrors);
  } finally {
    await context.close();
  }
};

const clickNav = async (page, label, view) => {
  await page.getByRole("button", { name: label, exact: true }).click();
  await waitForView(page, view);
};

before(async () => {
  server = await startRenderer();
  browser = await chromium.launch({ headless: process.env.E2E_HEADED !== "1" });
});

after(async () => {
  await browser?.close().catch(() => undefined);
  await server?.stop().catch(() => undefined);
});

test("demo shell navigates every primary view", { timeout: 60_000 }, async () => {
  await withDemoPage({ view: "week" }, async (page) => {
    await page.locator(".week-header").waitFor();
    assert.ok(await page.getByText(/WEEK \d+/).first().isVisible());
    // The week header carries the same billable / "to log" split as the Today hero.
    assert.ok(await page.locator(".week-header .week-split .ts-billable").isVisible());

    await clickNav(page, "TODAY", "today");
    await page.locator(".cal-track").waitFor();
    // The demo seeds a confirmed "Daily Standup" recurring ritual on the current day; it
    // must render as a committed block on the day grid, not just count toward the header.
    await page.locator(".cal-block--recurring", { hasText: "Daily Standup" }).first().waitFor();

    await clickNav(page, "WEEK", "week");
    await page.getByRole("button", { name: /Log time for Wednesday/i }).waitFor();

    await clickNav(page, "MONTH", "month");
    await page.locator(".month-view").waitFor();
    assert.ok(await page.getByText("WEEKS ON TARGET").isVisible());

    await clickNav(page, "REVIEW", "review");
    assert.ok(await page.getByText("REVIEW TIME", { exact: true }).isVisible());

    await clickNav(page, "TICKETS", "tickets");
    assert.ok(await page.getByText("IN PROGRESS · 2").isVisible());

    await clickNav(page, "REPORTS", "reports");
    assert.ok(await page.getByText("BY TICKET").isVisible());

    await clickNav(page, "SETTINGS", "settings");
    assert.ok(await page.getByRole("heading", { name: "Jira connection" }).isVisible());
  });
});

test("week Add Time modal creates, edits, and deletes a local note", { timeout: 60_000 }, async () => {
  await withDemoPage({ view: "week" }, async (page) => {
    await page.getByRole("button", { name: /Log time for Wednesday/i }).click();
    await page.getByRole("dialog", { name: "Log time" }).waitFor();
    await page.getByRole("button", { name: "Personal note", exact: true }).click();

    await page.getByLabel("Personal note title").fill("E2E planning");
    await page.locator(".personal-note-form textarea.note-textarea").fill("Created before the App refactor.");
    await page.getByRole("button", { name: "Save note" }).click();
    await page.getByRole("dialog", { name: /Personal note|Log time/ }).waitFor({ state: "detached" });

    await page.getByText("E2E planning").waitFor();
    assert.ok(await page.getByText("Created before the App refactor.").isVisible());

    await page
      .locator(".day-note-row", { hasText: "E2E planning" })
      .getByRole("button", { name: "Edit personal note" })
      .click();
    await page.getByRole("dialog", { name: "Edit personal note" }).waitFor();
    await page.getByLabel("Personal note title").fill("E2E planning updated");
    await page.locator(".personal-note-form textarea.note-textarea").fill("Updated safely through the modal.");
    await page.getByRole("button", { name: "Save note" }).click();
    await page.getByRole("dialog", { name: "Edit personal note" }).waitFor({ state: "detached" });

    await page.getByText("E2E planning updated").waitFor();
    assert.equal(await page.getByText("Created before the App refactor.").count(), 0);

    await page
      .locator(".day-note-row", { hasText: "E2E planning updated" })
      .getByRole("button", { name: "Edit personal note" })
      .click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog", { name: "Edit personal note" }).waitFor({ state: "detached" });

    assert.equal(await page.getByText("E2E planning updated").count(), 0);
  });
});

test("today calendar creates a local note via the Add Time modal", { timeout: 60_000 }, async () => {
  await withDemoPage({ view: "today" }, async (page) => {
    // Click an empty early-morning slot on the day grid to open the prefilled popup.
    await page.locator(".cal-track").waitFor();
    await page.locator(".cal-track").click({ position: { x: 180, y: 24 } });
    await page.getByRole("dialog", { name: "Log time" }).waitFor();

    await page.getByRole("button", { name: "Personal note", exact: true }).click();
    await page.getByLabel("Personal note title").fill("Today E2E note");
    await page.locator(".personal-note-form textarea.note-textarea").fill("Local entry created from the calendar.");
    await page.getByRole("button", { name: "Save note" }).click();
    await page.getByRole("dialog", { name: /Personal note|Log time/ }).waitFor({ state: "detached" });

    // The saved note renders as a block on the day grid.
    await page.getByText("Today E2E note").waitFor();
  });
});

test("today calendar confirms a pending recurring ritual into a committed block", { timeout: 60_000 }, async () => {
  // Thursday seeds a confirmed daily standup plus an unconfirmed "Weekly Team Sync".
  await withDemoPage({ view: "today", today: "2026-06-18" }, async (page) => {
    await page.locator(".cal-track").waitFor();

    // The pending ritual shows as a dashed suggestion block; the confirmed one is committed.
    const pending = page.locator(".cal-block--recurring-pending", { hasText: "Weekly Team Sync" });
    await pending.waitFor();
    await page.locator(".cal-block--recurring", { hasText: "Daily Standup" }).first().waitFor();

    // Confirming it turns the suggestion into a committed recurring block at the same time.
    await pending.click();
    await page.locator(".cal-block--recurring-pending", { hasText: "Weekly Team Sync" }).waitFor({ state: "detached" });
    await page.locator(".cal-block--recurring", { hasText: "Weekly Team Sync" }).waitFor();
  });
});

test("settings handles theme changes and update release notes", { timeout: 60_000 }, async () => {
  await withDemoPage({ view: "settings", update: "available" }, async (page) => {
    await page.getByRole("button", { name: /Appearance/i }).click();
    await page.getByRole("button", { name: "LIGHT" }).click();
    await page.waitForSelector('.app-shell[data-theme="light"]');
    await page.waitForFunction(() => document.documentElement.classList.contains("theme-light"));

    await page.getByRole("button", { name: "DARK" }).click();
    await page.waitForSelector('.app-shell[data-theme="dark"]');
    await page.waitForFunction(() => document.documentElement.classList.contains("theme-dark"));

    await page.getByRole("button", { name: /About/i }).click();
    assert.ok(await page.getByText("v1.3.0 is available.").isVisible());
    await page.getByRole("button", { name: "Current notes" }).click();
    await page.getByRole("dialog", { name: "Release notes" }).waitFor();
    assert.ok(await page.getByRole("heading", { name: "TimeBro v1.0.0" }).isVisible());
    await page.locator(".release-notes-version-list").getByRole("button", { name: /v1.3.0/ }).click();
    assert.ok(await page.getByRole("heading", { name: "Highlights" }).isVisible());
    assert.ok(await page.locator(".release-notes-image").isVisible());
    await page.getByRole("button", { name: "Done" }).click();
  });
});

test("mobile demo view renders without document overflow", { timeout: 60_000 }, async () => {
  await withDemoPage({ view: "week", theme: "light", viewport: { width: 390, height: 840 } }, async (page) => {
    await page.locator(".week-header").waitFor();
    await clickNav(page, "TICKETS", "tickets");
    await page.locator(".tickets-header .eyebrow").waitFor();

    const overflow = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth
    }));

    const maxScrollWidth = Math.max(overflow.documentScrollWidth, overflow.bodyScrollWidth);
    assert.ok(
      maxScrollWidth <= overflow.innerWidth + 2,
      `Expected no horizontal document overflow, got ${JSON.stringify(overflow)}`
    );
  });
});

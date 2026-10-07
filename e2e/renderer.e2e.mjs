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
  assert.equal(health.appShells, 1, "Yesterlog app shell should render once");
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
    assert.doesNotMatch(await page.locator("body").innerText(), /\bFTDM-\d+\b/);
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

    await clickNav(page, "NOTES", "notes");
    await page.locator(".notes-workspace").waitFor();
    const localOnlyNotice = page.getByText("Local only · never synced to Jira");
    await localOnlyNotice.waitFor({ state: "visible" });
    assert.ok(await localOnlyNotice.isVisible());
    await page.getByRole("button", { name: /^General notes\b/ }).click();
    const scratchpad = page.getByRole("textbox", { name: "General notes scratchpad" });
    await scratchpad.waitFor();
    await scratchpad.fill("");
    await scratchpad.pressSequentially("## ");
    await scratchpad.pressSequentially("Release notes");
    assert.equal(await scratchpad.locator("h2").textContent(), "Release notes");
    await scratchpad.press("End");
    await scratchpad.press("Enter");
    await scratchpad.pressSequentially("* ");
    await scratchpad.pressSequentially("First item");
    assert.equal(await scratchpad.locator("li").textContent(), "First item");

    await scratchpad.evaluate((element) => {
      const heading = element.querySelector("h2");
      if (!heading) throw new Error("Expected Scratchpad heading");
      const range = document.createRange();
      range.selectNodeContents(heading);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
    });
    await page.getByRole("button", { name: "Underline" }).click();
    assert.equal(
      await scratchpad.locator(".notes-rich-underline").textContent(),
      "Release notes"
    );

    await page.getByRole("tab", { name: /Notes & to-dos/ }).click();
    assert.ok(await page.getByRole("textbox", { name: /Add a note to General/ }).isVisible());
    await page.getByRole("tab", { name: "Scratchpad" }).click();
    assert.equal(await scratchpad.locator("h2").textContent(), "Release notes");
    assert.equal(await scratchpad.locator("li").textContent(), "First item");
    assert.equal(
      await scratchpad.locator(".notes-rich-underline").textContent(),
      "Release notes"
    );

    await clickNav(page, "REPORTS", "reports");
    assert.ok(await page.getByText("BY TICKET").isVisible());

    await clickNav(page, "RECAP", "recap");
    await page.locator(".recap-workspace").waitFor();
    assert.ok(await page.getByText("Summarize a week, month, or quarter from your logged activity").isVisible());

    await clickNav(page, "SETTINGS", "settings");
    assert.ok(await page.getByRole("heading", { name: "Jira connection" }).isVisible());
  });
});

test("Recap edits, versions, saves, reopens, exports, and deep-links", { timeout: 60_000 }, async () => {
  await withDemoPage({ view: "recap", viewport: { width: 1440, height: 960 } }, async (page) => {
    await page.locator(".recap-report").waitFor();
    assert.match(await page.evaluate(() => location.hash), /^#\/recap\?/);

    await page.locator(".recap-segments").getByRole("button", { name: "week" }).click();
    await page.locator(".recap-report").waitFor();
    await page.locator(".recap-format-list").getByRole("button", { name: /Manager update/ }).click();
    await page.locator(".recap-detail-buttons").getByRole("button", { name: "Standard" }).click();
    await page.getByRole("button", { name: "Refresh activity" }).click();
    await page.getByRole("option", { name: "Version 2" }).waitFor({ state: "attached" });

    const report = page.locator(".recap-report");
    await report.getByRole("button", { name: "Edit report" }).click();
    await report.getByLabel("Report introduction").fill("Platform delivery and quality remained the main focus of the week.");
    await report.getByRole("button", { name: "Apply edits" }).click();
    assert.ok(await report.getByText("Platform delivery and quality remained the main focus of the week.").isVisible());

    await page.locator(".recap-format-list").getByRole("button", { name: /CV bullets/ }).click();
    await page.locator(".recap-detail-buttons").getByRole("button", { name: "Detailed" }).click();
    const firstTheme = page.locator(".recap-theme").first();
    await firstTheme.getByRole("button", { name: "Add outcome" }).click();
    await firstTheme.getByLabel("What changed because of this work?").fill("Unblocked the release review for the platform team");
    await firstTheme.getByRole("button", { name: "Save outcome" }).click();
    assert.ok(await firstTheme.getByText("Unblocked the release review for the platform team.").isVisible());

    await page.getByRole("button", { name: "Export" }).click();
    assert.ok(await page.getByRole("button", { name: "Copy text" }).isVisible());
    assert.ok(await page.getByRole("button", { name: "Download Markdown" }).isVisible());
    assert.ok(await page.getByRole("button", { name: "Print / Save PDF" }).isVisible());
    await page.getByRole("button", { name: "Export" }).click();

    await page.getByRole("button", { name: "Save to brag doc" }).click();
    await page.locator(".recap-saved-card").filter({ hasText: "Q1 2026" }).click();
    await page.getByRole("button", { name: "Duplicate as draft" }).waitFor();
    assert.match(await page.evaluate(() => location.hash), /saved=/);
    assert.equal(await page.locator(".recap-format-list").getByRole("button", { name: /Manager update/ }).isDisabled(), true);
    await page.getByRole("button", { name: "Back to draft" }).click();
    await page.getByRole("button", { name: "Refresh activity" }).waitFor();
    assert.doesNotMatch(await page.evaluate(() => location.hash), /saved=/);
    assert.ok(await page.locator(".recap-format-list button.active", { hasText: "CV bullets" }).isVisible());
    assert.ok(await page.locator(".recap-segments button.active", { hasText: "week" }).isVisible());
    assert.ok(await page.locator(".recap-detail-buttons button.active", { hasText: "Detailed" }).isVisible());

    await clickNav(page, "WEEK", "week");
    await page.locator(".calendar-recap-marker").click();
    await waitForView(page, "recap");
    await page.getByRole("button", { name: "Duplicate as draft" }).waitFor();
    assert.match(await page.evaluate(() => location.hash), /saved=/);
    await page.getByRole("button", { name: "Back to draft" }).click();
    await page.getByRole("button", { name: "Refresh activity" }).waitFor();
    assert.doesNotMatch(await page.evaluate(() => location.hash), /saved=/);

    await page.evaluate(() => { location.hash = "#/recap?period=week&interval=2026-06-15&format=cv&detail=headline"; });
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForDemoReady(page, "recap", "dark");
    await page.getByRole("heading", { name: "Selected accomplishment candidates" }).waitFor();
    assert.ok(await page.locator(".recap-format-list button.active", { hasText: "CV bullets" }).isVisible());
  });
});

test("week switches between Summary and Timeline and remembers the choice", { timeout: 60_000 }, async () => {
  await withDemoPage({ view: "week" }, async (page) => {
    await page.getByRole("button", { name: "TIMELINE", exact: true }).click();
    await page.locator(".week-timeline").waitFor();
    assert.equal(await page.locator(".week-timeline .cal-track").count(), 4);
    assert.ok(await page.getByText("drag a ticket onto the timeline to log time").isVisible());

    await clickNav(page, "TODAY", "today");
    await clickNav(page, "WEEK", "week");
    await page.locator(".week-timeline").waitFor();

    await page.getByRole("button", { name: "SUMMARY", exact: true }).click();
    await page.locator(".week-grid").waitFor();
    assert.equal(await page.locator(".week-timeline").count(), 0);
  });
});

test("week Add Time modal creates, edits, and deletes a local note", { timeout: 60_000 }, async () => {
  await withDemoPage({ view: "week" }, async (page) => {
    await page.getByRole("button", { name: /Log time for Wednesday/i }).click();
    await page.getByRole("dialog", { name: "Log time" }).waitFor();
    await page.getByRole("region", { name: "Visual time range editor" }).waitFor();
    assert.ok(await page.locator(".add-time-modal-content.has-side-timeline").isVisible());

    const modeTabsBox = await page.locator(".modal-mode-tabs button").first().boundingBox();
    const timelineBox = await page.locator(".add-time-timeline").boundingBox();
    assert.ok(modeTabsBox && timelineBox);
    assert.ok(
      Math.abs(modeTabsBox.y - timelineBox.y) <= 1,
      "timeline should begin alongside the modal mode tabs",
    );

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

for (const view of ["today", "week"]) {
  test(`${view} drag-created slot survives entry-tab changes and saves the selected interval`, { timeout: 60_000 }, async () => {
    await withDemoPage({ view }, async (page) => {
      if (view === "week") {
        await page.getByRole("button", { name: "TIMELINE", exact: true }).click();
      }
      const track = page.locator('.cal-track[title="Drag an empty slot to log time"]').first();
      await track.waitFor();
      const scroll = page.locator(view === "week" ? ".week-timeline-scroll" : ".cal-scroll").first();
      await scroll.evaluate((element) => { element.scrollTop = 0; });
      // Use the first, empty hours of the actual day grid; one hour spans adjacent grid lines.
      const lines = track.locator(".cal-line");
      const first = await lines.nth(0).boundingBox();
      const second = await lines.nth(1).boundingBox();
      const box = await track.boundingBox();
      assert.ok(first && second && box);
      const hourHeight = second.y - first.y;
      const x = box.x + box.width / 2;
      await page.mouse.move(x, box.y + hourHeight / 2);
      await page.mouse.down();
      await page.mouse.move(x, box.y + hourHeight * 1.75, { steps: 10 });
      await page.mouse.up();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      assert.equal(await dialog.locator('input[type="time"]').inputValue(), "00:30");
      assert.equal(await dialog.locator(".modal-duration").innerText(), "1h 15m");
      await dialog.locator("textarea").fill("Keep the Jira draft");
      await dialog.getByRole("button", { name: "Personal note", exact: true }).click();
      assert.equal(await dialog.getByLabel("Exact personal note duration in minutes").inputValue(), "75");
      await dialog.getByLabel("Personal note title").fill(`${view} slot regression`);
      await dialog.locator("textarea").fill("Keep the private draft");
      await dialog.getByRole("radio", { name: "Meeting", exact: true }).click();
      await dialog.getByRole("button", { name: "Recurring", exact: true }).click();
      await dialog.getByRole("button", { name: "Log to ticket", exact: true }).click();
      assert.equal(await dialog.locator("textarea").inputValue(), "Keep the Jira draft");
      assert.equal(await dialog.locator(".modal-duration").innerText(), "1h 15m");
      await dialog.getByRole("button", { name: "Personal note", exact: true }).click();
      assert.equal(await dialog.locator('input[type="time"]').inputValue(), "00:30");
      assert.equal(await dialog.locator("textarea").inputValue(), "Keep the private draft");
      assert.equal(await dialog.getByLabel("Exact personal note duration in minutes").inputValue(), "75");
      await dialog.getByRole("button", { name: "Save note", exact: true }).click();
      await dialog.waitFor({ state: "detached" });
      const savedNote = page.locator(".cal-block", { hasText: `${view} slot regression` });
      await savedNote.waitFor();
      assert.match(await savedNote.innerText(), /0:30–1:45/);
    });
  });
}

test("Reconstruction prefill survives tabs with its ticket, comment, and duration", { timeout: 60_000 }, async () => {
  await withDemoPage({ view: "recon", today: "2026-06-18" }, async (page) => {
    await page.getByRole("button", { name: "Place", exact: true }).first().click();
    await page.locator(".recon-send-btn").click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    const start = await dialog.locator('input[type="time"]').inputValue();
    const duration = await dialog.locator(".modal-duration").innerText();
    const comment = await dialog.locator("textarea").inputValue();
    const selectedTicket = await dialog.locator(".modal-ticket").innerText();
    assert.ok(comment.length > 0);
    assert.match(selectedTicket, /Interrupt-safe queue draining/);
    assert.ok(await dialog.getByRole("button", { name: /Log .* to YLOG-410/ }).isVisible());
    await dialog.getByRole("button", { name: "Personal note", exact: true }).click();
    assert.equal(await dialog.locator(".personal-note-time").innerText(), duration);
    assert.equal(await dialog.locator('input[type="time"]').inputValue(), start);
    await dialog.getByRole("button", { name: "Recurring", exact: true }).click();
    await dialog.getByLabel("Exact recurring duration in minutes").fill("40");
    await dialog.locator("textarea").fill("Recurring draft from Reconstruction");
    await dialog.getByRole("button", { name: "Log to ticket", exact: true }).click();
    assert.equal(await dialog.locator(".modal-duration").innerText(), duration);
    assert.equal(await dialog.locator('input[type="time"]').inputValue(), start);
    assert.equal(await dialog.locator("textarea").inputValue(), comment);
    assert.equal(await dialog.locator(".modal-ticket").innerText(), selectedTicket);
    await dialog.getByRole("button", { name: "Recurring", exact: true }).click();
    assert.equal(await dialog.getByLabel("Exact recurring duration in minutes").inputValue(), "40");
    assert.equal(await dialog.locator("textarea").inputValue(), "Recurring draft from Reconstruction");
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
    assert.ok(await page.getByRole("heading", { name: "Yesterlog v1.0.0" }).isVisible());
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

    await clickNav(page, "NOTES", "notes");
    await page.getByRole("button", { name: "Expand notes sidebar" }).click();
    await page.getByRole("button", { name: /^General notes\b/ }).click();
    await page.getByRole("textbox", { name: "General notes scratchpad" }).waitFor();

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


test("PR analytics filters repositories and authors, drills into periods, and groups by month", { timeout: 60_000 }, async () => {
  await withDemoPage({ view: "reports" }, async (page) => {
    await page.getByRole("tab", { name: "PR analytics", exact: true }).click();
    await page.getByRole("heading", { name: "Pull request analytics", exact: true }).waitFor();
    const created = () => page.locator(".pa-kpis button").first().locator("strong").innerText().then(Number);
    const mine = await created();
    await page.getByRole("button", { name: "All", exact: true }).click();
    assert.ok(await created() > mine, "All includes other authors");
    await page.getByRole("combobox", { name: "Repository", exact: true }).selectOption("auth");
    assert.ok(await created() < mine, "One repository narrows the pooled cohort");
    await page.getByRole("button", { name: "Month", exact: true }).click();
    assert.ok(await page.locator(".pa-bars button").count() < 12);
    const period = page.locator(".pa-bars button").first();
    const count = Number((await period.getAttribute("aria-label")).match(/(\d+) created/)[1]);
    await period.click();
    assert.equal(Number(await page.locator(".pa-register h2 .pa-badge").innerText()), count);
    await page.locator(".pa-pr-title").first().click();
    assert.ok(await page.locator(".pa-detail").isVisible());
    await page.getByRole("button", { name: "Clear period" }).click();
    await page.getByRole("combobox", { name: "Trend metric", exact: true }).selectOption("comments");
    await page.locator(".pa-bars button").first().click();
    assert.equal(await page.getByRole("combobox", { name: "PR cohort", exact: true }).inputValue(), "comments");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  });
});


test("PR analytics shows chart values and searches cached PRs without changing totals", { timeout: 60_000 }, async () => {
  await withDemoPage({ view: "reports" }, async (page) => {
    await page.getByRole("tab", { name: "PR analytics", exact: true }).click();
    const bar = page.locator(".pa-bars button").first();
    const label = await bar.getAttribute("aria-label");
    await bar.hover();
    const tooltip = page.getByRole("tooltip");
    await tooltip.waitFor();
    const values = await tooltip.locator("b").allTextContents();
    assert.deepEqual(values, label.match(/(\d+) created, (\d+) merged/).slice(1));
    await bar.focus();
    await page.keyboard.press("Escape");
    assert.equal(await tooltip.count(), 0);
    await page.keyboard.press("Tab");
    await tooltip.waitFor();
    const totals = await page.locator(".pa-kpis").innerText();
    const originalCount = await page.locator(".pa-register h2 .pa-badge").innerText();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const title = await page.locator(".pa-pr-title").first().evaluate(el => el.firstChild.textContent);
    const id = (await page.locator(".pa-pr-title small").first().innerText()).match(/#(\d+)/)[1];
    const search = page.getByRole("searchbox", { name: "Search pull requests" });
    await search.fill(`  ${title.toUpperCase()}  `);
    assert.ok(await page.locator(".pa-pr-title").count() > 0);
    for (const text of await page.locator(".pa-pr-title").allTextContents()) {
      assert.ok(text.toLowerCase().includes(title.toLowerCase()));
    }
    assert.equal(await page.getByRole("button", { name: "Previous", exact: true }).isDisabled(), true);
    await search.fill(`#${id}`);
    assert.ok(await page.locator(".pa-pr-title").count() > 0);
    for (const text of await page.locator(".pa-pr-title small").allTextContents()) assert.ok(text.includes(`#${id}`));
    await page.locator(".pa-pr-title").first().click();
    assert.ok(await page.locator(".pa-detail").isVisible());
    await search.fill("no-such-synthetic-pull-request");
    assert.equal(await page.locator(".pa-pr-title").count(), 0);
    assert.ok(await page.locator(".pa-table-empty").isVisible());
    assert.equal(await page.locator(".pa-kpis").innerText(), totals);
    await page.getByRole("button", { name: "Clear PR search" }).click();
    assert.equal(await page.locator(".pa-register h2 .pa-badge").innerText(), originalCount);
    await page.setViewportSize({ width: 390, height: 844 });
    await bar.hover();
    await tooltip.waitFor();
    const box = await tooltip.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390, "tooltip fits narrow screen");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  });
});

test("PR analytics supports custom dates, repository comparison and explicit inline analysis", { timeout: 60_000 }, async () => {
  await withDemoPage({ view: "reports" }, async page => {
    await page.getByRole("tab", { name: "PR analytics", exact: true }).click();
    const ai = page.getByRole("region", { name: "AI review flow" });
    assert.equal(await ai.locator(".pa-ai-result").count(), 0);
    await ai.getByRole("button", { name: "Analyze review flow", exact: true }).click();
    await ai.locator(".pa-ai-result").waitFor();
    await ai.getByRole("button", { name: /Inspect .* supporting PRs/ }).first().click();
    assert.ok(await ai.locator(".pa-ai-evidence").isVisible());
    await ai.getByRole("button", { name: "Collapse", exact: true }).click();
    assert.equal(await ai.locator(".pa-ai-result").count(), 0);
    await page.getByRole("combobox", { name: "Repository", exact: true }).selectOption("explorer-web");
    assert.equal(await ai.locator(".pa-ai-result").count(), 0, "scope changes clear previous analysis");
    await page.getByRole("combobox", { name: "Compare with", exact: true }).selectOption("auth");
    const comparison = page.getByRole("region", { name: "Repository comparison" });
    assert.ok(await comparison.isVisible());
    assert.deepEqual(await comparison.locator("thead th").allTextContents(), ["Metric", "explorer-web", "auth"]);
    await page.getByRole("combobox", { name: "Period", exact: true }).selectOption("custom");
    await page.getByLabel("From", { exact: true }).fill("2026-06-01");
    await page.getByLabel("To", { exact: true }).fill("2026-06-03");
    await page.getByRole("button", { name: "Apply dates", exact: true }).click();
    assert.ok((await page.locator(".pa-context").innerText()).includes("1 Jun 2026 – 3 Jun 2026"));
    assert.ok((await ai.innerText()).includes("At least 5"));
    assert.equal(await ai.getByRole("button", { name: "Analyze review flow", exact: true }).isDisabled(), true);
    await page.locator(".pa-date-popover summary").click();
    await page.getByLabel("From", { exact: true }).fill("2026-06-04");
    assert.ok(await page.getByRole("button", { name: "Apply dates", exact: true }).isDisabled());
    await page.getByLabel("From", { exact: true }).fill("2026-06-02");
    await page.getByLabel("To", { exact: true }).fill("2026-06-02");
    await page.getByRole("button", { name: "Apply dates", exact: true }).click();
    assert.ok((await page.locator(".pa-context").innerText()).includes("2 Jun 2026 – 2 Jun 2026"));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(".pa-date-popover summary").click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.keyboard.press("Escape");
    await page.getByRole("combobox", { name: "Compare with", exact: true }).selectOption("");
    assert.equal(await comparison.count(), 0);
  });
});

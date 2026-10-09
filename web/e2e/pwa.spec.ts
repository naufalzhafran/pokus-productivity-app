import { test, expect, type Page, type BrowserContext, type APIRequestContext } from "@playwright/test";
import PocketBase from "pocketbase";
import axe from "axe-core";

const endpoint = "http://127.0.0.1:8099";
async function tab(page: Page, name: string) {
  const navigation = page.getByRole("navigation", { name: "Primary navigation" }).filter({ visible: true });
  const link = navigation.getByRole("link", { name, exact: name !== "Timer" });
  if (await link.count()) { await link.click(); return; }
  // Phones reach Calendar, Habits, Knowledge, and Profile through More.
  await navigation.getByRole("link", { name: /^More/ }).click();
  await page.getByRole("navigation", { name: "More", exact: true }).getByRole("link", { name, exact: true }).click();
}
// The seeded task has no project, so it lives under the "No project" card.
async function openTasks(page: Page) {
  await tab(page, "Projects");
  await page.getByRole("link", { name: /No project/ }).click();
}
async function setOffline(page: Page, context: BrowserContext, request: APIRequestContext, browserName: string, offline: boolean) {
  if (browserName !== "webkit") { await context.setOffline(offline); return; }
  // Playwright issue #42775: its WebKit offline switch rejects even cached SW responses.
  // Make the origin genuinely unavailable and block API requests instead.
  await request.get(`/__pokus_test_network?offline=${offline}`);
  if (offline) await context.route(`${endpoint}/**`, (route) => route.abort());
  else await context.unroute(`${endpoint}/**`);
  await page.evaluate((value) => {
    localStorage.setItem("pokus-test-offline", String(value));
    window.dispatchEvent(new Event(value ? "offline" : "online"));
  }, offline);
}
test.afterEach(async ({ request }) => { await request.get("/__pokus_test_network?offline=false&version=0"); });
test.beforeEach(async ({ page, browserName }) => {
  if (browserName === "webkit") await page.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => localStorage.getItem("pokus-test-offline") !== "true" });
  });
  // Never allow this suite to contact the live backend, even with an incorrect build.
  await page.route("https://pb1.madebynz.xyz/**", (route) => route.abort());
  const admin = new PocketBase(endpoint);
  await admin.collection("_superusers").authWithPassword("pokus-test@example.com", "Pokus-local-test-2026!");
  const user = await admin.collection("users").create({ email: `browser-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, password: "Pokus-browser-test!", passwordConfirm: "Pokus-browser-test!", name: "Pokus test", verified: true });
  const client = new PocketBase(endpoint);
  const auth = await client.collection("users").authWithPassword(user.email, "Pokus-browser-test!");
  await client.collection("tasks").create({ title: "Plan the next release", owner: user.id, priority: "high", focusedSeconds: 0 });
  await page.addInitScript(({ token, record }) => {
    if (!localStorage.getItem("pocketbase_auth")) localStorage.setItem("pocketbase_auth", JSON.stringify({ token, record }));
  }, { token: auth.token, record: auth.record });
});

test("phone controls, sheets, themes, and responsive layouts", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const start = page.getByRole("button", { name: "Start focus", exact: true });
  await expect(start).toBeVisible();
  const bounds = await start.boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThan(785);
  await page.screenshot({ path: testInfo.outputPath("timer-light.png"), fullPage: true, animations: "disabled" });
  await openTasks(page);
  await expect(page.getByRole("button", { name: "Open details for Plan the next release" })).toBeVisible();
  await page.getByRole("button", { name: "Filters (0)" }).click();
  await expect(page.getByRole("dialog", { name: "Filter tasks" })).toBeVisible();
  await page.getByRole("button", { name: "Show tasks" }).click();
  await page.getByRole("button", { name: "New task", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New task" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Task", exact: true }).fill("Write the launch notes");
  await dialog.getByRole("button", { name: "Add or edit link" }).click();
  await dialog.getByRole("textbox", { name: "Link URL" }).fill("https://example.com/notes");
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("task-sheet.png"), fullPage: true, animations: "disabled" });
  const sheetBounds = await dialog.boundingBox();
  expect(sheetBounds!.x).toBeGreaterThanOrEqual(0);
  expect(sheetBounds!.width).toBeGreaterThan(390);
  await dialog.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open details for Write the launch notes" })).toBeVisible();
  await tab(page, "Profile");
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await tab(page, "Timer");
  await expect(page.getByRole("link", { name: "Timer", exact: true }).filter({ visible: true })).toHaveAttribute("aria-current", "page");
  await page.screenshot({ path: testInfo.outputPath("timer-dark.png"), fullPage: true, animations: "disabled" });
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => {
    const result = await (window as unknown as { axe: typeof import("axe-core") }).axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
    return result.violations.map((violation) => ({ id: violation.id, targets: violation.nodes.map((node) => node.target) }));
  });
  expect(violations).toEqual([]);
  for (const width of [320, 375, 402, 430, 874, 1280]) {
    await page.setViewportSize({ width, height: width === 874 ? 402 : 874 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("an update waits for a paused session and an open editor", async ({ page, request }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect(page.getByRole("button", { name: "Start focus" })).toBeVisible();
  await page.getByRole("button", { name: "Start focus" }).click();
  await page.getByRole("button", { name: "Pause Pomodoro timer" }).click();
  await request.get("/__pokus_test_network?version=2");
  await page.evaluate(async () => { await (await navigator.serviceWorker.ready).update(); });
  const update = page.getByRole("button", { name: "Update app" });
  await expect(update).toBeDisabled();
  await page.getByRole("button", { name: "Stop Pomodoro timer", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Discard this focus session", exact: true }).click();
  await expect(update).toBeEnabled();
  await openTasks(page);
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await expect(page.getByRole("button", { name: "Update app", includeHidden: true })).toBeDisabled();
  await page.getByRole("dialog", { name: "New task" }).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(update).toBeEnabled();
  await update.click();
  await expect(page.getByRole("button", { name: "New task", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Update app" })).toHaveCount(0);
});

test("offline relaunch restores a paused timer and opens precached routes", async ({ page, context, request, browserName }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start focus" })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await openTasks(page);
  await expect(page.getByRole("button", { name: "Open details for Plan the next release" })).toBeVisible();
  await tab(page, "Timer");
  await page.getByRole("button", { name: "Start focus" }).click();
  await page.getByRole("button", { name: "Pause Pomodoro timer" }).click();
  await expect(page.getByRole("button", { name: "Resume Pomodoro timer" })).toBeEnabled();
  await setOffline(page, context, request, browserName, true);
  await page.reload();
  await expect(page.getByRole("button", { name: "Resume Pomodoro timer" })).toBeVisible();
  await openTasks(page);
  await expect(page.getByRole("button", { name: "Open details for Plan the next release" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New task", exact: true })).toBeDisabled();
  await tab(page, "Profile");
  await expect(page.getByText("Make Pokus yours")).toBeVisible();
  await expect(page.getByRole("button", { name: "Test sound" })).toBeVisible();
  await setOffline(page, context, request, browserName, false);
});

test("offline completion is saved and synced once after reconnecting", async ({ page, context, request, browserName }) => {
  await page.goto("/#projects/none");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.getByRole("button", { name: "Open details for Plan the next release" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Focus on Plan the next release" }).click();
  await page.getByRole("button", { name: "Start focus" }).click();
  await expect(page.getByRole("button", { name: "Pause Pomodoro timer" })).toBeVisible();
  await setOffline(page, context, request, browserName, true);
  await page.evaluate(async () => {
    const auth = JSON.parse(localStorage.getItem("pocketbase_auth")!);
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("pokus-offline", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result; const tx = db.transaction("timers", "readwrite"); const store = tx.objectStore("timers");
        const read = store.get(auth.record.id);
        read.onsuccess = () => { const value = read.result; value.current.lastTick = Date.now() - 1501_000; value.operations = []; store.put(value, auth.record.id); };
        tx.oncomplete = () => { db.close(); resolve(); };
      };
    });
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Session complete", exact: true })).toBeVisible();
  await expect(page.getByText(/Saved on this device. Waiting to sync/)).toBeVisible();
  await setOffline(page, context, request, browserName, false);
  await expect(page.getByText(/Saved to your history/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Session complete", exact: true })).toBeVisible();
  await tab(page, "Profile");
  await expect(page.getByText("25m", { exact: true }).first()).toBeVisible();
});

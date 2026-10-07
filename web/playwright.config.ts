import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["iPhone 13 Pro"], defaultBrowserType: "chromium", viewport: { width: 402, height: 874 } } },
    { name: "webkit", use: { ...devices["iPhone 13 Pro"], viewport: { width: 402, height: 874 } } },
  ],
  webServer: { command: "node e2e/serve.mjs", url: "http://127.0.0.1:4173", reuseExistingServer: false },
});

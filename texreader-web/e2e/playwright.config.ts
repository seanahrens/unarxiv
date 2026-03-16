import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: 1,
  workers: 4,
  fullyParallel: true,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: process.env.TEST_BASE_URL || "https://unarxiv.org",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "fast",
      testIgnore: /11-narration-gen/,
    },
    {
      name: "narration",
      testMatch: /11-narration-gen/,
      dependencies: ["fast"],
    },
  ],
  globalSetup: "./helpers/global-setup.ts",
});

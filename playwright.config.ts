import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright Configuration for Golf Society Hub
 * 
 * Usage:
 *   npx playwright test                    # Run all tests
 *   npx playwright test --headed           # Run with browser visible
 *   npx playwright test tests/smoke.spec.ts # Run specific test
 */

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  
  use: {
    // Base URL for tests - default to local Expo web server
    baseURL: process.env.TEST_BASE_URL || "http://localhost:8081",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Web server to run before tests (Expo web)
  webServer: process.env.TEST_BASE_URL
    ? undefined
    : {
        command: "npx expo start --web --port 8081",
        url: "http://localhost:8081",
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000, // Expo can be slow to start
      },
});

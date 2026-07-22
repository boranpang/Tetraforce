import { defineConfig, devices } from "@playwright/test";

const localChromeChannel = process.env.CI ? undefined : "chrome";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    channel: localChromeChannel,
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/en",
    reuseExistingServer: false,
    env: {
      TETRAFORCE_GUEST_STATE_SECRET:
        "playwright-only-secret-with-at-least-32-characters",
      TETRAFORCE_GUEST_ALLOCATION_RULES: "[]"
    }
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } }
    },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        channel: localChromeChannel,
        viewport: { width: 390, height: 844 }
      }
    }
  ]
});

import { defineConfig, devices } from "@playwright/test";

const localChromeChannel = process.env.CI ? undefined : "chrome";
const testPort = process.env.TETRAFORCE_E2E_PORT ?? "3100";
const testBaseUrl = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: testBaseUrl,
    channel: localChromeChannel,
    trace: "retain-on-failure"
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${testPort}`,
    url: `${testBaseUrl}/en`,
    reuseExistingServer: false,
    env: {
      TETRAFORCE_GUEST_STATE_SECRET:
        "playwright-only-secret-with-at-least-32-characters",
      TETRAFORCE_GUEST_ALLOCATION_RULES: "[]",
      TETRAFORCE_NEXT_DIST_DIR: ".next-playwright",
      TETRAFORCE_SUPPORT_EMAIL: "support@tetraforce.example"
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

import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for HoopUp MVP
 * Supports Demo projects (default) and Connected API project (via npm run e2e:connected).
 */
const isConnected = process.env.CONNECTED_E2E === '1';

export default defineConfig({
  testDir: isConnected ? './tests/connected-api' : './tests',
  testIgnore: isConnected ? [] : ['**/connected-api/**'],
  fullyParallel: false, // Ensure sequential flow for multi-tab collaboration tests
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Single worker avoids database/mock session state races
  reporter: isConnected
    ? [
        ['list'],
        ['json', { outputFile: 'docs/qa/test-results-connected.json' }],
      ]
    : [
        ['list'],
        ['html', { outputFolder: 'docs/qa/playwright-report', open: 'never' }],
        ['json', { outputFile: 'docs/qa/test-results.json' }],
      ],
  use: {
    baseURL: isConnected ? 'http://localhost:5199' : (process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:5173'),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: isConnected
    ? [
        {
          name: 'Connected API',
          use: {
            viewport: { width: 360, height: 800 },
            isMobile: true,
            hasTouch: true,
            userAgent:
              'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
          },
        },
      ]
    : [
        {
          name: 'Mobile Small Android (360x800)',
          use: {
            viewport: { width: 360, height: 800 },
            isMobile: true,
            hasTouch: true,
            userAgent:
              'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
          },
        },
        {
          name: 'Mobile iPhone (390x844)',
          use: {
            viewport: { width: 390, height: 844 },
            isMobile: true,
            hasTouch: true,
            userAgent:
              'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
          },
        },
        {
          name: 'Desktop Chromium',
          use: {
            ...devices['Desktop Chrome'],
            viewport: { width: 1280, height: 800 },
          },
        },
      ],

  /* Run local dev server before starting tests */
  webServer: isConnected
    ? {
        command: 'node scripts/start-connected-env.mjs',
        url: 'http://localhost:5199',
        reuseExistingServer: false,
        timeout: 60000,
      }
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
      },
});

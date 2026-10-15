import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:4173', headless: true },
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 4173', port: 4173, reuseExistingServer: !process.env.CI },
  projects: [{ name: 'chromium', use: { browserName: 'chromium',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {} } }],
});

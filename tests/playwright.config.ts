import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3000?test=1',
    headless: true,
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    cwd: '..',
  },
});

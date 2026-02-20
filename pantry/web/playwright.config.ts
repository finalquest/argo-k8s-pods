import { defineConfig, devices } from '@playwright/test';

const headless = process.env.PLAYWRIGHT_HEADLESS !== 'false';
const slowMo = Number(process.env.PW_SLOWMO ?? '0');
const videoMode =
  (process.env.PLAYWRIGHT_VIDEO as 'on' | 'off' | 'retain-on-failure' | 'retry-with-video') ??
  'on';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173',
    headless,
    launchOptions: {
      slowMo,
    },
    video: videoMode,
    trace: 'on-first-retry',
  },
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev -- --host 127.0.0.1 --port 4173',
        reuseExistingServer: !process.env.CI,
        env: {
          VITE_API_BASE_URL: process.env.VITE_API_BASE_URL ?? 'http://localhost:3000',
        },
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

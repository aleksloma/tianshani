// Playwright E2E: სერვერი mock რეჟიმში ცალკე პორტზე, ცალკე ბაზით.
import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';

// ყოველ გაშვებაზე სუფთა ბაზა — მხოლოდ მთავარ პროცესში (worker-ები კონფიგს თავიდან კითხულობენ, როცა სერვერი უკვე მუშაობს)
if (!process.env.TEST_WORKER_INDEX) {
  try { fs.rmSync('test-results/e2e', { recursive: true, force: true }); } catch { /* დაკავებულია — არა უშავს */ }
  fs.mkdirSync('test-results/e2e', { recursive: true });
}

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/playwright',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e-results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:3999',
    ...devices['Desktop Chrome'],
    viewport: { width: 1366, height: 860 },
    locale: 'ka-GE',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Round 3 §5/§6: ვიწრო ეკრანები რეგულარულ მატრიცაშია — mobile.spec.js ეშვება ტელეფონზე (375×812) და პლანშეტზე (700×900)
  projects: [
    { name: 'desktop', testIgnore: /mobile\.spec\.js$/ },
    { name: 'phone-375', testMatch: /mobile\.spec\.js$/, use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
    { name: 'tablet-700', testMatch: /mobile\.spec\.js$/, use: { viewport: { width: 700, height: 900 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'node src/server.js',
    url: 'http://127.0.0.1:3999/api/health',
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      SETTINGS_PATH: 'tests/e2e/settings.e2e.json',
      PORT: '3999',
      HOST: '127.0.0.1',
      DB_PATH: 'test-results/e2e/e2e.db',
      GEMINI_MOCK: '1',
      MOCK_DELAY_MS: '8',
    },
  },
});

import { test as base, expect } from '@playwright/test';

export * from '@playwright/test';

export const test = base.extend<{ mapImageWarnings: void }>({
  mapImageWarnings: [async ({ page }, use) => {
    const missing: string[] = [];
    page.on('console', message => {
      if (/Image .*could not be loaded/i.test(message.text())) {
        missing.push(message.text());
        console.warn(`MAP6D missing sprite: ${message.text()}`);
      }
    });
    await use();
    expect(missing, 'No missing sprite image warnings').toEqual([]);
  }, { auto: true }],
});

import { test as base } from '@playwright/test';

export * from '@playwright/test';

// Legacy Leaflet coverage explicitly selects its engine before any navigation.
// localStorage survives specs that replace the entire runtime config object.
export const test = base.extend<{ leafletEngine: void }>({
  leafletEngine: [async ({ context }, use) => {
    await context.addInitScript(() => localStorage.setItem('VITE_MAP_ENGINE', 'leaflet'));
    await use();
  }, { auto: true }],
});

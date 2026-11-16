import { test, expect } from '../helpers/glFixture';

test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } });

test('MAP6D no engine flag defaults to MapLibre with drawing buffer off', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('VITE_MAP_ENGINE');
    Object.assign(window, { __HOOPUP_CONFIG__: { VITE_MAP_TILES: 'off', VITE_PLACES: 'off' } });
  });
  await page.goto('/courts?view=map');
  await expect(page.getByTestId('courts-map')).toHaveAttribute('data-map-engine', 'maplibre');
  await expect(page.getByTestId('courts-map')).toHaveAttribute('data-ready', 'true');
  expect(await page.evaluate(async () => {
    const { getEffectiveMapEnv } = await import('/src/features/discovery/mapConfig.ts');
    return getEffectiveMapEnv().VITE_MAP_ENGINE;
  })).toBeUndefined();
  expect(await page.locator('.maplibregl-canvas').evaluate(canvas =>
    (canvas as HTMLCanvasElement).getContext('webgl2')!.getContextAttributes()!.preserveDrawingBuffer)).toBe(false);
  await expect(page.getByTestId('court-cluster').first()).toBeVisible();
});

for (const source of ['runtime', 'storage']) test(`MAP6D Leaflet remains selectable through ${source}`, async ({ page }) => {
  await page.addInitScript(source => {
    Object.assign(window, { __HOOPUP_CONFIG__: {
      VITE_MAP_TILES: 'off', ...(source === 'runtime' ? { VITE_MAP_ENGINE: 'leaflet' } : {}),
    } });
    if (source === 'storage') localStorage.setItem('VITE_MAP_ENGINE', 'leaflet');
  }, source);
  await page.goto('/courts?view=map');
  await expect(page.locator('[data-testid="courts-map"].leaflet-container')).toBeVisible();
  await expect(page.getByTestId('courts-map')).toHaveAttribute('data-pin-total', '151');
  await expect(page.locator('.marker-cluster').first()).toBeVisible();
  expect(Number(await page.locator('.marker-cluster').first().textContent())).toBeGreaterThan(1);
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(0);
});

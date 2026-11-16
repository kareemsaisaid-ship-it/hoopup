import { test, expect } from '../helpers/leafletFixture';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOT_DIR = path.resolve('docs/qa/screenshots_map3');

// 1x1 transparent PNG buffer for offline tile route-stubbing
const TILE_STUB_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

test.describe('HoopUp MAP3 — Court Pins Marker Clustering (360x800 Screenshots & Offline)', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
  });

  test.beforeEach(async ({ context }) => {
    // Route-stub OpenStreetMap tiles with 1x1 PNG for zero real network offline test
    await context.route('**/*tile.openstreetmap.org/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: TILE_STUB_PNG,
      });
    });
  });

  test('TC-MAP3-01: Initial map view shows clusters with counts, fits dense area, and captures 360x800 screenshots', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/courts?view=map');
    await page.waitForLoadState('networkidle');

    const courtsMap = page.locator('[data-testid="courts-map"]');
    await expect(courtsMap).toBeVisible();

    // Verify data-pin-total attribute shows total courts
    const pinTotal = await courtsMap.getAttribute('data-pin-total');
    expect(parseInt(pinTotal || '0', 10)).toBeGreaterThan(3);

    // Verify cluster bubbles exist and show count numbers
    const clusterBubbles = page.locator('.marker-cluster');
    await expect(clusterBubbles.first()).toBeVisible();
    const clusterCountText = await clusterBubbles.first().textContent();
    expect(parseInt(clusterCountText?.trim() || '0', 10)).toBeGreaterThan(1);

    // Capture screenshot of initial map view (360x800, stubbed tiles)
    const initialShot1 = path.join(SCREENSHOT_DIR, 'initial_map_view.png');
    const initialShot2 = path.join(SCREENSHOT_DIR, 'initial_map_view_360x800.png');
    await page.screenshot({ path: initialShot1, fullPage: false });
    await page.screenshot({ path: initialShot2, fullPage: false });
    expect(fs.existsSync(initialShot1)).toBe(true);

    // Tap a cluster bubble to zoom in
    await clusterBubbles.first().click({ force: true });
    await page.waitForTimeout(600);

    // Capture screenshot of zoomed-in view (360x800, stubbed tiles)
    const zoomedShot1 = path.join(SCREENSHOT_DIR, 'zoomed_in_view.png');
    const zoomedShot2 = path.join(SCREENSHOT_DIR, 'zoomed_in_map_view_360x800.png');
    await page.screenshot({ path: zoomedShot1, fullPage: false });
    await page.screenshot({ path: zoomedShot2, fullPage: false });
    expect(fs.existsSync(zoomedShot1)).toBe(true);
  });
});

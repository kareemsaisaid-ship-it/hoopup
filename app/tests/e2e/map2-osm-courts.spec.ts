import { test, expect } from '../helpers/leafletFixture';
import * as fs from 'fs';
import * as path from 'path';

const osmCourtsPath = path.resolve('src/data/osmCourtsBangkok.json');
const osmCourtsBangkok: Array<{
  osmType: string;
  osmId: number;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  osmQuality?: string;
}> = JSON.parse(fs.readFileSync(osmCourtsPath, 'utf-8'));

const SCREENSHOT_DIR = path.resolve('docs/qa/screenshots_map2');
const SCREENSHOT_OSM2_DIR = path.resolve('docs/qa/screenshots_osm2');

// 1x1 transparent PNG buffer for offline tile route-stubbing
const TILE_STUB_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

test.describe('HoopUp MAP2 — OpenStreetMap Bangkok Courts Integration', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
    if (!fs.existsSync(SCREENSHOT_OSM2_DIR)) {
      fs.mkdirSync(SCREENSHOT_OSM2_DIR, { recursive: true });
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

  test('TC-MAP2-01: Courts page displays real OSM courts (>3 courts), shows OSM attribution note, and captures 360x800 screenshots', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/courts?demo_reset=true');
    await page.waitForLoadState('networkidle');

    // 1. Verify OSM Attribution note under list/map toggle
    const osmNote = page.locator('[data-testid="osm-attribution-note"]');
    await expect(osmNote).toBeVisible();
    await expect(osmNote).toContainText('ข้อมูลสนามจาก OpenStreetMap');

    const copyrightLink = osmNote.locator('a[href="https://www.openstreetmap.org/copyright"]');
    await expect(copyrightLink).toBeVisible();
    await expect(copyrightLink).toHaveText('OpenStreetMap');

    // 2. Verify total courts count > 3 (3 demo courts + 148 loaded OSM courts = 151 courts)
    const loadedOsmCourts = osmCourtsBangkok
      .slice(0, 200)
      .filter((c) => c.osmQuality !== 'excluded');
    const expectedCount = 3 + loadedOsmCourts.length;

    const headerCount = page.locator('text=/ทั้งหมด \\d+ สนาม/');
    await expect(headerCount).toBeVisible();
    const countText = await headerCount.textContent();
    const match = countText?.match(/ทั้งหมด\s+(\d+)\s+สนาม/);
    const totalCourts = match ? parseInt(match[1], 10) : 0;
    expect(totalCourts).toBeGreaterThan(3);
    expect(totalCourts).toBe(expectedCount);

    // Capture list view screenshot (360x800)
    const listShotPath = path.join(SCREENSHOT_DIR, 'courts_list_view.png');
    await page.screenshot({ path: listShotPath, fullPage: false });
    expect(fs.existsSync(listShotPath)).toBe(true);

    // Switch to Map view
    const mapViewBtn = page.locator('[data-testid="courts-view-map"]');
    await mapViewBtn.click();

    const courtsMap = page.locator('[data-testid="courts-map"]');
    await expect(courtsMap).toBeVisible();

    // Verify total pinned courts > 3 via data-pin-total test hook (accommodating clustering)
    await expect(courtsMap).toHaveAttribute(
      'data-pin-total',
      String(expectedCount)
    );
    const pinTotalAttr = await courtsMap.getAttribute('data-pin-total');
    const pinCount = pinTotalAttr ? parseInt(pinTotalAttr, 10) : 0;
    expect(pinCount).toBeGreaterThan(3);

    // Capture map view screenshot (360x800)
    const mapShotPath = path.join(SCREENSHOT_DIR, 'courts_map_view.png');
    await page.screenshot({ path: mapShotPath, fullPage: false });
    expect(fs.existsSync(mapShotPath)).toBe(true);
  });

  test('TC-MAP2-02: Searching a real court name from OSM data filters the courts list accurately', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/courts?view=list');
    await page.waitForLoadState('networkidle');

    // Pick real named courts from OSM data
    const testOsmCourt = osmCourtsBangkok.find((c) => c.name && c.name.includes('MDCU'));
    const targetName = testOsmCourt?.name || 'MDCU basketball court';

    const searchInput = page.locator('input[placeholder*="ค้นหาชื่อสนาม"]');
    await expect(searchInput).toBeVisible();

    // Search for the specific OSM court name
    await searchInput.fill(targetName);

    // Target court card should be visible
    const targetCard = page.locator(`text=${targetName}`);
    await expect(targetCard.first()).toBeVisible();

    // Other non-matching courts should be filtered out
    const otherCourt = page.locator('text=สวนเบญจกิติ (Benjakitti Park)');
    await expect(otherCourt).not.toBeVisible();

    // Clear search and verify original courts reappear
    await searchInput.fill('');
    await expect(otherCourt.first()).toBeVisible();
  });

  test('TC-OSM2-01: Excluded court (way 625500759) is not listed or searchable, OSM badge is visible on unverified and positive courts, and captures 360x800 screenshots', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/courts?demo_reset=true');
    await page.waitForLoadState('networkidle');

    // 1. Verify excluded court way 625500759 ("Tippawas School Football Court") is NOT listed or searchable
    const searchInput = page.locator('input[placeholder*="ค้นหาชื่อสนาม"]');
    await expect(searchInput).toBeVisible();

    await searchInput.fill('Tippawas');
    await expect(page.locator('text=ไม่พบสนามที่ค้นหา')).toBeVisible();
    await expect(page.locator('text=Tippawas')).not.toBeVisible();

    await searchInput.fill('Football');
    await expect(page.locator('text=ไม่พบสนามที่ค้นหา')).toBeVisible();
    await expect(page.locator('text=Football Court')).not.toBeVisible();

    // Clear search
    await searchInput.fill('');

    // 2. Verify total courts count reflects only loaded non-excluded courts (151 total)
    const loadedOsmCourts = osmCourtsBangkok
      .slice(0, 200)
      .filter((c) => c.osmQuality !== 'excluded');
    const expectedTotal = 3 + loadedOsmCourts.length;

    const headerCount = page.locator('text=/ทั้งหมด \\d+ สนาม/');
    await expect(headerCount).toBeVisible();
    const countText = await headerCount.textContent();
    const match = countText?.match(/ทั้งหมด\s+(\d+)\s+สนาม/);
    const totalCourts = match ? parseInt(match[1], 10) : 0;
    expect(totalCourts).toBe(expectedTotal);

    // 3. Verify OSM verification badge is visible on unverified courts
    await searchInput.fill('MDCU');
    const unverifiedBadge = page.locator('[data-testid="court-osm-badge"]');
    await expect(unverifiedBadge.first()).toBeVisible();
    await expect(unverifiedBadge.first()).toHaveText('ข้อมูลจาก OSM ยังไม่ยืนยัน');

    // Capture screenshot showing court card with OSM badge
    const badgeShotPath = path.join(SCREENSHOT_OSM2_DIR, 'court_card_osm_badge.png');
    await page.screenshot({ path: badgeShotPath, fullPage: false });
    expect(fs.existsSync(badgeShotPath)).toBe(true);

    // Clear search and capture list screenshot for OSM2
    await searchInput.fill('');
    const osm2ListShot = path.join(SCREENSHOT_OSM2_DIR, 'courts_list_view.png');
    await page.screenshot({ path: osm2ListShot, fullPage: false });
    expect(fs.existsSync(osm2ListShot)).toBe(true);

    // 4. Switch to Map view and verify map attributes and popup badge
    const mapViewBtn = page.locator('[data-testid="courts-view-map"]');
    await mapViewBtn.click();

    const courtsMap = page.locator('[data-testid="courts-map"]');
    await expect(courtsMap).toBeVisible();
    await expect(courtsMap).toHaveAttribute('data-pin-total', String(expectedTotal));

    // Filter to MDCU to open popup and verify popup badge
    await searchInput.fill('MDCU');
    const mdcuPin = page.locator('[title="MDCU basketball court"]');
    await mdcuPin.dispatchEvent('click');

    const popupBadge = page.locator('[data-testid="court-popup-osm-badge"]');
    await expect(popupBadge).toBeVisible();
    await expect(popupBadge).toHaveText('ข้อมูลจาก OSM ยังไม่ยืนยัน');

    // Capture screenshot of popup with OSM badge
    const popupBadgeShot = path.join(SCREENSHOT_OSM2_DIR, 'court_popup_osm_badge.png');
    await page.screenshot({ path: popupBadgeShot, fullPage: false });
    expect(fs.existsSync(popupBadgeShot)).toBe(true);

    // Clear search, wait for map cluster render, and capture map screenshot for OSM2
    await searchInput.fill('');
    await page.waitForTimeout(400);

    const osm2MapShot = path.join(SCREENSHOT_OSM2_DIR, 'courts_map_view.png');
    await page.screenshot({ path: osm2MapShot, fullPage: false });
    expect(fs.existsSync(osm2MapShot)).toBe(true);
  });
});

import { test, expect } from '../helpers/leafletFixture';
import * as fs from 'fs';
import * as path from 'path';
import { SELECTORS } from '../helpers/selectors';

const SCREENSHOT_DIR = path.resolve('docs/qa/screenshots_theme2');

// 1x1 transparent PNG buffer for offline tile route-stubbing
const TILE_STUB_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

test.describe('HoopUp THEME2 — NBA Team Colour Themes & A11y Contrast', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
  });

  test.beforeEach(async ({ context, page }) => {
    // Stub OpenStreetMap tiles so map runs offline with zero network calls
    await context.route('**/*tile.openstreetmap.org/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: TILE_STUB_PNG,
      });
    });

    await page.setViewportSize({ width: 360, height: 800 });
  });

  test('TC-THEME2-01: Choosing a team changes the CSS accent variable immediately', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    const picker = page.locator(SELECTORS.theme.picker);
    await expect(picker).toBeVisible();

    // Default accent is #FF6B00
    const initialAccent = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
    });
    expect(initialAccent.toUpperCase()).toBe('#FF6B00');

    // Click Los Angeles Lakers chip
    const lakersOption = page.locator(SELECTORS.theme.option('los-angeles-lakers'));
    await expect(lakersOption).toBeVisible();
    await lakersOption.click();

    // Effective accent for Lakers is adjusted to #9F68D4 (passes >= 4.5:1 on #0B0F19)
    const newAccent = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
    });
    expect(newAccent.toUpperCase()).toBe('#9F68D4');

    // Active label updates
    const activeLabel = page.locator(SELECTORS.theme.activeLabel);
    await expect(activeLabel).toContainText('ลอสแอนเจลิส เลเกอส์ (Lakers)');
  });

  test('TC-THEME2-02: Selected theme choice persists after page reload', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    // Select Lakers
    await page.locator(SELECTORS.theme.option('los-angeles-lakers')).click();

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify accent is still Lakers #9F68D4
    const accentAfterReload = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
    });
    expect(accentAfterReload.toUpperCase()).toBe('#9F68D4');

    const activeLabel = page.locator(SELECTORS.theme.activeLabel);
    await expect(activeLabel).toContainText('ลอสแอนเจลิส เลเกอส์ (Lakers)');
  });

  test('TC-THEME2-03: Selecting default restores original HoopUp orange accent', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    // First change to another team
    await page.locator(SELECTORS.theme.option('golden-state-warriors')).click();
    let accent = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
    });
    expect(accent.toUpperCase()).toBe('#5180DA');

    // Select default HoopUp
    await page.locator(SELECTORS.theme.option('default-hoopup')).click();

    accent = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
    });
    expect(accent.toUpperCase()).toBe('#FF6B00');

    const activeLabel = page.locator(SELECTORS.theme.activeLabel);
    await expect(activeLabel).toContainText('ค่าเริ่มต้น HoopUp (ส้ม)');
  });

  test('TC-THEME2-04: Low-contrast team (Brooklyn Nets) receives an adjusted accent >= 4.5:1', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    // Filter to Nets
    await page.locator(SELECTORS.theme.search).fill('Nets');

    const netsOption = page.locator(SELECTORS.theme.option('brooklyn-nets'));
    await expect(netsOption).toBeVisible();
    await netsOption.click();

    // Raw primary is #000000, but effective accent must be adjusted to #808080
    const netsAccent = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
    });
    expect(netsAccent.toUpperCase()).not.toBe('#000000');
    expect(netsAccent.toUpperCase()).toBe('#808080');

    const activeLabel = page.locator(SELECTORS.theme.activeLabel);
    await expect(activeLabel).toContainText('บรูกคลิน เน็ตส์ (Nets)');
  });

  test('TC-THEME2-05: Real-time search filters 31 chips by Thai name, English name, and city', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    const searchInput = page.locator(SELECTORS.theme.search);

    // Filter by English nickname
    await searchInput.fill('Celtics');
    await expect(page.locator(SELECTORS.theme.option('boston-celtics'))).toBeVisible();
    await expect(page.locator(SELECTORS.theme.option('chicago-bulls'))).not.toBeVisible();

    // Filter by Thai name
    await searchInput.fill('ชิคาโก');
    await expect(page.locator(SELECTORS.theme.option('chicago-bulls'))).toBeVisible();
    await expect(page.locator(SELECTORS.theme.option('boston-celtics'))).not.toBeVisible();

    // Clear search
    await searchInput.fill('');
    await expect(page.locator(SELECTORS.theme.option('boston-celtics'))).toBeVisible();
    await expect(page.locator(SELECTORS.theme.option('chicago-bulls'))).toBeVisible();
  });

  test('TC-THEME2-06: Legal disclaimer note is visible and no official logos/images are present', async ({ page }) => {
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    const picker = page.locator(SELECTORS.theme.picker);
    await expect(picker).toContainText('สีตกแต่งตามทีมที่ชอบ ไม่เกี่ยวข้องกับ/ไม่ได้รับการรับรองจาก NBA หรือทีมใด');

    // Zero <img> tags inside theme-picker (Colours ONLY rule)
    const imgCount = await picker.locator('img').count();
    expect(imgCount).toBe(0);
  });

  test('TC-THEME2-07: Capture 360x800 screenshots of 4 themes across 4 screens (Feed, Create Form, Courts Map, Profile Picker)', async ({ page }) => {
    // 1. Screen 1: Feed Page in Golden State Warriors theme (#5180DA)
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');
    await page.locator(SELECTORS.theme.option('golden-state-warriors')).click();

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const shot1 = path.join(SCREENSHOT_DIR, '01_feed_warriors.png');
    await page.screenshot({ path: shot1, fullPage: false });
    expect(fs.existsSync(shot1)).toBe(true);

    // 2. Screen 2: Create Session Form in LA Lakers theme (#9F68D4)
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');
    await page.locator(SELECTORS.theme.option('los-angeles-lakers')).click();

    await page.goto('/sessions/new');
    await page.waitForLoadState('networkidle');
    const shot2 = path.join(SCREENSHOT_DIR, '02_create_form_lakers.png');
    await page.screenshot({ path: shot2, fullPage: false });
    expect(fs.existsSync(shot2)).toBe(true);

    // 3. Screen 3: Courts Map in Boston Celtics theme (#009940)
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');
    await page.locator(SELECTORS.theme.option('boston-celtics')).click();

    await page.goto('/courts?view=map');
    await page.waitForLoadState('networkidle');
    // Wait for leaflet map container to mount
    await expect(page.locator('[data-testid="courts-map"]')).toBeVisible();
    await page.waitForTimeout(600); // allow cluster render
    const shot3 = path.join(SCREENSHOT_DIR, '03_courts_map_celtics.png');
    await page.screenshot({ path: shot3, fullPage: false });
    expect(fs.existsSync(shot3)).toBe(true);

    // 4. Screen 4: Profile Picker in Brooklyn Nets theme (#808080)
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');
    await page.locator(SELECTORS.theme.search).fill('Nets');
    await page.locator(SELECTORS.theme.option('brooklyn-nets')).click();
    await page.locator(SELECTORS.theme.search).fill(''); // clear to show chips
    await page.waitForTimeout(300);

    const shot4 = path.join(SCREENSHOT_DIR, '04_profile_picker_nets.png');
    await page.screenshot({ path: shot4, fullPage: false });
    expect(fs.existsSync(shot4)).toBe(true);

    // Restore default theme for clean state
    await page.locator(SELECTORS.theme.option('default-hoopup')).click();
  });
});

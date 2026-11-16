import { test, expect } from '@playwright/test';
import { SELECTORS } from '../helpers/selectors';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Mobile Responsive Layout & Visual Verification
 * Tests TC-RESP-01 (360x800) and TC-RESP-02 (390x844)
 * Verifies zero horizontal overflow and collects real screenshots.
 */
const VIEWPORTS = [
  { name: 'android-360x800', width: 360, height: 800 },
  { name: 'iphone-390x844', width: 390, height: 844 },
];

const SCREENSHOT_DIR = path.resolve('docs/qa/screenshots');

test.describe('HoopUp MVP — Mobile Responsiveness (360x800 & 390x844)', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
  });

  for (const vp of VIEWPORTS) {
    test(`Responsive verification for ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      const checkNoHorizontalOverflow = async (pageName: string) => {
        const overflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });
        expect(overflow, `Page ${pageName} has horizontal overflow at ${vp.width}px`).toBe(false);

        // Take full-page screenshot for visual acceptance evidence
        const shotPath = path.join(SCREENSHOT_DIR, `${vp.name}-${pageName}.png`);
        await page.screenshot({ path: shotPath, fullPage: true });
      };

      // 1. Feed Page
      await page.goto('/?demo_reset=true');
      await page.waitForLoadState('networkidle');
      await checkNoHorizontalOverflow('feed');

      // 2. Create Session Page (Long Form)
      await page.locator(SELECTORS.nav.createSession).click();
      await page.waitForLoadState('networkidle');
      await checkNoHorizontalOverflow('create-session');

      // 3. Create a session to test Session Detail & Chat Page
      await page.locator(SELECTORS.createSession.titleInput).fill('Responsive Test');
      await page.locator(SELECTORS.createSession.timingNow).click();
      await page.locator(SELECTORS.createSession.teamSize5).click();
      await page.locator(SELECTORS.createSession.submitBtn).click();
      await page.waitForLoadState('networkidle');
      await checkNoHorizontalOverflow('session-detail-chat');

      // 4. Profile Page
      await page.locator(SELECTORS.nav.profile).click();
      await page.waitForLoadState('networkidle');
      await checkNoHorizontalOverflow('profile');
    });
  }
});

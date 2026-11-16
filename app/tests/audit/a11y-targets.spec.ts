import { test, expect } from '../helpers/leafletFixture';
import * as fs from 'fs';
import * as path from 'path';
import { SELECTORS } from '../helpers/selectors';

// 1x1 transparent PNG buffer for offline tile route-stubbing
const TILE_STUB_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const SCREENSHOT_DIR = path.resolve('docs/qa/screenshots_a11y1');

export interface Violation {
  screen: string;
  selector: string;
  tag: string;
  text: string;
  width: number;
  height: number;
  reason?: string;
}

/**
 * Small explicit allowlist for touch target exceptions under WCAG 2.5.5 / 2.5.8.
 * Each entry is commented with its architectural and accessibility rationale.
 */
interface AllowlistEntry {
  matcher: (item: {
    screen: string;
    selector: string;
    tag: string;
    text: string;
    className: string;
  }) => boolean;
  reason: string;
}

const TOUCH_TARGET_ALLOWLIST: AllowlistEntry[] = [
  {
    // Native HTML checkbox control (18px) enclosed inside a 44px min-height <label> container
    // Clicking anywhere within the 44px bounding area toggles the checkbox per standard HTML semantics.
    matcher: ({ selector }) => selector.includes('profile-plays-any'),
    reason: 'Native checkbox enclosed within 44px min-height <label> touch area',
  },
  {
    // Leaflet map canvas marker pins and cluster bubbles
    // These are geolocated map vector markers rendered dynamically by Leaflet and Leaflet.markercluster
    // on the interactive map canvas layer.
    matcher: ({ className }) =>
      className.includes('leaflet-marker-icon') ||
      className.includes('marker-cluster') ||
      className.includes('hoopup-court-pin'),
    reason: 'Interactive Leaflet map pins and cluster icons rendered on map canvas',
  },
];

test.describe('A11Y Touch Targets Compliance & LIVE Strip (360x800)', () => {
  const violations: Violation[] = [];
  const allowlisted: Violation[] = [];
  const inlineLinks: Violation[] = [];

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

  async function auditCurrentScreen(page: any, screenName: string) {
    await page.waitForLoadState('networkidle');

    // Find all interactive elements
    const elements = page.locator(
      'button, a[href], [role="button"], input, select, textarea, summary, [role="tab"]'
    );
    const count = await elements.count();

    for (let i = 0; i < count; i++) {
      const el = elements.nth(i);
      const isVisible = await el.isVisible().catch(() => false);
      if (!isVisible) continue;

      const box = await el.boundingBox().catch(() => null);
      if (!box || box.width === 0 || box.height === 0) continue;

      const info = await el.evaluate((node: HTMLElement) => {
        const testId = node.getAttribute('data-testid');
        const ariaLabel = node.getAttribute('aria-label');
        const role = node.getAttribute('role');
        const id = node.id;
        const className = typeof node.className === 'string' ? node.className.trim() : '';
        const tagName = node.tagName.toLowerCase();
        const text = (node.innerText || node.textContent || '').trim().slice(0, 30);

        // Check if inline link inside paragraph/sentence/attribution text block
        // (Exempt from target size requirement under WCAG 2.5.5 / 2.5.8)
        const isAnchor = tagName === 'a';
        const parentBlock = node.closest(
          'p, span, li, div, footer, [data-testid="osm-attribution-note"], .leaflet-control-attribution'
        );
        const parentFullText = (parentBlock?.textContent || '').trim();
        const isInline =
          isAnchor &&
          parentBlock &&
          parentFullText.length > text.length &&
          parentFullText !== text;

        // Skip internal leaflet controls that are purely map canvas or tile panes
        const isLeafletPane =
          className.includes('leaflet-tile') || className.includes('leaflet-pane');

        let selector = '';
        if (testId) {
          selector = `[data-testid="${testId}"]`;
        } else if (id) {
          selector = `#${id}`;
        } else if (ariaLabel) {
          selector = `${tagName}[aria-label="${ariaLabel}"]`;
        } else if (className) {
          selector = `${tagName}.${className.split(/\s+/).join('.')}`;
        } else {
          selector = tagName;
        }

        return {
          selector,
          tag: tagName,
          text,
          role,
          className,
          isInline,
          isLeafletPane,
        };
      });

      if (info.isLeafletPane) continue;

      // Check if size is under 44px threshold
      if (box.width < 43.5 || box.height < 43.5) {
        const item: Violation = {
          screen: screenName,
          selector: info.selector,
          tag: info.tag,
          text: info.text,
          width: Math.round(box.width * 10) / 10,
          height: Math.round(box.height * 10) / 10,
        };

        if (info.isInline) {
          item.reason = 'Inline text link inside paragraph/sentence or attribution block';
          inlineLinks.push(item);
          continue;
        }

        // Check small explicit allowlist
        const matchedAllowlist = TOUCH_TARGET_ALLOWLIST.find((entry) =>
          entry.matcher({
            screen: screenName,
            selector: info.selector,
            tag: info.tag,
            text: info.text,
            className: info.className,
          })
        );

        if (matchedAllowlist) {
          item.reason = matchedAllowlist.reason;
          allowlisted.push(item);
        } else {
          violations.push(item);
        }
      }
    }
  }

  test('TC-A11Y1-01: all main screens have touch targets >= 44x44px at 360x800', async ({
    page,
  }) => {
    test.setTimeout(90000);

    // 1. Feed Page
    await page.goto('/');
    await auditCurrentScreen(page, 'Feed (/)');

    // 2. Courts List
    await page.goto('/courts?view=list');
    await auditCurrentScreen(page, 'Courts List (/courts?view=list)');

    // 3. Courts Map (including ใกล้ฉัน and marker popup)
    await page.goto('/courts?view=map');
    await page.waitForTimeout(1000);
    const locateBtn = page.locator('[data-testid="courts-locate"]');
    if (await locateBtn.isVisible()) {
      await auditCurrentScreen(page, 'Courts Map (/courts?view=map)');
    }
    // Click a court marker to open popup
    const marker = page.locator('.leaflet-marker-icon, .hoopup-court-pin').first();
    if (await marker.isVisible()) {
      await marker.click();
      await page.waitForTimeout(500);
      await auditCurrentScreen(page, 'Courts Map Popup (/courts?view=map)');
    }

    // 4. Create Session
    await page.goto('/sessions/new');
    await auditCurrentScreen(page, 'Create Session (/sessions/new)');

    // 5. Session Detail (Host)
    await page.goto('/sessions/s1111111-1111-4111-8111-111111111111');
    await auditCurrentScreen(
      page,
      'Session Detail Host (/sessions/s1111111-1111-4111-8111-111111111111)'
    );

    // 6. Session Detail (Joiner)
    const switchSelect = page.locator('[data-testid="auth-switch-user"]');
    if (await switchSelect.isVisible()) {
      await switchSelect.selectOption('22222222-2222-4222-8222-222222222222');
      await page.waitForTimeout(500);
      await page.goto('/sessions/s1111111-1111-4111-8111-111111111111');
      await auditCurrentScreen(
        page,
        'Session Detail Joiner (/sessions/s1111111-1111-4111-8111-111111111111)'
      );
      // Switch back to Host
      await switchSelect.selectOption('11111111-1111-4111-8111-111111111111');
      await page.waitForTimeout(500);
    }

    // 7. My Sessions
    await page.goto('/my-sessions');
    await auditCurrentScreen(page, 'My Sessions (/my-sessions)');

    // 8. Profile Page (incl Theme Picker)
    await page.goto('/profile');
    await auditCurrentScreen(page, 'Profile (/profile)');

    // 9. Login Page
    await page.goto('/login');
    await auditCurrentScreen(page, 'Login (/login)');

    // Output stats
    console.log(`[A11Y Targets Audit] Real violations remaining: ${violations.length}`);
    console.log(`[A11Y Targets Audit] Allowlisted elements: ${allowlisted.length}`);
    console.log(`[A11Y Targets Audit] Inline text links: ${inlineLinks.length}`);

    if (violations.length > 0) {
      console.error('VIOLATIONS FOUND:', JSON.stringify(violations, null, 2));
    }

    // Must have 0 touch target violations across all screens
    expect(violations).toEqual([]);
  });

  test('TC-A11Y1-02: capture Feed screenshots with LIVE strip at 360x800 in default and lowest contrast themes', async ({
    page,
  }) => {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }

    // 1. Reset demo state
    await page.goto('/?demo_reset=true');
    await page.waitForLoadState('networkidle');

    // 2. Create a session starting "Now" so the LIVE strip (⚡ เล่นเลย) is active on the feed
    await page.goto('/sessions/new');
    await page.waitForLoadState('networkidle');
    await page.locator(SELECTORS.createSession.titleInput).fill('บาสสดตอนนี้ 3x3 เบญจกิติ');
    if (await page.locator(SELECTORS.createSession.courtSelect).isVisible()) {
      await page.locator(SELECTORS.createSession.courtSelect).selectOption({ index: 1 });
    }
    await page.locator(SELECTORS.createSession.timingNow).click();
    await page.locator(SELECTORS.createSession.submitBtn).click();
    await page.waitForTimeout(500);

    // 3. Navigate to Feed in Default Theme (default-hoopup)
    await page.evaluate(() => {
      localStorage.setItem('hoopup_theme_id_v2', 'default-hoopup');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify LIVE timing badge is visible on the card
    const timingBadge = page.locator('[data-testid="session-card-timing-badge"]').first();
    await expect(timingBadge).toBeVisible();
    await expect(timingBadge).toContainText('เล่นเลย');

    const defaultShotPath = path.join(SCREENSHOT_DIR, 'feed_live_strip_default_theme.png');
    await page.screenshot({ path: defaultShotPath, fullPage: false });
    expect(fs.existsSync(defaultShotPath)).toBe(true);

    // 4. Switch to Theme with lowest contrast before fix (san-antonio-spurs)
    await page.evaluate(() => {
      localStorage.setItem('hoopup_theme_id_v2', 'san-antonio-spurs');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify LIVE timing badge is still clearly visible in Spurs theme
    const timingBadgeSpurs = page.locator('[data-testid="session-card-timing-badge"]').first();
    await expect(timingBadgeSpurs).toBeVisible();
    await expect(timingBadgeSpurs).toContainText('เล่นเลย');

    const spursShotPath = path.join(SCREENSHOT_DIR, 'feed_live_strip_spurs_theme.png');
    await page.screenshot({ path: spursShotPath, fullPage: false });
    expect(fs.existsSync(spursShotPath)).toBe(true);
  });
});

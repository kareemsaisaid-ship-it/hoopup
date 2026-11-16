import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { SELECTORS } from '../helpers/selectors';

const SCREENSHOT_DIR = path.resolve('docs/qa/screenshots_ui2');
const LINT1_SCREENSHOT_DIR = path.resolve('docs/qa/screenshots_lint1');

test.describe('HoopUp UI2 — Ported UI Lab Screens & States', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
    if (!fs.existsSync(LINT1_SCREENSHOT_DIR)) {
      fs.mkdirSync(LINT1_SCREENSHOT_DIR, { recursive: true });
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
  });

  test('TC-UI2-01: Feed Loading State renders shimmer skeletons and captures 360x800 screenshot', async ({ page }) => {
    // Navigate with simulated loading parameter through service layer
    await page.goto('/?simulate_loading=feed');

    const loadingContainer = page.locator('[data-testid="feed-loading-container"]');
    await expect(loadingContainer).toBeVisible();

    // Verify skeleton shimmer cards exist
    const skeletonPills = page.locator('.skeleton-pill');
    await expect(skeletonPills.first()).toBeVisible();

    // Capture 360x800 screenshot
    const shotPath = path.join(SCREENSHOT_DIR, 'feed_loading.png');
    await page.screenshot({ path: shotPath, fullPage: false });
    expect(fs.existsSync(shotPath)).toBe(true);
  });

  test('TC-UI2-02: Feed Empty State renders Thai message, CTA buttons, and captures 360x800 screenshot', async ({ page }) => {
    await page.goto('/?demo_reset=true');
    await page.waitForLoadState('networkidle');

    // Filter to an impossible keyword
    await page.locator(SELECTORS.feed.searchInput).fill('NONEXISTENT_SESSION_XYZ_999');

    const emptyState = page.locator(SELECTORS.feed.emptyState);
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText('ยังไม่มีนัดที่เปิดรับในช่วงนี้');

    const createBtn = page.locator('[data-testid="feed-empty-create-btn"]');
    const resetBtn = page.locator('[data-testid="feed-empty-reset-btn"]');
    await expect(createBtn).toBeVisible();
    await expect(resetBtn).toBeVisible();

    // Capture 360x800 screenshot
    const shotPath = path.join(SCREENSHOT_DIR, 'feed_empty.png');
    await page.screenshot({ path: shotPath, fullPage: false });
    expect(fs.existsSync(shotPath)).toBe(true);

    // Verify reset filter button restores list
    await resetBtn.click();
    await expect(emptyState).not.toBeVisible();
  });

  test('TC-UI2-03: Feed Error State displays Thai safety copy and Retry button restores feed', async ({ page }) => {
    // Simulate error through service layer
    await page.goto('/?simulate_error=feed');

    const errorState = page.locator('[data-testid="feed-error-state"]');
    await expect(errorState).toBeVisible();
    await expect(errorState).toContainText('ไม่สามารถโหลดรายการนัดได้');
    await expect(errorState).toContainText('คำแนะนำสำหรับผู้เล่น');

    const retryBtn = page.locator('[data-testid="feed-retry-btn"]');
    await expect(retryBtn).toBeVisible();

    // Capture 360x800 screenshot
    const shotPath = path.join(SCREENSHOT_DIR, 'feed_error.png');
    await page.screenshot({ path: shotPath, fullPage: false });
    expect(fs.existsSync(shotPath)).toBe(true);

    // Clear simulation flag and click retry
    await page.evaluate(() => {
      const url = new URL(window.location.href);
      url.searchParams.delete('simulate_error');
      window.history.replaceState({}, '', url.toString());
      (window as unknown as { __HOOPUP_SIMULATE_FEED_ERROR__?: boolean }).__HOOPUP_SIMULATE_FEED_ERROR__ = false;
    });

    await retryBtn.click();
    await expect(errorState).not.toBeVisible({ timeout: 5000 });
  });

  test('TC-UI2-04: Create Session Redesign with friends stepper, live formula, dots, and captures 360x800 screenshot', async ({ page }) => {
    await page.goto('/sessions/new');
    await page.waitForLoadState('networkidle');

    // Title input
    await expect(page.locator(SELECTORS.createSession.titleInput)).toBeVisible();
    await page.locator(SELECTORS.createSession.titleInput).fill('บาสค่ำ สวนลุม 5v5');

    // Select court
    if (await page.locator(SELECTORS.createSession.courtSelect).isVisible()) {
      await page.locator(SELECTORS.createSession.courtSelect).selectOption({ index: 1 });
    }

    // Verify team size selection
    await page.locator(SELECTORS.createSession.teamSize5).click();

    // Test stepper and guest count input
    const guestInput = page.locator(SELECTORS.createSession.guestCountInput);
    const decBtn = page.locator(SELECTORS.createSession.guestDecrementBtn);
    const incBtn = page.locator(SELECTORS.createSession.guestIncrementBtn);
    await expect(guestInput).toBeVisible();
    await expect(decBtn).toBeVisible();
    await expect(incBtn).toBeVisible();

    // Verify stepper controls and friends input bounding boxes do not overlap at 360x800
    const decBox = await decBtn.boundingBox();
    const inputBox = await guestInput.boundingBox();
    const incBox = await incBtn.boundingBox();
    expect(decBox).toBeTruthy();
    expect(inputBox).toBeTruthy();
    expect(incBox).toBeTruthy();

    expect(decBox!.x + decBox!.width).toBeLessThanOrEqual(inputBox!.x);
    expect(inputBox!.x + inputBox!.width).toBeLessThanOrEqual(incBox!.x);

    // Verify native spinner is hidden so number text is fully readable without overlap
    const appearance = await guestInput.evaluate((el) => {
      const win = el.ownerDocument.defaultView!;
      const comp = win.getComputedStyle(el);
      return comp.appearance || comp.getPropertyValue('-moz-appearance');
    });
    expect(appearance).toBe('textfield');

    // Fill friends count = 2
    await guestInput.fill('2');

    // Verify live calculation banner
    const calcBanner = page.locator('.live-calc-banner');
    await expect(calcBanner).toBeVisible();
    await expect(calcBanner).toContainText('คุณ 1 คน + เพื่อน 2 คน');
    await expect(calcBanner).toContainText('มีแล้ว 3 คน');
    await expect(calcBanner).toContainText('รับเพิ่ม 2 คน');

    // Verify visual player dots: 1 host + 2 friends + 2 empty = 5
    const hostDot = page.locator('.player-dot.host');
    await expect(hostDot).toHaveCount(1);
    const friendDots = page.locator('.player-dot.friend');
    await expect(friendDots).toHaveCount(2);
    const emptyDots = page.locator('.player-dot.empty');
    await expect(emptyDots).toHaveCount(2);

    // Verify submit button displays dynamic text
    const submitBtn = page.locator(SELECTORS.createSession.submitBtn);
    await expect(submitBtn).toContainText('รับเพิ่ม 2 คน');

    // Capture 360x800 screenshots into both UI2 and LINT1 directories
    const shotPath = path.join(SCREENSHOT_DIR, 'create_session.png');
    await page.screenshot({ path: shotPath, fullPage: false });
    expect(fs.existsSync(shotPath)).toBe(true);

    const lint1ShotPath = path.join(LINT1_SCREENSHOT_DIR, 'create_session.png');
    await page.screenshot({ path: lint1ShotPath, fullPage: false });
    expect(fs.existsSync(lint1ShotPath)).toBe(true);

    // Submit session creation and verify redirect
    await submitBtn.click();
    await expect(page.locator(SELECTORS.sessionDetail.title)).toContainText('บาสค่ำ สวนลุม 5v5');
    await expect(page.locator(SELECTORS.sessionDetail.capacity)).toContainText('3/5');
  });

  test('TC-UI2-05: Session Detail Loading Skeleton renders and captures 360x800 screenshot', async ({ page }) => {
    // Navigate with simulate_loading=session
    await page.goto('/sessions/s1111111-1111-4111-8111-111111111111?simulate_loading=session');

    const loadingContainer = page.locator('[data-testid="session-detail-loading-container"]');
    await expect(loadingContainer).toBeVisible();

    // Verify shimmer skeleton elements exist
    await expect(page.locator('.skeleton').first()).toBeVisible();

    // Capture 360x800 screenshot
    const shotPath = path.join(SCREENSHOT_DIR, 'session_detail_loading.png');
    await page.screenshot({ path: shotPath, fullPage: false });
    expect(fs.existsSync(shotPath)).toBe(true);
  });

  test('TC-UI2-06: Session Detail Empty / Not Found State renders Thai copy and captures 360x800 screenshot', async ({ page }) => {
    // Navigate to a non-existent session
    await page.goto('/sessions/00000000-0000-0000-0000-000000000000');

    const emptyState = page.locator('[data-testid="session-detail-empty-state"]');
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText('ไม่พบนัดนี้ หรือนัดสิ้นสุดแล้ว');
    await expect(emptyState).toContainText('สถานะ: ยกเลิก / สิ้นสุดการรับคน');

    const backBtn = page.locator('[data-testid="session-detail-empty-feed-btn"]');
    await expect(backBtn).toBeVisible();

    // Capture 360x800 screenshot
    const shotPath = path.join(SCREENSHOT_DIR, 'session_detail_empty.png');
    await page.screenshot({ path: shotPath, fullPage: false });
    expect(fs.existsSync(shotPath)).toBe(true);
  });

  test('TC-UI2-07: Session Detail Error State renders and Retry button recovers the session', async ({ page }) => {
    // Simulate error through service layer
    await page.goto('/sessions/s1111111-1111-4111-8111-111111111111?simulate_error=session');

    const errorState = page.locator('[data-testid="session-detail-error-state"]');
    await expect(errorState).toBeVisible();
    await expect(errorState).toContainText('โหลดข้อมูลนัดไม่สำเร็จ');
    await expect(errorState).toContainText('ปลอดภัย & พร้อมกู้คืน');

    const retryBtn = page.locator('[data-testid="session-detail-retry-btn"]');
    await expect(retryBtn).toBeVisible();

    // Capture 360x800 screenshot
    const shotPath = path.join(SCREENSHOT_DIR, 'session_detail_error.png');
    await page.screenshot({ path: shotPath, fullPage: false });
    expect(fs.existsSync(shotPath)).toBe(true);

    // Clear simulation flag and click retry
    await page.evaluate(() => {
      const url = new URL(window.location.href);
      url.searchParams.delete('simulate_error');
      window.history.replaceState({}, '', url.toString());
      (window as unknown as { __HOOPUP_SIMULATE_SESSION_ERROR__?: boolean }).__HOOPUP_SIMULATE_SESSION_ERROR__ = false;
    });

    await retryBtn.click();
    await expect(errorState).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator(SELECTORS.sessionDetail.title)).toBeVisible();
  });

  test('TC-UI2-08: Bottom Navigation Polish renders 5 tabs with raised create button and captures 360x800 screenshot', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify all 5 navigation items exist
    await expect(page.locator(SELECTORS.nav.feed)).toBeVisible();
    await expect(page.locator(SELECTORS.nav.courts)).toBeVisible();
    await expect(page.locator(SELECTORS.nav.createSession)).toBeVisible();
    await expect(page.locator(SELECTORS.nav.mySessions)).toBeVisible();
    await expect(page.locator(SELECTORS.nav.profile)).toBeVisible();

    // Verify raised center button styling
    const createBtn = page.locator(SELECTORS.nav.createSession);
    await expect(createBtn).toHaveClass(/bottom-nav-create/);

    // Capture 360x800 screenshot
    const shotPath = path.join(SCREENSHOT_DIR, 'bottom_nav.png');
    await page.screenshot({ path: shotPath, fullPage: false });
    expect(fs.existsSync(shotPath)).toBe(true);
  });
});

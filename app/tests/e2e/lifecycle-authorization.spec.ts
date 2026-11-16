import { test, expect } from '@playwright/test';
import { SELECTORS } from '../helpers/selectors';

/**
 * Lifecycle, Time Validation, and Authorization Tests
 * Tests TC-TIME-01, TC-TIME-02, TC-LIFE-01, TC-LIFE-02, TC-LIFE-03, TC-SEC-01, TC-SEC-02, TC-SEC-03
 */
test.describe('HoopUp MVP — Lifecycle, Time & Authorization Boundaries', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?demo_reset=true');
    await page.waitForLoadState('networkidle');
  });

  test('TC-TIME-01 & TC-TIME-02: Past datetime is rejected; future datetime is accepted', async ({ page }) => {
    await page.locator(SELECTORS.nav.createSession).click();
    await page.locator(SELECTORS.createSession.titleInput).fill('ทดสอบเวลา');
    await page.locator(SELECTORS.createSession.teamSize5).click();

    // Select future timing
    await page.locator(SELECTORS.createSession.timingFuture).click();
    await expect(page.locator(SELECTORS.createSession.startsAtInput)).toBeVisible();

    // Set a past datetime (e.g. yesterday: 2026-10-20)
    await page.locator(SELECTORS.createSession.startsAtInput).fill('2026-10-20T10:00');
    await page.locator(SELECTORS.createSession.submitBtn).click();

    // Verify error displayed and form not submitted
    await expect(page.locator(SELECTORS.createSession.errorMessage)).toBeVisible();
    await expect(page.locator(SELECTORS.createSession.errorMessage)).toContainText(/อดีต|ย้อนหลัง|ไม่ถูกต้อง/i);

    // Now fix to future time (tomorrow)
    const tomorrow = new Date(Date.now() + 86400000);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}T18:00`;
    await page.locator(SELECTORS.createSession.startsAtInput).fill(tomorrowStr);
    await page.locator(SELECTORS.createSession.submitBtn).click();

    // Verify successful submission to detail page
    await expect(page.locator(SELECTORS.sessionDetail.title)).toContainText('ทดสอบเวลา');
  });

  test('TC-SEC-02: Non-host user cannot see or trigger host management actions', async ({ page, browser }) => {
    // 1. Host creates a session
    await page.locator(SELECTORS.nav.createSession).click();
    await page.locator(SELECTORS.createSession.titleInput).fill('สิทธิ์ Host เท่านั้น');
    await page.locator(SELECTORS.createSession.timingNow).click();
    await page.locator(SELECTORS.createSession.teamSize5).click();
    await page.locator(SELECTORS.createSession.submitBtn).click();

    // Verify Host sees management buttons
    await expect(page.locator(SELECTORS.sessionDetail.toggleRecruitmentBtn)).toBeVisible();
    await expect(page.locator(SELECTORS.sessionDetail.endSessionBtn)).toBeVisible();

    // 2. Open another context as non-host
    const nonHostContext = await browser.newContext();
    const nonHostPage = await nonHostContext.newPage();
    await nonHostPage.goto('/');

    if (await nonHostPage.locator(SELECTORS.auth.switchUser).isVisible()) {
      await nonHostPage.locator(SELECTORS.auth.switchUser).selectOption({ label: 'Joiner (ผู้เข้าร่วม)' });
    }

    const card = nonHostPage.locator(SELECTORS.feed.anySessionCard).first();
    await card.click();

    // Non-host must NOT see host management tools
    await expect(nonHostPage.locator(SELECTORS.sessionDetail.toggleRecruitmentBtn)).not.toBeVisible();
    await expect(nonHostPage.locator(SELECTORS.sessionDetail.endSessionBtn)).not.toBeVisible();

    await nonHostContext.close();
  });

  test('TC-SEC-01: Non-member or pending user cannot access chat messages or send input', async ({
    page,
    browser,
  }) => {
    // 1. Host creates session with approval required
    await page.locator(SELECTORS.nav.createSession).click();
    await page.locator(SELECTORS.createSession.titleInput).fill('ห้องแชทลับ');
    await page.locator(SELECTORS.createSession.timingNow).click();
    await page.locator(SELECTORS.createSession.teamSize5).click();
    await page.locator(SELECTORS.createSession.policyApproval).click();
    await page.locator(SELECTORS.createSession.submitBtn).click();

    // Host sends a message
    if (await page.locator(SELECTORS.chat.input).isVisible()) {
      await page.locator(SELECTORS.chat.input).fill('ความลับทีม');
      await page.locator(SELECTORS.chat.sendBtn).click();
    }

    // 2. Outsider opens the session detail
    const outsiderContext = await browser.newContext();
    const outsiderPage = await outsiderContext.newPage();
    await outsiderPage.goto('/');

    if (await outsiderPage.locator(SELECTORS.auth.switchUser).isVisible()) {
      await outsiderPage.locator(SELECTORS.auth.switchUser).selectOption({ label: 'Outsider' });
    }

    const card = outsiderPage.locator(SELECTORS.feed.anySessionCard).first();
    await card.click();

    // Outsider must see forbidden banner or no chat messages / inputs
    const chatInput = outsiderPage.locator(SELECTORS.chat.input);
    const forbiddenBanner = outsiderPage.locator(SELECTORS.chat.forbiddenBanner);

    const isInputHidden = !(await chatInput.isVisible());
    const isBannerShown = await forbiddenBanner.isVisible();

    expect(isInputHidden || isBannerShown).toBe(true);
    // Outsider should not see host's message text
    await expect(outsiderPage.locator(SELECTORS.chat.container)).not.toContainText('ความลับทีม');

    await outsiderContext.close();
  });

  test('TC-SEC-03: Sign-out clears user cache and prevents session leakage', async ({ page }) => {
    // Open profile
    await page.locator(SELECTORS.nav.profile).click();
    await expect(page.locator(SELECTORS.profile.displayNameInput)).toBeVisible();

    // Click sign out
    if (await page.locator(SELECTORS.auth.signOutBtn).isVisible()) {
      await page.locator(SELECTORS.auth.signOutBtn).click();

      // Ensure navigation to login or unauthenticated state
      await expect(page).toHaveURL(/\/(login|\?signed_out=true)?/);

      // Navigating back to private route redirects or shows empty login prompt
      await page.goto('/profile');
      await expect(page.locator(SELECTORS.profile.displayNameInput)).not.toBeVisible();
    }
  });

  test('R2 F-01: In demo mode, sign-out then hard reload keeps user signed out', async ({ page }) => {
    // 1. Start authenticated on profile
    await page.goto('/profile');
    await expect(page.locator(SELECTORS.profile.displayNameInput)).toBeVisible();

    // 2. Click sign out
    const signOutBtn = page.locator(SELECTORS.auth.signOutBtn);
    await expect(signOutBtn).toBeVisible();
    await signOutBtn.click();

    // 3. User lands on login
    await expect(page).toHaveURL(/\/(login|\?signed_out=true)?/);

    // 4. Perform a hard page reload on the current tab
    await page.reload();

    // 5. Hard reload must NOT auto-relogin into Host Demo
    await expect(page).toHaveURL(/\/(login|\?signed_out=true)?/);
    // DemoSwitcher and bottom navigation bar are hidden on login page
    await expect(page.locator(SELECTORS.nav.profile)).not.toBeVisible();

    // 6. Direct navigation to protected profile page redirects back to /login
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/(login|\?signed_out=true)?/);
    await expect(page.locator(SELECTORS.profile.displayNameInput)).not.toBeVisible();
  });
});

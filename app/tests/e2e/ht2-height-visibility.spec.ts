import { test, expect } from '../helpers/leafletFixture';
import { SELECTORS } from '../helpers/selectors';

const DEMO_USER_HOST = '11111111-1111-4111-8111-111111111111'; // ก้อง (heightVisible: true, height: 178)
const DEMO_USER_JOINER1 = '22222222-2222-4222-8222-222222222222'; // บอย (heightVisible: false, height: 183)
const DEMO_USER_JOINER2 = '33333333-3333-4333-8333-333333333333'; // ต้าร์ (heightVisible: true, height: 191)

test.describe('HoopUp HT2 — User-Controlled Height Visibility Specs', () => {
  test('TC-HT2-01: Toggle is off by default for hidden profile and has accessible Thai copy', async ({
    page,
  }) => {
    // Start with demo reset to ensure fresh state
    await page.goto('/profile?demo_reset=true');
    await page.waitForLoadState('networkidle');

    // Switch to Joiner 1 (บอย), whose seeded default is hidden (false)
    const switchSelect = page.locator(SELECTORS.auth.switchUser);
    if (await switchSelect.isVisible()) {
      await switchSelect.selectOption(DEMO_USER_JOINER1);
      await page.waitForTimeout(300);
    }

    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    // Verify row directly under height input
    const row = page.locator(SELECTORS.profile.heightVisibleRow);
    await expect(row).toBeVisible();

    // Verify Thai label and helper copy
    await expect(row).toContainText('แสดงส่วนสูงให้ผู้เล่นคนอื่นเห็น');
    await expect(row).toContainText('ปิดไว้เป็นค่าเริ่มต้น เฉพาะคุณเท่านั้นที่เห็นส่วนสูงของตัวเอง');

    // Verify switch is off by default for Joiner 1
    const toggle = page.locator(SELECTORS.profile.heightVisibleSwitch);
    await expect(toggle).toBeVisible();
    await expect(toggle).not.toBeChecked();
    await expect(toggle).toHaveAttribute('role', 'switch');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    // Accessible name via label
    const accessibleSwitch = page.getByRole('switch', {
      name: 'แสดงส่วนสูงให้ผู้เล่นคนอื่นเห็น',
    });
    await expect(accessibleSwitch).toBeVisible();
  });

  test('TC-HT2-02: Touch target size is >= 44x44 at 360x800 viewport', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    const toggle = page.locator(SELECTORS.profile.heightVisibleSwitch);
    await expect(toggle).toBeVisible();

    const box = await toggle.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    // Row container min-height
    const row = page.locator(SELECTORS.profile.heightVisibleRow);
    const rowBox = await row.boundingBox();
    expect(rowBox).not.toBeNull();
    expect(rowBox!.height).toBeGreaterThanOrEqual(44);
  });

  test('TC-HT2-03: Keyboard operable — Space key toggles checked and aria-checked states', async ({
    page,
  }) => {
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    const toggle = page.locator(SELECTORS.profile.heightVisibleSwitch);
    await expect(toggle).toBeVisible();

    // Focus switch via keyboard / focus
    await toggle.focus();
    await expect(toggle).toBeFocused();

    const initialChecked = await toggle.isChecked();

    // Press Space to toggle state
    await page.keyboard.press('Space');
    if (initialChecked) {
      await expect(toggle).not.toBeChecked();
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
    } else {
      await expect(toggle).toBeChecked();
      await expect(toggle).toHaveAttribute('aria-checked', 'true');
    }

    // Press Space again to revert state
    await page.keyboard.press('Space');
    if (initialChecked) {
      await expect(toggle).toBeChecked();
      await expect(toggle).toHaveAttribute('aria-checked', 'true');
    } else {
      await expect(toggle).not.toBeChecked();
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
    }
  });

  test('TC-HT2-04: Persists after save and reload, and saves with height filled', async ({
    page,
  }) => {
    await page.goto('/profile?demo_reset=true');
    await page.waitForLoadState('networkidle');

    // Switch to Joiner 1 (บอย)
    const switchSelect = page.locator(SELECTORS.auth.switchUser);
    if (await switchSelect.isVisible()) {
      await switchSelect.selectOption(DEMO_USER_JOINER1);
      await page.waitForTimeout(300);
    }

    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    const heightInput = page.locator(SELECTORS.profile.heightInput);
    const toggle = page.locator(SELECTORS.profile.heightVisibleSwitch);
    const saveBtn = page.locator(SELECTORS.profile.saveBtn);

    // Fill valid height
    await heightInput.fill('185');
    // Turn on height visibility
    await toggle.check();
    await expect(toggle).toBeChecked();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    // Save
    await saveBtn.click();
    await expect(page.locator(SELECTORS.profile.saveSuccess)).toBeVisible();

    // Reload page to verify persistence
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(heightInput).toHaveValue('185');
    await expect(toggle).toBeChecked();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    // Now turn toggle off, save, and reload again
    await toggle.uncheck();
    await expect(toggle).not.toBeChecked();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    await saveBtn.click();
    await expect(page.locator(SELECTORS.profile.saveSuccess)).toBeVisible();

    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(heightInput).toHaveValue('185');
    await expect(toggle).not.toBeChecked();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  test('TC-HT2-05: Viewing another user profile hides/shows height accordingly without leaking hints', async ({
    page,
  }) => {
    await page.goto('/profile?demo_reset=true');
    await page.waitForLoadState('networkidle');

    // Switch to Host (ก้อง)
    const switchSelect = page.locator(SELECTORS.auth.switchUser);
    if (await switchSelect.isVisible()) {
      await switchSelect.selectOption(DEMO_USER_HOST);
      await page.waitForTimeout(300);
    }

    // 1. Host views own profile: sees own height (178) in input
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');
    await expect(page.locator(SELECTORS.profile.heightInput)).toHaveValue('178');

    // 2. Host views Joiner 1 (บอย, heightVisible: false): height must be completely hidden
    await page.goto(`/profile?userId=${DEMO_USER_JOINER1}`);
    await page.waitForLoadState('networkidle');

    // Read-only card visible
    await expect(page.locator('text=ข้อมูลผู้เล่น')).toBeVisible();

    // Height display element must NOT be present
    const heightDisplay = page.locator(SELECTORS.profile.heightDisplay);
    await expect(heightDisplay).toHaveCount(0);

    // Whole page content must never show "183", "null", "0", or empty label
    const pageText = await page.locator('body').innerText();
    expect(pageText).not.toContain('183');
    expect(pageText).not.toContain('null');
    expect(pageText).not.toContain('ส่วนสูง:');
    expect(pageText).not.toContain('ส่วนสูง');

    // 3. Host views Joiner 2 (ต้าร์, heightVisible: true, 191 cm): height IS visible
    await page.goto(`/profile?userId=${DEMO_USER_JOINER2}`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=ข้อมูลผู้เล่น')).toBeVisible();
    await expect(heightDisplay).toBeVisible();
    await expect(heightDisplay).toContainText('191 ซม.');

    // 4. Switch to Joiner 1 (บอย): owner ALWAYS sees their own height (183) on own profile
    await switchSelect.selectOption(DEMO_USER_JOINER1);
    await page.waitForTimeout(300);

    await page.goto('/profile');
    await page.waitForLoadState('networkidle');
    await expect(page.locator(SELECTORS.profile.heightInput)).toHaveValue('183');

    // Toggle on and save
    const toggle = page.locator(SELECTORS.profile.heightVisibleSwitch);
    await toggle.check();
    await page.locator(SELECTORS.profile.saveBtn).click();
    await expect(page.locator(SELECTORS.profile.saveSuccess)).toBeVisible();

    // 5. Switch back to Host (ก้อง) and check Joiner 1 (บอย): now height IS visible
    await switchSelect.selectOption(DEMO_USER_HOST);
    await page.waitForTimeout(300);

    await page.goto(`/profile?userId=${DEMO_USER_JOINER1}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator(SELECTORS.profile.heightDisplay)).toBeVisible();
    await expect(page.locator(SELECTORS.profile.heightDisplay)).toContainText('183 ซม.');
  });

  // Added by claude-app review (2026-11-03): the read-only view used hard-coded dark text on the dark
  // card (contrast 1.06:1) and showed made-up defaults for an unknown user.
  test('TC-HT2-06: read-only view text has contrast >= 4.5:1 on the card', async ({ page }) => {
    await page.goto(`/profile/${DEMO_USER_JOINER2}?demo_reset=true`);
    await expect(page.locator(SELECTORS.profile.heightDisplay)).toBeVisible();

    const ratios = await page.evaluate(() => {
      const lum = (c: string) => {
        const m = c.match(/[\d.]+/g)!.map(Number);
        const f = (v: number) => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]);
      };
      const bgOf = (el: Element | null): string => {
        while (el) {
          const b = getComputedStyle(el).backgroundColor;
          if (b && !b.startsWith('rgba(0, 0, 0, 0)') && b !== 'transparent') return b;
          el = el.parentElement;
        }
        return 'rgb(0, 0, 0)';
      };
      const card = Array.from(document.querySelectorAll('div')).find(
        (d) => d.textContent?.trim().startsWith('ข้อมูลผู้เล่น') && d.querySelector('[data-testid="profile-height-display"]'),
      );
      const out: { text: string; ratio: number }[] = [];
      card?.querySelectorAll('span, div').forEach((e) => {
        const text = e.children.length === 0 ? e.textContent?.trim() : '';
        if (!text) return;
        const a = lum(getComputedStyle(e).color);
        const b = lum(bgOf(e));
        out.push({ text, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) });
      });
      return out;
    });

    expect(ratios.length).toBeGreaterThanOrEqual(5);
    for (const r of ratios) {
      expect(r.ratio, `contrast of "${r.text}"`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('TC-HT2-07: unknown user shows a not-found note, not made-up defaults', async ({ page }) => {
    await page.goto('/profile/99999999-9999-4999-8999-999999999999?demo_reset=true');
    await expect(page.locator(SELECTORS.profile.notFound)).toBeVisible();
    const text = await page.locator('main').innerText();
    expect(text).not.toContain('Casual');
    expect(text).not.toContain('ตำแหน่งหลัก');
    expect(text).not.toContain('ส่วนสูง');
    expect(text).not.toContain('null');
  });
});

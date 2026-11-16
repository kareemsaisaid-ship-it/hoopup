import { test, expect } from '../helpers/leafletFixture';
import path from 'path';
import fs from 'fs';
import { SELECTORS } from '../helpers/selectors';

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'docs/qa/screenshots_fix3');

test.describe('HoopUp FIX3 — Confirmed REV4 Review Findings Tests', () => {
  test.beforeEach(async ({ page }) => {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
    await page.setViewportSize({ width: 360, height: 800 });
  });

  test('TC-FIX3-01 (F01): EditSessionPage allows editing session when startsAt is unchanged, but rejects past time when changed', async ({
    page,
  }) => {
    // 1. Reset demo and create a session with "⚡ ตอนนี้"
    await page.goto('/?demo_reset=true');
    await page.waitForLoadState('networkidle');

    await page.locator(SELECTORS.nav.createSession).click();
    await page.locator(SELECTORS.createSession.titleInput).fill('นัดบาสตอนเย็น F01');
    await page.locator(SELECTORS.createSession.timingNow).click();
    await page.locator(SELECTORS.createSession.teamSize5).click();
    await page.locator(SELECTORS.createSession.submitBtn).click();

    // 2. Wait for detail page and extract session ID
    await page.waitForURL(/\/sessions\/[a-f0-9-]+/);
    const url = page.url();
    const match = url.match(/\/sessions\/([a-f0-9-]+)/);
    expect(match).toBeTruthy();
    const sessionId = match![1];

    // 3. Navigate to Edit page
    await page.goto(`/sessions/${sessionId}/edit`);
    await page.waitForLoadState('networkidle');

    // 4. Edit only meeting point without changing startsAt
    const meetingPointInput = page.locator('[data-testid="session-edit-meeting-point"]');
    await expect(meetingPointInput).toBeVisible();
    await meetingPointInput.fill('ข้างแป้น 2 ฝั่งทิศใต้');

    const submitBtn = page.locator('[data-testid="session-edit-submit-btn"]');
    await submitBtn.click();

    // 5. Verify save succeeds and navigates back to session detail
    await page.waitForURL(`/sessions/${sessionId}`);
    await expect(page.locator(SELECTORS.sessionDetail.title)).toBeVisible();

    // Capture screenshot: edit-session saved
    const shotPath1 = path.join(SCREENSHOT_DIR, 'edit-session-saved.png');
    const shotPath1Alt = path.join(SCREENSHOT_DIR, 'edit_session_saved.png');
    await page.screenshot({ path: shotPath1, fullPage: false });
    fs.copyFileSync(shotPath1, shotPath1Alt);
    expect(fs.existsSync(shotPath1)).toBe(true);

    // 6. Return to edit page and deliberately pick a past time
    await page.goto(`/sessions/${sessionId}/edit`);
    await page.waitForLoadState('networkidle');

    const startsAtInput = page.locator('[data-testid="session-edit-starts-at"]');
    await startsAtInput.fill('2026-10-15T10:00');
    await page.locator('[data-testid="session-edit-submit-btn"]').click();

    // Verify error is shown and submission is blocked
    const errorMsg = page.locator('text=ไม่สามารถเลือกเวลาในอดีตได้');
    await expect(errorMsg).toBeVisible();
    expect(page.url()).toContain(`/sessions/${sessionId}/edit`);
  });

  test('TC-FIX3-02 (F02): CourtsMap preserves Leaflet instance and DOM node across search keystrokes', async ({
    page,
  }) => {
    await page.goto('/courts?view=map');
    await page.waitForLoadState('networkidle');

    const courtsMap = page.locator('[data-testid="courts-map"]');
    await expect(courtsMap).toBeVisible();

    // Initial build counter must be 1
    await expect(courtsMap).toHaveAttribute('data-map-builds', '1');
    const initialPinTotal = await courtsMap.getAttribute('data-pin-total');
    expect(Number(initialPinTotal)).toBeGreaterThan(1);

    // Type in search box to filter to a specific court
    const searchInput = page.locator('input[placeholder*="ค้นหาชื่อสนาม"]');
    await searchInput.fill('สวนเบญจกิติ');

    // Wait for pin count to update to 1
    await expect(courtsMap).toHaveAttribute('data-pin-total', '1');

    // Crucial F02 check: Leaflet map instance was NOT rebuilt (data-map-builds stays 1)
    await expect(courtsMap).toHaveAttribute('data-map-builds', '1');

    // Marker for Benjakitti remains visible on map
    const benjakittiPin = page.locator('[title="สวนเบญจกิติ (Benjakitti Park)"]');
    await expect(benjakittiPin).toBeVisible();

    // Capture screenshot: courts map after typing a search
    const shotPath2 = path.join(SCREENSHOT_DIR, 'courts-map-search.png');
    const shotPath2Alt = path.join(SCREENSHOT_DIR, 'courts_map_search.png');
    await page.screenshot({ path: shotPath2, fullPage: false });
    fs.copyFileSync(shotPath2, shotPath2Alt);
    expect(fs.existsSync(shotPath2)).toBe(true);
  });

  test('TC-FIX3-03 (F03): User location marker restores cleanly when toggling list -> map -> list -> map', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 13.7466, longitude: 100.5348 });

    // 1. Open map view and locate
    await page.goto('/courts?view=map');
    await page.waitForLoadState('networkidle');

    const locateBtn = page.locator('[data-testid="courts-locate"]');
    await locateBtn.click();

    const userPin = page.locator('[data-testid="user-location-pin"]');
    await expect(userPin).toBeVisible({ timeout: 5000 });

    // 2. Toggle to list view (unmounts CourtsMap)
    const listViewBtn = page.locator('button:has-text("รายการ")').first();
    await listViewBtn.click();
    await expect(userPin).not.toBeVisible();

    // 3. Toggle back to map view (mounts new CourtsMap instance)
    const mapViewBtn = page.locator('button:has-text("แผนที่")').first();
    await mapViewBtn.click();
    await expect(page.locator('[data-testid="courts-map"]')).toBeVisible();

    // 4. Tap locate again -> userMarkerRef was cleaned up and new pin is created & visible
    const newLocateBtn = page.locator('[data-testid="courts-locate"]');
    await newLocateBtn.click();
    await expect(page.locator('[data-testid="user-location-pin"]')).toBeVisible({ timeout: 5000 });
  });

  test('TC-FIX3-04 (F04): CreateSessionPage preselects court from ?court=<id> parameter', async ({ page }) => {
    // 1. Navigate to Courts page in list view
    await page.goto('/courts?demo_reset=true');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.court-card').first()).toBeVisible({ timeout: 10000 });

    // 2. Find Lumpini Court card (+ สร้างนัดที่นี่)
    const lumpiniCourtId = 'c2222222-2222-4222-8222-222222222222';
    const lumpiniCard = page.locator('.court-card').filter({ hasText: 'สวนลุมพินี' }).first();
    await expect(lumpiniCard).toBeVisible();

    const createHereBtn = lumpiniCard.locator('button:has-text("+ สร้างนัดที่นี่")');
    await createHereBtn.click();

    // 3. Verify landing on /sessions/new?court=c2222222-2222-4222-8222-222222222222
    await page.waitForURL(new RegExp(`/sessions/new\\?court=${lumpiniCourtId}`));

    // 4. Verify court <select> value equals lumpiniCourtId and displays court name
    const courtSelect = page.locator(SELECTORS.createSession.courtSelect);
    await expect(courtSelect).toHaveValue(lumpiniCourtId);
    const selectedOption = courtSelect.locator('option:checked');
    await expect(selectedOption).toContainText('สวนลุมพินี');

    // Capture screenshot: create form with court preselected
    const shotPath3 = path.join(SCREENSHOT_DIR, 'create-form-court-preselected.png');
    const shotPath3Alt = path.join(SCREENSHOT_DIR, 'create_form_court_preselected.png');
    await page.screenshot({ path: shotPath3, fullPage: false });
    fs.copyFileSync(shotPath3, shotPath3Alt);
    expect(fs.existsSync(shotPath3)).toBe(true);
  });

  test('TC-FIX3-05 (F07): จบนัด opens confirm modal, captures screenshot, and supports cancelled status', async ({
    page,
  }) => {
    // 1. Reset demo and create a session
    await page.goto('/?demo_reset=true');
    await page.waitForLoadState('networkidle');

    await page.locator(SELECTORS.nav.createSession).click();
    await page.locator(SELECTORS.createSession.titleInput).fill('นัดที่จะยกเลิก F07');
    await page.locator(SELECTORS.createSession.timingNow).click();
    await page.locator(SELECTORS.createSession.teamSize5).click();
    await page.locator(SELECTORS.createSession.submitBtn).click();

    await page.waitForURL(/\/sessions\/[a-f0-9-]+/);

    // 2. Click "🏁 จบนัด"
    const endBtn = page.locator(SELECTORS.sessionDetail.endSessionBtn);
    await expect(endBtn).toBeVisible();
    await endBtn.click();

    // 3. Verify Modal opens with both Completed and Cancelled options
    const endModal = page.locator(SELECTORS.sessionDetail.endModal);
    await expect(endModal).toBeVisible();

    const completedBtn = page.locator(SELECTORS.sessionDetail.endConfirmCompletedBtn);
    const cancelledBtn = page.locator(SELECTORS.sessionDetail.endConfirmCancelledBtn);
    await expect(completedBtn).toBeVisible();
    await expect(cancelledBtn).toBeVisible();

    // Capture screenshot: end-session modal
    const shotPath4 = path.join(SCREENSHOT_DIR, 'end-session-modal.png');
    const shotPath4Alt = path.join(SCREENSHOT_DIR, 'end_session_modal.png');
    await page.screenshot({ path: shotPath4, fullPage: false });
    fs.copyFileSync(shotPath4, shotPath4Alt);
    expect(fs.existsSync(shotPath4)).toBe(true);

    // 4. Click Cancelled option
    await cancelledBtn.click();

    // Verify modal closes and session status is updated to cancelled
    await expect(endModal).not.toBeVisible();
    await expect(page.locator(SELECTORS.sessionDetail.status)).toContainText(/ยกเลิก|cancelled/i);
    await expect(page.locator(SELECTORS.chat.sendBtn)).toBeDisabled();
  });

  test('TC-FIX3-06 (F09): ProfilePage validates height 100-250 cm and blocks save with Thai error', async ({
    page,
  }) => {
    await page.goto('/profile?demo_reset=true');
    await page.waitForLoadState('networkidle');

    const heightInput = page.locator('[data-testid="profile-height-input"]');
    const saveBtn = page.locator('[data-testid="profile-save-btn"]');
    await expect(heightInput).toBeVisible();

    // 1. Enter height below 100 cm (e.g. 50)
    await heightInput.fill('50');
    await expect(saveBtn).toBeDisabled();

    const validationAlert = page.locator('text=กรุณาระบุส่วนสูงที่ถูกต้อง (ระหว่าง 100 ถึง 250 ซม.)');
    await expect(validationAlert).toBeVisible();

    // 2. Enter height above 250 cm (e.g. 299)
    await heightInput.fill('299');
    await expect(saveBtn).toBeDisabled();
    await expect(validationAlert).toBeVisible();

    // 3. Enter valid height (e.g. 182)
    await heightInput.fill('182');
    await expect(validationAlert).not.toBeVisible();
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // Verify save success banner
    const successAlert = page.locator('text=บันทึกข้อมูลโปรไฟล์เรียบร้อย');
    await expect(successAlert).toBeVisible();
  });

  test('TC-FIX3-07 (F08): Icon-only buttons have Thai aria-label and bounding box >= 44x44 at 360x800', async ({
    page,
    context,
  }) => {
    // 1. Bottom Navigation create button
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const navCreateBtn = page.locator('[data-testid="nav-create-session"]');
    await expect(navCreateBtn).toHaveAttribute('aria-label', /สร้างนัด/);
    const navBox = await navCreateBtn.boundingBox();
    expect(navBox).toBeTruthy();
    expect(navBox!.width).toBeGreaterThanOrEqual(44);
    expect(navBox!.height).toBeGreaterThanOrEqual(44);

    // 2. Theme search clear button (on /profile)
    await page.goto('/profile');
    await page.waitForLoadState('networkidle');

    const themeSearchInput = page.locator('input[placeholder*="ค้นหาทีม"]');
    await themeSearchInput.fill('Lakers');

    const themeClearBtn = page.locator('[data-testid="theme-search-clear-btn"]');
    await expect(themeClearBtn).toBeVisible();
    await expect(themeClearBtn).toHaveAttribute('aria-label', /ล้างคำค้นหา/);
    const clearBox = await themeClearBtn.boundingBox();
    expect(clearBox).toBeTruthy();
    expect(clearBox!.width).toBeGreaterThanOrEqual(44);
    expect(clearBox!.height).toBeGreaterThanOrEqual(44);

    // 3. CourtsMap GPS alert close button
    await context.clearPermissions();
    await page.goto('/courts?view=map');
    await page.waitForLoadState('networkidle');

    const locateBtn = page.locator('[data-testid="courts-locate"]');
    await locateBtn.click();

    const locateErrorClose = page.locator('[data-testid="courts-locate-error-close"]');
    await expect(locateErrorClose).toBeVisible();
    await expect(locateErrorClose).toHaveAttribute('aria-label', /ปิดการแจ้งเตือนตำแหน่ง/);
    const alertCloseBox = await locateErrorClose.boundingBox();
    expect(alertCloseBox).toBeTruthy();
    expect(alertCloseBox!.width).toBeGreaterThanOrEqual(44);
    expect(alertCloseBox!.height).toBeGreaterThanOrEqual(44);

    // 4. DemoSwitcher controls
    const switchSelect = page.locator('[data-testid="auth-switch-user"]');
    await expect(switchSelect).toHaveAttribute('aria-label', /สลับ/);

    const signoutBtn = page.locator('[data-testid="auth-signout-btn"]');
    await expect(signoutBtn).toHaveAttribute('aria-label', /ออกจากระบบ/);

    // 5. MemberList & SessionChat report/block buttons
    // Switch to Joiner and visit an active session with messages and other members
    await switchSelect.selectOption({ label: 'Joiner (ผู้เข้าร่วม)' });
    await page.goto('/sessions/s1111111-1111-4111-8111-111111111111');
    await page.waitForLoadState('networkidle');

    // Member report & block buttons for other members
    const memberReportBtn = page.locator('[data-testid="member-report-btn"]').first();
    if (await memberReportBtn.isVisible()) {
      await expect(memberReportBtn).toHaveAttribute('aria-label', /รายงาน/);
      const repBox = await memberReportBtn.boundingBox();
      expect(repBox!.width).toBeGreaterThanOrEqual(44);
      expect(repBox!.height).toBeGreaterThanOrEqual(44);
    }

    const memberBlockBtn = page.locator('[data-testid="member-block-btn"]').first();
    if (await memberBlockBtn.isVisible()) {
      await expect(memberBlockBtn).toHaveAttribute('aria-label', /บล็อก/);
      const blkBox = await memberBlockBtn.boundingBox();
      expect(blkBox!.width).toBeGreaterThanOrEqual(44);
      expect(blkBox!.height).toBeGreaterThanOrEqual(44);
    }

    // Chat report message button
    const chatReportBtn = page.locator('[data-testid="chat-report-message-btn"]').first();
    if (await chatReportBtn.isVisible()) {
      await expect(chatReportBtn).toHaveAttribute('aria-label', /รายงาน/);
      const chatBox = await chatReportBtn.boundingBox();
      expect(chatBox!.width).toBeGreaterThanOrEqual(44);
      expect(chatBox!.height).toBeGreaterThanOrEqual(44);
    }
  });
});

import { test, expect } from '@playwright/test';
import { SELECTORS } from '../helpers/selectors';

/**
 * TC-E2E-01: Full Happy Path Acceptance Flow
 * Two independent browser contexts (Host and Joiner)
 * Validates session creation, capacity math (3/5 -> 4/5 -> 3/5),
 * approval workflow, real-time-like chat, withdrawal, and session lifecycle closure.
 */
test.describe('HoopUp MVP — Core Acceptance Flow (Happy Path)', () => {
  test('Complete interaction: Host creates with 2 guests -> Joiner requests -> Host approves -> Chat -> Withdraw -> End', async ({
    browser,
  }) => {
    // 1. Setup two independent contexts representing two real users
    const hostContext = await browser.newContext();
    const joinerContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const joinerPage = await joinerContext.newPage();

    // Collect browser console errors to enforce zero-runtime-error acceptance rule
    const consoleErrors: string[] = [];
    hostPage.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`[Host Console Error]: ${msg.text()}`);
    });
    joinerPage.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`[Joiner Console Error]: ${msg.text()}`);
    });

    // Step A: Host opens application and switches identity
    await hostPage.goto('/?demo_reset=true');
    await hostPage.waitForLoadState('networkidle');

    if (await hostPage.locator(SELECTORS.auth.switchUser).isVisible()) {
      await hostPage.locator(SELECTORS.auth.switchUser).selectOption({ label: 'Host (ผู้จัด)' });
    }

    // Step B: Host navigates to Create Session
    await hostPage.locator(SELECTORS.nav.createSession).click();
    await expect(hostPage.locator(SELECTORS.createSession.titleInput)).toBeVisible();

    // Fill form: 5x5, 2 guests, Approval policy, Timing: Now
    await hostPage.locator(SELECTORS.createSession.titleInput).fill('บาสเย็นนี้ 5x5 สวนลุม');
    if (await hostPage.locator(SELECTORS.createSession.courtSelect).isVisible()) {
      await hostPage.locator(SELECTORS.createSession.courtSelect).selectOption({ index: 1 });
    }
    await hostPage.locator(SELECTORS.createSession.timingNow).click();
    await hostPage.locator(SELECTORS.createSession.teamSize5).click();
    await hostPage.locator(SELECTORS.createSession.guestCountInput).fill('2');
    await hostPage.locator(SELECTORS.createSession.policyApproval).click();
    await hostPage.locator(SELECTORS.createSession.meetingPointInput).fill('ข้างแป้นสนาม 2');
    await hostPage.locator(SELECTORS.createSession.notesInput).fill('เล่นสนุกๆ ไม่ซีเรียส');

    // Submit session creation
    await hostPage.locator(SELECTORS.createSession.submitBtn).click();

    // Step C: Verify Host is redirected to Session Detail
    await expect(hostPage.locator(SELECTORS.sessionDetail.title)).toContainText('บาสเย็นนี้ 5x5 สวนลุม');
    // Verify capacity: Host (1) + Guests (2) in Team 5 = 3/5
    await expect(hostPage.locator(SELECTORS.sessionDetail.capacity)).toContainText('3/5');
    await expect(hostPage.locator(SELECTORS.sessionDetail.status)).toContainText('เปิดรับ');

    // Extract current session URL or ID
    const _sessionUrl = hostPage.url();

    // Step D: Joiner opens Feed
    await joinerPage.goto('/');
    await joinerPage.waitForLoadState('networkidle');

    if (await joinerPage.locator(SELECTORS.auth.switchUser).isVisible()) {
      await joinerPage.locator(SELECTORS.auth.switchUser).selectOption({ label: 'Joiner (ผู้เข้าร่วม)' });
    }

    // Joiner finds the session in feed
    const targetSessionCard = joinerPage.locator(SELECTORS.feed.anySessionCard).first();
    await expect(targetSessionCard).toBeVisible();
    await expect(targetSessionCard.locator(SELECTORS.feed.cardCapacity)).toContainText('3/5');

    // Joiner clicks card or navigates directly to session
    await targetSessionCard.click();
    await expect(joinerPage.locator(SELECTORS.sessionDetail.title)).toContainText('บาสเย็นนี้ 5x5 สวนลุม');

    // Joiner requests to join
    await expect(joinerPage.locator(SELECTORS.sessionDetail.joinBtn)).toBeVisible();
    await joinerPage.locator(SELECTORS.sessionDetail.joinBtn).click();

    // Joiner button state should reflect Pending
    await expect(joinerPage.locator(SELECTORS.sessionDetail.joinBtn)).toContainText(/รออนุมัติ|ส่งคำขอแล้ว/);

    // Step E: Verify Host side pending requests
    await hostPage.reload();
    await hostPage.waitForLoadState('networkidle');

    // Capacity must remain 3/5 (Pending requests do NOT consume seats)
    await expect(hostPage.locator(SELECTORS.sessionDetail.capacity)).toContainText('3/5');

    // Host approves joiner
    const approveBtn = hostPage.locator('[data-testid^="request-approve-"]').first();
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();

    // Step F: Capacity updates to 4/5 on both screens
    await expect(hostPage.locator(SELECTORS.sessionDetail.capacity)).toContainText('4/5');

    await joinerPage.reload();
    await joinerPage.waitForLoadState('networkidle');
    await expect(joinerPage.locator(SELECTORS.sessionDetail.capacity)).toContainText('4/5');

    // Step G: Chat interaction
    // Host sends message
    await expect(hostPage.locator(SELECTORS.chat.input)).toBeVisible();
    await hostPage.locator(SELECTORS.chat.input).fill('ยินดีต้อนรับครับ เจอกันสนาม 2 นะ');
    await hostPage.locator(SELECTORS.chat.sendBtn).click();

    // Joiner receives message
    await joinerPage.reload(); // or wait for shared mock poll
    await expect(joinerPage.locator(SELECTORS.chat.container)).toContainText('ยินดีต้อนรับครับ');

    // Joiner replies
    await joinerPage.locator(SELECTORS.chat.input).fill('สวัสดีครับ กำลังออกเดินทางครับ');
    await joinerPage.locator(SELECTORS.chat.sendBtn).click();

    // Host receives reply
    await hostPage.reload();
    await expect(hostPage.locator(SELECTORS.chat.container)).toContainText('กำลังออกเดินทางครับ');

    // Step H: Joiner withdraws
    await expect(joinerPage.locator(SELECTORS.sessionDetail.withdrawBtn)).toBeVisible();
    await joinerPage.locator(SELECTORS.sessionDetail.withdrawBtn).click();

    // Capacity drops back to 3/5
    await joinerPage.reload();
    await expect(joinerPage.locator(SELECTORS.sessionDetail.capacity)).toContainText('3/5');

    await hostPage.reload();
    await expect(hostPage.locator(SELECTORS.sessionDetail.capacity)).toContainText('3/5');

    // Step I: Host ends session (modal confirm flow)
    await expect(hostPage.locator(SELECTORS.sessionDetail.endSessionBtn)).toBeVisible();
    await hostPage.locator(SELECTORS.sessionDetail.endSessionBtn).click();
    await expect(hostPage.locator(SELECTORS.sessionDetail.endModal)).toBeVisible();
    await hostPage.locator(SELECTORS.sessionDetail.endConfirmCompletedBtn).click();

    // Verify session status is ended / completed
    await expect(hostPage.locator(SELECTORS.sessionDetail.status)).toContainText(/จบ|สิ้นสุด|completed/i);

    // Verify chat sending and join actions are locked on ended session
    await expect(hostPage.locator(SELECTORS.chat.sendBtn)).toBeDisabled();
    await expect(joinerPage.locator(SELECTORS.sessionDetail.joinBtn)).toBeDisabled();

    // Assert zero uncaught console errors
    expect(consoleErrors).toEqual([]);

    await hostContext.close();
    await joinerContext.close();
  });
});

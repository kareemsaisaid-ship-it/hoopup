import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOT_DIR = path.resolve(__dirname, '../../docs/qa/screenshots_be2');

function getBackendUrl(): string {
  const envPath = path.resolve(__dirname, '../../.connected-env.json');
  if (fs.existsSync(envPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(envPath, 'utf8'));
      if (data.backendUrl) return data.backendUrl;
    } catch {}
  }
  return process.env.VITE_API_BASE_URL || 'http://localhost:3000';
}

test.describe('HoopUp Connected API Acceptance Suite (BE2)', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
  });

  test('TC-BE2-01: Sign up two users in the UI and capture 360x800 login/sign-up screenshots', async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });

    // 1. Visit Login Page in Connected Mode
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Verify connected-api mode tabs are present
    const signInTab = page.locator('[data-testid="auth-tab-signin"]');
    const signUpTab = page.locator('[data-testid="auth-tab-signup"]');
    await expect(signInTab).toBeVisible();
    await expect(signUpTab).toBeVisible();

    // Capture screenshot: Connected Login Form
    const loginShot = path.join(SCREENSHOT_DIR, '01_connected_login_form.png');
    await page.screenshot({ path: loginShot, fullPage: false });
    expect(fs.existsSync(loginShot)).toBe(true);

    // Switch to Sign-up Tab
    await signUpTab.click();
    const nameInput = page.locator('[data-testid="auth-name-input"]');
    await expect(nameInput).toBeVisible();

    // Capture screenshot: Connected Sign-up Form
    const signupShot = path.join(SCREENSHOT_DIR, '02_connected_signup_form.png');
    await page.screenshot({ path: signupShot, fullPage: false });
    expect(fs.existsSync(signupShot)).toBe(true);

    // Sign up User 1 (Host)
    const hostEmail = `host_ui_${Date.now()}@hoopup.test`;
    await nameInput.fill('โฮสต์ ตะลุยเดี่ยว');
    await page.locator('[data-testid="auth-email-input"]').fill(hostEmail);
    await page.locator('[data-testid="auth-password-input"]').fill('PasswordValid123!');
    await page.locator('[data-testid="auth-submit-btn"]').click();

    // Expect navigation to feed page
    await page.waitForURL('**/');
    const currentUserBadge = page.locator('[data-testid="auth-current-user"]');
    await expect(currentUserBadge).toContainText('โฮสต์ ตะลุยเดี่ยว');

    // 2. Sign up User 2 (Joiner) in a separate browser context
    const context2 = await browser.newContext({
      viewport: { width: 360, height: 800 },
      isMobile: true,
      hasTouch: true,
    });
    const page2 = await context2.newPage();
    await page2.goto('/login');
    await page2.locator('[data-testid="auth-tab-signup"]').click();

    const joinerEmail = `joiner_ui_${Date.now()}@hoopup.test`;
    await page2.locator('[data-testid="auth-name-input"]').fill('จอยเนอร์ นักชู้ต');
    await page2.locator('[data-testid="auth-email-input"]').fill(joinerEmail);
    await page2.locator('[data-testid="auth-password-input"]').fill('PasswordValid123!');
    await page2.locator('[data-testid="auth-submit-btn"]').click();

    await page2.waitForURL('**/');
    await expect(page2.locator('[data-testid="auth-current-user"]')).toContainText('จอยเนอร์ นักชู้ต');

    await context2.close();
  });

  test('TC-BE2-02: Host creates session, joiner joins, both chat and capture 360x800 screenshot', async ({
    page: hostPage,
    browser,
  }) => {
    await hostPage.setViewportSize({ width: 360, height: 800 });

    // Host sign up
    const hostEmail = `host_flow_${Date.now()}@hoopup.test`;
    await hostPage.goto('/login');
    await hostPage.locator('[data-testid="auth-tab-signup"]').click();
    await hostPage.locator('[data-testid="auth-name-input"]').fill('โฮสต์ ชวนเล่น');
    await hostPage.locator('[data-testid="auth-email-input"]').fill(hostEmail);
    await hostPage.locator('[data-testid="auth-password-input"]').fill('PasswordValid123!');
    await hostPage.locator('[data-testid="auth-submit-btn"]').click();
    await hostPage.waitForURL('**/');

    // Host creates session
    await hostPage.goto('/sessions/new');
    await hostPage.waitForLoadState('networkidle');

    await hostPage.locator('[data-testid="session-form-title"]').fill('บาส 3x3 เบญจกิติ รอบเย็น');

    // Select team size 3
    await hostPage.locator('[data-testid="session-form-teamsize-3"]').click();

    // Submit form
    await hostPage.locator('[data-testid="session-form-submit-btn"]').click();

    // Wait for session detail page
    await hostPage.waitForURL(/\/sessions\/[0-9a-fA-F-]{10,}/);
    const sessionUrl = hostPage.url();
    const sessionId = sessionUrl.split('/sessions/')[1]?.split('?')[0];
    expect(sessionId).toBeTruthy();
    expect(sessionId).not.toBe('new');

    // Joiner signs up in a second context
    const joinerContext = await browser.newContext({
      viewport: { width: 360, height: 800 },
      isMobile: true,
      hasTouch: true,
    });
    const joinerPage = await joinerContext.newPage();

    const joinerEmail = `joiner_flow_${Date.now()}@hoopup.test`;
    await joinerPage.goto('/login');
    await joinerPage.locator('[data-testid="auth-tab-signup"]').click();
    await joinerPage.locator('[data-testid="auth-name-input"]').fill('จอยเนอร์ พอยต์การ์ด');
    await joinerPage.locator('[data-testid="auth-email-input"]').fill(joinerEmail);
    await joinerPage.locator('[data-testid="auth-password-input"]').fill('PasswordValid123!');
    await joinerPage.locator('[data-testid="auth-submit-btn"]').click();
    await joinerPage.waitForURL('**/');

    // Joiner navigates to session detail
    await joinerPage.goto(`/sessions/${sessionId}`);
    await joinerPage.waitForLoadState('networkidle');

    // Joiner joins session
    const joinBtn = joinerPage.locator('[data-testid="session-action-join"]');
    await expect(joinBtn).toBeVisible();
    await joinBtn.click();

    // Verify joiner is confirmed
    await expect(joinerPage.locator('text=คุณเป็นสมาชิกในนัดนี้แล้ว')).toBeVisible({ timeout: 10000 });

    // Joiner sends chat message
    const chatInputJoiner = joinerPage.locator('[data-testid="chat-input"]');
    await chatInputJoiner.fill('สวัสดีครับโฮสต์ เจอกันที่คอร์ต 1 นะครับ');
    await joinerPage.locator('[data-testid="chat-send-btn"]').click();

    // Verify message appears in joiner chat
    await expect(joinerPage.locator('[data-testid="chat-message-item"]').first()).toContainText(
      'สวัสดีครับโฮสต์ เจอกันที่คอร์ต 1 นะครับ'
    );

    // Host refreshes chat to see joiner message
    await hostPage.reload();
    await hostPage.waitForLoadState('networkidle');
    await expect(hostPage.locator('[data-testid="chat-message-item"]').first()).toContainText(
      'สวัสดีครับโฮสต์ เจอกันที่คอร์ต 1 นะครับ'
    );

    // Host replies
    const chatInputHost = hostPage.locator('[data-testid="chat-input"]');
    await chatInputHost.fill('ได้เลยครับ ผมถึงสนามแล้ว ใส่เสื้อสีดำ');
    await hostPage.locator('[data-testid="chat-send-btn"]').click();

    // Verify both messages visible for host
    const hostMessages = hostPage.locator('[data-testid="chat-message-item"]');
    await expect(hostMessages).toHaveCount(2);

    // Capture screenshot: Chat between two users
    const chatShot = path.join(SCREENSHOT_DIR, '03_connected_chat_two_users.png');
    await hostPage.screenshot({ path: chatShot, fullPage: false });
    expect(fs.existsSync(chatShot)).toBe(true);

    await joinerContext.close();
  });

  test('TC-BE2-03: Outsider cannot see the chat in UI and via direct API call (RLS enforcement)', async ({
    page: hostPage,
    browser,
    playwright,
  }) => {
    const api = await playwright.request.newContext({ baseURL: getBackendUrl() });

    // 1. Host creates a session via UI
    await hostPage.goto('/login');
    await hostPage.locator('[data-testid="auth-tab-signup"]').click();
    await hostPage.locator('[data-testid="auth-name-input"]').fill('โฮสต์ เจ้าของนัด');
    await hostPage.locator('[data-testid="auth-email-input"]').fill(`host_rls_${Date.now()}@hoopup.test`);
    await hostPage.locator('[data-testid="auth-password-input"]').fill('PasswordValid123!');
    await hostPage.locator('[data-testid="auth-submit-btn"]').click();
    await hostPage.waitForURL('**/');

    await hostPage.goto('/sessions/new');
    await hostPage.locator('[data-testid="session-form-title"]').fill('นัดบาสส่วนตัว ห้ามบุคคลภายนอกดูแชท');
    await hostPage.locator('[data-testid="session-form-submit-btn"]').click();
    await hostPage.waitForURL(/\/sessions\/[0-9a-fA-F-]{10,}/);

    const sessionId = hostPage.url().split('/sessions/')[1]?.split('?')[0];
    expect(sessionId).toBeTruthy();
    expect(sessionId).not.toBe('new');

    // Host sends a private message
    await hostPage.locator('[data-testid="chat-input"]').fill('รหัสผ่านตู้เก็บของ 9988');
    await hostPage.locator('[data-testid="chat-send-btn"]').click();
    await expect(hostPage.locator('[data-testid="chat-message-item"]')).toHaveCount(1);

    // 2. Outsider signs up via API
    const outsiderEmail = `outsider_${Date.now()}@hoopup.test`;
    const signupRes = await api.post('/auth/signup', {
      data: {
        email: outsiderEmail,
        password: 'PasswordValid123!',
        displayName: 'บุคคลภายนอก',
      },
    });
    expect(signupRes.status()).toBe(201);
    const outsiderData = await signupRes.json();
    const outsiderToken = outsiderData.accessToken;
    expect(outsiderToken).toBeTruthy();

    // 3. UI Check: Outsider visits session detail page
    const outsiderContext = await browser.newContext({
      viewport: { width: 360, height: 800 },
      isMobile: true,
      hasTouch: true,
    });
    const outsiderPage = await outsiderContext.newPage();

    // Log in outsider in UI
    await outsiderPage.goto('/login');
    await outsiderPage.locator('[data-testid="auth-email-input"]').fill(outsiderEmail);
    await outsiderPage.locator('[data-testid="auth-password-input"]').fill('PasswordValid123!');
    await outsiderPage.locator('[data-testid="auth-submit-btn"]').click();
    await outsiderPage.waitForURL('**/');

    // Visit session
    await outsiderPage.goto(`/sessions/${sessionId}`);
    await outsiderPage.waitForLoadState('networkidle');

    // Assert UI shows forbidden banner and 0 messages
    const forbiddenBanner = outsiderPage.locator('[data-testid="chat-forbidden-banner"]');
    await expect(forbiddenBanner).toBeVisible();
    const messageItems = outsiderPage.locator('[data-testid="chat-message-item"]');
    await expect(messageItems).toHaveCount(0);
    const pageText = await outsiderPage.content();
    expect(pageText).not.toContain('รหัสผ่านตู้เก็บของ 9988');

    // 4. Direct API Check: Outsider calls GET /messages with their token
    const directApiRes = await api.get(`/messages?sessionId=${sessionId}`, {
      headers: {
        Authorization: `Bearer ${outsiderToken}`,
      },
    });
    expect(directApiRes.status()).toBe(200);
    const messages = await directApiRes.json();
    // PostgreSQL RLS policy filters out private messages for non-members
    expect(Array.isArray(messages)).toBe(true);
    expect(messages).toHaveLength(0);

    await outsiderContext.close();
  });

  test('TC-BE2-04: Concurrency test — 8 parallel joins for the last seat results in exactly one success', async ({
    playwright,
  }) => {
    const api = await playwright.request.newContext({ baseURL: getBackendUrl() });

    // 1. Host creates a session with 1 seat remaining (teamSize: 3, guestCount: 1, host occupies 1 => 2 occupied out of 3)
    const hostRes = await api.post('/auth/signup', {
      data: {
        email: `concur_host_${Date.now()}@hoopup.test`,
        password: 'PasswordValid123!',
        displayName: 'โฮสต์ คอนเคอร์เรนต์',
      },
    });
    expect(hostRes.status()).toBe(201);
    const hostData = await hostRes.json();

    const courtsRes = await api.get('/courts', {
      headers: { Authorization: `Bearer ${hostData.accessToken}` },
    });
    const courts = await courtsRes.json();
    const courtId = courts[0].id;

    const createRes = await api.post('/rpc/hoopup_create_session', {
      headers: { Authorization: `Bearer ${hostData.accessToken}` },
      data: {
        p_request_id: crypto.randomUUID(),
        p_input: {
          title: '3x3 แข่งแย่งที่นั่งสุดท้าย',
          courtId,
          startsAt: null,
          teamSize: 3,
          guestCount: 1, // Host brings 1 friend. Occupied = 2. Seats remaining = 1.
          joinPolicy: 'instant',
        },
      },
    });
    expect(createRes.status()).toBe(200);
    const sessionData = await createRes.json();
    expect(sessionData.ok).toBe(true);
    const sessionId = sessionData.session.id;

    // 2. Create 8 candidate users via API
    const joinerTokens: string[] = [];
    for (let i = 1; i <= 8; i++) {
      const uRes = await api.post('/auth/signup', {
        data: {
          email: `racer_${i}_${Date.now()}@hoopup.test`,
          password: 'PasswordValid123!',
          displayName: `ผู้ท้าชิงคนที่ ${i}`,
        },
      });
      expect(uRes.status()).toBe(201);
      const uData = await uRes.json();
      joinerTokens.push(uData.accessToken);
    }
    expect(joinerTokens).toHaveLength(8);

    // 3. Fire 8 simultaneous join requests via Promise.all
    const joinPromises = joinerTokens.map((token) =>
      api.post('/rpc/hoopup_join_session', {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          p_session_id: sessionId,
          p_position: 'PG',
        },
      })
    );

    const joinResponses = await Promise.all(joinPromises);

    let successCount = 0;
    let conflictCount = 0;

    for (const res of joinResponses) {
      const body = await res.json().catch(() => ({}));
      if (res.status() === 200 && body.ok === true) {
        successCount++;
        expect(body.code).toBe('joined');
      } else {
        conflictCount++;
        // Rejection can be code: session_full / capacity_conflict
        expect(['session_full', 'conflict', 'capacity_conflict']).toContain(body.code || 'conflict');
      }
    }

    // EXACTLY 1 winner and 7 rejected
    expect(successCount).toBe(1);
    expect(conflictCount).toBe(7);

    // 4. Verify session is now full
    const sessionCheck = await api.post('/rpc/hoopup_get_session', {
      headers: { Authorization: `Bearer ${hostData.accessToken}` },
      data: { p_session_id: sessionId },
    });
    const finalSession = await sessionCheck.json();
    expect(finalSession.seatsRemaining).toBe(0);
    expect(finalSession.occupiedCount).toBe(3);
  });

  test('TC-BE2-05: Wrong password shows generic Thai error without leaking password or token in DOM or logs', async ({
    page,
    playwright,
  }) => {
    const api = await playwright.request.newContext({ baseURL: getBackendUrl() });
    const email = `valid_user_${Date.now()}@hoopup.test`;
    const signupRes = await api.post('/auth/signup', {
      data: {
        email,
        password: 'ValidPassword123!',
        displayName: 'ผู้ใช้จริง',
      },
    });
    expect(signupRes.status()).toBe(201);

    const consoleLogs: string[] = [];
    page.on('console', (msg) => consoleLogs.push(msg.text()));

    await page.goto('/login');
    await page.locator('[data-testid="auth-email-input"]').fill(email);
    await page.locator('[data-testid="auth-password-input"]').fill('WrongSecretPassword999!');
    await page.locator('[data-testid="auth-submit-btn"]').click();

    // Verify error banner
    const errorBanner = page.locator('[data-testid="auth-error-banner"]');
    await expect(errorBanner).toBeVisible();
    await expect(errorBanner).toContainText('อีเมลหรือรหัสผ่านไม่ถูกต้อง');

    // Security assertions: Neither the wrong password nor token appears outside the password input's own masked value
    const pageHtmlWithoutPassword = await page.evaluate(() => {
      const clone = document.documentElement.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('input[type="password"]').forEach((el) => el.remove());
      return clone.outerHTML;
    });
    expect(pageHtmlWithoutPassword).not.toContain('WrongSecretPassword999!');
    expect(pageHtmlWithoutPassword).not.toContain('eyJ');

    // Check console logs do not leak password or token
    const combinedLogs = consoleLogs.join('\n');
    expect(combinedLogs).not.toContain('WrongSecretPassword999!');
    expect(combinedLogs).not.toContain('eyJ');
  });

  test('TC-BE2-06: Sign-out clears token, reload stays signed out', async ({ page }) => {
    // Sign up and log in
    await page.goto('/login');
    await page.locator('[data-testid="auth-tab-signup"]').click();
    await page.locator('[data-testid="auth-name-input"]').fill('ผู้ทดสอบ ออกจากระบบ');
    await page.locator('[data-testid="auth-email-input"]').fill(`signout_${Date.now()}@hoopup.test`);
    await page.locator('[data-testid="auth-password-input"]').fill('PasswordValid123!');
    await page.locator('[data-testid="auth-submit-btn"]').click();
    await page.waitForURL('**/');

    // Click Sign Out button
    const signoutBtn = page.locator('[data-testid="auth-signout-btn"]');
    await expect(signoutBtn).toBeVisible();
    await signoutBtn.click();

    // Wait for redirect to /login
    await page.waitForURL('**/login');
    await expect(page.locator('[data-testid="auth-tab-signin"]')).toBeVisible();

    // Verify sessionStorage has cleared the access token
    const tokenInStorage = await page.evaluate(() => sessionStorage.getItem('hoopup_access_token'));
    expect(tokenInStorage).toBeNull();

    // Hard reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // App remains on /login without automatically logging back in
    await expect(page).toHaveURL(/.*\/login/);
    await expect(page.locator('[data-testid="auth-tab-signin"]')).toBeVisible();
  });

  test('TC-BE2-07: Expired or garbage token in sessionStorage returns cleanly to login without crashing', async ({
    page,
  }) => {
    // Pre-populate sessionStorage with a garbage token
    await page.goto('/login');
    await page.evaluate(() => {
      sessionStorage.setItem(
        'hoopup_access_token',
        'garbage.header.payload.signature_that_fails_verification_401'
      );
    });

    // Attempt to access protected root /
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // App handles 401 cleanly, clears the garbage token, and displays login page without crashing
    await expect(page).toHaveURL(/.*\/login/);
    await expect(page.locator('[data-testid="auth-tab-signin"]')).toBeVisible();

    const tokenAfter = await page.evaluate(() => sessionStorage.getItem('hoopup_access_token'));
    expect(tokenAfter).toBeNull();
  });
});

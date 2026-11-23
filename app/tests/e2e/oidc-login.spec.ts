import { test, expect } from '@playwright/test';

test.describe('HoopUp OIDC2 — Google / LINE Sign-In Buttons & Callback (Acceptance Suite)', () => {
  test('TC-OIDC2-01: OIDC buttons are hidden in default DEMO/mock mode', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // OIDC buttons must NOT be visible in DEMO mode
    await expect(page.locator('[data-testid="oidc-btn-google"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="oidc-btn-line"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="oidc-buttons-container"]')).toHaveCount(0);

    // Demo Mode card is visible
    await expect(page.locator('text=เข้าสู่ระบบด้วยบัญชีทดสอบ (Demo Mode)')).toBeVisible();
  });

  test('TC-OIDC2-02: OIDC buttons are visible in Connected API mode with listed providers & 44px touch targets', async ({
    page,
  }) => {
    // Configure API mode and both providers via runtime config and localStorage
    await page.addInitScript(() => {
      (window as any).__HOOPUP_CONFIG__ = {
        VITE_API_BASE_URL: 'http://127.0.0.1:8787',
        VITE_OIDC_PROVIDERS: 'google,line',
        VITE_OIDC_RETURN_URL: 'http://localhost:5173/auth/callback',
      };
      localStorage.setItem('hoopup_preferred_mode', 'connected');
    });

    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Both buttons must be visible with exact plain-text Thai labels (no emoji, no web logos)
    const googleBtn = page.locator('[data-testid="oidc-btn-google"]');
    const lineBtn = page.locator('[data-testid="oidc-btn-line"]');

    await expect(googleBtn).toBeVisible();
    await expect(googleBtn).toHaveText('เข้าสู่ระบบด้วย Google');

    await expect(lineBtn).toBeVisible();
    await expect(lineBtn).toHaveText('เข้าสู่ระบบด้วย LINE');

    // Verify touch target >= 44px (A11Y1 rule)
    const googleBox = await googleBtn.boundingBox();
    expect(googleBox).not.toBeNull();
    expect(googleBox!.height).toBeGreaterThanOrEqual(44);

    const lineBox = await lineBtn.boundingBox();
    expect(lineBox).not.toBeNull();
    expect(lineBox!.height).toBeGreaterThanOrEqual(44);

    // Verify start links have the correct provider and return_to parameter
    const googleHref = await googleBtn.getAttribute('href');
    expect(googleHref).toContain('/auth/oidc/google/start');
    expect(googleHref).toContain('return_to=http%3A%2F%2Flocalhost%3A5173%2Fauth%2Fcallback');

    const lineHref = await lineBtn.getAttribute('href');
    expect(lineHref).toContain('/auth/oidc/line/start');
    expect(lineHref).toContain('return_to=http%3A%2F%2Flocalhost%3A5173%2Fauth%2Fcallback');
  });

  test('TC-OIDC2-03: Only listed providers are displayed when config has a single provider', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as any).__HOOPUP_CONFIG__ = {
        VITE_API_BASE_URL: 'http://127.0.0.1:8787',
        VITE_OIDC_PROVIDERS: 'google',
      };
      localStorage.setItem('hoopup_preferred_mode', 'connected');
    });

    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[data-testid="oidc-btn-google"]')).toBeVisible();
    await expect(page.locator('[data-testid="oidc-btn-line"]')).toHaveCount(0);
  });

  test('TC-OIDC2-04: /auth/callback?code=x -> exchange 200 -> token stored, address bar cleaned, lands on feed', async ({
    page,
  }) => {
    const SECRET_ACCESS_TOKEN = 'secret-test-access-token-jwt-999';
    const consoleLogs: string[] = [];

    page.on('console', (msg) => {
      consoleLogs.push(msg.text());
    });

    // Mock backend OIDC exchange and auth endpoints with CORS support
    await page.route('**/auth/oidc/exchange', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': '*',
          },
        });
      }

      const data = route.request().postDataJSON();
      expect(data.code).toBe('test-valid-code-456');

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          accessToken: SECRET_ACCESS_TOKEN,
          tokenType: 'Bearer',
          user: {
            id: 'u-oidc-456',
            email: 'oidc_player@example.com',
            createdAt: new Date().toISOString(),
            emailVerified: true,
          },
        }),
      });
    });

    await page.route('**/auth/me', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': '*',
          },
        });
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          user: { id: 'u-oidc-456', email: 'oidc_player@example.com' },
          profile: {
            id: 'u-oidc-456',
            display_name: 'นักบาส OIDC',
            avatar_path: null,
            skill_level: 'casual',
            primary_position: 'PG',
            secondary_position: null,
            plays_any_position: true,
            height_cm: 182,
            height_visible: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        }),
      });
    });

    // Mock backend API feed routes (strict regex avoids intercepting /src/ styles/scripts)
    await page.route(/\/sessions(\?.*)?$/, async (route) => {
      if (route.request().url().includes('/src/')) {
        return route.fallback();
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify([]),
      });
    });

    await page.route(/\/courts(\?.*)?$/, async (route) => {
      if (route.request().url().includes('/src/')) {
        return route.fallback();
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify([]),
      });
    });

    await page.addInitScript(() => {
      (window as any).__HOOPUP_CONFIG__ = {
        VITE_API_BASE_URL: 'http://127.0.0.1:8787',
        VITE_OIDC_PROVIDERS: 'google,line',
      };
      localStorage.setItem('hoopup_preferred_mode', 'connected');
    });

    // Navigate to callback page with one-time code
    await page.goto('/auth/callback?code=test-valid-code-456');

    // 1. Verify code was immediately stripped from the URL address bar
    await page.waitForFunction(() => !window.location.search.includes('code='));
    expect(page.url()).not.toContain('code=');

    // 2. Lands on the feed page (route '/')
    await page.waitForURL((url) => url.pathname === '/', { timeout: 10000 });
    expect(new URL(page.url()).pathname).toBe('/');

    // 3. Verify token was stored via the existing sessionStorage store
    const storedToken = await page.evaluate(() => {
      return sessionStorage.getItem('hoopup_access_token');
    });
    expect(storedToken).toBe(SECRET_ACCESS_TOKEN);

    // 4. Verify user display name is visible in header
    await expect(page.locator('[data-testid="auth-current-user"]')).toContainText('นักบาส OIDC');

    // 5. Verify token is NEVER logged to console
    for (const log of consoleLogs) {
      expect(log).not.toContain(SECRET_ACCESS_TOKEN);
    }
  });

  test('TC-OIDC2-05: /auth/callback?error=account_unavailable shows Thai message & back to login button', async ({
    page,
  }) => {
    await page.goto('/auth/callback?error=account_unavailable');

    // Address bar must be cleaned immediately
    await page.waitForFunction(() => !window.location.search.includes('error='));
    expect(page.url()).not.toContain('error=');

    // Error alert is visible with the mapped Thai message
    const errorAlert = page.locator('[data-testid="auth-callback-error"]');
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toHaveText('บัญชีผู้ใช้ถูกระงับหรือไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ');

    // Back to login button works
    const backBtn = page.locator('[data-testid="auth-back-to-login"]');
    await expect(backBtn).toBeVisible();
    await backBtn.click();

    await page.waitForURL((url) => url.pathname === '/login');
    expect(new URL(page.url()).pathname).toBe('/login');
  });

  test('TC-OIDC2-06: /auth/callback with exchange 400 invalid_code shows Thai error message', async ({
    page,
  }) => {
    await page.route('**/auth/oidc/exchange', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': '*',
          },
        });
      }

      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'invalid_code' }),
      });
    });

    await page.addInitScript(() => {
      (window as any).__HOOPUP_CONFIG__ = {
        VITE_API_BASE_URL: 'http://127.0.0.1:8787',
        VITE_OIDC_PROVIDERS: 'google,line',
      };
      localStorage.setItem('hoopup_preferred_mode', 'connected');
    });

    await page.goto('/auth/callback?code=garbage-or-used-code');

    const errorAlert = page.locator('[data-testid="auth-callback-error"]');
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toHaveText(
      'รหัสยืนยันตัวตนไม่ถูกต้องหรือหมดอายุแล้ว กรุณาลองเข้าสู่ระบบใหม่อีกครั้ง'
    );
  });
});

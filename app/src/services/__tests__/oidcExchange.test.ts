import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiAuthService } from '../apiAdapter';

describe('ApiAuthService OIDC Exchange (OIDC2)', () => {
  const TEST_BASE_URL = 'http://127.0.0.1:8787';
  const ACCESS_TOKEN_STORAGE_KEY = 'hoopup_access_token';

  const storageMap = new Map<string, string>();
  const mockSessionStorage = {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, val: string) => {
      storageMap.set(key, String(val));
    },
    removeItem: (key: string) => {
      storageMap.delete(key);
    },
    clear: () => {
      storageMap.clear();
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    storageMap.clear();
    (globalThis as any).window = { sessionStorage: mockSessionStorage };
    (globalThis as any).sessionStorage = mockSessionStorage;
  });

  afterEach(() => {
    storageMap.clear();
  });

  it('fails cleanly when ApiAuthService is not configured', async () => {
    const unconfigured = new ApiAuthService('');
    const res = await unconfigured.exchangeOidcCode('code-123');
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe('not_configured');
  });

  it('fails cleanly when code is missing or empty', async () => {
    const auth = new ApiAuthService(TEST_BASE_URL);
    const res = await auth.exchangeOidcCode('');
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe('missing_code');
  });

  it('successfully exchanges code, reuses the existing token store in sessionStorage, and notifies subscribers', async () => {
    const auth = new ApiAuthService(TEST_BASE_URL);
    const capturedRequests: { url: string; method: string; body: any }[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const u = url.toString();
      capturedRequests.push({
        url: u,
        method: init?.method || 'GET',
        body: init?.body ? JSON.parse(init.body.toString()) : null,
      });

      if (u.endsWith('/auth/oidc/exchange')) {
        return new Response(
          JSON.stringify({
            accessToken: 'oidc-access-token-jwt-123',
            tokenType: 'Bearer',
            user: {
              id: 'u-oidc-1',
              email: 'player@example.com',
              createdAt: '2026-11-19T00:00:00Z',
              emailVerified: true,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (u.endsWith('/auth/me')) {
        return new Response(
          JSON.stringify({
            user: { id: 'u-oidc-1', email: 'player@example.com' },
            profile: {
              id: 'u-oidc-1',
              display_name: 'Player One',
              avatar_path: null,
              skill_level: 'casual',
              primary_position: 'PG',
              secondary_position: null,
              plays_any_position: true,
              height_cm: 185,
              height_visible: true,
              created_at: '2026-11-19T00:00:00Z',
              updated_at: '2026-11-19T00:00:00Z',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response('Not Found', { status: 404 });
    });

    let observedUser: any = null;
    auth.subscribe((user) => {
      observedUser = user;
    });

    const res = await auth.exchangeOidcCode('valid-exchange-code-123');
    expect(res.ok).toBe(true);

    // Verify exchange request was POSTed with { code }
    expect(capturedRequests[0]).toEqual({
      url: `${TEST_BASE_URL}/auth/oidc/exchange`,
      method: 'POST',
      body: { code: 'valid-exchange-code-123' },
    });

    // Verify token is stored in memory and sessionStorage using existing ACCESS_TOKEN_STORAGE_KEY
    expect(auth.getAccessToken()).toBe('oidc-access-token-jwt-123');
    expect(mockSessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBe('oidc-access-token-jwt-123');

    // Verify profile is loaded and subscriber was notified
    expect(observedUser).not.toBeNull();
    expect(observedUser?.displayName).toBe('Player One');
    expect(observedUser?.primaryPosition).toBe('PG');
  });

  it('handles 400 invalid_code response from exchange endpoint', async () => {
    const auth = new ApiAuthService(TEST_BASE_URL);

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({ error: 'invalid_code' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const res = await auth.exchangeOidcCode('expired-or-used-code');
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe('invalid_code');
    expect(res.error).toBe('รหัสยืนยันตัวตนไม่ถูกต้องหรือหมดอายุแล้ว กรุณาลองเข้าสู่ระบบใหม่อีกครั้ง');
  });

  it('handles 403 Account unavailable response from exchange endpoint', async () => {
    const auth = new ApiAuthService(TEST_BASE_URL);

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({ error: 'Account unavailable' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const res = await auth.exchangeOidcCode('banned-user-code');
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe('Account unavailable');
    expect(res.error).toBe('บัญชีผู้ใช้ถูกระงับหรือไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
  });

  it('handles network failure during exchange', async () => {
    const auth = new ApiAuthService(TEST_BASE_URL);

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    const res = await auth.exchangeOidcCode('any-code');
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe('network_error');
    expect(res.error).toBe('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง');
  });
});

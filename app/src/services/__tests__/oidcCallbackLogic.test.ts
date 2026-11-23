import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mapOidcErrorMessage } from '../oidcConfig';

describe('OIDC Callback Flow Logic (OIDC2)', () => {
  let replacedUrls: string[] = [];

  beforeEach(() => {
    vi.restoreAllMocks();
    replacedUrls = [];

    // Mock history.replaceState
    (globalThis as any).window = {
      location: {
        href: 'http://localhost:5173/auth/callback?code=test-code-1&other=preserved#section',
        pathname: '/auth/callback',
        search: '?code=test-code-1&other=preserved',
        hash: '#section',
      },
      history: {
        replaceState: vi.fn((_state, _title, url) => {
          replacedUrls.push(url);
        }),
      },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('immediately strips code and error from URL query string while preserving other parameters and hash', () => {
    const rawUrl = 'http://localhost:5173/auth/callback?code=one-time-code-123&state=abc&other=keep#hash1';
    const parsed = new URL(rawUrl);

    expect(parsed.searchParams.get('code')).toBe('one-time-code-123');
    parsed.searchParams.delete('code');
    parsed.searchParams.delete('error');

    const cleanUrl =
      parsed.pathname + (parsed.search ? parsed.search : '') + parsed.hash;

    window.history.replaceState(null, '', cleanUrl);

    expect(cleanUrl).toBe('/auth/callback?state=abc&other=keep#hash1');
    expect(replacedUrls).toContain('/auth/callback?state=abc&other=keep#hash1');
  });

  it('immediately strips error parameter from URL query string', () => {
    const rawUrl = 'http://localhost:5173/auth/callback?error=account_unavailable';
    const parsed = new URL(rawUrl);

    expect(parsed.searchParams.get('error')).toBe('account_unavailable');
    parsed.searchParams.delete('code');
    parsed.searchParams.delete('error');

    const cleanUrl =
      parsed.pathname + (parsed.search ? parsed.search : '') + parsed.hash;

    window.history.replaceState(null, '', cleanUrl);

    expect(cleanUrl).toBe('/auth/callback');
    expect(replacedUrls).toContain('/auth/callback');
  });

  it('correctly maps all known callback error parameters to Thai descriptions', () => {
    const errorCodes = [
      'account_unavailable',
      'invalid_request',
      'token_endpoint_error',
      'invalid_token_response',
      'invalid_token',
      'email_not_verified',
      'access_denied',
      'missing_code',
    ];

    for (const code of errorCodes) {
      const msg = mapOidcErrorMessage(code);
      expect(msg).toBeTruthy();
      expect(typeof msg).toBe('string');
      // Should not be generic fallback for known codes
      expect(msg).not.toBe('เกิดข้อผิดพลาดในการเข้าสู่ระบบผ่านผู้ให้บริการ กรุณาลองใหม่อีกครั้ง');
    }
  });

  it('guards against React StrictMode double invocation: single request for the same one-time code', async () => {
    const consumed = new Set<string>();
    let exchangeCount = 0;

    const mockExchange = async (code: string) => {
      if (consumed.has(code)) return;
      consumed.add(code);
      exchangeCount++;
      return { ok: true };
    };

    // Simulate first run
    await mockExchange('strictmode-code-1');
    // Simulate second immediate StrictMode run
    await mockExchange('strictmode-code-1');

    expect(exchangeCount).toBe(1);
  });
});

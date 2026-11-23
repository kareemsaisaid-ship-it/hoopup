import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getDefaultReturnUrl,
  getEffectiveApiBaseUrl,
  getEffectiveOidcConfig,
  getEffectiveOidcEnv,
  getOidcStartUrl,
  mapOidcErrorMessage,
  parseOidcProviders,
} from '../oidcConfig';

describe('OIDC Configuration and Utilities (OIDC2)', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    // Reset window.__HOOPUP_CONFIG__
    if (typeof window !== 'undefined') {
      delete (window as any).__HOOPUP_CONFIG__;
      try {
        window.localStorage.clear();
      } catch {
        // ignore
      }
    }
  });

  afterEach(() => {
    globalThis.window = originalWindow;
  });

  describe('parseOidcProviders', () => {
    it('returns empty array for undefined, null, empty string, or whitespace', () => {
      expect(parseOidcProviders()).toEqual([]);
      expect(parseOidcProviders(undefined)).toEqual([]);
      expect(parseOidcProviders('')).toEqual([]);
      expect(parseOidcProviders('   ')).toEqual([]);
    });

    it('parses valid comma-separated providers with whitespace and mixed cases', () => {
      expect(parseOidcProviders('google,line')).toEqual(['google', 'line']);
      expect(parseOidcProviders(' Google , LINE ')).toEqual(['google', 'line']);
      expect(parseOidcProviders('google')).toEqual(['google']);
      expect(parseOidcProviders('line')).toEqual(['line']);
    });

    it('filters out unsupported providers', () => {
      expect(parseOidcProviders('google,facebook,apple,line,github')).toEqual(['google', 'line']);
    });

    it('deduplicates identical providers', () => {
      expect(parseOidcProviders('google,google,line,LINE')).toEqual(['google', 'line']);
    });
  });

  describe('getDefaultReturnUrl', () => {
    it('returns window.location.origin + /auth/callback when window.location exists', () => {
      (globalThis as any).window = {
        location: { origin: 'http://localhost:3000' },
      };
      expect(getDefaultReturnUrl()).toBe('http://localhost:3000/auth/callback');
    });

    it('falls back to default localhost URL if window is undefined or missing origin', () => {
      (globalThis as any).window = undefined;
      expect(getDefaultReturnUrl()).toBe('http://localhost:5173/auth/callback');
    });
  });

  describe('getEffectiveOidcConfig & Runtime Overrides', () => {
    it('reads runtime overrides from window.__HOOPUP_CONFIG__ (highest priority)', () => {
      const storageMap = new Map<string, string>();
      storageMap.set('VITE_OIDC_PROVIDERS', 'line');
      (globalThis as any).window = {
        location: { origin: 'http://localhost:5173' },
        localStorage: {
          getItem: (k: string) => storageMap.get(k) ?? null,
        },
        __HOOPUP_CONFIG__: {
          VITE_OIDC_PROVIDERS: 'google,line',
          VITE_OIDC_RETURN_URL: 'http://localhost:5173/custom-callback',
          VITE_API_BASE_URL: 'http://127.0.0.1:8787',
        },
      };

      const env = getEffectiveOidcEnv();
      expect(env.VITE_OIDC_PROVIDERS).toBe('google,line');
      expect(env.VITE_OIDC_RETURN_URL).toBe('http://localhost:5173/custom-callback');
      expect(getEffectiveApiBaseUrl()).toBe('http://127.0.0.1:8787');

      const config = getEffectiveOidcConfig();
      expect(config.providers).toEqual(['google', 'line']);
      expect(config.returnUrl).toBe('http://localhost:5173/custom-callback');
    });

    it('reads overrides from localStorage when window.__HOOPUP_CONFIG__ is unset', () => {
      const storageMap = new Map<string, string>();
      storageMap.set('VITE_OIDC_PROVIDERS', 'line');
      storageMap.set('VITE_OIDC_RETURN_URL', 'http://example.com/auth/callback');

      (globalThis as any).window = {
        location: { origin: 'http://localhost:5173' },
        localStorage: {
          getItem: (k: string) => storageMap.get(k) ?? null,
        },
      };

      const config = getEffectiveOidcConfig();
      expect(config.providers).toEqual(['line']);
      expect(config.returnUrl).toBe('http://example.com/auth/callback');
    });
  });

  describe('getOidcStartUrl', () => {
    it('constructs correct start URL with encoded return_to parameter', () => {
      const startUrl = getOidcStartUrl('google', 'http://127.0.0.1:8787', 'http://localhost:5173/auth/callback');
      expect(startUrl).toBe(
        'http://127.0.0.1:8787/auth/oidc/google/start?return_to=http%3A%2F%2Flocalhost%3A5173%2Fauth%2Fcallback'
      );
    });

    it('trims trailing slashes from apiBaseUrl', () => {
      const startUrl = getOidcStartUrl('line', 'http://127.0.0.1:8787///', 'http://localhost:5173/auth/callback');
      expect(startUrl).toBe(
        'http://127.0.0.1:8787/auth/oidc/line/start?return_to=http%3A%2F%2Flocalhost%3A5173%2Fauth%2Fcallback'
      );
    });
  });

  describe('mapOidcErrorMessage', () => {
    it('maps known error codes to friendly Thai messages', () => {
      expect(mapOidcErrorMessage('account_unavailable')).toBe(
        'บัญชีผู้ใช้ถูกระงับหรือไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ'
      );
      expect(mapOidcErrorMessage('Account unavailable')).toBe(
        'บัญชีผู้ใช้ถูกระงับหรือไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ'
      );
      expect(mapOidcErrorMessage('invalid_code')).toBe(
        'รหัสยืนยันตัวตนไม่ถูกต้องหรือหมดอายุแล้ว กรุณาลองเข้าสู่ระบบใหม่อีกครั้ง'
      );
      expect(mapOidcErrorMessage('invalid_request')).toBe(
        'คำขอเข้าสู่ระบบไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง'
      );
      expect(mapOidcErrorMessage('token_endpoint_error')).toBe(
        'ไม่สามารถเชื่อมต่อกับผู้ให้บริการยืนยันตัวตนได้ กรุณาลองใหม่อีกครั้ง'
      );
      expect(mapOidcErrorMessage('invalid_token_response')).toBe(
        'ข้อมูลยืนยันตัวตนจากผู้ให้บริการไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง'
      );
      expect(mapOidcErrorMessage('invalid_token')).toBe(
        'ข้อมูลยืนยันตัวตนจากผู้ให้บริการไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง'
      );
      expect(mapOidcErrorMessage('email_not_verified')).toBe(
        'อีเมลของคุณยังไม่ได้รับการยืนยัน กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ'
      );
      expect(mapOidcErrorMessage('access_denied')).toBe(
        'คุณได้ยกเลิกการเข้าสู่ระบบผ่านผู้ให้บริการ'
      );
      expect(mapOidcErrorMessage('missing_code')).toBe(
        'ไม่พบรหัสยืนยันตัวตนสำหรับการเข้าสู่ระบบ'
      );
    });

    it('falls back to generic Thai error message for unknown error codes or empty values', () => {
      expect(mapOidcErrorMessage('')).toBe(
        'เกิดข้อผิดพลาดในการเข้าสู่ระบบผ่านผู้ให้บริการ กรุณาลองใหม่อีกครั้ง'
      );
      expect(mapOidcErrorMessage(null)).toBe(
        'เกิดข้อผิดพลาดในการเข้าสู่ระบบผ่านผู้ให้บริการ กรุณาลองใหม่อีกครั้ง'
      );
      expect(mapOidcErrorMessage('some_obscure_upstream_error')).toBe(
        'เกิดข้อผิดพลาดในการเข้าสู่ระบบผ่านผู้ให้บริการ กรุณาลองใหม่อีกครั้ง'
      );
    });
  });
});

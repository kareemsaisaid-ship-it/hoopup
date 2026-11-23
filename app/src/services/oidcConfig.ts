/**
 * HoopUp OIDC Configuration & Utilities (OIDC2)
 * Manages provider lists, return URLs, start URL generation, and error localization.
 */

export type OidcProvider = 'google' | 'line';

export interface OidcEnv {
  VITE_OIDC_PROVIDERS?: string;
  VITE_OIDC_RETURN_URL?: string;
  VITE_API_BASE_URL?: string;
}

export interface EffectiveOidcConfig {
  providers: OidcProvider[];
  rawProviders: string;
  returnUrl: string;
}

const SUPPORTED_PROVIDERS: ReadonlySet<string> = new Set(['google', 'line']);

/**
 * Parses comma-separated list of OIDC providers.
 * Case-insensitive, trims whitespace, deduplicates, and filters to supported providers.
 */
export function parseOidcProviders(raw?: string): OidcProvider[] {
  if (!raw || typeof raw !== 'string') return [];
  const result: OidcProvider[] = [];
  const seen = new Set<string>();

  for (const part of raw.split(',')) {
    const trimmed = part.trim().toLowerCase();
    if (trimmed && SUPPORTED_PROVIDERS.has(trimmed) && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed as OidcProvider);
    }
  }
  return result;
}

/**
 * Default return URL used by the app: <origin>/auth/callback
 */
export function getDefaultReturnUrl(): string {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return `${window.location.origin}/auth/callback`;
  }
  return 'http://localhost:5173/auth/callback';
}

/**
 * Reads effective OIDC environment variables with support for runtime overrides
 * via window.__HOOPUP_CONFIG__ and localStorage (same pattern as mapConfig.ts).
 */
export function getEffectiveOidcEnv(): OidcEnv {
  let runtimeConfig: Record<string, string | undefined> | undefined;
  if (typeof window !== 'undefined') {
    const win = window as unknown as { __HOOPUP_CONFIG__?: Record<string, string | undefined> };
    runtimeConfig = win.__HOOPUP_CONFIG__;
  }

  const getStorage = (key: string): string | undefined => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key) ?? undefined;
      }
    } catch {
      // Ignore storage access errors in sandboxed test contexts
    }
    return undefined;
  };

  const getMeta = (key: string): string | undefined => {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return (import.meta.env as Record<string, string | undefined>)[key];
    }
    return undefined;
  };

  return {
    VITE_OIDC_PROVIDERS:
      runtimeConfig?.VITE_OIDC_PROVIDERS ??
      getStorage('VITE_OIDC_PROVIDERS') ??
      getMeta('VITE_OIDC_PROVIDERS'),
    VITE_OIDC_RETURN_URL:
      runtimeConfig?.VITE_OIDC_RETURN_URL ??
      getStorage('VITE_OIDC_RETURN_URL') ??
      getMeta('VITE_OIDC_RETURN_URL'),
    VITE_API_BASE_URL:
      runtimeConfig?.VITE_API_BASE_URL ??
      getStorage('VITE_API_BASE_URL') ??
      getMeta('VITE_API_BASE_URL'),
  };
}

export function getEffectiveOidcConfig(): EffectiveOidcConfig {
  const env = getEffectiveOidcEnv();
  const rawProviders = env.VITE_OIDC_PROVIDERS?.trim() || '';
  const providers = parseOidcProviders(rawProviders);
  const returnUrl = env.VITE_OIDC_RETURN_URL?.trim() || getDefaultReturnUrl();

  return {
    providers,
    rawProviders,
    returnUrl,
  };
}

/**
 * Resolves the effective API base URL supporting runtime overrides.
 */
export function getEffectiveApiBaseUrl(): string {
  const env = getEffectiveOidcEnv();
  return (env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
}

/**
 * Builds the provider start URL:
 * GET {API}/auth/oidc/:provider/start?return_to=<url>
 */
export function getOidcStartUrl(
  provider: OidcProvider,
  apiBaseUrl: string,
  returnUrl?: string
): string {
  const effectiveReturnUrl = returnUrl || getDefaultReturnUrl();
  const base = apiBaseUrl.replace(/\/+$/, '');
  const url = new URL(`${base}/auth/oidc/${encodeURIComponent(provider)}/start`);
  url.searchParams.set('return_to', effectiveReturnUrl);
  return url.toString();
}

/**
 * Maps OIDC error codes to Thai messages.
 * Treats error strings as untrusted text and maps to predetermined safe descriptions.
 */
export function mapOidcErrorMessage(error?: string | null): string {
  if (!error || typeof error !== 'string') {
    return 'เกิดข้อผิดพลาดในการเข้าสู่ระบบผ่านผู้ให้บริการ กรุณาลองใหม่อีกครั้ง';
  }

  const normalized = error.trim().toLowerCase();

  switch (normalized) {
    case 'account_unavailable':
    case 'account unavailable':
      return 'บัญชีผู้ใช้ถูกระงับหรือไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ';
    case 'invalid_code':
      return 'รหัสยืนยันตัวตนไม่ถูกต้องหรือหมดอายุแล้ว กรุณาลองเข้าสู่ระบบใหม่อีกครั้ง';
    case 'invalid_request':
      return 'คำขอเข้าสู่ระบบไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง';
    case 'token_endpoint_error':
      return 'ไม่สามารถเชื่อมต่อกับผู้ให้บริการยืนยันตัวตนได้ กรุณาลองใหม่อีกครั้ง';
    case 'invalid_token_response':
    case 'invalid_token':
      return 'ข้อมูลยืนยันตัวตนจากผู้ให้บริการไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง';
    case 'email_not_verified':
      return 'อีเมลของคุณยังไม่ได้รับการยืนยัน กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ';
    case 'access_denied':
      return 'คุณได้ยกเลิกการเข้าสู่ระบบผ่านผู้ให้บริการ';
    case 'missing_code':
      return 'ไม่พบรหัสยืนยันตัวตนสำหรับการเข้าสู่ระบบ';
    case 'service temporarily unavailable':
    case 'service_unavailable':
      return 'บริการไม่พร้อมใช้งานชั่วคราว กรุณารอสักครู่แล้วลองใหม่อีกครั้ง';
    case 'user not found':
      return 'ไม่พบข้อมูลผู้ใช้งานในระบบ';
    case 'provider_not_configured':
      return 'ผู้ให้บริการเข้าสู่ระบบนี้ยังไม่เปิดใช้งานในระบบ';
    default:
      return 'เกิดข้อผิดพลาดในการเข้าสู่ระบบผ่านผู้ให้บริการ กรุณาลองใหม่อีกครั้ง';
  }
}

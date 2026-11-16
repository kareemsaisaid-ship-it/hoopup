import crypto from 'node:crypto';
import * as jose from 'jose';

export const OIDC_PRESETS = {
  google: {
    issuer: 'https://accounts.google.com',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
    scope: 'openid email profile',
    trustEmail: false,
    allowUnverifiedEmail: false,
  },
  line: {
    issuer: 'https://access.line.me',
    authUrl: 'https://access.line.me/oauth2/v2.1/authorize',
    tokenUrl: 'https://api.line.me/oauth2/v2.1/token',
    jwksUrl: 'https://api.line.me/oauth2/v2.1/certs',
    scope: 'openid profile email',
    trustEmail: false,
    allowUnverifiedEmail: true,
  },
};

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function validateEndpointUrl(urlStr, fieldName = 'endpoint') {
  if (!urlStr || typeof urlStr !== 'string') {
    throw new Error(`Invalid ${fieldName}: URL string is required`);
  }
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch (err) {
    throw new Error(`Invalid ${fieldName} URL '${urlStr}': ${err.message}`);
  }

  if (parsed.protocol === 'https:') {
    return parsed.href;
  }

  if (parsed.protocol === 'http:') {
    const isLocalhost =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1' ||
      parsed.hostname === '[::1]';

    if (process.env.NODE_ENV !== 'production' && isLocalhost) {
      return parsed.href;
    }
    throw new Error(
      `OIDC endpoint '${urlStr}' must use HTTPS in production and non-localhost environments`
    );
  }

  throw new Error(`OIDC endpoint '${urlStr}' has unsupported protocol: ${parsed.protocol}`);
}

export class OidcStateStore {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 5000;
    this.ttlMs = options.ttlMs || 10 * 60 * 1000; // 10 minutes
    this.store = new Map();
  }

  save({ state, provider, nonce, verifier, returnTo, cookieHash }) {
    if (!state) return;
    const key = crypto.createHash('sha256').update(state).digest('hex');
    if (this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      this.store.delete(oldestKey);
    }
    this.store.set(key, {
      provider,
      nonce,
      verifier,
      returnTo,
      cookieHash,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  consume(state) {
    if (!state || typeof state !== 'string' || state.length > 2048) {
      return null;
    }
    const key = crypto.createHash('sha256').update(state).digest('hex');
    const entry = this.store.get(key);
    this.store.delete(key); // single use, atomic delete
    if (!entry) {
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      return null;
    }
    return entry;
  }

  clear() {
    this.store.clear();
  }
}

export class OidcExchangeCodeStore {
  constructor(options = {}) {
    this.maxSize = options.maxSize || 5000;
    this.ttlMs = options.ttlMs || 60 * 1000; // 60 seconds
    this.store = new Map();
  }

  issue(userId) {
    const code = crypto.randomBytes(32).toString('base64url');
    const key = crypto.createHash('sha256').update(code).digest('hex');
    if (this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      this.store.delete(oldestKey);
    }
    this.store.set(key, {
      userId,
      expiresAt: Date.now() + this.ttlMs,
    });
    return code;
  }

  consume(code) {
    if (!code || typeof code !== 'string' || code.length > 2048) {
      return null;
    }
    const key = crypto.createHash('sha256').update(code).digest('hex');
    const entry = this.store.get(key);
    this.store.delete(key); // single use, atomic delete
    if (!entry) {
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      return null;
    }
    return entry;
  }

  clear() {
    this.store.clear();
  }
}

export function generateOidcSession() {
  const state = crypto.randomBytes(32).toString('base64url');
  const nonce = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const cookieValue = crypto.randomBytes(32).toString('base64url');
  const cookieHash = crypto.createHash('sha256').update(cookieValue).digest('hex');

  return {
    state,
    nonce,
    verifier,
    challenge,
    cookieValue,
    cookieHash,
  };
}

export function loadOidcConfig(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger;

  const rawProviders =
    options.providers !== undefined
      ? options.providers
      : env.OIDC_PROVIDERS || '';
  const providerNames = rawProviders
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const rawReturnUrls =
    options.allowedReturnUrls !== undefined
      ? options.allowedReturnUrls
      : env.OIDC_ALLOWED_RETURN_URLS || '';
  const allowedReturnUrls = new Set(
    rawReturnUrls
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );

  const providers = new Map();

  for (const name of providerNames) {
    const NAME = name.toUpperCase();
    const preset = OIDC_PRESETS[name] || {};

    const clientId = options[`${name}ClientId`] || env[`OIDC_${NAME}_CLIENT_ID`] || '';
    const clientSecret = options[`${name}ClientSecret`] || env[`OIDC_${NAME}_CLIENT_SECRET`] || '';
    const redirectUri = options[`${name}RedirectUri`] || env[`OIDC_${NAME}_REDIRECT_URI`] || '';

    const hasAnyConfig = Boolean(clientId || clientSecret || redirectUri);
    const isFullyConfigured = Boolean(clientId && clientSecret && redirectUri);

    if (hasAnyConfig && !isFullyConfigured) {
      if (logger && typeof logger.warn === 'function') {
        logger.warn(`OIDC provider "${name}" is half-configured and will remain disabled`);
      }
      continue;
    }

    if (!isFullyConfigured) {
      continue;
    }

    const rawIssuer = options[`${name}Issuer`] || env[`OIDC_${NAME}_ISSUER`] || preset.issuer;
    const rawAuthUrl = options[`${name}AuthUrl`] || env[`OIDC_${NAME}_AUTH_URL`] || preset.authUrl;
    const rawTokenUrl = options[`${name}TokenUrl`] || env[`OIDC_${NAME}_TOKEN_URL`] || preset.tokenUrl;
    const rawJwksUrl = options[`${name}JwksUrl`] || env[`OIDC_${NAME}_JWKS_URL`] || preset.jwksUrl;
    const scope = options[`${name}Scope`] || env[`OIDC_${NAME}_SCOPE`] || preset.scope || 'openid email profile';

    const rawTrustEmail = options[`${name}TrustEmail`] !== undefined
      ? options[`${name}TrustEmail`]
      : env[`OIDC_${NAME}_TRUST_EMAIL`];
    const trustEmail = rawTrustEmail === true || rawTrustEmail === 'true' || Boolean(preset.trustEmail);

    const rawAllowUnverified = options[`${name}AllowUnverifiedEmail`] !== undefined
      ? options[`${name}AllowUnverifiedEmail`]
      : env[`OIDC_${NAME}_ALLOW_UNVERIFIED_EMAIL`];
    const allowUnverifiedEmail =
      rawAllowUnverified !== undefined && rawAllowUnverified !== null
        ? rawAllowUnverified === true || rawAllowUnverified === 'true'
        : Boolean(preset.allowUnverifiedEmail);

    const authUrl = validateEndpointUrl(rawAuthUrl, `${name} authUrl`);
    const tokenUrl = validateEndpointUrl(rawTokenUrl, `${name} tokenUrl`);
    const jwksUrl = validateEndpointUrl(rawJwksUrl, `${name} jwksUrl`);
    const issuer = rawIssuer;

    const jwks = jose.createRemoteJWKSet(new URL(jwksUrl), {
      cooldownDuration: 30000,
      timeoutDuration: 5000,
    });

    const tokenTimeoutMs = options[`${name}TokenTimeoutMs`] || 5000;

    providers.set(name, {
      name,
      clientId,
      clientSecret,
      redirectUri,
      issuer,
      authUrl,
      tokenUrl,
      jwksUrl,
      jwks,
      scope,
      trustEmail,
      allowUnverifiedEmail,
      tokenTimeoutMs,
    });
  }

  return {
    providers,
    allowedReturnUrls,
  };
}

export async function verifyIdToken(idToken, provider, expectedNonce) {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('id_token is required');
  }

  const { payload } = await jose.jwtVerify(idToken, provider.jwks, {
    issuer: provider.issuer,
    audience: provider.clientId,
    algorithms: ['RS256', 'ES256'],
    clockTolerance: 30,
  });

  if (!payload.exp) {
    throw new Error('Missing exp claim in id_token');
  }

  if (typeof payload.iat === 'number') {
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.iat > nowSec + 30) {
      throw new Error('id_token iat is in the future');
    }
  }

  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 255) {
    throw new Error('Missing or invalid sub claim in id_token');
  }

  if (!payload.nonce || typeof payload.nonce !== 'string' || !safeEqual(payload.nonce, expectedNonce)) {
    throw new Error('Nonce mismatch in id_token');
  }

  if (Array.isArray(payload.aud)) {
    if (payload.azp !== provider.clientId) {
      throw new Error('azp claim does not match clientId when aud is an array');
    }
  }

  return payload;
}

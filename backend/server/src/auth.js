import bcrypt from 'bcryptjs';
import * as jose from 'jose';
import crypto from 'node:crypto';

const BCRYPT_SALT_ROUNDS = 12;

// B2: Fixed dummy hash generated once at startup with the same bcrypt cost (12)
// This mitigates user enumeration via login timing attacks.
export const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  'dummy_timing_mitigation_password_never_matches',
  BCRYPT_SALT_ROUNDS
);

export const COMMON_PASSWORDS = [
  'password', 'passwords', 'password123', 'password1234', 'password12345',
  '1234567890', '0123456789', '9876543210', '123456789012',
  'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'poiuytrewq', 'lkjhgfdsa',
  'welcome', 'welcome123', 'welcome1234', 'welcome2026',
  'admin', 'administrator', 'admin123', 'admin1234', 'admin12345',
  'changeme', 'changeme123', 'changeme1234',
  'iloveyou', 'iloveyou123', 'iloveyou1234',
  'sunshine', 'princess', 'football', 'basketball', 'baseball', 'soccer',
  'monkey', 'dragon', 'master', 'computer', 'superman', 'batman', 'spiderman',
  'charlie', 'donald', 'starwars', 'pokemon', 'trustno1', 'shadow',
  'mustang', 'superstar', 'whatever', 'letmein', 'letmein123',
  'secret', 'secret123', 'security', 'football123', 'basketball123',
  'hoopup', 'hoopup123', 'hoopup2026', 'hoopupapp',
  'default', 'default123', 'testing', 'testing123',
  'login', 'login123', 'access', 'access123',
  'passcode', 'passcode123', 'hellouser', 'goodmorning',
  'qwerty1234', 'qwerty12345', 'qazwsxedc', 'wsxedcrfv',
  'freedom', 'freedom123', 'america', 'thailand', 'bangkok',
  'bangkok2026', 'thailand123', 'thailand2026', 'diamond',
  'killer', 'cookie', 'cookies', 'ginger', 'pepper', 'jordan',
  'jordan23', 'kobe24', 'lebron', 'lakers', 'warriors', 'bulls',
  'celtics', 'champion', 'champions', 'winner', 'victory',
  'november', 'december', 'january', 'summer', 'winter', 'autumn', 'spring',
  'coffee', 'chocolate', 'orange', 'purple', 'silver', 'golden',
  'family', 'forever', 'together', 'friends', 'internet', 'network',
  'system', 'service', 'database', 'terminal', 'account', 'manager',
  'operator', 'superuser', 'standard', 'complete', 'creative',
  'universe', 'galaxy', 'planet', 'earth', 'jupiter', 'mercury'
];

const COMMON_PASSWORDS_SET = new Set(COMMON_PASSWORDS.map((p) => p.toLowerCase()));

export function validateEmail(email) {
  if (typeof email !== 'string') {
    return { valid: false, error: 'Valid email is required' };
  }
  // Reject spaces and control characters anywhere
  if (/[\s\x00-\x1f\x7f]/.test(email)) {
    return { valid: false, error: 'Email cannot contain spaces or control characters' };
  }
  if (email.length === 0 || email.length > 254) {
    return { valid: false, error: 'Email length must be between 1 and 254 characters' };
  }
  const atParts = email.split('@');
  if (atParts.length !== 2) {
    return { valid: false, error: 'Email must match a pattern with exactly one "@"' };
  }
  const [localPart, domain] = atParts;
  if (!localPart || localPart.length === 0) {
    return { valid: false, error: 'Email local part cannot be empty' };
  }
  if (localPart.length > 64) {
    return { valid: false, error: 'Email local part cannot exceed 64 characters' };
  }
  if (localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
    return { valid: false, error: 'Email local part contains invalid dot placement' };
  }
  if (!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(localPart)) {
    return { valid: false, error: 'Email local part contains invalid characters' };
  }

  if (!domain || domain.length === 0) {
    return { valid: false, error: 'Email domain cannot be empty' };
  }
  if (!domain.includes('.')) {
    return { valid: false, error: 'Email domain must contain a dot' };
  }
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) {
    return { valid: false, error: 'Email domain contains invalid dot placement' };
  }

  const dotParts = domain.split('.');
  for (const part of dotParts) {
    if (part.length === 0 || part.length > 63) {
      return { valid: false, error: 'Domain labels must be between 1 and 63 characters' };
    }
    if (part.startsWith('-') || part.endsWith('-')) {
      return { valid: false, error: 'Domain labels cannot start or end with a hyphen' };
    }
    if (!/^[a-zA-Z0-9-]+$/.test(part)) {
      return { valid: false, error: 'Domain labels contain invalid characters' };
    }
  }

  const tld = dotParts[dotParts.length - 1];
  if (tld.length < 2) {
    return { valid: false, error: 'Email domain TLD must be at least 2 characters' };
  }
  if (!/^[a-zA-Z]{2,}$/.test(tld)) {
    return { valid: false, error: 'Email domain TLD must contain only letters' };
  }

  return { valid: true, email: email.trim().toLowerCase() };
}

export function validatePassword(password, options = {}) {
  let email, displayName;
  if (typeof options === 'string') {
    email = options;
    displayName = arguments[2];
  } else if (options && typeof options === 'object') {
    email = options.email;
    displayName = options.displayName;
  }

  if (typeof password !== 'string') {
    return {
      valid: false,
      error: 'Password must be a string',
    };
  }
  const byteLength = Buffer.byteLength(password, 'utf8');
  if (byteLength < 10) {
    return {
      valid: false,
      error: 'Password must be at least 10 characters long',
    };
  }
  if (byteLength > 72) {
    return {
      valid: false,
      error: 'Password cannot exceed 72 bytes (bcrypt truncates at 72 bytes)',
    };
  }

  // Reject all same character
  if (/^(.)\1+$/.test(password)) {
    return {
      valid: false,
      error: 'Password cannot consist of a single repeated character',
    };
  }

  const lower = password.toLowerCase();

  // Reject password equal to email local part (case-insensitive)
  if (email && typeof email === 'string') {
    const atIdx = email.indexOf('@');
    const localPart = atIdx !== -1 ? email.slice(0, atIdx) : email;
    if (localPart && lower === localPart.toLowerCase()) {
      return {
        valid: false,
        error: 'Password cannot be the same as your email address',
      };
    }
  }

  // Reject password equal to display name (case-insensitive)
  if (displayName && typeof displayName === 'string') {
    const trimmedName = displayName.trim().toLowerCase();
    if (trimmedName && lower === trimmedName) {
      return {
        valid: false,
        error: 'Password cannot be the same as your display name',
      };
    }
  }

  // Reject simple sequences
  const predictableSequences = [
    '1234567890',
    '0123456789',
    '9876543210',
    '0987654321',
    'qwertyuiop',
    'poiuytrewq',
    'asdfghjkl;',
    'zxcvbnm,./',
    'qazwsxedc',
  ];
  for (const seq of predictableSequences) {
    if (lower.includes(seq)) {
      return {
        valid: false,
        error: 'Password contains an easily guessable sequence',
      };
    }
  }

  // Common password blocklist check + padding rule:
  // "rejects if the lower-cased password, after stripping trailing digits/symbols, equals a listed base word"
  if (COMMON_PASSWORDS_SET.has(lower)) {
    return {
      valid: false,
      error: 'Password is too common or easily guessable',
    };
  }
  const baseAlpha = lower.replace(/[^a-z]+$/, '');
  if (baseAlpha && COMMON_PASSWORDS_SET.has(baseAlpha)) {
    return {
      valid: false,
      error: 'Password is too common or easily guessable',
    };
  }
  const baseAlnum = lower.replace(/[^a-z0-9]+$/, '');
  if (baseAlnum && COMMON_PASSWORDS_SET.has(baseAlnum)) {
    return {
      valid: false,
      error: 'Password is too common or easily guessable',
    };
  }

  return { valid: true };
}

export function validateDisplayName(displayName) {
  if (displayName === undefined || displayName === null) {
    return { valid: true, displayName: null };
  }
  if (typeof displayName !== 'string') {
    return { valid: false, error: 'Display name must be a string' };
  }
  if (displayName.length > 60) {
    return { valid: false, error: 'Display name cannot exceed 60 characters' };
  }
  return { valid: true, displayName: displayName.trim() };
}

export async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

export async function verifyPassword(password, hash) {
  if (!password || !hash) return false;
  return bcrypt.compare(password, hash);
}

export const BLOCKED_DEV_JWT_SECRETS = new Set([
  'super_secret_jwt_passphrase_min_32_bytes_long_12345',
  'test_jwt_super_secret_passphrase_32chars_long!',
  'test_jwt_secret_places_route_32chars_long!',
  'test_jwt_secret_places_rate_32chars!',
  'test_jwt_secret_places_missing_32chars!',
  'test_jwt_secret_places_real_32chars!',
  'test_jwt_secret_places_search_route_32chars!',
  'test_jwt_secret_places_search_rate_32!',
  'test_jwt_secret_search_missing_32chars!',
  'test_jwt_secret_places_search_real_32!',
  'test_jwt_secret_tiles_route_32chars_long!',
]);

function getSecretKey(secret) {
  const secretStr = secret || process.env.JWT_SECRET;
  if (!secretStr || secretStr.length < 32) {
    throw new Error(
      'JWT_SECRET must be at least 32 characters long. Generate one using: openssl rand -base64 48'
    );
  }
  if (process.env.NODE_ENV === 'production' && BLOCKED_DEV_JWT_SECRETS.has(secretStr)) {
    throw new Error(
      'JWT_SECRET is set to a known development/demo value which is forbidden in production (NODE_ENV=production). Generate a secure random secret using: openssl rand -base64 48'
    );
  }
  return new TextEncoder().encode(secretStr);
}

// Fail at startup (not at the first signup) when the signing secret is missing, too short (< 32), or insecure in production.
export function assertJwtSecret(secret) {
  getSecretKey(secret);
}

export async function createAccessToken(user, secret) {
  const secretKey = getSecretKey(secret);
  const now = Math.floor(Date.now() / 1000);

  return new jose.SignJWT({
    sub: user.id,
    email: user.email,
    role: 'authenticated',
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600) // 1 hour
    .sign(secretKey);
}

export async function verifyAccessToken(token, secret) {
  if (!token || typeof token !== 'string') {
    throw new Error('Token missing or invalid');
  }

  // Explicitly check for unsecure alg:none before jose parsing
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed token');
  }

  try {
    const headerStr = Buffer.from(parts[0], 'base64url').toString('utf8');
    const header = JSON.parse(headerStr);
    if (!header.alg || header.alg.toLowerCase() === 'none' || header.alg !== 'HS256') {
      throw new Error('Unsupported or insecure algorithm');
    }
  } catch (err) {
    throw new Error(`Invalid token header: ${err.message}`);
  }

  const secretKey = getSecretKey(secret);
  const { payload } = await jose.jwtVerify(token, secretKey, {
    algorithms: ['HS256'],
  });

  return payload;
}

// In-memory sliding window / bucket rate limiter for /auth/*
export class InMemoryRateLimiter {
  constructor(options = {}) {
    this.max = options.max || 10;
    this.windowMs = options.windowMs || 60000;
    this.hits = new Map();

    // Periodic cleanup every 60s
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, record] of this.hits.entries()) {
        if (now > record.resetAt) {
          this.hits.delete(key);
        }
      }
    }, 60000);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  check(key) {
    const now = Date.now();
    let record = this.hits.get(key);

    if (!record || now > record.resetAt) {
      record = { count: 1, resetAt: now + this.windowMs };
      this.hits.set(key, record);
      return { allowed: true, remaining: this.max - 1 };
    }

    record.count += 1;
    if (record.count > this.max) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, record.resetAt - now),
      };
    }

    return { allowed: true, remaining: this.max - record.count };
  }

  reset() {
    this.hits.clear();
  }

  destroy() {
    clearInterval(this.cleanupTimer);
  }
}

// Bounded in-memory login lockout tracker (keyed by SHA-256 hash of normalized email)
export function hashEmail(email) {
  if (typeof email !== 'string') return '';
  return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

export class LoginAccountLock {
  constructor(options = {}) {
    this.max = options.max ?? (process.env.LOGIN_LOCK_MAX ? parseInt(process.env.LOGIN_LOCK_MAX, 10) : 5);
    this.windowMs = options.windowMs ?? (process.env.LOGIN_LOCK_WINDOW_MS ? parseInt(process.env.LOGIN_LOCK_WINDOW_MS, 10) : 15 * 60 * 1000);
    this.lockSeconds = options.lockSeconds ?? (process.env.LOGIN_LOCK_SECONDS ? parseFloat(process.env.LOGIN_LOCK_SECONDS) : 60);
    this.lockDurationMs = Math.round(this.lockSeconds * 1000);
    this.maxEntries = options.maxEntries || 10000;
    this.records = new Map();

    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, record] of this.records.entries()) {
        if (now > record.resetAt && (!record.lockedUntil || now > record.lockedUntil)) {
          this.records.delete(key);
        }
      }
    }, 60000);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  isLocked(normalizedEmail) {
    const key = hashEmail(normalizedEmail);
    const record = this.records.get(key);
    if (!record) {
      return { locked: false };
    }
    const now = Date.now();
    if (record.lockedUntil && now < record.lockedUntil) {
      const retryAfter = Math.max(1, Math.ceil((record.lockedUntil - now) / 1000));
      return { locked: true, retryAfter };
    }
    if (record.lockedUntil && now >= record.lockedUntil) {
      this.records.delete(key);
      return { locked: false };
    }
    if (now > record.resetAt) {
      this.records.delete(key);
      return { locked: false };
    }
    return { locked: false };
  }

  recordFailure(normalizedEmail) {
    const key = hashEmail(normalizedEmail);
    const now = Date.now();
    let record = this.records.get(key);

    if (!record || now > record.resetAt) {
      record = { count: 1, resetAt: now + this.windowMs, lockedUntil: null };
      if (this.records.size >= this.maxEntries) {
        const oldestKey = this.records.keys().next().value;
        this.records.delete(oldestKey);
      }
      this.records.set(key, record);
      return { locked: false, count: 1 };
    }

    record.count += 1;
    if (record.count >= this.max) {
      record.lockedUntil = now + this.lockDurationMs;
      record.resetAt = Math.max(record.resetAt, record.lockedUntil);
      const retryAfter = Math.max(1, Math.ceil((record.lockedUntil - now) / 1000));
      return { locked: true, retryAfter };
    }

    return { locked: false, count: record.count };
  }

  recordSuccess(normalizedEmail) {
    const key = hashEmail(normalizedEmail);
    this.records.delete(key);
  }

  reset() {
    this.records.clear();
  }

  destroy() {
    clearInterval(this.cleanupTimer);
  }
}

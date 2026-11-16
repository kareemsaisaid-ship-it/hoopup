import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as jose from 'jose';

import { buildApp } from '../src/app.js';
import { initPool, closePool, withClient, withTransaction } from '../src/db.js';
import { UserStatusCache } from '../src/user-status.js';
import { startTempPostgres } from './helpers/temp-postgres.js';
import { FakeIdP } from './helpers/fake-idp.js';
import { OidcStateStore, OidcExchangeCodeStore } from '../src/oidc.js';

describe('HoopUp OIDC1 Authentication Test Suite', async () => {
  let pgInstance;
  let fakeIdp;
  let app;
  const testSecret = 'oidc1_test_super_secret_jwt_passphrase_32_chars!';
  const allowedReturnUrl = 'http://localhost:5173/auth/callback';

  before(async () => {
    pgInstance = await startTempPostgres();
    process.env.DATABASE_URL = pgInstance.connectionString;
    process.env.JWT_SECRET = testSecret;

    initPool({
      connectionString: pgInstance.connectionString,
    });

    fakeIdp = new FakeIdP({
      clientId: 'google-client-id-test',
      clientSecret: 'google-client-secret-test',
      redirectUri: 'http://127.0.0.1:3000/auth/oidc/google/callback',
    });
    await fakeIdp.start();

    // Configure OIDC environment variables
    process.env.OIDC_PROVIDERS = 'google,line';
    process.env.OIDC_ALLOWED_RETURN_URLS = allowedReturnUrl;

    // Google config pointing to fakeIdp
    process.env.OIDC_GOOGLE_CLIENT_ID = fakeIdp.clientId;
    process.env.OIDC_GOOGLE_CLIENT_SECRET = fakeIdp.clientSecret;
    process.env.OIDC_GOOGLE_REDIRECT_URI = fakeIdp.redirectUri;
    process.env.OIDC_GOOGLE_ISSUER = fakeIdp.issuer;
    process.env.OIDC_GOOGLE_AUTH_URL = `${fakeIdp.issuer}/auth`;
    process.env.OIDC_GOOGLE_TOKEN_URL = `${fakeIdp.issuer}/token`;
    process.env.OIDC_GOOGLE_JWKS_URL = `${fakeIdp.issuer}/jwks`;

    // LINE config pointing to fakeIdp with different client id and redirect uri
    process.env.OIDC_LINE_CLIENT_ID = 'line-client-id-test';
    process.env.OIDC_LINE_CLIENT_SECRET = 'line-client-secret-test';
    process.env.OIDC_LINE_REDIRECT_URI = 'http://127.0.0.1:3000/auth/oidc/line/callback';
    process.env.OIDC_LINE_ISSUER = fakeIdp.issuer;
    process.env.OIDC_LINE_AUTH_URL = `${fakeIdp.issuer}/auth`;
    process.env.OIDC_LINE_TOKEN_URL = `${fakeIdp.issuer}/token`;
    process.env.OIDC_LINE_JWKS_URL = `${fakeIdp.issuer}/jwks`;

    app = buildApp({
      logger: false,
      jwtSecret: testSecret,
      userStatusCacheMs: 30000,
      authRateLimitMax: 1000,
    });
  });

  after(async () => {
    if (fakeIdp) {
      await fakeIdp.stop();
    }
    await closePool();
    if (pgInstance) {
      pgInstance.stop();
    }
  });

  beforeEach(() => {
    fakeIdp.tokenHook = null;
    fakeIdp.jwksHook = null;
    fakeIdp.activeAlg = 'RS256';
    if (app && app.rateLimiter) {
      app.rateLimiter.reset();
    }
  });

  // Helper to extract cookie
  function getCookieValue(setCookieHeader, cookieName) {
    if (!setCookieHeader) return null;
    const headerStr = Array.isArray(setCookieHeader) ? setCookieHeader.join('; ') : setCookieHeader;
    const match = headerStr.match(new RegExp(`${cookieName}=([^;]+)`));
    return match ? match[1] : null;
  }

  // Helper to drive the full flow
  async function driveOidcLogin(provider, options = {}) {
    const returnTo = options.returnTo || allowedReturnUrl;
    const startRes = await app.inject({
      method: 'GET',
      url: `/auth/oidc/${provider}/start?return_to=${encodeURIComponent(returnTo)}`,
    });

    if (options.expectStartStatus) {
      assert.equal(startRes.statusCode, options.expectStartStatus);
      return { startRes };
    }

    assert.equal(startRes.statusCode, 302);
    const startLocation = new URL(startRes.headers.location);
    const state = startLocation.searchParams.get('state');
    const nonce = startLocation.searchParams.get('nonce');
    const codeChallenge = startLocation.searchParams.get('code_challenge');
    const cookie = getCookieValue(startRes.headers['set-cookie'], 'hoopup_oidc');

    const authCode = options.authCode || `auth-code-${crypto.randomBytes(8).toString('hex')}`;
    const claims = {
      sub: options.sub || `sub-${crypto.randomBytes(6).toString('hex')}`,
      email: options.email !== undefined ? options.email : `oidc_${crypto.randomBytes(4).toString('hex')}@test.com`,
      email_verified: options.email_verified !== undefined ? options.email_verified : true,
      name: options.name !== undefined ? options.name : 'Test Athlete',
      nonce: options.wrongNonce ? 'wrong-nonce-value' : nonce,
      ...options.claims,
    };
    if (options.omitEmail) {
      delete claims.email;
    }

    fakeIdp.registerCode(authCode, {
      codeChallenge,
      claims,
      customIdToken: options.customIdToken,
      alg: options.alg || 'RS256',
    });

    // Callback
    const cbState = options.wrongState ? 'tampered-state-value' : state;
    const cbCode = options.wrongCode ? 'wrong-code-value' : authCode;
    const cbCookie = options.wrongCookie ? 'wrong-cookie-value' : (options.missingCookie ? null : cookie);
    const cbProvider = options.wrongCallbackProvider || provider;

    const cbHeaders = {};
    if (cbCookie) {
      cbHeaders.cookie = `hoopup_oidc=${cbCookie}`;
    }

    const cbQuery = new URLSearchParams();
    if (!options.omitState) cbQuery.set('state', cbState);
    if (!options.omitCode) cbQuery.set('code', cbCode);
    if (options.providerError) cbQuery.set('error', options.providerError);

    const cbRes = await app.inject({
      method: 'GET',
      url: `/auth/oidc/${cbProvider}/callback?${cbQuery.toString()}`,
      headers: cbHeaders,
    });

    if (options.expectCallbackStatus) {
      assert.equal(cbRes.statusCode, options.expectCallbackStatus);
      return { startRes, cbRes };
    }

    assert.equal(cbRes.statusCode, 302);
    assert.equal(cbRes.headers['cache-control'], 'no-store');
    assert.equal(cbRes.headers['referrer-policy'], 'no-referrer');

    const cbLocation = new URL(cbRes.headers.location);
    const exchangeCode = cbLocation.searchParams.get('code');
    const callbackError = cbLocation.searchParams.get('error');

    if (options.expectCallbackError) {
      assert.equal(callbackError, options.expectCallbackError);
      return { startRes, cbRes, callbackError };
    }

    assert.ok(exchangeCode, 'Expected exchange code in redirect URL');

    if (options.skipExchange) {
      return {
        startRes,
        cbRes,
        exchangeCode,
        claims,
      };
    }

    // Exchange
    const exRes = await app.inject({
      method: 'POST',
      url: '/auth/oidc/exchange',
      payload: {
        code: options.wrongExchangeCode || exchangeCode,
      },
    });

    return {
      startRes,
      cbRes,
      exRes,
      exchangeCode,
      claims,
    };
  }

  // 0. Prerequisite Fix: UserStatusCache.invalidate race condition
  test('0. Prerequisite Fix: UserStatusCache.invalidate race condition', async () => {
    let gateResolve;
    const gatePromise = new Promise((resolve) => {
      gateResolve = resolve;
    });

    let queryCount = 0;
    let queryStatus = 'active';

    const slowQueryFn = async (userId) => {
      queryCount++;
      const current = queryStatus;
      if (queryCount === 1) {
        await gatePromise;
      }
      return current;
    };

    const cache = new UserStatusCache({
      ttlMs: 30000,
      queryFn: slowQueryFn,
    });

    const p1 = cache.get('user-race-test');
    queryStatus = 'banned';
    cache.invalidate('user-race-test');
    const p2 = cache.get('user-race-test');

    gateResolve();

    const [res1, res2] = await Promise.all([p1, p2]);
    assert.equal(res1, 'active', 'Initial query receives its snapshotted status');
    assert.equal(res2, 'banned', 'Post-invalidate query must receive fresh status');

    const res3 = await cache.get('user-race-test');
    assert.equal(res3, 'banned', 'Cache must retain new status and not be polluted by stale query');
  });

  // 1. Happy Path: New User via Google OIDC
  test('1. Happy Path: New user via Google OIDC (hash NULL, email_verified true, identity & profile created, exchange token works)', async () => {
    const email = `new_google_${crypto.randomBytes(4).toString('hex')}@test.com`;
    const sub = `google-sub-${crypto.randomBytes(6).toString('hex')}`;
    const name = 'สมชาย สายลุย';

    const { cbRes, exRes, claims } = await driveOidcLogin('google', {
      sub,
      email,
      name,
    });

    assert.equal(exRes.statusCode, 200);
    assert.equal(exRes.headers['cache-control'], 'no-store');
    assert.equal(exRes.headers['referrer-policy'], 'no-referrer');

    const body = exRes.json();
    assert.ok(body.accessToken, 'Must return accessToken');
    assert.equal(body.tokenType, 'Bearer');
    assert.ok(body.user.id);
    assert.equal(body.user.email, email);
    assert.equal(body.user.emailVerified, true);

    // Verify DB state
    const userRow = await withClient(async (c) => {
      const res = await c.query('SELECT password_hash, email_verified FROM app_auth.users WHERE id = $1;', [body.user.id]);
      return res.rows[0];
    });
    assert.equal(userRow.password_hash, null, 'password_hash must be NULL');
    assert.equal(userRow.email_verified, true, 'email_verified must be true');

    // Verify identity row
    const identRow = await withClient(async (c) => {
      const res = await c.query('SELECT provider, subject, email FROM app_auth.identities WHERE user_id = $1;', [body.user.id]);
      return res.rows[0];
    });
    assert.equal(identRow.provider, 'google');
    assert.equal(identRow.subject, sub);
    assert.equal(identRow.email, email);

    // Verify profile created via hoopup_save_profile
    const profileRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${body.accessToken}` },
    });
    assert.equal(profileRes.statusCode, 200);
    const profileJson = profileRes.json();
    assert.equal(profileJson.user.emailVerified, true);
    assert.equal(profileJson.profile.display_name, name);
    assert.equal(profileJson.profile.avatar_path, null, 'No hotlinked avatar');

    // Verify authenticated RPC call works with issued access token
    const rpcRes = await app.inject({
      method: 'POST',
      url: '/rpc/hoopup_list_sessions',
      headers: { authorization: `Bearer ${body.accessToken}` },
      payload: { p_filter: {} },
    });
    assert.equal(rpcRes.statusCode, 200);
  });

  // 2. Idempotent Login: Same sub again resolves to same user
  test('2. Same sub logs in again: resolves to existing user and updates last_login_at', async () => {
    const email = `repeat_user_${crypto.randomBytes(4).toString('hex')}@test.com`;
    const sub = `sub-repeat-${crypto.randomBytes(6).toString('hex')}`;

    const first = await driveOidcLogin('google', { sub, email, name: 'Repeat User' });
    const firstUserId = first.exRes.json().user.id;

    // Second login with same sub
    const second = await driveOidcLogin('google', { sub, email, name: 'Repeat User' });
    const secondUserId = second.exRes.json().user.id;

    assert.equal(firstUserId, secondUserId, 'Must resolve to the exact same user ID');

    // Verify only 1 identity row and 1 user row exist
    const count = await withClient(async (c) => {
      const res = await c.query('SELECT count(*)::int AS count FROM app_auth.identities WHERE subject = $1;', [sub]);
      return res.rows[0].count;
    });
    assert.equal(count, 1);
  });

  // 3. Link by verified email & Pre-Hijack rule
  test('3. Pre-hijack rule: linking to existing password account with email_verified false clears password_hash and sets email_verified true', async () => {
    const email = `victim_${crypto.randomBytes(4).toString('hex')}@test.com`;
    const password = 'StrongPassword2026!';

    // Attacker signs up with victim's email via password
    const signupRes = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: {
        email,
        password,
        displayName: 'Victim Account',
      },
    });
    assert.equal(signupRes.statusCode, 201);
    const victimUserId = signupRes.json().user.id;
    assert.equal(signupRes.json().user.emailVerified, false);

    // Victim logs in via Google OIDC with verified email
    const victimSub = `google-victim-sub-${crypto.randomBytes(4).toString('hex')}`;
    const oidcResult = await driveOidcLogin('google', {
      sub: victimSub,
      email,
      email_verified: true,
      name: 'Real Victim Name',
    });
    assert.equal(oidcResult.exRes.statusCode, 200);
    assert.equal(oidcResult.exRes.json().user.id, victimUserId, 'Must link to existing user ID');
    assert.equal(oidcResult.exRes.json().user.emailVerified, true);

    // Verify DB state: password_hash NULL, email_verified true
    const updatedUser = await withClient(async (c) => {
      const res = await c.query('SELECT password_hash, email_verified FROM app_auth.users WHERE id = $1;', [victimUserId]);
      return res.rows[0];
    });
    assert.equal(updatedUser.password_hash, null, 'Attacker password hash must be cleared to NULL');
    assert.equal(updatedUser.email_verified, true, 'email_verified must be flipped to true');

    // Attacker tries to login with old password -> returns 401 identical to wrong password
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password },
    });
    assert.equal(loginRes.statusCode, 401);
    assert.equal(loginRes.json().error, 'Invalid email or password');
  });

  // 4. Case-insensitive email linking
  test('4. Case-insensitive email link (citext matching)', async () => {
    const baseEmail = `case_test_${crypto.randomBytes(4).toString('hex')}@example.com`;
    const lowerEmail = baseEmail.toLowerCase();
    const upperEmail = baseEmail.toUpperCase();

    // Signup with lowercase
    const signupRes = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: lowerEmail, password: 'StrongPassword2026!', displayName: 'Case User' },
    });
    assert.equal(signupRes.statusCode, 201);
    const userId = signupRes.json().user.id;

    // Login via OIDC with uppercase email
    const oidcSub = `case-sub-${crypto.randomBytes(4).toString('hex')}`;
    const result = await driveOidcLogin('google', {
      sub: oidcSub,
      email: upperEmail,
      email_verified: true,
    });
    assert.equal(result.exRes.statusCode, 200);
    assert.equal(result.exRes.json().user.id, userId, 'Must link case-insensitively to existing user');
  });

  // 5. Unverified email claims
  test('5. Unverified email claim: Google returns 403 email_not_verified; LINE creates placeholder account', async () => {
    const unverifiedEmail = `unverified_${crypto.randomBytes(4).toString('hex')}@test.com`;

    // Google preset refuses unverified email with 403
    const googleRes = await driveOidcLogin('google', {
      email: unverifiedEmail,
      email_verified: false,
      expectCallbackStatus: 403,
    });
    assert.equal(googleRes.cbRes.json().error, 'email_not_verified');

    // LINE preset (allowUnverifiedEmail: true) creates placeholder account
    const lineSub = `line-sub-${crypto.randomBytes(6).toString('hex')}`;
    fakeIdp.clientId = 'line-client-id-test';
    fakeIdp.clientSecret = 'line-client-secret-test';
    fakeIdp.redirectUri = 'http://127.0.0.1:3000/auth/oidc/line/callback';

    const lineResult = await driveOidcLogin('line', {
      sub: lineSub,
      email: unverifiedEmail,
      email_verified: false,
      name: 'LINE Athlete',
    });
    assert.equal(lineResult.exRes.statusCode, 200);
    const lineUser = lineResult.exRes.json().user;
    assert.equal(lineUser.emailVerified, false);
    assert.ok(lineUser.email.endsWith('@oidc.invalid'), `Expected placeholder email ending in @oidc.invalid, got ${lineUser.email}`);
    assert.ok(lineUser.email.startsWith('line-'));

    // Reset fakeIdp back to Google defaults for subsequent tests
    fakeIdp.clientId = 'google-client-id-test';
    fakeIdp.clientSecret = 'google-client-secret-test';
    fakeIdp.redirectUri = 'http://127.0.0.1:3000/auth/oidc/google/callback';
  });

  // 6. Both RS256 and ES256 IdPs verified
  test('6. Cryptographic algorithms: Both RS256 and ES256 IdPs succeed', async () => {
    // RS256 tested in happy path; now test ES256
    const esSub = `es256-sub-${crypto.randomBytes(4).toString('hex')}`;
    const esEmail = `es256_${crypto.randomBytes(4).toString('hex')}@test.com`;

    const result = await driveOidcLogin('google', {
      sub: esSub,
      email: esEmail,
      alg: 'ES256',
    });
    assert.equal(result.exRes.statusCode, 200);
    assert.equal(result.exRes.json().user.email, esEmail);
  });

  // 7. Security & Protocol Failures (400 JSON and 302 Error Redirects)
  describe('7. Security & Protocol Failures', () => {
    test('7.1 Unknown state returns 400 JSON', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/auth/oidc/google/callback?code=some-code&state=nonexistent-state',
      });
      assert.equal(res.statusCode, 400);
      assert.equal(res.json().error, 'invalid_request');
    });

    test('7.2 Replayed state returns 400 JSON on second use', async () => {
      const startRes = await app.inject({
        method: 'GET',
        url: `/auth/oidc/google/start?return_to=${encodeURIComponent(allowedReturnUrl)}`,
      });
      const startUrl = new URL(startRes.headers.location);
      const state = startUrl.searchParams.get('state');
      const cookie = getCookieValue(startRes.headers['set-cookie'], 'hoopup_oidc');

      // Consume once with invalid code to trigger state consumption
      await app.inject({
        method: 'GET',
        url: `/auth/oidc/google/callback?code=bad-code&state=${state}`,
        headers: { cookie: `hoopup_oidc=${cookie}` },
      });

      // Second use must fail with 400 JSON
      const replayRes = await app.inject({
        method: 'GET',
        url: `/auth/oidc/google/callback?code=bad-code&state=${state}`,
        headers: { cookie: `hoopup_oidc=${cookie}` },
      });
      assert.equal(replayRes.statusCode, 400);
      assert.equal(replayRes.json().error, 'invalid_request');
    });

    test('7.3 Expired state returns 400 JSON', async () => {
      const stateStore = app.oidcStateStore;
      const expiredState = 'expired-state-test';
      stateStore.save({
        state: expiredState,
        provider: 'google',
        nonce: 'nonce',
        verifier: 'verifier',
        returnTo: allowedReturnUrl,
        cookieHash: 'dummy-hash',
      });
      // Force expire
      const key = crypto.createHash('sha256').update(expiredState).digest('hex');
      stateStore.store.get(key).expiresAt = Date.now() - 1000;

      const res = await app.inject({
        method: 'GET',
        url: `/auth/oidc/google/callback?code=c&state=${expiredState}`,
        headers: { cookie: 'hoopup_oidc=dummy' },
      });
      assert.equal(res.statusCode, 400);
    });

    test('7.4 Missing or mismatched binding cookie returns 400 JSON', async () => {
      // Missing cookie
      const resMissing = await driveOidcLogin('google', {
        missingCookie: true,
        expectCallbackStatus: 400,
      });
      assert.equal(resMissing.cbRes.json().error, 'invalid_request');

      // Wrong cookie
      const resWrong = await driveOidcLogin('google', {
        wrongCookie: true,
        expectCallbackStatus: 400,
      });
      assert.equal(resWrong.cbRes.json().error, 'invalid_request');
    });

    test('7.5 Provider mismatch between start and callback returns 400 JSON', async () => {
      const res = await driveOidcLogin('google', {
        wrongCallbackProvider: 'line',
        expectCallbackStatus: 400,
      });
      assert.equal(res.cbRes.json().error, 'invalid_request');
    });

    test('7.6 Wrong nonce returns error redirect', async () => {
      const res = await driveOidcLogin('google', {
        wrongNonce: true,
        expectCallbackError: 'invalid_token',
      });
      assert.equal(res.callbackError, 'invalid_token');
    });

    test('7.7 Wrong audience returns error redirect', async () => {
      const res = await driveOidcLogin('google', {
        claims: { aud: 'attacker-client-id' },
        expectCallbackError: 'invalid_token',
      });
      assert.equal(res.callbackError, 'invalid_token');
    });

    test('7.8 Wrong issuer returns error redirect', async () => {
      const customToken = await fakeIdp.createSignedIdToken(
        { sub: 'sub-wrong-iss', nonce: 'test' },
        { issuer: 'https://evil-issuer.com' }
      );
      const res = await driveOidcLogin('google', {
        customIdToken: customToken,
        expectCallbackError: 'invalid_token',
      });
      assert.equal(res.callbackError, 'invalid_token');
    });

    test('7.9 Expired token returns error redirect', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const res = await driveOidcLogin('google', {
        claims: { exp: nowSec - 60 },
        expectCallbackError: 'invalid_token',
      });
      assert.equal(res.callbackError, 'invalid_token');
    });

    test('7.10 Future iat returns error redirect', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const res = await driveOidcLogin('google', {
        claims: { iat: nowSec + 3600 },
        expectCallbackError: 'invalid_token',
      });
      assert.equal(res.callbackError, 'invalid_token');
    });

    test('7.11 Signature by a different key returns error redirect', async () => {
      const strangerKeyPair = await jose.generateKeyPair('RS256');
      const customToken = await fakeIdp.createSignedIdToken(
        { sub: 'sub-stranger' },
        { keyPair: strangerKeyPair }
      );
      const res = await driveOidcLogin('google', {
        customIdToken: customToken,
        expectCallbackError: 'invalid_token',
      });
      assert.equal(res.callbackError, 'invalid_token');
    });

    test('7.12 Unknown kid returns error redirect', async () => {
      const customToken = await fakeIdp.createSignedIdToken(
        { sub: 'sub-unknown-kid' },
        { kid: 'unknown-key-999' }
      );
      const res = await driveOidcLogin('google', {
        customIdToken: customToken,
        expectCallbackError: 'invalid_token',
      });
      assert.equal(res.callbackError, 'invalid_token');
    });

    test('7.13 alg:none returns error redirect', async () => {
      // Unsigned token
      const nowSec = Math.floor(Date.now() / 1000);
      const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        sub: 'sub-none',
        iss: fakeIdp.issuer,
        aud: fakeIdp.clientId,
        iat: nowSec,
        exp: nowSec + 3600,
      })).toString('base64url');
      const noneToken = `${header}.${payload}.`;

      const res = await driveOidcLogin('google', {
        customIdToken: noneToken,
        expectCallbackError: 'invalid_token',
      });
      assert.equal(res.callbackError, 'invalid_token');
    });

    test('7.14 HS256 signed with public key as secret (Key confusion) is refused', async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const exportedPublic = await jose.exportSPKI(fakeIdp.rsKeyPair.publicKey);
      const hmacSecret = new TextEncoder().encode(exportedPublic);

      const confusionToken = await new jose.SignJWT({
        sub: 'sub-key-confusion',
        iss: fakeIdp.issuer,
        aud: fakeIdp.clientId,
        iat: nowSec,
        exp: nowSec + 3600,
      })
        .setProtectedHeader({ alg: 'HS256', kid: 'rs-key-1' })
        .sign(hmacSecret);

      const res = await driveOidcLogin('google', {
        customIdToken: confusionToken,
        expectCallbackError: 'invalid_token',
      });
      assert.equal(res.callbackError, 'invalid_token');
    });

    test('7.15 Missing sub claim returns error redirect', async () => {
      const res = await driveOidcLogin('google', {
        claims: { sub: '' },
        expectCallbackError: 'invalid_token',
      });
      assert.equal(res.callbackError, 'invalid_token');
    });

    test('7.16 Array aud without matching azp returns error redirect', async () => {
      const res = await driveOidcLogin('google', {
        claims: {
          aud: [fakeIdp.clientId, 'another-client-id'],
          azp: 'wrong-azp-client',
        },
        expectCallbackError: 'invalid_token',
      });
      assert.equal(res.callbackError, 'invalid_token');
    });

    test('7.17 email_verified: "false" (string false) treated as unverified', async () => {
      const res = await driveOidcLogin('google', {
        claims: { email_verified: 'false' },
        expectCallbackStatus: 403,
      });
      assert.equal(res.cbRes.json().error, 'email_not_verified');
    });

    test('7.18 Missing id_token from token endpoint returns error redirect', async () => {
      fakeIdp.tokenHook = (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ access_token: 'no-id-token' }));
      };
      const res = await driveOidcLogin('google', {
        expectCallbackError: 'invalid_token_response',
      });
      assert.equal(res.callbackError, 'invalid_token_response');
    });

    test('7.19 Token endpoint HTTP 500 / timeout returns error redirect', async () => {
      fakeIdp.tokenHook = (req, res) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'internal_upstream_failure' }));
      };
      const res = await driveOidcLogin('google', {
        expectCallbackError: 'token_endpoint_error',
      });
      assert.equal(res.callbackError, 'token_endpoint_error');
    });

    test('7.20 Wrong code_verifier (PKCE failure) rejected by IdP -> error redirect', async () => {
      fakeIdp.tokenHook = (req, res, params) => {
        // Enforce PKCE check failure
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'PKCE verification failed' }));
      };
      const res = await driveOidcLogin('google', {
        expectCallbackError: 'token_endpoint_error',
      });
      assert.equal(res.callbackError, 'token_endpoint_error');
    });

    test('7.21 return_to not allowlisted returns 400', async () => {
      const maliciousUrls = [
        '//evil.com/callback',
        'javascript:alert(1)',
        'http://localhost:5173/auth/callback/', // Trailing slash mismatch
        'HTTP://LOCALHOST:5173/auth/callback',  // Case mismatch
        'http://user:pass@localhost:5173/auth/callback', // Userinfo trick
        'http://evil.com/auth/callback',
      ];

      for (const badUrl of maliciousUrls) {
        const res = await app.inject({
          method: 'GET',
          url: `/auth/oidc/google/start?return_to=${encodeURIComponent(badUrl)}`,
        });
        assert.equal(res.statusCode, 400, `Expected 400 for return_to: ${badUrl}`);
        assert.equal(res.json().error, 'invalid_return_to');
      }
    });

    test('7.22 Unconfigured / half-configured / unknown provider returns 404', async () => {
      // Unknown provider
      const resUnknown = await app.inject({
        method: 'GET',
        url: `/auth/oidc/unknown_idp/start?return_to=${encodeURIComponent(allowedReturnUrl)}`,
      });
      assert.equal(resUnknown.statusCode, 404);
      assert.equal(resUnknown.json().error, 'provider_not_configured');

      // Half-configured provider app instance
      const halfApp = buildApp({
        logger: false,
        jwtSecret: testSecret,
        providers: 'google,halfprov',
        halfprovClientId: 'half-client-id',
        // secret and redirectUri omitted!
      });
      const resHalf = await halfApp.inject({
        method: 'GET',
        url: `/auth/oidc/halfprov/start?return_to=${encodeURIComponent(allowedReturnUrl)}`,
      });
      assert.equal(resHalf.statusCode, 404);
      assert.equal(resHalf.json().error, 'provider_not_configured');
    });
  });

  // 8. Exchange Code Security
  describe('8. Exchange Code Security', () => {
    test('8.1 Exchange code replay returns 400 invalid_code', async () => {
      const { exRes, exchangeCode } = await driveOidcLogin('google');
      assert.equal(exRes.statusCode, 200);

      // Replay
      const replayRes = await app.inject({
        method: 'POST',
        url: '/auth/oidc/exchange',
        payload: { code: exchangeCode },
      });
      assert.equal(replayRes.statusCode, 400);
      assert.equal(replayRes.json().error, 'invalid_code');
    });

    test('8.2 Expired exchange code returns 400 invalid_code', async () => {
      const { exchangeCode } = await driveOidcLogin('google', { skipExchange: true });
      // Expire the code in the store
      const key = crypto.createHash('sha256').update(exchangeCode).digest('hex');
      const entry = app.oidcExchangeCodeStore.store.get(key);
      assert.ok(entry, 'Exchange code entry must exist before expiring');
      entry.expiresAt = Date.now() - 1000;

      const res = await app.inject({
        method: 'POST',
        url: '/auth/oidc/exchange',
        payload: { code: exchangeCode },
      });
      assert.equal(res.statusCode, 400);
      assert.equal(res.json().error, 'invalid_code');
    });

    test('8.3 Garbage, empty, and oversize (> 2048) codes return 400 invalid_code', async () => {
      const testCases = [
        {},
        { code: '' },
        { code: 12345 },
        { code: 'a'.repeat(2049) },
        { code: 'nonexistent-code-random' },
      ];

      for (const payload of testCases) {
        const res = await app.inject({
          method: 'POST',
          url: '/auth/oidc/exchange',
          payload,
        });
        assert.equal(res.statusCode, 400);
        assert.equal(res.json().error, 'invalid_code');
      }
    });
  });

  // 9. Moderation / Status Integration (Banned & Deleted Users)
  describe('9. User Status Enforcement on OIDC', () => {
    test('9.1 Banned user refused at callback (error redirect to account_unavailable)', async () => {
      const email = `banned_oidc_${crypto.randomBytes(4).toString('hex')}@test.com`;
      const sub = `sub-banned-${crypto.randomBytes(4).toString('hex')}`;

      // Create banned user in DB
      let bannedId;
      await withClient(async (c) => {
        const res = await c.query(
          `INSERT INTO app_auth.users (email, banned_at, ban_reason)
           VALUES ($1, now(), 'terms violation')
           RETURNING id;`,
          [email]
        );
        bannedId = res.rows[0].id;
      });

      const res = await driveOidcLogin('google', {
        sub,
        email,
        expectCallbackError: 'account_unavailable',
      });
      assert.equal(res.callbackError, 'account_unavailable');

      // Verify no second account was created
      const count = await withClient(async (c) => {
        const r = await c.query('SELECT count(*)::int AS count FROM app_auth.users WHERE email = $1;', [email]);
        return r.rows[0].count;
      });
      assert.equal(count, 1);
    });

    test('9.2 User banned between callback and exchange is refused at exchange with 403', async () => {
      const email = `mid_ban_${crypto.randomBytes(4).toString('hex')}@test.com`;
      const { exRes, exchangeCode, claims } = await driveOidcLogin('google', {
        email,
        wrongExchangeCode: 'PLACEHOLDER', // don't execute exchange automatically
      });

      // User was resolved and code issued; now ban the user in DB
      const userId = await withClient(async (c) => {
        const r = await c.query('SELECT id FROM app_auth.users WHERE email = $1;', [email]);
        return r.rows[0].id;
      });

      await withClient(async (c) => {
        await c.query('UPDATE app_auth.users SET banned_at = now() WHERE id = $1;', [userId]);
      });

      // Call exchange with valid code
      const realExchangeRes = await app.inject({
        method: 'POST',
        url: '/auth/oidc/exchange',
        payload: { code: exchangeCode },
      });
      assert.equal(realExchangeRes.statusCode, 403);
      assert.equal(realExchangeRes.json().error, 'Account unavailable');
    });

    test('9.3 Deleted user refused at exchange with 403', async () => {
      const email = `mid_del_${crypto.randomBytes(4).toString('hex')}@test.com`;
      const { exchangeCode } = await driveOidcLogin('google', {
        email,
        wrongExchangeCode: 'PLACEHOLDER',
      });

      const userId = await withClient(async (c) => {
        const r = await c.query('SELECT id FROM app_auth.users WHERE email = $1;', [email]);
        return r.rows[0].id;
      });

      await withClient(async (c) => {
        await c.query('UPDATE app_auth.users SET deleted_at = now() WHERE id = $1;', [userId]);
      });

      const realExchangeRes = await app.inject({
        method: 'POST',
        url: '/auth/oidc/exchange',
        payload: { code: exchangeCode },
      });
      assert.equal(realExchangeRes.statusCode, 403);
      assert.equal(realExchangeRes.json().error, 'Account unavailable');
    });
  });

  // 10. Concurrency & Parallel First Logins
  test('10. Parallel first logins of one sub create exactly ONE user', async () => {
    const sub = `parallel-sub-${crypto.randomBytes(6).toString('hex')}`;
    const email = `parallel_${crypto.randomBytes(4).toString('hex')}@test.com`;

    // Start 2 logins
    const login1 = await driveOidcLogin('google', { sub, email, wrongExchangeCode: 'HOLD' });
    const login2 = await driveOidcLogin('google', { sub, email, wrongExchangeCode: 'HOLD' });

    // Verify exactly one user in app_auth.users and one identity in app_auth.identities
    const userCount = await withClient(async (c) => {
      const r = await c.query('SELECT count(*)::int AS count FROM app_auth.users WHERE email = $1;', [email]);
      return r.rows[0].count;
    });
    assert.equal(userCount, 1, 'Exactly one user row must exist');

    const identCount = await withClient(async (c) => {
      const r = await c.query('SELECT count(*)::int AS count FROM app_auth.identities WHERE subject = $1;', [sub]);
      return r.rows[0].count;
    });
    assert.equal(identCount, 1, 'Exactly one identity row must exist');
  });

  // 11. OIDC-Only User Password Login & Duplicate Signup
  test('11. OIDC-only user attempting password login returns 401 identical to wrong password; duplicate signup returns 409', async () => {
    const email = `oidc_only_${crypto.randomBytes(4).toString('hex')}@test.com`;
    await driveOidcLogin('google', { email });

    // 1. Password login attempt
    const pwRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: 'AnyPassword123!' },
    });
    assert.equal(pwRes.statusCode, 401);
    assert.equal(pwRes.json().error, 'Invalid email or password');

    // 2. Signup with same email returns 409
    const signupRes = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email, password: 'StrongPassword1234!', displayName: 'Attacker' },
    });
    assert.equal(signupRes.statusCode, 409);
    assert.equal(signupRes.json().error, 'Email already registered');
  });

  // 12. Rate Limiting on /start and /exchange
  test('12. In-memory IP rate limiter applies to /auth/oidc/:provider/start and /auth/oidc/exchange', async () => {
    const testLimiterApp = buildApp({
      logger: false,
      jwtSecret: testSecret,
      authRateLimitMax: 5,
      authRateLimitWindowMs: 60000,
    });

    const clientIp = '198.51.100.55';

    // 5 allowed requests to /start
    for (let i = 0; i < 5; i++) {
      const res = await testLimiterApp.inject({
        method: 'GET',
        url: `/auth/oidc/google/start?return_to=${encodeURIComponent(allowedReturnUrl)}`,
        headers: { 'x-forwarded-for': clientIp },
      });
      assert.equal(res.statusCode, 302);
    }

    // 6th request trips rate limit -> 429
    const limitedRes = await testLimiterApp.inject({
      method: 'GET',
      url: `/auth/oidc/google/start?return_to=${encodeURIComponent(allowedReturnUrl)}`,
      headers: { 'x-forwarded-for': clientIp },
    });
    assert.equal(limitedRes.statusCode, 429);
    assert.ok(limitedRes.headers['retry-after']);
  });

  // 13. Logging Redaction & Query String Stripping
  test('13. Captured log output drops query string on /auth/oidc/ and redacts sensitive credentials', async () => {
    let logBuffer = '';
    const captureStream = {
      write(chunk) {
        logBuffer += chunk;
      },
    };

    const loggingApp = buildApp({
      jwtSecret: testSecret,
      logger: {
        level: 'info',
        stream: captureStream,
        serializers: {
          req(req) {
            let url = req.url;
            if (url && (url.startsWith('/auth/oidc/') || url === '/auth/oidc')) {
              const qIdx = url.indexOf('?');
              if (qIdx !== -1) {
                url = url.slice(0, qIdx);
              }
            }
            return {
              method: req.method,
              url,
              hostname: req.hostname,
              remoteAddress: req.ip,
            };
          },
        },
        redact: {
          paths: ['password', 'accessToken', 'id_token', 'code', 'state', 'nonce', 'verifier', 'clientSecret'],
          censor: '[REDACTED]',
        },
      },
    });

    const secretState = 'super-sensitive-secret-state-12345';
    const secretCode = 'super-sensitive-secret-code-67890';

    await loggingApp.inject({
      method: 'GET',
      url: `/auth/oidc/google/callback?code=${secretCode}&state=${secretState}`,
    });

    assert.ok(!logBuffer.includes(secretState), 'Log must NOT contain the raw state string');
    assert.ok(!logBuffer.includes(secretCode), 'Log must NOT contain the raw code string');
  });

  // 14. Bounded In-Memory Stores
  test('14. In-memory maps stay bounded at max 5000 entries after 6,000 insertions', async () => {
    const stateStore = new OidcStateStore({ maxSize: 5000 });
    for (let i = 0; i < 6000; i++) {
      stateStore.save({
        state: `state-${i}`,
        provider: 'google',
        nonce: `nonce-${i}`,
        verifier: `verifier-${i}`,
        returnTo: allowedReturnUrl,
        cookieHash: `hash-${i}`,
      });
    }
    assert.equal(stateStore.store.size, 5000, 'State store size must be capped at 5000');

    const codeStore = new OidcExchangeCodeStore({ maxSize: 5000 });
    for (let i = 0; i < 6000; i++) {
      codeStore.issue(`user-${i}`);
    }
    assert.equal(codeStore.store.size, 5000, 'Exchange code store size must be capped at 5000');
  });

  // 15. Migration 008 Permissions Check
  test('15. Migration 008: authenticated role has NO SELECT/INSERT/UPDATE on app_auth.identities', async () => {
    const hasSelect = await withClient(async (c) => {
      const res = await c.query("SELECT has_table_privilege('authenticated', 'app_auth.identities', 'select') AS ok;");
      return res.rows[0].ok;
    });
    assert.equal(hasSelect, false, 'Role authenticated must not have SELECT on app_auth.identities');

    const hasInsert = await withClient(async (c) => {
      const res = await c.query("SELECT has_table_privilege('authenticated', 'app_auth.identities', 'insert') AS ok;");
      return res.rows[0].ok;
    });
    assert.equal(hasInsert, false, 'Role authenticated must not have INSERT on app_auth.identities');
  });
});

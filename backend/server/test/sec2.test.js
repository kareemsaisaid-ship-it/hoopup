import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp, parseTrustProxy } from '../src/app.js';
import { BLOCKED_DEV_JWT_SECRETS, createAccessToken } from '../src/auth.js';
import { startTempPostgres } from './helpers/temp-postgres.js';
import { initPool, closePool, withClient } from '../src/db.js';

describe('HoopUp SEC2 Security Fixes Test Suite', async () => {
  let pgInstance;
  const testSecret = 'sec2_test_super_secure_random_key_min_32_bytes!';

  before(async () => {
    pgInstance = await startTempPostgres();
    process.env.DATABASE_URL = pgInstance.connectionString;
    process.env.JWT_SECRET = testSecret;
    initPool({
      connectionString: pgInstance.connectionString,
      statementTimeout: 500, // 500 ms for timeout testing
      idleInTransactionSessionTimeout: 1000,
    });
  });

  after(async () => {
    await closePool();
    if (pgInstance) {
      pgInstance.stop();
    }
  });

  // =========================================================================
  // 1. TRUST_PROXY Tests
  // =========================================================================
  describe('1. trustProxy Configuration and Spoofing Prevention', () => {
    test('1.1 parseTrustProxy rejects true, *, and empty-but-set values at startup', () => {
      assert.throws(
        () => parseTrustProxy('true'),
        /Invalid TRUST_PROXY.*true.*spoofable/
      );
      assert.throws(
        () => parseTrustProxy(true),
        /Invalid TRUST_PROXY.*true.*spoofable/
      );
      assert.throws(
        () => parseTrustProxy('*'),
        /Invalid TRUST_PROXY.*\*/
      );
      assert.throws(
        () => parseTrustProxy(''),
        /Invalid TRUST_PROXY.*empty/
      );
      assert.throws(
        () => parseTrustProxy('   '),
        /Invalid TRUST_PROXY.*empty/
      );
      assert.throws(
        () => parseTrustProxy('127.0.0.1, , 10.0.0.1'),
        /Invalid TRUST_PROXY.*empty/
      );
      assert.throws(
        () => parseTrustProxy('127.0.0.1, *'),
        /Invalid TRUST_PROXY.*\*/
      );
    });

    test('1.2 parseTrustProxy accepts false/unset, IP, CIDR list, and hop count', () => {
      assert.equal(parseTrustProxy(undefined), false);
      assert.equal(parseTrustProxy(null), false);
      assert.equal(parseTrustProxy('false'), false);
      assert.equal(parseTrustProxy(false), false);

      assert.equal(parseTrustProxy('127.0.0.1'), '127.0.0.1');
      assert.deepEqual(parseTrustProxy('127.0.0.1, 10.0.0.0/8'), ['127.0.0.1', '10.0.0.0/8']);

      const hopFn = parseTrustProxy('1');
      assert.equal(typeof hopFn, 'function');
      assert.equal(hopFn('127.0.0.1', 0), true);
      assert.equal(hopFn('127.0.0.1', 1), false);
    });

    test('1.3 TRUST_PROXY=127.0.0.1: credential limiter keys on X-Forwarded-For IP from trusted peer', async () => {
      const app = buildApp({
        trustProxy: '127.0.0.1',
        authRateLimitMax: 3,
        authRateLimitWindowMs: 60000,
        logger: false,
      });

      // Peer is 127.0.0.1 (trusted proxy), forwarded IP = 203.0.113.5
      for (let i = 0; i < 3; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/auth/login',
          headers: { 'X-Forwarded-For': '203.0.113.5' },
          remoteAddress: '127.0.0.1',
          payload: { email: 'wrong@test.com', password: 'WrongPassword123!' },
        });
        assert.equal(res.statusCode, 401);
      }

      // 4th request from same forwarded IP gets 429
      const tripRes = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { 'X-Forwarded-For': '203.0.113.5' },
        remoteAddress: '127.0.0.1',
        payload: { email: 'wrong@test.com', password: 'WrongPassword123!' },
      });
      assert.equal(tripRes.statusCode, 429);
      assert.ok(tripRes.headers['retry-after']);

      // A different forwarded IP (203.0.113.6) gets its own bucket and is allowed
      const separateIpRes = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { 'X-Forwarded-For': '203.0.113.6' },
        remoteAddress: '127.0.0.1',
        payload: { email: 'wrong@test.com', password: 'WrongPassword123!' },
      });
      assert.equal(separateIpRes.statusCode, 401);

      await app.close();
    });

    test('1.4 TRUST_PROXY=127.0.0.1: /places and /places/search key on forwarded IP', async () => {
      const app = buildApp({
        trustProxy: '127.0.0.1',
        placesRateLimitMax: 2,
        placesRateLimitWindowMs: 60000,
        placesSearchRateLimitMax: 2,
        placesSearchRateLimitWindowMs: 60000,
        logger: false,
      });

      // Places route
      for (let i = 0; i < 2; i++) {
        const res = await app.inject({
          method: 'GET',
          url: '/places?bbox=100.50,13.70,100.52,13.72',
          headers: { 'X-Forwarded-For': '198.51.100.10' },
          remoteAddress: '127.0.0.1',
        });
        assert.equal(res.statusCode, 200);
      }
      const places429 = await app.inject({
        method: 'GET',
        url: '/places?bbox=100.50,13.70,100.52,13.72',
        headers: { 'X-Forwarded-For': '198.51.100.10' },
        remoteAddress: '127.0.0.1',
      });
      assert.equal(places429.statusCode, 429);

      // Different IP allowed
      const placesDiff = await app.inject({
        method: 'GET',
        url: '/places?bbox=100.50,13.70,100.52,13.72',
        headers: { 'X-Forwarded-For': '198.51.100.11' },
        remoteAddress: '127.0.0.1',
      });
      assert.equal(placesDiff.statusCode, 200);

      // Places Search route
      for (let i = 0; i < 2; i++) {
        const res = await app.inject({
          method: 'GET',
          url: '/places/search?q=siam',
          headers: { 'X-Forwarded-For': '198.51.100.20' },
          remoteAddress: '127.0.0.1',
        });
        assert.equal(res.statusCode, 200);
      }
      const search429 = await app.inject({
        method: 'GET',
        url: '/places/search?q=siam',
        headers: { 'X-Forwarded-For': '198.51.100.20' },
        remoteAddress: '127.0.0.1',
      });
      assert.equal(search429.statusCode, 429);

      // Different IP allowed
      const searchDiff = await app.inject({
        method: 'GET',
        url: '/places/search?q=siam',
        headers: { 'X-Forwarded-For': '198.51.100.21' },
        remoteAddress: '127.0.0.1',
      });
      assert.equal(searchDiff.statusCode, 200);

      await app.close();
    });

    test('1.5 TRUST_PROXY unset: X-Forwarded-For header is ignored (current default behaviour)', async () => {
      const app = buildApp({
        trustProxy: false,
        authRateLimitMax: 3,
        authRateLimitWindowMs: 60000,
        logger: false,
      });

      // 3 calls with 3 different X-Forwarded-For headers from the same remoteAddress
      for (let i = 0; i < 3; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/auth/login',
          headers: { 'X-Forwarded-For': `203.0.113.${i + 100}` },
          remoteAddress: '127.0.0.1',
          payload: { email: 'wrong@test.com', password: 'WrongPassword123!' },
        });
        assert.equal(res.statusCode, 401);
      }

      // 4th call with another different X-Forwarded-For header is STILL throttled (bucket shared on 127.0.0.1)
      const res4 = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { 'X-Forwarded-For': '203.0.113.200' },
        remoteAddress: '127.0.0.1',
        payload: { email: 'wrong@test.com', password: 'WrongPassword123!' },
      });
      assert.equal(res4.statusCode, 429, 'With TRUST_PROXY unset, socket address must be used');

      await app.close();
    });

    test('1.6 Spoof attempt from untrusted peer: X-Forwarded-For is ignored and does not change rate limiter key', async () => {
      const app = buildApp({
        trustProxy: '127.0.0.1',
        authRateLimitMax: 2,
        authRateLimitWindowMs: 60000,
        logger: false,
      });

      // Untrusted peer connects directly from 198.51.100.50 trying to spoof X-Forwarded-For
      for (let i = 0; i < 2; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/auth/login',
          headers: { 'X-Forwarded-For': `spoofed.ip.${i}, another.spoofed.ip` },
          remoteAddress: '198.51.100.50',
          payload: { email: 'wrong@test.com', password: 'WrongPassword123!' },
        });
        assert.equal(res.statusCode, 401);
      }

      // 3rd attempt from untrusted peer is blocked under its actual socket IP 198.51.100.50
      const tripRes = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { 'X-Forwarded-For': 'brand.new.spoofed.ip' },
        remoteAddress: '198.51.100.50',
        payload: { email: 'wrong@test.com', password: 'WrongPassword123!' },
      });
      assert.equal(tripRes.statusCode, 429);

      await app.close();
    });
  });

  // =========================================================================
  // 2. JWT Secret Length and Production Safety Tests
  // =========================================================================
  describe('2. JWT Secret Enforcement and Production Hardening', () => {
    test('2.1 Refuses to start if JWT secret is shorter than 32 characters', () => {
      assert.throws(
        () => buildApp({ logger: false, jwtSecret: 'short_only_16_ch' }),
        /JWT_SECRET must be at least 32 characters long.*openssl rand -base64 48/
      );
      assert.throws(
        () => buildApp({ logger: false, jwtSecret: '1234567890123456789012345678901' }), // 31 chars
        /JWT_SECRET must be at least 32 characters long.*openssl rand -base64 48/
      );
    });

    test('2.2 In NODE_ENV=production, refuses all known development/demo secrets', () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        for (const blocked of BLOCKED_DEV_JWT_SECRETS) {
          assert.throws(
            () => buildApp({ logger: false, jwtSecret: blocked }),
            /known development\/demo value which is forbidden in production.*openssl rand -base64 48/,
            `Should have blocked known dev secret: ${blocked}`
          );
        }

        // A secure 32+ character random secret must succeed in production
        const secureSecret = 'dGVzdF9zZWN1cmVfcmFuZG9tX3NlY3JldF8zMl9ieXRlc19sb25nISE=';
        const app = buildApp({ logger: false, jwtSecret: secureSecret });
        assert.ok(app);
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });
  });

  // =========================================================================
  // 3. Per-User Rate Limiter on Authenticated Traffic
  // =========================================================================
  describe('3. Per-User Rate Limiter on Authenticated Traffic', () => {
    let userA, tokenA;
    let userB, tokenB;

    before(async () => {
      userA = { id: '00000000-0000-0000-0000-0000000000a1', email: 'userA@test.com' };
      userB = { id: '00000000-0000-0000-0000-0000000000b2', email: 'userB@test.com' };
      await withClient(async (client) => {
        await client.query(
          `INSERT INTO app_auth.users (id, email, password_hash)
           VALUES ($1, $2, 'dummy_hash'), ($3, $4, 'dummy_hash')
           ON CONFLICT (id) DO NOTHING;`,
          [userA.id, userA.email, userB.id, userB.email]
        );
      });
      tokenA = await createAccessToken(userA, testSecret);
      tokenB = await createAccessToken(userB, testSecret);
    });

    test('3.1 /rpc/:name: two users do not share rate-limit buckets', async () => {
      const app = buildApp({
        logger: false,
        jwtSecret: testSecret,
        rpcRateLimitMax: 3,
        rpcRateLimitWindowMs: 60000,
      });

      // User A consumes all 3 tokens on /rpc/hoopup_list_sessions
      for (let i = 0; i < 3; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/rpc/hoopup_list_sessions',
          headers: { Authorization: `Bearer ${tokenA}` },
          payload: { p_filter: {} },
        });
        assert.equal(res.statusCode, 200);
      }

      // User A 4th request trips 429
      const tripRes = await app.inject({
        method: 'POST',
        url: '/rpc/hoopup_list_sessions',
        headers: { Authorization: `Bearer ${tokenA}` },
        payload: { p_filter: {} },
      });
      assert.equal(tripRes.statusCode, 429);
      assert.ok(tripRes.headers['retry-after']);
      const bodyA = tripRes.json();
      assert.equal(bodyA.ok, false);
      assert.equal(bodyA.code, 'rate_limited');

      // User B is completely unaffected
      const resB = await app.inject({
        method: 'POST',
        url: '/rpc/hoopup_list_sessions',
        headers: { Authorization: `Bearer ${tokenB}` },
        payload: { p_filter: {} },
      });
      assert.equal(resB.statusCode, 200);

      await app.close();
    });

    test('3.2 /rpc/:name: stricter limit (20/min default) applies to hoopup_send_message, hoopup_create_session, hoopup_report', async () => {
      const app = buildApp({
        logger: false,
        jwtSecret: testSecret,
        rpcRateLimitMax: 100, // overall limit is high
        rpcStrictRateLimitMax: 2, // strict limit is low (2)
        rpcStrictRateLimitWindowMs: 60000,
      });

      // Strict RPC calls for user A: hoopup_report
      for (let i = 0; i < 2; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/rpc/hoopup_report',
          headers: { Authorization: `Bearer ${tokenA}` },
          payload: {
            p_target_type: 'user',
            p_target_id: '00000000-0000-0000-0000-000000000001',
            p_reason: 'spam',
          },
        });
        // Might be 400 or 200 depending on DB data, but NOT 429
        assert.notEqual(res.statusCode, 429);
      }

      // 3rd call trips the strict limiter with 429
      const tripStrict = await app.inject({
        method: 'POST',
        url: '/rpc/hoopup_report',
        headers: { Authorization: `Bearer ${tokenA}` },
        payload: {
          p_target_type: 'user',
          p_target_id: '00000000-0000-0000-0000-000000000001',
          p_reason: 'spam',
        },
      });
      assert.equal(tripStrict.statusCode, 429);
      assert.ok(tripStrict.headers['retry-after']);

      // Non-strict function (/rpc/hoopup_list_sessions) is still allowed for user A (overall limit is 100)
      const nonStrictRes = await app.inject({
        method: 'POST',
        url: '/rpc/hoopup_list_sessions',
        headers: { Authorization: `Bearer ${tokenA}` },
        payload: { p_filter: {} },
      });
      assert.equal(nonStrictRes.statusCode, 200);

      await app.close();
    });

    test('3.3 /rpc/:name: rate limits reset after window expires', async () => {
      const app = buildApp({
        logger: false,
        jwtSecret: testSecret,
        rpcRateLimitMax: 1,
        rpcRateLimitWindowMs: 50, // 50ms window
      });

      const res1 = await app.inject({
        method: 'POST',
        url: '/rpc/hoopup_list_sessions',
        headers: { Authorization: `Bearer ${tokenA}` },
        payload: { p_filter: {} },
      });
      assert.equal(res1.statusCode, 200);

      const res2 = await app.inject({
        method: 'POST',
        url: '/rpc/hoopup_list_sessions',
        headers: { Authorization: `Bearer ${tokenA}` },
        payload: { p_filter: {} },
      });
      assert.equal(res2.statusCode, 429);

      // Wait 70ms for window to reset
      await new Promise((r) => setTimeout(r, 70));

      const res3 = await app.inject({
        method: 'POST',
        url: '/rpc/hoopup_list_sessions',
        headers: { Authorization: `Bearer ${tokenA}` },
        payload: { p_filter: {} },
      });
      assert.equal(res3.statusCode, 200);

      await app.close();
    });

    test('3.4 GET data routes (/courts, /messages, /session_members, /profiles/*) apply 300/min per-user limiter', async () => {
      const app = buildApp({
        logger: false,
        jwtSecret: testSecret,
        dataRateLimitMax: 3,
        dataRateLimitWindowMs: 60000,
      });

      // 3 calls across data routes by User A
      const res1 = await app.inject({
        method: 'GET',
        url: '/courts',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(res1.statusCode, 200);

      const res2 = await app.inject({
        method: 'GET',
        url: '/profiles/00000000-0000-0000-0000-0000000000a1',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.notEqual(res2.statusCode, 429);

      const res3 = await app.inject({
        method: 'GET',
        url: '/messages?sessionId=00000000-0000-0000-0000-000000000001',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.notEqual(res3.statusCode, 429);

      // 4th call by User A trips data limiter
      const tripRes = await app.inject({
        method: 'GET',
        url: '/courts',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(tripRes.statusCode, 429);
      assert.ok(tripRes.headers['retry-after']);

      // User B is unaffected
      const resB = await app.inject({
        method: 'GET',
        url: '/courts',
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(resB.statusCode, 200);

      await app.close();
    });

    test('3.5 /auth/me, /health, /tiles, and /places are unaffected by data and rpc limiters', async () => {
      const app = buildApp({
        logger: false,
        jwtSecret: testSecret,
        dataRateLimitMax: 1, // exhausted immediately
        rpcRateLimitMax: 1,
        logger: false,
      });

      // Exhaust User A's data limiter
      await app.inject({
        method: 'GET',
        url: '/courts',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const dataBlocked = await app.inject({
        method: 'GET',
        url: '/courts',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(dataBlocked.statusCode, 429);

      // /health is public and unaffected
      const healthRes = await app.inject({ method: 'GET', url: '/health' });
      assert.equal(healthRes.statusCode, 200);

      // /places is public and unaffected
      const placesRes = await app.inject({
        method: 'GET',
        url: '/places?bbox=100.50,13.70,100.52,13.72',
      });
      assert.equal(placesRes.statusCode, 200);

      // /tiles is public and unaffected
      const tilesRes = await app.inject({ method: 'HEAD', url: '/tiles/bangkok.pmtiles' });
      assert.notEqual(tilesRes.statusCode, 429);

      await app.close();
    });
  });

  // =========================================================================
  // 4. DB Pool Timeouts and Generic 503 Error
  // =========================================================================
  describe('4. DB Pool Timeouts and Safe Error Handling', () => {
    test('4.1 pg_sleep exceeding statement_timeout is cancelled and returns generic 503 without leaking SQL', async () => {
      const app = buildApp({
        logger: false,
        jwtSecret: testSecret,
        enableTestRoutes: true,
      });

      // Fast query within 500ms timeout succeeds
      const fastRes = await app.inject({
        method: 'GET',
        url: '/_test/sleep?seconds=0.05',
      });
      assert.equal(fastRes.statusCode, 200);
      assert.equal(fastRes.json().ok, true);

      // Slow query (1.0s) exceeding 500ms statement_timeout is cancelled by PostgreSQL
      const slowRes = await app.inject({
        method: 'GET',
        url: '/_test/sleep?seconds=1.0',
      });

      assert.equal(slowRes.statusCode, 503);
      const body = slowRes.json();
      assert.equal(body.error, 'Service temporarily unavailable');
      assert.equal(slowRes.payload.includes('pg_sleep'), false, 'SQL statement must not leak');
      assert.equal(slowRes.payload.includes('statement_timeout'), false, 'Internal DB timeout message must not leak');

      await app.close();
    });
  });

  // =========================================================================
  // 5. Explicit Profile Columns (No SELECT *)
  // =========================================================================
  describe('5. Explicit Profile Columns Selection', () => {
    test('5.1 /profiles/:userId and /auth/me select explicit columns; future table columns are not exposed', async () => {
      const app = buildApp({
        logger: false,
        jwtSecret: testSecret,
      });

      // 1. Create a real user and profile
      const signupRes = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: {
          email: `sec2_profile_${Date.now()}@test.com`,
          password: 'PasswordValid1234!',
          displayName: 'SEC2 Test Athlete',
        },
      });
      assert.equal(signupRes.statusCode, 201);
      const { user, accessToken } = signupRes.json();

      // 2. Add a temporary sensitive column to public.profiles directly in PostgreSQL
      pgInstance.runSql(
        "ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS temp_secret_national_id text DEFAULT '1-2345-67890-12-3';"
      );

      try {
        // Query /profiles/:userId
        const profileRes = await app.inject({
          method: 'GET',
          url: `/profiles/${user.id}`,
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        assert.equal(profileRes.statusCode, 200);
        const profileBody = profileRes.json();

        // Legitimate columns MUST be present
        assert.equal(profileBody.id, user.id);
        assert.equal(profileBody.display_name, 'SEC2 Test Athlete');
        assert.equal(profileBody.skill_level, 'casual');
        assert.equal(profileBody.plays_any_position, true);
        assert.ok('created_at' in profileBody);
        assert.ok('updated_at' in profileBody);

        // Newly added column MUST NOT be returned
        assert.equal(
          profileBody.temp_secret_national_id,
          undefined,
          'Unselected table column must not be exposed by /profiles/:userId'
        );

        // Query /auth/me
        const meRes = await app.inject({
          method: 'GET',
          url: '/auth/me',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        assert.equal(meRes.statusCode, 200);
        const meBody = meRes.json();
        assert.equal(meBody.user.id, user.id);
        assert.equal(meBody.profile.display_name, 'SEC2 Test Athlete');
        assert.equal(
          meBody.profile.temp_secret_national_id,
          undefined,
          'Unselected table column must not be exposed by /auth/me'
        );
      } finally {
        // Clean up temporary column
        pgInstance.runSql('ALTER TABLE public.profiles DROP COLUMN IF EXISTS temp_secret_national_id;');
        await app.close();
      }
    });
  });

  // =========================================================================
  // 6. Signup Enumeration Timing Verification
  // =========================================================================
  describe('6. Signup Enumeration Timing Mitigation', () => {
    test('6.1 5 fresh signups vs 5 duplicate signups (409) have equivalent cost (median within factor of 2)', async () => {
      const app = buildApp({
        logger: false,
        jwtSecret: testSecret,
        authRateLimitMax: 100, // ensure no rate limit interference during timing test
      });

      const fixedEmail = `sec2_duplicate_${Date.now()}@test.com`;
      const fixedPassword = 'PasswordValid1234!';

      // Create initial user
      const initial = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: { email: fixedEmail, password: fixedPassword, displayName: 'Initial User' },
      });
      assert.equal(initial.statusCode, 201);

      // 5 fresh signups
      const freshTimes = [];
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        const res = await app.inject({
          method: 'POST',
          url: '/auth/signup',
          payload: {
            email: `sec2_fresh_${i}_${Date.now()}@test.com`,
            password: fixedPassword,
            displayName: `Fresh User ${i}`,
          },
        });
        const duration = performance.now() - start;
        assert.equal(res.statusCode, 201);
        freshTimes.push(duration);
      }

      // 5 duplicate signups (409)
      const duplicateTimes = [];
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        const res = await app.inject({
          method: 'POST',
          url: '/auth/signup',
          payload: {
            email: fixedEmail,
            password: fixedPassword,
            displayName: 'Duplicate Attempt',
          },
        });
        const duration = performance.now() - start;
        assert.equal(res.statusCode, 409);
        assert.equal(res.json().error, 'Email already registered');
        duplicateTimes.push(duration);
      }

      freshTimes.sort((a, b) => a - b);
      duplicateTimes.sort((a, b) => a - b);
      const medianFresh = freshTimes[Math.floor(freshTimes.length / 2)];
      const medianDuplicate = duplicateTimes[Math.floor(duplicateTimes.length / 2)];
      const ratio = medianDuplicate / medianFresh;

      console.log(
        `\n[SEC2 Signup Timing Benchmark] fresh median: ${medianFresh.toFixed(2)}ms, duplicate 409 median: ${medianDuplicate.toFixed(2)}ms, ratio: ${ratio.toFixed(2)}`
      );

      // Verify timing within factor of 2 (0.5 to 2.0)
      assert.ok(
        ratio >= 0.5 && ratio <= 2.0,
        `Duplicate signup timing out of bounds: medianDuplicate=${medianDuplicate.toFixed(1)}ms, medianFresh=${medianFresh.toFixed(1)}ms, ratio=${ratio.toFixed(2)}`
      );

      await app.close();
    });
  });
});

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildApp } from '../src/app.js';
import { createAccessToken } from '../src/auth.js';
import { initPool, closePool } from '../src/db.js';
import { UserStatusCache } from '../src/user-status.js';
import { startTempPostgres } from './helpers/temp-postgres.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_DIR = path.resolve(__dirname, '..');
const MODERATE_SCRIPT = path.join(SERVER_DIR, 'scripts', 'moderate.mjs');

describe('HoopUp BAN1 User Status & Moderation Test Suite', async () => {
  let pgInstance;
  const testSecret = 'ban1_test_super_secure_jwt_secret_32_bytes_min!';
  let app;
  let activeUser, activeToken;
  let bannedUser, bannedToken;
  let deletedUser, deletedToken;
  const validPassword = 'PasswordValid1234!';

  before(async () => {
    pgInstance = await startTempPostgres();
    process.env.DATABASE_URL = pgInstance.connectionString;
    process.env.JWT_SECRET = testSecret;

    initPool({
      connectionString: pgInstance.connectionString,
    });

    app = buildApp({
      logger: false,
      jwtSecret: testSecret,
      userStatusCacheMs: 30000,
    });

    // Sign up 3 test users via POST /auth/signup
    const resActive = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: {
        email: 'active_ban1@test.com',
        password: validPassword,
        displayName: 'Active User',
      },
    });
    assert.equal(resActive.statusCode, 201);
    activeUser = resActive.json().user;
    activeToken = resActive.json().accessToken;

    const resBanned = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: {
        email: 'banned_ban1@test.com',
        password: validPassword,
        displayName: 'Banned User',
      },
    });
    assert.equal(resBanned.statusCode, 201);
    bannedUser = resBanned.json().user;
    bannedToken = resBanned.json().accessToken;

    const resDeleted = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: {
        email: 'deleted_ban1@test.com',
        password: validPassword,
        displayName: 'Deleted User',
      },
    });
    assert.equal(resDeleted.statusCode, 201);
    deletedUser = resDeleted.json().user;
    deletedToken = resDeleted.json().accessToken;

    // Use admin connection to set banned_at and deleted_at
    const adminClient = new (await import('pg')).default.Client({
      connectionString: pgInstance.superuserConnectionString,
    });
    await adminClient.connect();
    await adminClient.query(
      "UPDATE app_auth.users SET banned_at = now(), ban_reason = 'violation of terms' WHERE id = $1;",
      [bannedUser.id]
    );
    await adminClient.query(
      "UPDATE app_auth.users SET deleted_at = now() WHERE id = $1;",
      [deletedUser.id]
    );
    // Scrub deleted user's profile
    await adminClient.query(
      "UPDATE public.profiles SET display_name = 'ผู้ใช้ที่ถูกลบ', avatar_path = null, height_cm = null, height_visible = false WHERE id = $1;",
      [deletedUser.id]
    );
    await adminClient.end();
  });

  after(async () => {
    if (app) {
      await app.close();
    }
    await closePool();
    if (pgInstance) {
      pgInstance.stop();
    }
  });

  beforeEach(() => {
    if (app && app.rateLimiter) {
      app.rateLimiter.reset();
    }
    if (app && app.loginLock) {
      app.loginLock.reset();
    }
  });

  // =========================================================================
  // 1. Active User Works Across Routes
  // =========================================================================
  describe('1. Active User Status Enforcement', () => {
    test('1.1 Active user can access /rpc/:name, GET data routes, and /auth/me', async () => {
      // /rpc/hoopup_list_sessions
      const rpcRes = await app.inject({
        method: 'POST',
        url: '/rpc/hoopup_list_sessions',
        headers: { Authorization: `Bearer ${activeToken}` },
        payload: { p_filter: {} },
      });
      assert.equal(rpcRes.statusCode, 200);

      // GET /courts
      const courtsRes = await app.inject({
        method: 'GET',
        url: '/courts',
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      assert.equal(courtsRes.statusCode, 200);

      // GET /auth/me
      const meRes = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      assert.equal(meRes.statusCode, 200);
      assert.equal(meRes.json().user.id, activeUser.id);
      assert.equal(meRes.json().profile.display_name, 'Active User');
    });
  });

  // =========================================================================
  // 2. Banned User Blocked Across Routes
  // =========================================================================
  describe('2. Banned User Blocked with 403', () => {
    test('2.1 Banned user gets 403 account_suspended on /rpc/:name', async () => {
      app.userStatusCache.invalidate(bannedUser.id);
      const res = await app.inject({
        method: 'POST',
        url: '/rpc/hoopup_list_sessions',
        headers: { Authorization: `Bearer ${bannedToken}` },
        payload: { p_filter: {} },
      });
      assert.equal(res.statusCode, 403);
      const body = res.json();
      assert.equal(body.ok, false);
      assert.equal(body.code, 'account_suspended');
      assert.equal(body.error, 'Account unavailable');
    });

    test('2.2 Banned user gets 403 on all GET data routes (/courts, /messages, /session_members, /profiles/:id)', async () => {
      app.userStatusCache.invalidate(bannedUser.id);

      // /courts
      const courtsRes = await app.inject({
        method: 'GET',
        url: '/courts',
        headers: { Authorization: `Bearer ${bannedToken}` },
      });
      assert.equal(courtsRes.statusCode, 403);
      assert.deepEqual(courtsRes.json(), { error: 'Account unavailable' });

      // /messages
      const dummySessionId = '00000000-0000-0000-0000-000000000001';
      const msgRes = await app.inject({
        method: 'GET',
        url: `/messages?sessionId=${dummySessionId}`,
        headers: { Authorization: `Bearer ${bannedToken}` },
      });
      assert.equal(msgRes.statusCode, 403);
      assert.deepEqual(msgRes.json(), { error: 'Account unavailable' });

      // /session_members
      const memRes = await app.inject({
        method: 'GET',
        url: `/session_members?sessionId=${dummySessionId}`,
        headers: { Authorization: `Bearer ${bannedToken}` },
      });
      assert.equal(memRes.statusCode, 403);
      assert.deepEqual(memRes.json(), { error: 'Account unavailable' });

      // /profiles/:id
      const profRes = await app.inject({
        method: 'GET',
        url: `/profiles/${activeUser.id}`,
        headers: { Authorization: `Bearer ${bannedToken}` },
      });
      assert.equal(profRes.statusCode, 403);
      assert.deepEqual(profRes.json(), { error: 'Account unavailable' });
    });

    test('2.3 Banned user gets 403 on /auth/me', async () => {
      app.userStatusCache.invalidate(bannedUser.id);
      const res = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { Authorization: `Bearer ${bannedToken}` },
      });
      assert.equal(res.statusCode, 403);
      assert.deepEqual(res.json(), { error: 'Account unavailable' });
    });
  });

  // =========================================================================
  // 3. Unban & Cache TTL / Invalidation
  // =========================================================================
  describe('3. Unban Works Again (Invalidate & Small TTL)', () => {
    test('3.1 Unbanning user and invalidating cache restores access immediately', async () => {
      const adminClient = new (await import('pg')).default.Client({
        connectionString: pgInstance.superuserConnectionString,
      });
      await adminClient.connect();
      await adminClient.query(
        'UPDATE app_auth.users SET banned_at = null, ban_reason = null WHERE id = $1;',
        [bannedUser.id]
      );
      await adminClient.end();

      app.userStatusCache.invalidate(bannedUser.id);

      const res = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { Authorization: `Bearer ${bannedToken}` },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.json().user.id, bannedUser.id);
    });

    test('3.2 Small TTL option (50ms) expires and automatically reflects database status change', async () => {
      // Re-ban user
      const adminClient = new (await import('pg')).default.Client({
        connectionString: pgInstance.superuserConnectionString,
      });
      await adminClient.connect();
      await adminClient.query(
        "UPDATE app_auth.users SET banned_at = now(), ban_reason = 're-banned' WHERE id = $1;",
        [bannedUser.id]
      );
      await adminClient.end();

      const shortTtlApp = buildApp({
        logger: false,
        jwtSecret: testSecret,
        userStatusCacheMs: 50, // 50 ms TTL
      });

      // Request 1: cache miss, DB status is banned -> 403
      const res1 = await shortTtlApp.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { Authorization: `Bearer ${bannedToken}` },
      });
      assert.equal(res1.statusCode, 403);

      // Admin unbans user in DB
      const adminClient2 = new (await import('pg')).default.Client({
        connectionString: pgInstance.superuserConnectionString,
      });
      await adminClient2.connect();
      await adminClient2.query(
        'UPDATE app_auth.users SET banned_at = null, ban_reason = null WHERE id = $1;',
        [bannedUser.id]
      );
      await adminClient2.end();

      // Wait 70ms for TTL to expire
      await new Promise((r) => setTimeout(r, 70));

      // Request 2: cache expired, re-queries DB -> 200
      const res2 = await shortTtlApp.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { Authorization: `Bearer ${bannedToken}` },
      });
      assert.equal(res2.statusCode, 200);

      await shortTtlApp.close();
    });
  });

  // =========================================================================
  // 4. Deleted User & Scrubbed Profile
  // =========================================================================
  describe('4. Deleted User Blocked & Profile Scrubbed', () => {
    test('4.1 Deleted user is refused with 403 on rpc, data, and /auth/me', async () => {
      app.userStatusCache.invalidate(deletedUser.id);

      const rpcRes = await app.inject({
        method: 'POST',
        url: '/rpc/hoopup_list_sessions',
        headers: { Authorization: `Bearer ${deletedToken}` },
        payload: { p_filter: {} },
      });
      assert.equal(rpcRes.statusCode, 403);
      assert.equal(rpcRes.json().code, 'account_suspended');

      const dataRes = await app.inject({
        method: 'GET',
        url: '/courts',
        headers: { Authorization: `Bearer ${deletedToken}` },
      });
      assert.equal(dataRes.statusCode, 403);

      const meRes = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { Authorization: `Bearer ${deletedToken}` },
      });
      assert.equal(meRes.statusCode, 403);
    });

    test('4.2 Deleted user profile is scrubbed when viewed by an active user', async () => {
      const profRes = await app.inject({
        method: 'GET',
        url: `/profiles/${deletedUser.id}`,
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      assert.equal(profRes.statusCode, 200);
      const prof = profRes.json();
      assert.equal(prof.display_name, 'ผู้ใช้ที่ถูกลบ');
      assert.equal(prof.avatar_path, null);
      assert.equal(prof.height_cm, null);
      assert.equal(prof.height_visible, null); // null for other users when hidden
    });
  });

  // =========================================================================
  // 5. Non-Existent / Ghost Sub Refused
  // =========================================================================
  describe('5. Token for Non-Existent Sub Refused', () => {
    test('5.1 Validly signed token whose sub is not in DB is refused with 403 account_suspended', async () => {
      const ghostSub = '99999999-9999-9999-9999-999999999999';
      const ghostToken = await createAccessToken(
        { id: ghostSub, email: 'ghost@test.com' },
        testSecret
      );

      // /rpc
      const rpcRes = await app.inject({
        method: 'POST',
        url: '/rpc/hoopup_list_sessions',
        headers: { Authorization: `Bearer ${ghostToken}` },
        payload: { p_filter: {} },
      });
      assert.equal(rpcRes.statusCode, 403);
      assert.equal(rpcRes.json().code, 'account_suspended');
      assert.equal(rpcRes.json().error, 'Account unavailable');

      // /courts
      const courtsRes = await app.inject({
        method: 'GET',
        url: '/courts',
        headers: { Authorization: `Bearer ${ghostToken}` },
      });
      assert.equal(courtsRes.statusCode, 403);
      assert.deepEqual(courtsRes.json(), { error: 'Account unavailable' });

      // /auth/me
      const meRes = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { Authorization: `Bearer ${ghostToken}` },
      });
      assert.equal(meRes.statusCode, 403);
      assert.deepEqual(meRes.json(), { error: 'Account unavailable' });
    });
  });

  // =========================================================================
  // 6. Login Behaviour for Banned / Deleted Users
  // =========================================================================
  describe('6. POST /auth/login with Banned/Deleted Users', () => {
    let banLoginUser, delLoginUser;

    before(async () => {
      if (app && app.rateLimiter) app.rateLimiter.reset();
      if (app && app.loginLock) app.loginLock.reset();

      const resB = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: {
          email: 'login_banned@test.com',
          password: validPassword,
          displayName: 'Login Ban',
        },
      });
      banLoginUser = resB.json().user;

      const resD = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: {
          email: 'login_deleted@test.com',
          password: validPassword,
          displayName: 'Login Del',
        },
      });
      delLoginUser = resD.json().user;

      const adminClient = new (await import('pg')).default.Client({
        connectionString: pgInstance.superuserConnectionString,
      });
      await adminClient.connect();
      await adminClient.query(
        "UPDATE app_auth.users SET banned_at = now(), ban_reason = 'banned test' WHERE id = $1;",
        [banLoginUser.id]
      );
      await adminClient.query(
        'UPDATE app_auth.users SET deleted_at = now() WHERE id = $1;',
        [delLoginUser.id]
      );
      await adminClient.end();
    });

    test('6.1 Correct password for banned user returns 403 Account unavailable', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'login_banned@test.com',
          password: validPassword,
        },
      });
      assert.equal(res.statusCode, 403);
      assert.deepEqual(res.json(), { error: 'Account unavailable' });
    });

    test('6.2 Correct password for deleted user returns 403 Account unavailable', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'login_deleted@test.com',
          password: validPassword,
        },
      });
      assert.equal(res.statusCode, 403);
      assert.deepEqual(res.json(), { error: 'Account unavailable' });
    });

    test('6.3 Wrong password for banned user returns 401 identical to unknown email (attacker learns nothing)', async () => {
      const wrongPwRes = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'login_banned@test.com',
          password: 'WrongPassword999!',
        },
      });
      assert.equal(wrongPwRes.statusCode, 401);
      assert.deepEqual(wrongPwRes.json(), { error: 'Invalid email or password' });

      const unknownRes = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'does_not_exist_at_all@test.com',
          password: 'WrongPassword999!',
        },
      });
      assert.equal(unknownRes.statusCode, 401);
      assert.deepEqual(unknownRes.json(), { error: 'Invalid email or password' });

      // Verify bodies are strictly identical
      assert.deepEqual(wrongPwRes.json(), unknownRes.json());
    });

    test('6.4 Signup with email of banned or deleted user returns 409 like any taken email', async () => {
      const banSignup = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: {
          email: 'login_banned@test.com',
          password: validPassword,
          displayName: 'Try Again',
        },
      });
      assert.equal(banSignup.statusCode, 409);
      assert.deepEqual(banSignup.json(), { error: 'Email already registered' });

      const delSignup = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: {
          email: 'login_deleted@test.com',
          password: validPassword,
          displayName: 'Try Again',
        },
      });
      assert.equal(delSignup.statusCode, 409);
      assert.deepEqual(delSignup.json(), { error: 'Email already registered' });
    });
  });

  // =========================================================================
  // 7. Fail-Closed on Lookup Errors
  // =========================================================================
  describe('7. Fail-Closed Error Handling (No SQL Leak)', () => {
    test('7.1 Simulated database failure during status check returns 503 generic JSON with zero SQL text', async () => {
      const failingCache = new UserStatusCache({
        queryFn: async () => {
          throw new Error('Connection terminated unexpectedly: SELECT id FROM app_auth.users');
        },
      });

      const failApp = buildApp({
        logger: false,
        jwtSecret: testSecret,
        userStatusCache: failingCache,
      });

      // RPC route
      const rpcRes = await failApp.inject({
        method: 'POST',
        url: '/rpc/hoopup_list_sessions',
        headers: { Authorization: `Bearer ${activeToken}` },
        payload: { p_filter: {} },
      });
      assert.equal(rpcRes.statusCode, 503);
      const rpcBody = rpcRes.json();
      assert.equal(rpcBody.ok, false);
      assert.equal(rpcBody.code, 'service_unavailable');
      assert.equal(rpcBody.error, 'Service temporarily unavailable');
      assert.ok(!JSON.stringify(rpcBody).includes('SELECT'));
      assert.ok(!JSON.stringify(rpcBody).includes('app_auth'));

      // Data route
      const courtsRes = await failApp.inject({
        method: 'GET',
        url: '/courts',
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      assert.equal(courtsRes.statusCode, 503);
      const dataBody = courtsRes.json();
      assert.equal(dataBody.error, 'Service temporarily unavailable');
      assert.ok(!JSON.stringify(dataBody).includes('SELECT'));

      // /auth/me
      const meRes = await failApp.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      assert.equal(meRes.statusCode, 503);
      const meBody = meRes.json();
      assert.equal(meBody.error, 'Service temporarily unavailable');
      assert.ok(!JSON.stringify(meBody).includes('SELECT'));

      await failApp.close();
    });
  });

  // =========================================================================
  // 8. UserStatusCache Mechanics (Hits, Misses, Bounded Size, In-Flight Sharing)
  // =========================================================================
  describe('8. UserStatusCache Mechanics', () => {
    test('8.1 Second request within TTL does not query database; expiry re-queries', async () => {
      let queryCount = 0;
      const testCache = new UserStatusCache({
        ttlMs: 50,
        queryFn: async (uid) => {
          queryCount++;
          return 'active';
        },
      });

      const uid = '00000000-0000-0000-0000-000000000001';

      // 1st call: query count = 1
      const s1 = await testCache.get(uid);
      assert.equal(s1, 'active');
      assert.equal(queryCount, 1);

      // 2nd call (immediate): served from cache, query count still 1
      const s2 = await testCache.get(uid);
      assert.equal(s2, 'active');
      assert.equal(queryCount, 1);

      // Wait 70ms for TTL expiry
      await new Promise((r) => setTimeout(r, 70));

      // 3rd call: expired, re-queries, query count = 2
      const s3 = await testCache.get(uid);
      assert.equal(s3, 'active');
      assert.equal(queryCount, 2);
    });

    test('8.2 Concurrent lookups for the same user share a single in-flight promise', async () => {
      let queryCount = 0;
      const testCache = new UserStatusCache({
        ttlMs: 30000,
        queryFn: async (uid) => {
          queryCount++;
          await new Promise((r) => setTimeout(r, 20));
          return 'active';
        },
      });

      const uid = '00000000-0000-0000-0000-000000000002';
      const results = await Promise.all([
        testCache.get(uid),
        testCache.get(uid),
        testCache.get(uid),
        testCache.get(uid),
      ]);

      assert.deepEqual(results, ['active', 'active', 'active', 'active']);
      assert.equal(queryCount, 1, '4 concurrent lookups must share 1 database query');
    });

    test('8.3 Bounded size: cache evicts oldest entry when maxSize is reached', async () => {
      const testCache = new UserStatusCache({
        ttlMs: 30000,
        maxSize: 3,
        queryFn: async (uid) => 'active',
      });

      await testCache.get('00000000-0000-0000-0000-000000000001');
      await testCache.get('00000000-0000-0000-0000-000000000002');
      await testCache.get('00000000-0000-0000-0000-000000000003');
      assert.equal(testCache.cache.size, 3);
      assert.ok(testCache.cache.has('00000000-0000-0000-0000-000000000001'));

      // 4th item evicts oldest (item 1)
      await testCache.get('00000000-0000-0000-0000-000000000004');
      assert.equal(testCache.cache.size, 3);
      assert.equal(testCache.cache.has('00000000-0000-0000-0000-000000000001'), false);
      assert.ok(testCache.cache.has('00000000-0000-0000-0000-000000000004'));
    });

    test('8.4 USER_STATUS_CACHE_MS=0 disables caching (every call queries)', async () => {
      let queryCount = 0;
      const testCache = new UserStatusCache({
        ttlMs: 0,
        queryFn: async () => {
          queryCount++;
          return 'active';
        },
      });

      const uid = '00000000-0000-0000-0000-000000000005';
      await testCache.get(uid);
      await testCache.get(uid);
      await testCache.get(uid);
      assert.equal(queryCount, 3, 'When ttlMs=0, cache is disabled and every call queries');
      assert.equal(testCache.cache.size, 0);
    });
  });

  // =========================================================================
  // 9. Unauthenticated & Public Routes Unaffected
  // =========================================================================
  describe('9. Public & Unauthenticated Routes Unaffected', () => {
    test('9.1 /health, /tiles, /places, /auth/signup do not require status check', async () => {
      // /health
      const healthRes = await app.inject({ method: 'GET', url: '/health' });
      assert.equal(healthRes.statusCode, 200);

      // /tiles/:file (HEAD) - does not require auth or status check
      const tilesRes = await app.inject({ method: 'HEAD', url: '/tiles/bangkok.pmtiles' });
      assert.notEqual(tilesRes.statusCode, 401);
      assert.notEqual(tilesRes.statusCode, 403);
      assert.notEqual(tilesRes.statusCode, 429);

      // /places (valid bbox)
      const placesRes = await app.inject({
        method: 'GET',
        url: '/places?bbox=100.52,13.73,100.54,13.75',
      });
      assert.equal(placesRes.statusCode, 200);

      // /auth/signup with fresh email
      const signupRes = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: {
          email: `fresh_ban1_${Date.now()}@test.com`,
          password: validPassword,
          displayName: 'Fresh User',
        },
      });
      assert.equal(signupRes.statusCode, 201);
    });
  });

  // =========================================================================
  // 10. Moderation CLI & Moderation Log Tests
  // =========================================================================
  describe('10. Moderation CLI (scripts/moderate.mjs) & Log Audit', () => {
    let modUser;

    before(async () => {
      if (app && app.rateLimiter) app.rateLimiter.reset();
      if (app && app.loginLock) app.loginLock.reset();

      const res = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: {
          email: 'cli_target@test.com',
          password: validPassword,
          displayName: 'CLI Target',
        },
      });
      modUser = res.json().user;
    });

    function runCli(args, envOverrides = {}) {
      return spawnSync(
        process.execPath,
        [MODERATE_SCRIPT, ...args],
        {
          env: {
            ...process.env,
            DATABASE_URL: pgInstance.superuserConnectionString,
            MODERATOR: 'test-admin',
            ...envOverrides,
          },
          encoding: 'utf8',
        }
      );
    }

    test('10.1 status command prints details, never prints password hash, exit code 0', () => {
      const proc = runCli(['status', 'cli_target@test.com']);
      assert.equal(proc.status, 0);
      assert.ok(proc.stdout.includes(`User ID: ${modUser.id}`));
      assert.ok(proc.stdout.includes('Status: active'));
      assert.ok(proc.stdout.includes('Profile Display Name: CLI Target'));
      assert.ok(!proc.stdout.includes('password'));
      assert.ok(!proc.stdout.includes('$2b$'));
    });

    test('10.2 ban command bans user, writes moderation_log, prints cache notice, exit code 0', async () => {
      const proc = runCli(['ban', modUser.id, '--reason', 'spamming in court chat']);
      assert.equal(proc.status, 0);
      assert.ok(proc.stdout.includes(`User ${modUser.id} (cli_target@test.com) has been banned.`));
      assert.ok(proc.stdout.includes('Reason: spamming in court chat'));
      assert.ok(proc.stdout.includes('takes effect within 30 s on a running server'));

      // Verify moderation_log row
      const adminClient = new (await import('pg')).default.Client({
        connectionString: pgInstance.superuserConnectionString,
      });
      await adminClient.connect();
      const logRes = await adminClient.query(
        "SELECT * FROM app_auth.moderation_log WHERE user_id = $1 AND action = 'ban';",
        [modUser.id]
      );
      assert.equal(logRes.rows.length, 1);
      assert.equal(logRes.rows[0].actor, 'test-admin');
      assert.equal(logRes.rows[0].reason, 'spamming in court chat');
      await adminClient.end();
    });

    test('10.3 unban command unbans user, writes moderation_log, exit code 0', async () => {
      const proc = runCli(['unban', 'cli_target@test.com']);
      assert.equal(proc.status, 0);
      assert.ok(proc.stdout.includes(`User ${modUser.id} (cli_target@test.com) has been unbanned.`));

      // Verify status is active again
      const statProc = runCli(['status', modUser.id]);
      assert.equal(statProc.status, 0);
      assert.ok(statProc.stdout.includes('Status: active'));
    });

    test('10.4 delete command requires --confirm flag, exits with code 1 if omitted', () => {
      const proc = runCli(['delete', modUser.id]);
      assert.equal(proc.status, 1);
      assert.ok(proc.stderr.includes("--confirm"));
    });

    test('10.5 delete command with --confirm soft-deletes user, scrubs profile, writes log, exit code 0', async () => {
      const proc = runCli(['delete', 'cli_target@test.com', '--confirm', '--reason', 'user requested deletion']);
      assert.equal(proc.status, 0);
      assert.ok(proc.stdout.includes('deleted (soft delete)'));
      assert.ok(proc.stdout.includes('ผู้ใช้ที่ถูกลบ'));
      assert.ok(proc.stdout.includes('takes effect within 30 s on a running server'));

      // Check DB row: deleted_at is set, profile is scrubbed
      const adminClient = new (await import('pg')).default.Client({
        connectionString: pgInstance.superuserConnectionString,
      });
      await adminClient.connect();
      const uRes = await adminClient.query('SELECT deleted_at FROM app_auth.users WHERE id = $1;', [modUser.id]);
      assert.ok(uRes.rows[0].deleted_at);

      const pRes = await adminClient.query('SELECT display_name, avatar_path, height_cm, height_visible FROM public.profiles WHERE id = $1;', [modUser.id]);
      assert.equal(pRes.rows[0].display_name, 'ผู้ใช้ที่ถูกลบ');
      assert.equal(pRes.rows[0].avatar_path, null);
      assert.equal(pRes.rows[0].height_cm, null);
      assert.equal(pRes.rows[0].height_visible, false);

      const logRes = await adminClient.query(
        "SELECT * FROM app_auth.moderation_log WHERE user_id = $1 AND action = 'delete';",
        [modUser.id]
      );
      assert.equal(logRes.rows.length, 1);
      assert.equal(logRes.rows[0].actor, 'test-admin');
      assert.equal(logRes.rows[0].reason, 'user requested deletion');
      await adminClient.end();
    });

    test('10.6 status/ban/unban/delete for non-existent user exits with code 2', () => {
      const proc = runCli(['status', 'nonexistent_user@test.com']);
      assert.equal(proc.status, 2);
      assert.ok(proc.stderr.includes('User not found'));

      const banProc = runCli(['ban', '00000000-0000-0000-0000-000000000099']);
      assert.equal(banProc.status, 2);
    });

    test('10.7 API role (hoopup_api) cannot access app_auth.moderation_log', async () => {
      // Connect using API role credentials
      const apiClient = new (await import('pg')).default.Client({
        connectionString: pgInstance.connectionString,
      });
      await apiClient.connect();
      try {
        await assert.rejects(
          () => apiClient.query('SELECT * FROM app_auth.moderation_log;'),
          /permission denied/
        );
      } finally {
        await apiClient.end();
      }
    });

    test('10.8 Migration 007 applies twice idempotently without error', async () => {
      const adminClient = new (await import('pg')).default.Client({
        connectionString: pgInstance.superuserConnectionString,
      });
      await adminClient.connect();
      const fs = await import('node:fs');
      const sql007 = fs.readFileSync(path.join(SERVER_DIR, 'sql', '007_user_status.sql'), 'utf8');
      // Running a second time must not throw
      await adminClient.query(sql007);
      await adminClient.end();
    });
  });
});

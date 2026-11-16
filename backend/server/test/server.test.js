import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Writable } from 'node:stream';
import * as jose from 'jose';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startTempPostgres } from './helpers/temp-postgres.js';
import { buildApp } from '../src/app.js';
import { initPool, closePool, withClient } from '../src/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_DIR = path.resolve(__dirname, '..');

describe('HoopUp Backend Server Test Suite', () => {
  let tempPg;
  let app;
  let baseUrl;
  let jwtSecret;
  const capturedLogs = [];

  const logStream = new Writable({
    write(chunk, encoding, callback) {
      capturedLogs.push(chunk.toString());
      callback();
    },
  });

  const knownPasswords = new Set();
  const knownTokens = new Set();

  before(async () => {
    jwtSecret = 'test_jwt_super_secret_passphrase_32chars_long!';
    process.env.JWT_SECRET = jwtSecret;

    // Start isolated temp PostgreSQL cluster with portable binaries and apply migrations 001-004
    tempPg = await startTempPostgres();
    process.env.DATABASE_URL = tempPg.connectionString;

    initPool({ databaseUrl: tempPg.connectionString });

    // Build Fastify application with log capturing
    app = buildApp({
      jwtSecret,
      allowedOrigins: 'http://localhost:5173,http://localhost:5199',
      authRateLimitMax: 10,
      authRateLimitWindowMs: 60000,
      logger: {
        level: 'info',
        stream: logStream,
        redact: {
          paths: [
            'req.headers.authorization',
            'headers.authorization',
            'req.body.password',
            'body.password',
            'password',
            'accessToken',
          ],
          censor: '[REDACTED]',
        },
      },
    });

    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    if (app && app.rateLimiter) {
      app.rateLimiter.reset();
    }
  });

  after(async () => {
    if (app) {
      await app.close();
    }
    await closePool();
    if (tempPg) {
      tempPg.stop();
    }
  });

  // Helper HTTP request wrapper
  async function request(path, options = {}) {
    const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
    const headers = { ...(options.headers || {}) };

    if (options.body && typeof options.body === 'object' && !(options.body instanceof String)) {
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
      options.body = JSON.stringify(options.body);
    }

    const res = await fetch(url, { ...options, headers });
    let data = null;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = text;
    }

    return { status: res.status, headers: res.headers, body: data, rawText: text };
  }

  // 1. Health check
  test('GET /health returns 200 without exposing database internals', async () => {
    const res = await request('/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.ok(res.body.timestamp);
    assert.equal(res.body.databaseUrl, undefined);
    assert.equal(res.body.postgres, undefined);
  });

  // 2. Signup, Login, Me flow + no password_hash returned
  test('1. User flow: signup -> login -> /auth/me returns valid profile and no password hash', async () => {
    const email = `player1_${Date.now()}@test.com`;
    const password = 'StrongPassword2026!';
    knownPasswords.add(password);

    // Signup
    const signupRes = await request('/auth/signup', {
      method: 'POST',
      body: { email, password, displayName: 'Alice Champion' },
    });
    assert.equal(signupRes.status, 201);
    assert.ok(signupRes.body.accessToken);
    assert.equal(signupRes.body.user.email, email.toLowerCase());
    assert.equal(signupRes.body.password_hash, undefined);
    assert.equal(signupRes.body.user.password_hash, undefined);

    knownTokens.add(signupRes.body.accessToken);

    // Login
    const loginRes = await request('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    assert.equal(loginRes.status, 200);
    assert.ok(loginRes.body.accessToken);
    assert.equal(loginRes.body.user.email, email.toLowerCase());
    assert.equal(loginRes.body.password_hash, undefined);
    assert.equal(loginRes.body.user.password_hash, undefined);

    const token = loginRes.body.accessToken;
    knownTokens.add(token);

    // Me
    const meRes = await request('/auth/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.user.email, email.toLowerCase());
    assert.equal(meRes.body.profile.display_name, 'Alice Champion');
    assert.equal(meRes.body.password_hash, undefined);
    assert.equal(meRes.body.user.password_hash, undefined);
  });

  // 3. Wrong password and unknown email give the exact same 401
  test('2. Wrong password and unknown email return the exact same 401 message', async () => {
    const existingEmail = `exist_${Date.now()}@test.com`;
    const password = 'PasswordValid1234!';
    knownPasswords.add(password);

    await request('/auth/signup', {
      method: 'POST',
      body: { email: existingEmail, password },
    });

    const wrongPasswordRes = await request('/auth/login', {
      method: 'POST',
      body: { email: existingEmail, password: 'WrongPassword999!' },
    });

    const unknownEmailRes = await request('/auth/login', {
      method: 'POST',
      body: { email: 'unknown_ghost_user@test.com', password },
    });

    assert.equal(wrongPasswordRes.status, 401);
    assert.equal(unknownEmailRes.status, 401);
    assert.deepEqual(wrongPasswordRes.body, unknownEmailRes.body);
    assert.equal(wrongPasswordRes.body.error, 'Invalid email or password');
  });

  // 4. Duplicate signup returns 409
  test('3. Duplicate signup returns 409 with generic error', async () => {
    const email = `duplicate_${Date.now()}@test.com`;
    const password = 'PasswordValid1234!';
    knownPasswords.add(password);

    const first = await request('/auth/signup', {
      method: 'POST',
      body: { email, password },
    });
    assert.equal(first.status, 201);

    const second = await request('/auth/signup', {
      method: 'POST',
      body: { email, password },
    });
    assert.equal(second.status, 409);
    assert.equal(second.body.error, 'Email already registered');
  });

  // 5. Weak password returns 400
  test('4. Weak password (< 10 chars) returns 400', async () => {
    const res = await request('/auth/signup', {
      method: 'POST',
      body: { email: `weak_${Date.now()}@test.com`, password: 'short' },
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('10 characters'));
  });

  // 6. RPC without token returns 401
  test('5. RPC call without token returns 401', async () => {
    const res = await request('/rpc/hoopup_get_session', {
      method: 'POST',
      body: { p_session_id: crypto.randomUUID() },
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.code, 'unauthorized');
  });

  // 7. Tampered, expired, and alg:none JWT return 401
  test('6. Tampered, expired, and alg:none JWT tokens return 401', async () => {
    const secretKey = new TextEncoder().encode(jwtSecret);

    // Tampered token
    const validToken = await new jose.SignJWT({ sub: crypto.randomUUID(), role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(secretKey);
    const tamperedToken = validToken.slice(0, -6) + 'xxxxxx';

    const tamperedRes = await request('/rpc/hoopup_get_session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tamperedToken}` },
      body: { p_session_id: crypto.randomUUID() },
    });
    assert.equal(tamperedRes.status, 401);

    // Expired token
    const expiredToken = await new jose.SignJWT({ sub: crypto.randomUUID(), role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(secretKey);

    const expiredRes = await request('/rpc/hoopup_get_session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${expiredToken}` },
      body: { p_session_id: crypto.randomUUID() },
    });
    assert.equal(expiredRes.status, 401);

    // alg: none token
    const headerNone = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payloadNone = Buffer.from(JSON.stringify({ sub: crypto.randomUUID() })).toString('base64url');
    const algNoneToken = `${headerNone}.${payloadNone}.`;

    const noneRes = await request('/rpc/hoopup_get_session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${algNoneToken}` },
      body: { p_session_id: crypto.randomUUID() },
    });
    assert.equal(noneRes.status, 401);
  });

  // 8. Non-whitelisted function name returns 404 + SQL injection immunity
  test('7. Non-whitelisted function names return 404; SQL injection strings in args are strictly parameterized', async () => {
    const email = `audit_${Date.now()}@test.com`;
    const password = 'PasswordSecure2026!';
    knownPasswords.add(password);

    const user = (await request('/auth/signup', { method: 'POST', body: { email, password } })).body;
    const token = user.accessToken;

    // hoopup_private.list_sessions -> 404
    const privRes = await request('/rpc/hoopup_private.list_sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {},
    });
    assert.equal(privRes.status, 404);

    // pg_sleep -> 404
    const sleepRes = await request('/rpc/pg_sleep', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: { seconds: 1 },
    });
    assert.equal(sleepRes.status, 404);

    // Path traversal -> 404
    const travRes = await request('/rpc/..%2F..', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {},
    });
    assert.equal(travRes.status, 404);

    // SQL injection string in argument
    const injectionRes = await request('/rpc/hoopup_get_session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: { p_session_id: "00000000-0000-0000-0000-000000000000'; DROP TABLE sessions CASCADE; --" },
    });
    // Parameterized typing causes a Postgres syntax/cast error (22P02 invalid input syntax for type uuid)
    assert.equal(injectionRes.status, 400);

    // Verify sessions table still exists and unharmed
    const count = tempPg.runSql('SELECT count(*) FROM public.sessions;');
    assert.ok(!isNaN(parseInt(count, 10)));
  });

  // DB1. OSM real courts seeding verification
  test('DB1. Real OSM courts seeding (counts, exclusions, idempotency, apostrophes, coordinates, and auth)', async () => {
    // (f) GET /courts without a token still behaves exactly as before (do not change auth rules)
    const unauthRes = await request('/courts', { method: 'GET' });
    assert.equal(unauthRes.status, 401);
    assert.equal(unauthRes.body.error, 'Missing or invalid authorization header');

    // Mint a valid JWT token
    const osmUserId = crypto.randomUUID();
    const osmEmail = `osm_tester_${Date.now()}@hoopup.com`;
    await withClient(async (client) => {
      await client.query(
        `INSERT INTO app_auth.users (id, email, password_hash)
         VALUES ($1, $2, 'dummy_hash')
         ON CONFLICT (id) DO NOTHING;`,
        [osmUserId, osmEmail]
      );
    });

    const token = await new jose.SignJWT({
      sub: osmUserId,
      email: osmEmail,
      role: 'authenticated',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(jwtSecret));

    // (a) GET /courts with a valid token returns the seeded count (148)
    const courtsRes = await request('/courts', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(courtsRes.status, 200);
    assert.ok(Array.isArray(courtsRes.body));
    assert.equal(courtsRes.body.length, 148, 'Expected 148 seeded courts (146 unverified + 2 positive)');

    // (b) no row is named like an excluded entry
    const excludedNames = ['Tippawas School Football Court'];
    for (const row of courtsRes.body) {
      assert.ok(!excludedNames.includes(row.name), `Excluded court name found: ${row.name}`);
      assert.ok(!row.name.toLowerCase().includes('football'), `Excluded sport in name: ${row.name}`);
      assert.notEqual(row.address, 'แหล่งข้อมูล: https://www.openstreetmap.org/way/625500759');
    }

    // (c) applying the seed a second time does not change the count
    const seedFilePath = path.join(SERVER_DIR, 'sql', '005_seed_osm_courts.sql');
    tempPg.runSqlFile(seedFilePath);
    const countSql = tempPg.runSql('SELECT count(*) FROM public.courts;');
    assert.equal(parseInt(countSql, 10), 148, 'Re-applying 005 seed must not change court count');

    const courtsResSecond = await request('/courts', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(courtsResSecond.status, 200);
    assert.equal(courtsResSecond.body.length, 148);

    // (d) King's Court (apostrophe) is present with correct latitude/longitude
    const kingsCourt = courtsRes.body.find((c) => c.name === "King's Court");
    assert.ok(kingsCourt, "King's Court must be present in seeded courts");
    assert.equal(kingsCourt.latitude, 13.6135125);
    assert.equal(kingsCourt.longitude, 100.8323296);
    assert.equal(kingsCourt.verified_at, null);
    assert.equal(kingsCourt.address, 'แหล่งข้อมูล: https://www.openstreetmap.org/relation/3817117');

    // (e) every row has latitude between 13.4 and 14.1 and longitude between 100.2 and 100.9 (Bangkok area)
    for (const row of courtsRes.body) {
      assert.ok(
        typeof row.latitude === 'number' && row.latitude >= 13.4 && row.latitude <= 14.1,
        `Latitude ${row.latitude} for court "${row.name}" (${row.id}) must be between 13.4 and 14.1`
      );
      assert.ok(
        typeof row.longitude === 'number' && row.longitude >= 100.2 && row.longitude <= 100.9,
        `Longitude ${row.longitude} for court "${row.name}" (${row.id}) must be between 100.2 and 100.9`
      );
    }
  });

  // 9. Full lifecycle: create session -> join -> chat as two different users; outsider cannot read chat
  test('8 & 9. Create session, join, and chat between 2 users; outsider cannot read chat (RLS)', async () => {
    const courtId = crypto.randomUUID();
    tempPg.runSql(`INSERT INTO public.courts (id, name) VALUES ('${courtId}', 'Rama IX Basketball Court');`);

    // User 1 (Host)
    const hostUser = (await request('/auth/signup', {
      method: 'POST',
      body: { email: `host_${Date.now()}@test.com`, password: 'PasswordValid1234!', displayName: 'Host Player' },
    })).body;
    const hostToken = hostUser.accessToken;

    // User 2 (Member)
    const memberUser = (await request('/auth/signup', {
      method: 'POST',
      body: { email: `member_${Date.now()}@test.com`, password: 'PasswordValid1234!', displayName: 'Member Player' },
    })).body;
    const memberToken = memberUser.accessToken;

    // User 3 (Outsider)
    const outsiderUser = (await request('/auth/signup', {
      method: 'POST',
      body: { email: `outsider_${Date.now()}@test.com`, password: 'PasswordValid1234!', displayName: 'Outsider Player' },
    })).body;
    const outsiderToken = outsiderUser.accessToken;

    // Host creates session
    const createRes = await request('/rpc/hoopup_create_session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${hostToken}` },
      body: {
        p_request_id: crypto.randomUUID(),
        p_input: {
          title: '3x3 Pickup Game',
          courtId,
          startsAt: null,
          teamSize: 3,
          guestCount: 0,
          skillLevel: 'regular',
          joinPolicy: 'instant',
        },
      },
    });
    assert.equal(createRes.status, 200);
    assert.equal(createRes.body.ok, true);
    assert.equal(createRes.body.code, 'created');
    const sessionId = createRes.body.session.id;

    // Member joins session
    const joinRes = await request('/rpc/hoopup_join_session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${memberToken}` },
      body: { p_session_id: sessionId, p_position: 'PG' },
    });
    assert.equal(joinRes.status, 200);
    assert.equal(joinRes.body.ok, true);
    assert.equal(joinRes.body.code, 'joined');

    // Host sends chat message
    const msgId1 = crypto.randomUUID();
    const hostMsgRes = await request('/rpc/hoopup_send_message', {
      method: 'POST',
      headers: { Authorization: `Bearer ${hostToken}` },
      body: {
        p_session_id: sessionId,
        p_client_message_id: msgId1,
        p_body: 'See you guys at 5 PM!',
      },
    });
    assert.equal(hostMsgRes.status, 200);
    assert.equal(hostMsgRes.body.ok, true);
    assert.equal(hostMsgRes.body.code, 'sent');

    // Member sends chat message
    const msgId2 = crypto.randomUUID();
    const memberMsgRes = await request('/rpc/hoopup_send_message', {
      method: 'POST',
      headers: { Authorization: `Bearer ${memberToken}` },
      body: {
        p_session_id: sessionId,
        p_client_message_id: msgId2,
        p_body: 'On my way now!',
      },
    });
    assert.equal(memberMsgRes.status, 200);
    assert.equal(memberMsgRes.body.ok, true);
    assert.equal(memberMsgRes.body.code, 'sent');

    // Member reads chat messages via GET /messages
    const memberChatRes = await request(`/messages?sessionId=${sessionId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    assert.equal(memberChatRes.status, 200);
    assert.equal(memberChatRes.body.length, 2);
    assert.equal(memberChatRes.body[0].body, 'See you guys at 5 PM!');
    assert.equal(memberChatRes.body[1].body, 'On my way now!');

    // Outsider attempts to read chat messages via GET /messages
    const outsiderChatRes = await request(`/messages?sessionId=${sessionId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${outsiderToken}` },
    });
    assert.equal(outsiderChatRes.status, 200);
    // RLS policy on public.messages ensures 0 messages are returned to non-members
    assert.equal(outsiderChatRes.body.length, 0);

    // Outsider checks session summary actions: canReadChat is false
    const outsiderSummaryRes = await request('/rpc/hoopup_get_session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${outsiderToken}` },
      body: { p_session_id: sessionId },
    });
    assert.equal(outsiderSummaryRes.status, 200);
    assert.equal(outsiderSummaryRes.body.actions.canReadChat, false);
    assert.equal(outsiderSummaryRes.body.actions.canSendMessage, false);

    // Outsider tries to send message: rejected with forbidden
    const outsiderSendRes = await request('/rpc/hoopup_send_message', {
      method: 'POST',
      headers: { Authorization: `Bearer ${outsiderToken}` },
      body: {
        p_session_id: sessionId,
        p_client_message_id: crypto.randomUUID(),
        p_body: 'Unauthorized intrusion attempt',
      },
    });
    assert.equal(outsiderSendRes.status, 200);
    assert.equal(outsiderSendRes.body.ok, false);
    assert.equal(outsiderSendRes.body.code, 'forbidden');
  });

  // 10. 8 parallel joins for the last seat over HTTP -> exactly 1 success and 7 session_full
  test('10. 8 parallel joins for the last seat over HTTP yield exactly 1 joined and 7 session_full', async () => {
    const courtId = crypto.randomUUID();
    tempPg.runSql(`INSERT INTO public.courts (id, name) VALUES ('${courtId}', 'Parallel Race Court');`);

    // Host creates a session with teamSize: 3, guestCount: 1.
    // Host counts as 1 confirmed seat + 1 guest seat = 2 occupied seats.
    // Remaining seats = 3 - 2 = EXACTLY 1 seat!
    const hostUser = (await request('/auth/signup', {
      method: 'POST',
      body: { email: `race_host_${Date.now()}@test.com`, password: 'PasswordValid1234!', displayName: 'Race Host' },
    })).body;

    const createRes = await request('/rpc/hoopup_create_session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${hostUser.accessToken}` },
      body: {
        p_request_id: crypto.randomUUID(),
        p_input: {
          title: 'High Concurrency Seat Race',
          courtId,
          startsAt: null,
          teamSize: 3,
          guestCount: 1,
          skillLevel: 'casual',
          joinPolicy: 'instant',
        },
      },
    });
    const sessionId = createRes.body.session.id;

    // Create 8 racers
    const racers = [];
    for (let i = 0; i < 8; i++) {
      const u = (await request('/auth/signup', {
        method: 'POST',
        body: {
          email: `racer_${i}_${Date.now()}@test.com`,
          password: 'PasswordValid1234!',
          displayName: `Racer ${i}`,
        },
      })).body;
      racers.push(u);
    }

    // Fire 8 joins simultaneously over real HTTP
    const joinPromises = racers.map((racer) =>
      request('/rpc/hoopup_join_session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${racer.accessToken}` },
        body: { p_session_id: sessionId },
      })
    );

    const results = await Promise.all(joinPromises);

    const joinedCount = results.filter((r) => r.body && r.body.ok === true && r.body.code === 'joined').length;
    const fullCount = results.filter((r) => r.body && r.body.ok === false && r.body.code === 'session_full').length;

    assert.equal(results.length, 8);
    assert.equal(joinedCount, 1, `Expected exactly 1 success, got ${joinedCount}`);
    assert.equal(fullCount, 7, `Expected exactly 7 session_full, got ${fullCount}`);

    // Verify session summary shows 3 occupied and full
    const finalSummary = await request('/rpc/hoopup_get_session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${hostUser.accessToken}` },
      body: { p_session_id: sessionId },
    });
    assert.equal(finalSummary.body.occupiedCount, 3);
    assert.equal(finalSummary.body.displayStatus, 'full');
    assert.equal(finalSummary.body.seatsRemaining, 0);
  });

  // 11. Rate limit trips
  test('11. In-memory rate limiter trips after exceeding max attempts', async () => {
    // Reset rate limiter hits map for clean test
    app.rateLimiter.reset();

    const responses = [];
    for (let i = 0; i < 11; i++) {
      const res = await request('/auth/login', {
        method: 'POST',
        body: { email: `rate_test_${i}@test.com`, password: 'WrongPassword999!' },
      });
      responses.push(res);
    }

    // First 10 should be 401 (invalid credentials)
    for (let i = 0; i < 10; i++) {
      assert.equal(responses[i].status, 401);
    }

    // 11th should be 429 Too Many Requests
    assert.equal(responses[10].status, 429);
    assert.equal(responses[10].body.error, 'Too many attempts, please try again later');
  });

  // C1-01 (CODEX1 review): the limiter must see percent-encoded spellings of the credential routes
  test('C1-01. Percent-encoded spellings of /auth/login share the same rate-limit bucket', async () => {
    app.rateLimiter.reset();
    const spellings = [
      '/auth/login', '/auth/login', '/auth/login', '/auth/login', '/auth/login',
      '/auth/login', '/auth/login', '/auth/login', '/auth/login', '/auth/login',
    ];
    let idx = 0;
    for (const url of spellings) {
      const res = await request(url, {
        method: 'POST',
        body: { email: `c101_${idx++}@test.com`, password: 'WrongPassword999!' },
      });
      assert.equal(res.status, 401);
    }
    for (const url of ['/auth/%6cogin', '/%61uth/login', '/auth/log%69n', '/auth/login']) {
      const res = await request(url, {
        method: 'POST',
        body: { email: `c101_${idx++}@test.com`, password: 'WrongPassword999!' },
      });
      assert.equal(res.status, 429, `${url} bypassed the rate limiter`);
    }
    app.rateLimiter.reset();
  });

  // C1-03 (CODEX1 review / SEC2): a missing/short signing secret must stop startup, not the first signup (>= 32 chars)
  test('C1-03. buildApp refuses to start without a JWT secret of at least 32 characters', async () => {
    const saved = process.env.JWT_SECRET;
    try {
      delete process.env.JWT_SECRET;
      assert.throws(
        () => buildApp({ logger: false }),
        /JWT_SECRET must be at least 32 characters long.*openssl rand -base64 48/
      );
      assert.throws(
        () => buildApp({ logger: false, jwtSecret: 'short_sixteen_16' }),
        /JWT_SECRET must be at least 32 characters long.*openssl rand -base64 48/
      );
    } finally {
      process.env.JWT_SECRET = saved;
    }
  });

  // 12. CORS header only for allowed origin
  test('12. CORS headers set only for allowed origins', async () => {
    // Allowed origin: http://localhost:5173
    const allowedRes = await request('/health', {
      method: 'GET',
      headers: { Origin: 'http://localhost:5173' },
    });
    assert.equal(allowedRes.headers.get('access-control-allow-origin'), 'http://localhost:5173');

    // Another allowed origin: http://localhost:5199
    const allowed2Res = await request('/health', {
      method: 'GET',
      headers: { Origin: 'http://localhost:5199' },
    });
    assert.equal(allowed2Res.headers.get('access-control-allow-origin'), 'http://localhost:5199');

    // Disallowed origin: http://malicious-site.com
    const disallowedRes = await request('/health', {
      method: 'GET',
      headers: { Origin: 'http://malicious-site.com' },
    });
    assert.notEqual(disallowedRes.headers.get('access-control-allow-origin'), 'http://malicious-site.com');
  });

  // 13. Server never returns password_hash
  test('13. Server never returns password_hash in any response', async () => {
    const email = `security_audit_${Date.now()}@test.com`;
    const password = 'StrictAuditPassword2026!';
    knownPasswords.add(password);

    const signupRes = await request('/auth/signup', {
      method: 'POST',
      body: { email, password },
    });
    assert.ok(!signupRes.rawText.includes('password_hash'));
    assert.ok(!signupRes.rawText.includes('$2a$'));

    const loginRes = await request('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    assert.ok(!loginRes.rawText.includes('password_hash'));
    assert.ok(!loginRes.rawText.includes('$2a$'));

    const meRes = await request('/auth/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${loginRes.body.accessToken}` },
    });
    assert.ok(!meRes.rawText.includes('password_hash'));
    assert.ok(!meRes.rawText.includes('$2a$'));
  });

  // 14. Log output contains no tokens/passwords
  test('14. Captured log output contains no tokens or plain passwords', async () => {
    const fullLogText = capturedLogs.join('\n');

    for (const pwd of knownPasswords) {
      assert.ok(
        !fullLogText.includes(pwd),
        `Plaintext password '${pwd}' was leaked into log stream!`
      );
    }

    for (const token of knownTokens) {
      assert.ok(
        !fullLogText.includes(token),
        `JWT token was leaked into log stream!`
      );
    }
  });

  // =========================================================================
  // BE1b Weakness Fix Verifications (B1 - B5)
  // =========================================================================

  // B1: GET /auth/me and POST /auth/logout are not limited by credential rate limiter bucket
  test('B1. GET /auth/me (13 calls) and POST /auth/logout do not trip rate limit; only credential endpoints do', async () => {
    app.rateLimiter.reset();

    const email = `b1_user_${Date.now()}@test.com`;
    const password = 'PasswordValid1234!';
    knownPasswords.add(password);

    const signup = (await request('/auth/signup', {
      method: 'POST',
      body: { email, password, displayName: 'B1 Player' },
    })).body;
    const token = signup.accessToken;

    // Call GET /auth/me 13 times with a valid token
    for (let i = 0; i < 13; i++) {
      const meRes = await request('/auth/me', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(meRes.status, 200, `Call ${i + 1} to /auth/me failed with status ${meRes.status}`);
      assert.equal(meRes.body.user.email, email.toLowerCase());
    }

    // Call POST /auth/logout 5 times
    for (let i = 0; i < 5; i++) {
      const logoutRes = await request('/auth/logout', { method: 'POST', body: {} });
      assert.equal(logoutRes.status, 200);
    }
  });

  // B2: Login timing leak mitigation (bcrypt against dummy hash on unknown email)
  test('B2. Login timing: median time of 5 unknown-email logins within a factor of 2 of 5 known-email wrong-password logins', async () => {
    app.rateLimiter.reset();

    const knownEmail = `b2_timing_user_${Date.now()}@test.com`;
    const password = 'PasswordValid1234!';
    knownPasswords.add(password);

    await request('/auth/signup', {
      method: 'POST',
      body: { email: knownEmail, password, displayName: 'B2 Timing User' },
    });

    const unknownTimes = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      const res = await request('/auth/login', {
        method: 'POST',
        body: { email: `unknown_${i}_${Date.now()}@test.com`, password: 'SomeWrongPassword999!' },
      });
      const duration = performance.now() - start;
      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'Invalid email or password');
      unknownTimes.push(duration);
    }

    // Reset rate limiter between runs so tests are not throttled
    app.rateLimiter.reset();

    const knownWrongTimes = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      const res = await request('/auth/login', {
        method: 'POST',
        body: { email: knownEmail, password: `WrongPasswordAttempt${i}!` },
      });
      const duration = performance.now() - start;
      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'Invalid email or password');
      knownWrongTimes.push(duration);
    }

    unknownTimes.sort((a, b) => a - b);
    knownWrongTimes.sort((a, b) => a - b);
    const medianUnknown = unknownTimes[Math.floor(unknownTimes.length / 2)];
    const medianKnownWrong = knownWrongTimes[Math.floor(knownWrongTimes.length / 2)];

    const ratio = medianUnknown / medianKnownWrong;
    // Verify within a factor of 2 (i.e. ratio between 0.5 and 2.0)
    assert.ok(
      ratio >= 0.5 && ratio <= 2.0,
      `Timing difference out of bounds: medianUnknown=${medianUnknown.toFixed(1)}ms, medianKnownWrong=${medianKnownWrong.toFixed(1)}ms, ratio=${ratio.toFixed(2)}`
    );
  });

  // B3: Object prototype keys (/rpc/constructor, toString, valueOf, hasOwnProperty, __proto__) give 404 with identical body as unknown function
  test('B3. Prototype names and __proto__ give 404 even WITH a valid token and exact same 404 body as unknown functions', async () => {
    const email = `b3_proto_${Date.now()}@test.com`;
    const password = 'PasswordValid1234!';
    knownPasswords.add(password);

    const user = (await request('/auth/signup', {
      method: 'POST',
      body: { email, password, displayName: 'B3 Tester' },
    })).body;
    const token = user.accessToken;

    // Unknown function baseline
    const unknownRes = await request('/rpc/non_existent_function_abc123', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {},
    });
    assert.equal(unknownRes.status, 404);
    assert.deepEqual(unknownRes.body, {
      ok: false,
      code: 'not_found',
      error: 'Function not found',
    });

    const prototypeNames = [
      'constructor',
      'toString',
      'valueOf',
      'hasOwnProperty',
      '__proto__',
      'isPrototypeOf',
      'propertyIsEnumerable',
      'toLocaleString',
    ];

    for (const name of prototypeNames) {
      const res = await request(`/rpc/${name}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: {},
      });
      assert.equal(res.status, 404, `/rpc/${name} did not return 404 (status=${res.status})`);
      assert.deepEqual(res.body, unknownRes.body, `/rpc/${name} body differs from baseline 404`);
    }
  });

  // B4: Error bodies do not leak internals (generic JWT errors and sanitized FK violation errors)
  test('B4. Error bodies do not leak internals: bad token body is generic; FK violation has no table/constraint name', async () => {
    const expectedBadTokenBody = {
      ok: false,
      code: 'unauthorized',
      error: 'Invalid or expired token',
    };

    const secretKey = new TextEncoder().encode(jwtSecret);

    // 1. Malformed token
    const malformedRes = await request('/rpc/hoopup_get_session', {
      method: 'POST',
      headers: { Authorization: 'Bearer this.is.not.a.valid.jwt.token' },
      body: { p_session_id: crypto.randomUUID() },
    });
    assert.equal(malformedRes.status, 401);
    assert.deepEqual(malformedRes.body, expectedBadTokenBody);

    // 2. Expired token
    const expiredToken = await new jose.SignJWT({ sub: crypto.randomUUID(), role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(secretKey);
    const expiredRes = await request('/rpc/hoopup_get_session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${expiredToken}` },
      body: { p_session_id: crypto.randomUUID() },
    });
    assert.equal(expiredRes.status, 401);
    assert.deepEqual(expiredRes.body, expectedBadTokenBody);

    // 3. Wrong secret token
    const wrongSecretKey = new TextEncoder().encode('completely_different_secret_key_123456');
    const wrongSecretToken = await new jose.SignJWT({ sub: crypto.randomUUID(), role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(wrongSecretKey);
    const wrongSecretRes = await request('/rpc/hoopup_get_session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${wrongSecretToken}` },
      body: { p_session_id: crypto.randomUUID() },
    });
    assert.equal(wrongSecretRes.status, 401);
    assert.deepEqual(wrongSecretRes.body, expectedBadTokenBody);

    // 4. alg: none token
    const headerNone = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payloadNone = Buffer.from(JSON.stringify({ sub: crypto.randomUUID(), role: 'authenticated' })).toString('base64url');
    const algNoneToken = `${headerNone}.${payloadNone}.`;
    const noneRes = await request('/rpc/hoopup_get_session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${algNoneToken}` },
      body: { p_session_id: crypto.randomUUID() },
    });
    assert.equal(noneRes.status, 401);
    assert.deepEqual(noneRes.body, expectedBadTokenBody);

    // 5. Database FK violation response contains no table or constraint name
    // 5a. Host with profile creates session with non-existent courtId (violates sessions_court_id_fkey)
    const validUserRes = await request('/auth/signup', {
      method: 'POST',
      body: { email: `fk_host_${Date.now()}@test.com`, password: 'PasswordValid1234!', displayName: 'FK Host' },
    });
    const validToken = validUserRes.body.accessToken;

    const fakeCourtId = crypto.randomUUID();
    const fkCourtRes = await request('/rpc/hoopup_create_session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${validToken}` },
      body: {
        p_request_id: crypto.randomUUID(),
        p_input: {
          title: 'FK Court Violation Session',
          courtId: fakeCourtId,
          startsAt: null,
          teamSize: 3,
          guestCount: 0,
          skillLevel: 'regular',
          joinPolicy: 'instant',
        },
      },
    });
    assert.equal(fkCourtRes.status, 400);
    assert.equal(fkCourtRes.body.ok, false);
    assert.equal(fkCourtRes.body.code, 'invalid_input');
    const rawFkCourtBody = JSON.stringify(fkCourtRes.body);
    assert.ok(!rawFkCourtBody.includes('fkey'), 'Leaked constraint name (fkey) in error response');
    assert.ok(!rawFkCourtBody.includes('court_id'), 'Leaked column identifier in error response');
    assert.ok(!rawFkCourtBody.includes('violates foreign key'), 'Leaked raw Postgres error message');

    // 5b. Validly signed token with ghost sub (not in app_auth.users) calls save_profile (BAN1 intercepts with 403 account_suspended)
    const ghostToken = await new jose.SignJWT({ sub: crypto.randomUUID(), role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(secretKey);

    const fkProfileRes = await request('/rpc/hoopup_save_profile', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ghostToken}` },
      body: { p_input: { displayName: 'Ghost Profile' } },
    });
    assert.equal(fkProfileRes.status, 403);
    assert.equal(fkProfileRes.body.ok, false);
    assert.equal(fkProfileRes.body.code, 'account_suspended');
    assert.equal(fkProfileRes.body.error, 'Account unavailable');
    const rawFkProfileBody = JSON.stringify(fkProfileRes.body);
    assert.ok(!rawFkProfileBody.includes('fkey'), 'Leaked constraint name (fkey) in error response');
    assert.ok(!rawFkProfileBody.includes('profiles_id'), 'Leaked internal identifier in error response');
    assert.ok(!rawFkProfileBody.includes('violates foreign key'), 'Leaked raw Postgres error message');
  });

  // B5: Input validation rejections for email, password, and displayName (all return 400)
  test('B5. Input limits: rejects invalid email, long email, long/short password, long displayName with 400', async () => {
    const validPassword = 'ValidPassword123!';

    // 1. Rejection: Email "@"
    const atOnly = await request('/auth/signup', {
      method: 'POST',
      body: { email: '@', password: validPassword },
    });
    assert.equal(atOnly.status, 400);
    assert.ok(atOnly.body.error);

    // 2. Rejection: 5000-char email
    const longEmail = 'a'.repeat(4990) + '@example.com';
    const longEmailRes = await request('/auth/signup', {
      method: 'POST',
      body: { email: longEmail, password: validPassword },
    });
    assert.equal(longEmailRes.status, 400);
    assert.ok(longEmailRes.body.error);

    // 3. Rejection: email without dot in domain
    const noDotRes = await request('/auth/signup', {
      method: 'POST',
      body: { email: 'user@localhost', password: validPassword },
    });
    assert.equal(noDotRes.status, 400);
    assert.ok(noDotRes.body.error);

    // 4. Rejection: email with multiple @
    const multiAtRes = await request('/auth/signup', {
      method: 'POST',
      body: { email: 'user@@example.com', password: validPassword },
    });
    assert.equal(multiAtRes.status, 400);
    assert.ok(multiAtRes.body.error);

    // 5. Rejection: 1000-char password (> 72 bytes)
    const longPassword = 'P'.repeat(1000);
    const longPwRes = await request('/auth/signup', {
      method: 'POST',
      body: { email: `long_pw_${Date.now()}@example.com`, password: longPassword },
    });
    assert.equal(longPwRes.status, 400);
    assert.ok(longPwRes.body.error.includes('72'));
    assert.ok(longPwRes.body.error.toLowerCase().includes('bcrypt'));

    // 6. Rejection: password < 10 characters / bytes
    const shortPwRes = await request('/auth/signup', {
      method: 'POST',
      body: { email: `short_pw_${Date.now()}@example.com`, password: 'short' },
    });
    assert.equal(shortPwRes.status, 400);
    assert.ok(shortPwRes.body.error.includes('10'));

    // 7. Rejection: displayName > 60 chars (e.g. 61 chars)
    const longDisplayName = 'D'.repeat(61);
    const longNameRes = await request('/auth/signup', {
      method: 'POST',
      body: { email: `long_name_${Date.now()}@example.com`, password: validPassword, displayName: longDisplayName },
    });
    assert.equal(longNameRes.status, 400);
    assert.ok(longNameRes.body.error.includes('60'));

    // 8. Acceptance check: valid boundaries (displayName 60 chars, password 72 bytes) succeed
    const boundaryRes = await request('/auth/signup', {
      method: 'POST',
      body: {
        email: `boundary_${Date.now()}@example.com`,
        password: 'Pass72Bytes!' + 'aB3#'.repeat(15),
        displayName: 'N'.repeat(60),
      },
    });
    assert.equal(boundaryRes.status, 201);
    assert.ok(boundaryRes.body.accessToken);
  });
});

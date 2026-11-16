import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  validateEmail,
  validatePassword,
  validateDisplayName,
  COMMON_PASSWORDS,
  LoginAccountLock,
  hashEmail,
} from '../src/auth.js';
import { buildApp } from '../src/app.js';
import { startTempPostgres } from './helpers/temp-postgres.js';
import { initPool, closePool } from '../src/db.js';

describe('HoopUp SEC3 Hardening Test Suite', async () => {
  let pgInstance;
  const testSecret = 'sec3_test_super_secure_random_key_min_32_bytes!';

  before(async () => {
    pgInstance = await startTempPostgres();
    process.env.DATABASE_URL = pgInstance.connectionString;
    process.env.JWT_SECRET = testSecret;
    initPool({
      connectionString: pgInstance.connectionString,
      statementTimeout: 10000,
      idleInTransactionSessionTimeout: 15000,
    });
  });

  after(async () => {
    await closePool();
    if (pgInstance) {
      pgInstance.stop();
    }
  });

  // =========================================================================
  // 1. validateEmail Hardening & Comprehensive Examples
  // =========================================================================
  describe('1. validateEmail Specifications & Examples (>= 30 valid & >= 30 invalid)', () => {
    const validEmails = [
      'player@hoopup.com',
      'player123@example.co.th',
      'user+tag@domain.test',
      'a.b.c@domain.test',
      'first_last@example.org',
      'first-last@example.net',
      'contact@sub.domain.co.uk',
      'numbers12345@numbers12345.com',
      'user-name@domain-name.com',
      'x@test.com',
      'admin@courts.basketball',
      'support+help@hoopup.app',
      'test.user@domain.io',
      'player_one@sub.domain.org',
      'hoop-up@bball.th',
      'thai-baller@stadium.co.th',
      'pointguard3@team.sports',
      'center.position@hoop.cloud',
      'forward_mvp@league.pro',
      'a+b+c@x.test',
      'alpha.beta+gamma@sub1.sub2.example.com',
      'player123456789@example.com',
      'user@123domain.com',
      'dev.test+fixture@hoopup.test',
      'host_flow_123456@hoopup.test',
      'joiner_flow_123456@hoopup.test',
      'a'.repeat(64) + '@example.com', // local part exactly 64 chars
      'user@' + 'a'.repeat(63) + '.com', // domain label exactly 63 chars
      'user@my-domain-label.com',
      'valid.email.address@sub-domain.example.com',
      'super-athlete+session1@hoopup.community',
      'regular.user@gmail.com',
      'work-email@company.internal.test',
      'player@bkk-courts.org',
      'captain@bangkok-basketball.co.th',
    ];

    const invalidEmails = [
      '', // empty string
      'notanemail', // no @, no domain
      'plainaddress', // plain word
      '@nodomain.com', // missing local part
      'user@', // missing domain
      'user@localhost', // domain without a dot
      'user@@domain.com', // multiple @
      'user@domain@extra.com', // more than one @
      ' leading@example.com', // space at start
      'trailing@example.com ', // space at end
      'user name@example.com', // space in local part
      'user@exam ple.com', // space in domain
      'user\t@example.com', // tab in local part
      'user@domain\n.com', // newline in domain
      'user\r\n@domain.com', // CR LF in local part
      '\x00user@example.com', // null control character
      'user\x1f@example.com', // ASCII control character
      'user\x7f@example.com', // DEL control character
      '.leadingdot@domain.com', // leading dot in local part
      'trailingdot.@domain.com', // trailing dot in local part
      'consecutive..dots@domain.com', // consecutive dots in local part
      'user@.leadingdot.com', // leading dot in domain
      'user@trailingdot.com.', // trailing dot in domain
      'user@consecutive..dots.com', // consecutive dots in domain
      'user@-hyphenstart.com', // label starting with hyphen
      'user@hyphenend-.com', // label ending with hyphen
      'user@sub.-hyphen.com', // middle label starting with hyphen
      'user@sub.hyphen-.com', // middle label ending with hyphen
      'a@b.c', // TLD shorter than 2 (requirement: a@b.c)
      'user@domain.x', // TLD length 1
      'a'.repeat(65) + '@example.com', // local part > 64 chars (65 chars)
      'user@' + 'a'.repeat(64) + '.com', // label > 63 chars (64 chars)
      'a'.repeat(250) + '@example.com', // total length > 254 chars
      'user@domain.123', // TLD with numbers (must be letters)
      'user@domain..co.uk', // consecutive dots in multi-label domain
      null, // non-string
      undefined, // non-string
      12345, // non-string
    ];

    test('1.1 At least 30 valid email formats pass validation (tested 35)', () => {
      assert.ok(validEmails.length >= 30, `Expected at least 30 valid emails, got ${validEmails.length}`);
      for (const email of validEmails) {
        const res = validateEmail(email);
        assert.equal(res.valid, true, `Expected valid email for "${email}", got error: ${res.error}`);
        assert.ok(res.email, `Expected normalized email returned for "${email}"`);
        assert.equal(res.email, email.trim().toLowerCase());
      }
    });

    test('1.2 At least 30 invalid email formats fail validation (tested 38)', () => {
      assert.ok(invalidEmails.length >= 30, `Expected at least 30 invalid emails, got ${invalidEmails.length}`);
      for (const email of invalidEmails) {
        const res = validateEmail(email);
        assert.equal(res.valid, false, `Expected invalid email for "${email}", but it was accepted`);
        assert.ok(res.error, `Expected error message for "${email}"`);
      }
    });

    test('1.3 Proves old validateEmail flaws are fixed (spaces, control chars, a@b.c, hyphen labels, consecutive dots in local part)', () => {
      // 1. Space anywhere rejected
      assert.equal(validateEmail('user name@example.com').valid, false);
      assert.equal(validateEmail(' user@example.com').valid, false);
      assert.equal(validateEmail('user@example.com ').valid, false);
      // 2. Control characters rejected
      assert.equal(validateEmail('user\x00@example.com').valid, false);
      assert.equal(validateEmail('user\t@example.com').valid, false);
      assert.equal(validateEmail('user\n@example.com').valid, false);
      // 3. TLD shorter than 2 (a@b.c) rejected
      assert.equal(validateEmail('a@b.c').valid, false);
      assert.equal(validateEmail('hello@world.x').valid, false);
      // 4. Domain labels starting or ending with hyphen rejected
      assert.equal(validateEmail('user@-domain.com').valid, false);
      assert.equal(validateEmail('user@domain-.com').valid, false);
      assert.equal(validateEmail('user@sub.-domain-.com').valid, false);
      // 5. Local part dot placement checks
      assert.equal(validateEmail('.user@domain.com').valid, false);
      assert.equal(validateEmail('user.@domain.com').valid, false);
      assert.equal(validateEmail('user..name@domain.com').valid, false);
      // 6. Limits: local part <= 64, label <= 63, total <= 254
      assert.equal(validateEmail('a'.repeat(64) + '@test.com').valid, true);
      assert.equal(validateEmail('a'.repeat(65) + '@test.com').valid, false);
      assert.equal(validateEmail('user@' + 'd'.repeat(63) + '.com').valid, true);
      assert.equal(validateEmail('user@' + 'd'.repeat(64) + '.com').valid, false);
    });
  });

  // =========================================================================
  // 2. validatePassword Hardening & Blocklist
  // =========================================================================
  describe('2. validatePassword Hardening & Blocklist (>= 100 entries, padding rule, sequences, repeat chars)', () => {
    test('2.1 COMMON_PASSWORDS has at least 100 entries', () => {
      assert.ok(Array.isArray(COMMON_PASSWORDS));
      assert.ok(
        COMMON_PASSWORDS.length >= 100,
        `Expected at least 100 entries in COMMON_PASSWORDS, found ${COMMON_PASSWORDS.length}`
      );
    });

    test('2.2 Rejects passwords with all same character (length 10..72)', () => {
      assert.equal(validatePassword('aaaaaaaaaa').valid, false);
      assert.equal(validatePassword('1111111111').valid, false);
      assert.equal(validatePassword('BBBBBBBBBB').valid, false);
      assert.equal(validatePassword('!'.repeat(20)).valid, false);
      assert.equal(validatePassword('B'.repeat(72)).valid, false);
      assert.equal(
        validatePassword('aaaaaaaaaa').error,
        'Password cannot consist of a single repeated character'
      );
    });

    test('2.3 Rejects password equal to email local part (case-insensitive)', () => {
      const email = 'PlayerChampion@hoopup.com';
      assert.equal(
        validatePassword('playerchampion', { email }).valid,
        false
      );
      assert.equal(
        validatePassword('PlayerChampion', { email }).valid,
        false
      );
      assert.equal(
        validatePassword('PLAYERCHAMPION', { email }).valid,
        false
      );
      assert.equal(
        validatePassword('PlayerChampion', { email }).error,
        'Password cannot be the same as your email address'
      );
      // Different password passes
      assert.equal(
        validatePassword('DifferentSecurePass2026!', { email }).valid,
        true
      );
    });

    test('2.4 Rejects password equal to display name (case-insensitive)', () => {
      const displayName = 'BangkokShooter';
      assert.equal(
        validatePassword('bangkokshooter', { displayName }).valid,
        false
      );
      assert.equal(
        validatePassword('BangkokShooter', { displayName }).valid,
        false
      );
      assert.equal(
        validatePassword('BANGKOKSHOOTER', { displayName }).valid,
        false
      );
      assert.equal(
        validatePassword('BangkokShooter', { displayName }).error,
        'Password cannot be the same as your display name'
      );
      // Different password passes
      assert.equal(
        validatePassword('DifferentSecurePass2026!', { displayName }).valid,
        true
      );
    });

    test('2.5 Rejects predictable sequences (1234567890, qwertyuiop)', () => {
      assert.equal(validatePassword('1234567890').valid, false);
      assert.equal(validatePassword('qwertyuiop').valid, false);
      assert.equal(validatePassword('pass_1234567890_word').valid, false);
      assert.equal(validatePassword('my_qwertyuiop_key').valid, false);
      assert.equal(
        validatePassword('1234567890').error,
        'Password contains an easily guessable sequence'
      );
    });

    test('2.6 Rejects common passwords and padded base words (stripping trailing digits/symbols)', () => {
      // Direct matches from blocklist
      assert.equal(validatePassword('administrator').valid, false);
      assert.equal(validatePassword('password12345').valid, false);
      assert.equal(validatePassword('welcome2026').valid, false);

      // Padded base words (base word in blocklist, padded with trailing digits/symbols)
      assert.equal(validatePassword('Password123!').valid, false);
      assert.equal(validatePassword('welcome123456!').valid, false);
      assert.equal(validatePassword('basketball2026!').valid, false);
      assert.equal(validatePassword('football12345#').valid, false);
      assert.equal(validatePassword('sunshine999$$').valid, false);
      assert.equal(validatePassword('superman2026!').valid, false);

      // Generic error text, does NOT echo password
      const res = validatePassword('Password123!');
      assert.equal(res.valid, false);
      assert.equal(res.error, 'Password is too common or easily guessable');
      assert.ok(!res.error.includes('Password123!'));
    });

    test('2.7 Existing valid passwords from app/e2e and backend test suite still pass', () => {
      assert.equal(validatePassword('PasswordValid123!').valid, true);
      assert.equal(validatePassword('PasswordValid1234!').valid, true);
      assert.equal(validatePassword('StrongPassword2026!').valid, true);
      assert.equal(validatePassword('ValidPassword123!').valid, true);
      // Valid boundary 72 bytes
      assert.equal(validatePassword('Pass72Bytes!' + 'aB3#'.repeat(15)).valid, true);
    });

    test('2.8 Length limits (10..72 bytes) preserved strictly', () => {
      assert.equal(validatePassword('short').valid, false);
      assert.ok(validatePassword('short').error.includes('10'));

      const longPw = 'P'.repeat(100);
      assert.equal(validatePassword(longPw).valid, false);
      assert.ok(validatePassword(longPw).error.includes('72'));
      assert.ok(validatePassword(longPw).error.toLowerCase().includes('bcrypt'));
    });
  });

  // =========================================================================
  // 3. Per-Account Login Lock (LoginAccountLock)
  // =========================================================================
  describe('3. Per-Account Login Lock (LoginAccountLock)', () => {
    test('3.1 Locks after 5 consecutive failures; 6th attempt returns locked with Retry-After', () => {
      const lock = new LoginAccountLock({ max: 5, windowMs: 60000, lockSeconds: 60 });
      const email = 'victim@example.com';

      // 5 consecutive failures
      for (let i = 1; i <= 5; i++) {
        assert.equal(lock.isLocked(email).locked, false);
        const record = lock.recordFailure(email);
        if (i < 5) {
          assert.equal(record.locked, false);
          assert.equal(record.count, i);
        } else {
          assert.equal(record.locked, true);
          assert.ok(record.retryAfter > 0 && record.retryAfter <= 60);
        }
      }

      // 6th check: account is locked
      const status = lock.isLocked(email);
      assert.equal(status.locked, true);
      assert.ok(status.retryAfter > 0 && status.retryAfter <= 60);

      lock.destroy();
    });

    test('3.2 Unknown email behaves identically (same 5-attempt threshold and 429 lock)', () => {
      const lock = new LoginAccountLock({ max: 5, windowMs: 60000, lockSeconds: 60 });
      const unknownEmail = 'ghost_unknown_never_registered@example.com';

      for (let i = 1; i <= 5; i++) {
        assert.equal(lock.isLocked(unknownEmail).locked, false);
        lock.recordFailure(unknownEmail);
      }

      const status = lock.isLocked(unknownEmail);
      assert.equal(status.locked, true);
      assert.ok(status.retryAfter > 0 && status.retryAfter <= 60);

      lock.destroy();
    });

    test('3.3 Successful login resets failure record and clears lockout', () => {
      const lock = new LoginAccountLock({ max: 5, windowMs: 60000, lockSeconds: 60 });
      const email = 'user_reset@example.com';

      // 4 failed attempts
      for (let i = 0; i < 4; i++) {
        lock.recordFailure(email);
      }
      assert.equal(lock.isLocked(email).locked, false);

      // Successful login
      lock.recordSuccess(email);

      // Now 4 more failed attempts do not trip the lock (fresh count from 1)
      for (let i = 0; i < 4; i++) {
        const res = lock.recordFailure(email);
        assert.equal(res.locked, false);
        assert.equal(res.count, i + 1);
      }

      lock.destroy();
    });

    test('3.4 Lock expires after the lock window (using small options window)', async () => {
      // 0.15s (150ms) lock duration
      const lock = new LoginAccountLock({ max: 5, windowMs: 1000, lockSeconds: 0.15 });
      const email = 'temporary_lock@example.com';

      for (let i = 0; i < 5; i++) {
        lock.recordFailure(email);
      }
      assert.equal(lock.isLocked(email).locked, true);

      // Wait 250ms for lock to expire
      await sleep(250);

      const statusAfter = lock.isLocked(email);
      assert.equal(statusAfter.locked, false);

      lock.destroy();
    });

    test('3.5 Keys are stored as SHA-256 hashes (not plain email) and map size is bounded', () => {
      const lock = new LoginAccountLock({ max: 5, maxEntries: 10 });
      const email = 'privacy_test@example.com';
      lock.recordFailure(email);

      const expectedHash = hashEmail(email);
      assert.ok(lock.records.has(expectedHash));
      assert.equal(lock.records.has(email), false, 'Plain email must not be stored as map key');

      // Add 20 unique emails to verify bounded map size (maxEntries = 10)
      for (let i = 0; i < 20; i++) {
        lock.recordFailure(`bounded_${i}@example.com`);
      }
      assert.ok(lock.records.size <= 10, `Map size ${lock.records.size} must not exceed maxEntries 10`);

      lock.destroy();
    });
  });

  // =========================================================================
  // 4. Live HTTP Endpoint Integration Tests
  // =========================================================================
  describe('4. Live HTTP Endpoint Integration (/auth/signup & /auth/login)', () => {
    let app;

    before(async () => {
      app = buildApp({
        logger: false,
        jwtSecret: testSecret,
        loginLockMax: 5,
        loginLockSeconds: 0.2, // 200ms lock for fast testing
        authRateLimitMax: 1000, // ensure IP rate limiter does not interfere
      });
    });

    after(async () => {
      if (app) {
        await app.close();
      }
    });

    test('4.1 POST /auth/signup rejects invalid emails with 400', async () => {
      const badEmails = [
        'bad email@test.com',
        'a@b.c',
        'user@-bad-domain.com',
        'user..double@test.com',
      ];
      for (const email of badEmails) {
        const res = await app.inject({
          method: 'POST',
          url: '/auth/signup',
          payload: { email, password: 'PasswordValid123!' },
        });
        assert.equal(res.statusCode, 400);
        assert.ok(res.json().error);
      }
    });

    test('4.2 POST /auth/signup rejects weak/predictable passwords with 400', async () => {
      const email = `sec3_weak_${Date.now()}@hoopup.test`;

      // All same char
      const resSame = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: { email, password: 'aaaaaaaaaa' },
      });
      assert.equal(resSame.statusCode, 400);
      assert.equal(resSame.json().error, 'Password cannot consist of a single repeated character');

      // Equal to email local part
      const resEmail = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: { email, password: email.split('@')[0] },
      });
      assert.equal(resEmail.statusCode, 400);
      assert.equal(resEmail.json().error, 'Password cannot be the same as your email address');

      // Equal to display name
      const resName = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: { email, password: 'MyDisplayName123', displayName: 'MyDisplayName123' },
      });
      assert.equal(resName.statusCode, 400);
      assert.equal(resName.json().error, 'Password cannot be the same as your display name');

      // Predictable sequence
      const resSeq = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: { email, password: 'pass1234567890word' },
      });
      assert.equal(resSeq.statusCode, 400);
      assert.equal(resSeq.json().error, 'Password contains an easily guessable sequence');

      // Common password blocklist (padded base word)
      const resBlock = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: { email, password: 'Password123!' },
      });
      assert.equal(resBlock.statusCode, 400);
      assert.equal(resBlock.json().error, 'Password is too common or easily guessable');
    });

    test('4.3 POST /auth/login: 5 failed logins lock the account; 6th gets 429 Retry-After', async () => {
      const email = `lockout_target_${Date.now()}@hoopup.test`;
      const validPw = 'PasswordValid123!';

      // Create user
      const signupRes = await app.inject({
        method: 'POST',
        url: '/auth/signup',
        payload: { email, password: validPw, displayName: 'Lockout Target' },
      });
      assert.equal(signupRes.statusCode, 201);

      // 5 wrong password attempts -> all return 401
      for (let i = 0; i < 5; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: { email, password: `WrongPassword${i}!` },
        });
        assert.equal(res.statusCode, 401);
        assert.equal(res.json().error, 'Invalid email or password');
      }

      // 6th attempt -> 429 with Retry-After header
      const resLocked = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: `WrongPassword6!` },
      });
      assert.equal(resLocked.statusCode, 429);
      assert.ok(resLocked.headers['retry-after']);
      assert.equal(resLocked.json().error, 'Too many failed login attempts. Please try again later.');

      // Wait 250ms for lock to expire
      await sleep(250);

      // Now valid login succeeds and clears failures
      const resSuccess = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: validPw },
      });
      assert.equal(resSuccess.statusCode, 200);
      assert.ok(resSuccess.json().accessToken);
    });

    test('4.4 POST /auth/login: unknown email behaves IDENTICALLY (401 x 5, then 429 with Retry-After)', async () => {
      const unknownEmail = `ghost_${Date.now()}@hoopup.test`;

      // 5 failed attempts for unknown email -> 401
      for (let i = 0; i < 5; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: { email: unknownEmail, password: 'AnyPassword123!' },
        });
        assert.equal(res.statusCode, 401);
        assert.equal(res.json().error, 'Invalid email or password');
      }

      // 6th attempt -> 429 with Retry-After header
      const resLocked = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: unknownEmail, password: 'AnyPassword123!' },
      });
      assert.equal(resLocked.statusCode, 429);
      assert.ok(resLocked.headers['retry-after']);
      assert.equal(resLocked.json().error, 'Too many failed login attempts. Please try again later.');
    });
  });

  // =========================================================================
  // 5. Signup Timing Benchmark (SEC2 6.1 Parity)
  // =========================================================================
  describe('5. Signup Enumeration Timing Verification (5-Sample Median Comparison)', () => {
    test('5.1 5 fresh signups vs 5 duplicate signups (409) have equivalent cost (median within factor of 2)', async () => {
      const app = buildApp({
        logger: false,
        jwtSecret: testSecret,
        authRateLimitMax: 1000,
      });

      const fixedEmail = `sec3_duplicate_${Date.now()}@test.com`;
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
            email: `sec3_fresh_${i}_${Date.now()}@test.com`,
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
        `\n[SEC3 Signup Timing Benchmark] fresh median: ${medianFresh.toFixed(2)}ms, duplicate 409 median: ${medianDuplicate.toFixed(2)}ms, ratio: ${ratio.toFixed(2)}`
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

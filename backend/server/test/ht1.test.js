import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { startTempPostgres } from './helpers/temp-postgres.js';
import { initPool, closePool } from '../src/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_DIR = path.resolve(__dirname, '..');

describe('HoopUp HT1 - User-Controlled Height Visibility Test Suite', async () => {
  let pgInstance;
  let app;
  const testSecret = 'ht1_test_super_secure_random_key_min_32_bytes!';

  let userA;
  let tokenA;
  let userB;
  let tokenB;

  before(async () => {
    pgInstance = await startTempPostgres();
    process.env.DATABASE_URL = pgInstance.connectionString;
    process.env.JWT_SECRET = testSecret;

    initPool({
      connectionString: pgInstance.connectionString,
      statementTimeout: 5000,
      idleInTransactionSessionTimeout: 5000,
    });

    app = buildApp({
      logger: false,
      jwtSecret: testSecret,
    });

    // Create User A
    const signupARes = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: {
        email: `alice_ht1_${Date.now()}@test.com`,
        password: 'PasswordValid1234!',
        displayName: 'Alice Champion',
      },
    });
    assert.equal(signupARes.statusCode, 201);
    const bodyA = signupARes.json();
    userA = bodyA.user;
    tokenA = bodyA.accessToken;

    // Create User B
    const signupBRes = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: {
        email: `bob_ht1_${Date.now()}@test.com`,
        password: 'PasswordValid1234!',
        displayName: 'Bob Defender',
      },
    });
    assert.equal(signupBRes.statusCode, 201);
    const bodyB = signupBRes.json();
    userB = bodyB.user;
    tokenB = bodyB.accessToken;
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

  // Test 1: default: newly saved profile with heightCm: 185 and no heightVisible
  test('1. default: newly saved profile with heightCm: 185 and no heightVisible -> other user gets height_cm: null; owner gets 185 and height_visible: false', async () => {
    // User A saves profile with heightCm: 185 and no heightVisible
    const saveRes = await app.inject({
      method: 'POST',
      url: '/rpc/hoopup_save_profile',
      headers: { Authorization: `Bearer ${tokenA}` },
      payload: {
        p_input: {
          displayName: 'Alice Champion',
          heightCm: 185,
        },
      },
    });
    assert.equal(saveRes.statusCode, 200);
    const saveBody = saveRes.json();
    assert.equal(saveBody.ok, true);
    assert.equal(saveBody.profile.height_cm, 185);
    assert.equal(saveBody.profile.height_visible, false);

    // Another user (User B) calls GET /profiles/:userAId -> returns height_cm: null, height_visible: null
    const profileBRes = await app.inject({
      method: 'GET',
      url: `/profiles/${userA.id}`,
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(profileBRes.statusCode, 200);
    const profileBBody = profileBRes.json();
    assert.equal(profileBBody.id, userA.id);
    assert.equal(profileBBody.display_name, 'Alice Champion');
    assert.equal(profileBBody.height_cm, null, 'Other user must not see hidden height_cm');
    assert.equal(profileBBody.height_visible, null, 'Other user must not receive owner visibility flag');

    // The owner (User A) calls GET /profiles/:userAId -> returns 185 and height_visible: false
    const profileARes = await app.inject({
      method: 'GET',
      url: `/profiles/${userA.id}`,
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(profileARes.statusCode, 200);
    const profileABody = profileARes.json();
    assert.equal(profileABody.id, userA.id);
    assert.equal(profileABody.height_cm, 185, 'Owner must always see their own height_cm');
    assert.equal(profileABody.height_visible, false, 'Owner must see their height_visible flag');

    // The owner calls GET /auth/me -> returns 185 and height_visible: false
    const meRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(meRes.statusCode, 200);
    const meBody = meRes.json();
    assert.equal(meBody.profile.height_cm, 185);
    assert.equal(meBody.profile.height_visible, false);
  });

  // Test 2: heightVisible: true -> other user sees 185; set back to false -> hidden again
  test('2. heightVisible: true -> other user sees 185; set back to false -> hidden again', async () => {
    // User A sets heightVisible: true
    const setTrueRes = await app.inject({
      method: 'POST',
      url: '/rpc/hoopup_save_profile',
      headers: { Authorization: `Bearer ${tokenA}` },
      payload: {
        p_input: {
          displayName: 'Alice Champion',
          heightCm: 185,
          heightVisible: true,
        },
      },
    });
    assert.equal(setTrueRes.statusCode, 200);
    assert.equal(setTrueRes.json().ok, true);
    assert.equal(setTrueRes.json().profile.height_visible, true);

    // Other user (User B) now sees 185
    const profileBRes1 = await app.inject({
      method: 'GET',
      url: `/profiles/${userA.id}`,
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(profileBRes1.statusCode, 200);
    assert.equal(profileBRes1.json().height_cm, 185, 'Other user must see height_cm when height_visible is true');
    assert.equal(profileBRes1.json().height_visible, null);

    // User A sets heightVisible back to false
    const setFalseRes = await app.inject({
      method: 'POST',
      url: '/rpc/hoopup_save_profile',
      headers: { Authorization: `Bearer ${tokenA}` },
      payload: {
        p_input: {
          displayName: 'Alice Champion',
          heightCm: 185,
          heightVisible: false,
        },
      },
    });
    assert.equal(setFalseRes.statusCode, 200);
    assert.equal(setFalseRes.json().ok, true);
    assert.equal(setFalseRes.json().profile.height_visible, false);

    // Other user (User B) sees null again
    const profileBRes2 = await app.inject({
      method: 'GET',
      url: `/profiles/${userA.id}`,
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(profileBRes2.statusCode, 200);
    assert.equal(profileBRes2.json().height_cm, null, 'Other user must see height_cm hidden again');
  });

  // Test 3: update without the key keeps the stored flag
  test('3. update without the key keeps the stored flag (save with true, save again without key, still visible)', async () => {
    // 1. Save with heightVisible: true
    const saveTrueRes = await app.inject({
      method: 'POST',
      url: '/rpc/hoopup_save_profile',
      headers: { Authorization: `Bearer ${tokenA}` },
      payload: {
        p_input: {
          displayName: 'Alice Visible',
          heightCm: 188,
          heightVisible: true,
        },
      },
    });
    assert.equal(saveTrueRes.statusCode, 200);
    assert.equal(saveTrueRes.json().profile.height_visible, true);

    // 2. Save again without the heightVisible key (e.g. updating display name and skill level)
    const updateRes = await app.inject({
      method: 'POST',
      url: '/rpc/hoopup_save_profile',
      headers: { Authorization: `Bearer ${tokenA}` },
      payload: {
        p_input: {
          displayName: 'Alice Updated Name',
          skillLevel: 'competitive',
          heightCm: 188,
        },
      },
    });
    assert.equal(updateRes.statusCode, 200);
    assert.equal(updateRes.json().ok, true);
    assert.equal(updateRes.json().profile.height_visible, true, 'Stored flag must remain true on omitted key');

    // 3. User B still sees height 188
    const profileBRes = await app.inject({
      method: 'GET',
      url: `/profiles/${userA.id}`,
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(profileBRes.statusCode, 200);
    assert.equal(profileBRes.json().height_cm, 188);

    // 4. Owner reads profile and /auth/me -> still visible: true
    const meRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(meRes.statusCode, 200);
    assert.equal(meRes.json().profile.height_visible, true);
  });

  // Test 4: invalid values ("yes", 1, null, an object) are rejected and do not change the row
  test('4. invalid values ("yes", 1, null, an object) are rejected by the function and do not change the row', async () => {
    const invalidValues = ['yes', 1, null, { enabled: true }, [true]];

    for (const invalidVal of invalidValues) {
      const res = await app.inject({
        method: 'POST',
        url: '/rpc/hoopup_save_profile',
        headers: { Authorization: `Bearer ${tokenA}` },
        payload: {
          p_input: {
            displayName: 'Alice Malicious Update',
            heightVisible: invalidVal,
          },
        },
      });
      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.equal(body.ok, false, `Expected rejection for invalid value: ${JSON.stringify(invalidVal)}`);
      assert.equal(body.code, 'invalid_input');
    }

    // Verify row was not modified: display_name and height_visible are unchanged
    const meRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(meRes.statusCode, 200);
    assert.equal(meRes.json().profile.display_name, 'Alice Updated Name');
    assert.equal(meRes.json().profile.height_visible, true);
    assert.equal(meRes.json().profile.height_cm, 188);
  });

  // Test 5: a user cannot change another user's flag
  test('5. a user cannot change another user\'s flag (RPC acts on caller only; attempt fails or has no effect)', async () => {
    // Current User B status: height_visible is false by default
    const meBBefore = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(meBBefore.json().profile.height_visible, false);

    // User A attempts to provide target id/userId in RPC payload to modify User B
    const tamperIdRes = await app.inject({
      method: 'POST',
      url: '/rpc/hoopup_save_profile',
      headers: { Authorization: `Bearer ${tokenA}` },
      payload: {
        p_input: {
          id: userB.id,
          displayName: 'Bob Hijacked',
          heightVisible: true,
        },
      },
    });
    assert.equal(tamperIdRes.statusCode, 200);
    assert.equal(tamperIdRes.json().ok, false);
    assert.equal(tamperIdRes.json().code, 'invalid_input');

    const tamperUserIdRes = await app.inject({
      method: 'POST',
      url: '/rpc/hoopup_save_profile',
      headers: { Authorization: `Bearer ${tokenA}` },
      payload: {
        p_input: {
          userId: userB.id,
          displayName: 'Bob Hijacked',
          heightVisible: true,
        },
      },
    });
    assert.equal(tamperUserIdRes.statusCode, 200);
    assert.equal(tamperUserIdRes.json().ok, false);
    assert.equal(tamperUserIdRes.json().code, 'invalid_input');

    // Normal RPC call by User A only affects User A
    const normalRes = await app.inject({
      method: 'POST',
      url: '/rpc/hoopup_save_profile',
      headers: { Authorization: `Bearer ${tokenA}` },
      payload: {
        p_input: {
          displayName: 'Alice Champion',
          heightVisible: false,
        },
      },
    });
    assert.equal(normalRes.statusCode, 200);
    assert.equal(normalRes.json().profile.id, userA.id);

    // Verify User B was completely unaffected
    const meBAfter = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(meBAfter.json().profile.display_name, 'Bob Defender');
    assert.equal(meBAfter.json().profile.height_visible, false);
  });

  // Test 6: unauthenticated and anon cannot read profiles or call the function
  test('6. unauthenticated and anon cannot read profiles or call the function', async () => {
    // 1. HTTP GET /profiles/:userId without token
    const unauthGetRes = await app.inject({
      method: 'GET',
      url: `/profiles/${userA.id}`,
    });
    assert.equal(unauthGetRes.statusCode, 401);

    // 2. HTTP POST /rpc/hoopup_save_profile without token
    const unauthRpcRes = await app.inject({
      method: 'POST',
      url: '/rpc/hoopup_save_profile',
      payload: { p_input: { displayName: 'Ghost' } },
    });
    assert.equal(unauthRpcRes.statusCode, 401);

    // 3. PostgreSQL direct call as role 'anon' cannot execute public.hoopup_save_profile
    assert.throws(
      () => {
        pgInstance.runSql("SET ROLE anon; SELECT public.hoopup_save_profile('{}'::jsonb);");
      },
      /permission denied/,
      'anon role must not have permission to execute public.hoopup_save_profile'
    );

    // 4. PostgreSQL direct call as role 'anon' cannot execute hoopup_private.save_profile
    assert.throws(
      () => {
        pgInstance.runSql("SET ROLE anon; SELECT hoopup_private.save_profile('{}'::jsonb);");
      },
      /permission denied/,
      'anon role must not have permission to execute hoopup_private.save_profile'
    );

    // 5. PostgreSQL direct SELECT on public.profiles as role 'anon' is denied
    assert.throws(
      () => {
        pgInstance.runSql('SET ROLE anon; SELECT * FROM public.profiles;');
      },
      /permission denied/,
      'anon role must not have permission to read public.profiles'
    );
  });

  // Test 7: existing profile behaviour unchanged (all other fields returned, SELECT * absent: temp-column trick)
  test('7. existing profile behaviour unchanged (all other fields returned, SELECT * absent: temp-column trick)', async () => {
    // Check all required profile columns are returned by GET /profiles/:userId
    const profileRes = await app.inject({
      method: 'GET',
      url: `/profiles/${userA.id}`,
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(profileRes.statusCode, 200);
    const profile = profileRes.json();
    assert.equal(profile.id, userA.id);
    assert.equal(profile.display_name, 'Alice Champion');
    assert.equal(profile.skill_level, 'casual');
    assert.equal(profile.plays_any_position, true);
    assert.equal(typeof profile.height_visible, 'boolean');
    assert.ok('created_at' in profile);
    assert.ok('updated_at' in profile);

    // Temporary sensitive column trick from SEC2 test 5.1
    pgInstance.runSql(
      "ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS temp_secret_national_id text DEFAULT '1-2345-67890-12-3';"
    );

    try {
      // 1. GET /profiles/:userId as owner
      const ownProfileRes = await app.inject({
        method: 'GET',
        url: `/profiles/${userA.id}`,
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(ownProfileRes.statusCode, 200);
      assert.equal(
        ownProfileRes.json().temp_secret_national_id,
        undefined,
        'Temp column must not leak in /profiles/:userId for owner'
      );

      // 2. GET /profiles/:userId as other user
      const otherProfileRes = await app.inject({
        method: 'GET',
        url: `/profiles/${userA.id}`,
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      assert.equal(otherProfileRes.statusCode, 200);
      assert.equal(
        otherProfileRes.json().temp_secret_national_id,
        undefined,
        'Temp column must not leak in /profiles/:userId for other user'
      );

      // 3. GET /auth/me
      const meRes = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(meRes.statusCode, 200);
      assert.equal(
        meRes.json().profile.temp_secret_national_id,
        undefined,
        'Temp column must not leak in /auth/me profile'
      );
    } finally {
      pgInstance.runSql('ALTER TABLE public.profiles DROP COLUMN IF EXISTS temp_secret_national_id;');
    }
  });

  // Test 8: migration 006 is idempotent: applying it twice does not fail
  test('8. migration 006 is idempotent: applying it twice does not fail', async () => {
    const migration006 = path.join(SERVER_DIR, 'sql', '006_height_visibility.sql');

    // Run migration a second time directly on the active PostgreSQL instance
    assert.doesNotThrow(() => {
      pgInstance.runSqlFile(migration006);
    }, 'Applying migration 006 a second time must succeed without errors');

    // Run migration a third time to be doubly certain
    assert.doesNotThrow(() => {
      pgInstance.runSqlFile(migration006);
    }, 'Applying migration 006 a third time must succeed without errors');

    // Verify system continues to operate properly
    const profileRes = await app.inject({
      method: 'GET',
      url: `/profiles/${userA.id}`,
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(profileRes.statusCode, 200);
    assert.equal(profileRes.json().id, userA.id);
    assert.equal(typeof profileRes.json().height_visible, 'boolean');
  });
});

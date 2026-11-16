import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import existsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { PlacesIndex } from '../src/routes/places.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_DIR = path.resolve(__dirname, '..');
const REAL_PLACES_FILE = path.join(SERVER_DIR, 'data', 'places-bangkok.ndjson');

describe('HoopUp MAP6b Places Route Test Suite', () => {
  let tempDir;
  let testPlacesFile;
  let missingPlacesFile;
  let app;
  let baseUrl;

  // Test fixture dataset
  const testPlaces = [
    { i: 'place-01-food', n: 'Siam Noodle Express', c: 'restaurant', x: 100.530000, y: 13.740000, f: 0.95 },
    { i: 'place-02-food', n: 'Siam Cafe Corner', c: 'cafe', x: 100.531000, y: 13.741000, f: 0.80 },
    { i: 'place-03-food', n: 'Siam Fast Burger', c: 'fast_food_restaurant', x: 100.532000, y: 13.742000, f: 0.70 },
    { i: 'place-04-shop', n: 'Siam Paragon Mall', c: 'shopping_mall', x: 100.534000, y: 13.746000, f: 0.99 },
    { i: 'place-05-shop', n: '7-Eleven Siam Square', c: 'convenience_store', x: 100.533000, y: 13.743000, f: 0.85 },
    { i: 'place-06-sports', n: 'National Stadium Gym', c: 'gym', x: 100.528000, y: 13.744000, f: 0.92 },
    { i: 'place-07-sports', n: 'Nimibutr Sports Arena', c: 'stadium', x: 100.529000, y: 13.745000, f: 0.88 },
    { i: 'place-08-parking', n: 'Siam Square Parking Block', c: 'parking', x: 100.532500, y: 13.743500, f: 0.75 },
    { i: 'place-09-transport', n: 'BTS Siam Station', c: 'light_rail_and_subway_station', x: 100.534500, y: 13.745500, f: 0.98 },
    { i: 'place-10-health', n: 'Police General Hospital', c: 'hospital', x: 100.539000, y: 13.743000, f: 0.91 },
    { i: 'place-11-education', n: 'Chulalongkorn University', c: 'college_university', x: 100.531000, y: 13.737000, f: 0.96 },
    { i: 'place-12-lodging', n: 'Novotel Siam Square Hotel', c: 'hotel', x: 100.533500, y: 13.744500, f: 0.89 },
    // Boundary test points
    { i: 'place-13-boundary', n: 'Exact Boundary Landmark', c: 'restaurant', x: 100.530000, y: 13.740000, f: 0.77 },
    { i: 'place-14-inside', n: 'Inside Box Landmark', c: 'cafe', x: 100.534999, y: 13.744999, f: 0.76 },
    { i: 'place-15-outside', n: 'Outside Box Landmark', c: 'cafe', x: 100.535001, y: 13.744999, f: 0.74 },
  ];

  before(async () => {
    // 1. Create isolated OS temp directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hoopup-places-test-'));
    testPlacesFile = path.join(tempDir, 'places-test.ndjson');
    missingPlacesFile = path.join(tempDir, 'nonexistent.ndjson');

    // 2. Write NDJSON test fixture
    const ndjsonContent = testPlaces.map((p) => JSON.stringify(p)).join('\n') + '\n';
    await fs.writeFile(testPlacesFile, ndjsonContent, 'utf8');

    // 3. Build test Fastify app
    const jwtSecret = 'test_jwt_secret_places_route_32chars_long!';
    process.env.JWT_SECRET = jwtSecret;

    app = buildApp({
      jwtSecret,
      placesFile: testPlacesFile,
      allowedOrigins: 'http://localhost:5173,http://localhost:5199',
      placesRateLimitMax: 50,
      logger: false,
    });

    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    if (app) {
      await app.close();
    }
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  test('1. Bbox filtering correctness and cell boundary containment', async () => {
    // Query box containing Siam center landmarks
    const minLon = 100.528;
    const minLat = 13.738;
    const maxLon = 100.535;
    const maxLat = 13.745;

    const res = await fetch(`${baseUrl}/places?bbox=${minLon},${minLat},${maxLon},${maxLat}`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.ok(Array.isArray(body.places));
    assert.ok(typeof body.total === 'number');
    assert.equal(body.truncated, false);

    // All returned places must lie strictly within [minLon, maxLon] and [minLat, maxLat]
    for (const p of body.places) {
      assert.ok(p.x >= minLon && p.x <= maxLon, `Lon ${p.x} out of [${minLon}, ${maxLon}]`);
      assert.ok(p.y >= minLat && p.y <= maxLat, `Lat ${p.y} out of [${minLat}, ${maxLat}]`);
      assert.ok(p.i, 'Place must have id i');
      assert.ok(p.n, 'Place must have name n');
      assert.ok(p.c, 'Place must have category c');
      assert.ok(p.g, 'Place must have group g');
    }

    // Boundary check: place-14-inside (100.534999) must be present, place-15-outside (100.535001) must NOT
    const ids = body.places.map((p) => p.i);
    assert.ok(ids.includes('place-14-inside'), 'place-14-inside should be matched');
    assert.ok(!ids.includes('place-15-outside'), 'place-15-outside should NOT be matched');
  });

  test('2. Limit and truncation order (highest confidence first, stable)', async () => {
    // Box covers many places, set limit = 3
    const res = await fetch(
      `${baseUrl}/places?bbox=100.525,13.735,100.540,13.750&limit=3`
    );
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.ok(body.total > 3, `Expected total > 3, got ${body.total}`);
    assert.equal(body.truncated, true);
    assert.equal(body.places.length, 3);

    // Confidence values must be descending: highest confidence first
    // In our test fixture: place-04-shop (0.99), place-09-transport (0.98), place-11-education (0.96)
    assert.equal(body.places[0].i, 'place-04-shop');
    assert.equal(body.places[1].i, 'place-09-transport');
    assert.equal(body.places[2].i, 'place-11-education');

    // Verify properties format {i, n, c, g, x, y}
    assert.deepEqual(Object.keys(body.places[0]).sort(), ['c', 'g', 'i', 'n', 'x', 'y'].sort());
  });

  test('3. Cats filter (single, multiple, all groups)', async () => {
    // 3a. Single category group: sports
    const resSports = await fetch(
      `${baseUrl}/places?bbox=100.525,13.735,100.540,13.750&cats=sports`
    );
    assert.equal(resSports.status, 200);
    const bodySports = await resSports.json();
    assert.ok(bodySports.places.length >= 2);
    for (const p of bodySports.places) {
      assert.equal(p.g, 'sports');
    }

    // 3b. Multiple category groups: food,shop
    const resMulti = await fetch(
      `${baseUrl}/places?bbox=100.525,13.735,100.540,13.750&cats=food,shop`
    );
    assert.equal(resMulti.status, 200);
    const bodyMulti = await resMulti.json();
    assert.ok(bodyMulti.places.length >= 4);
    for (const p of bodyMulti.places) {
      assert.ok(p.g === 'food' || p.g === 'shop', `Unexpected group: ${p.g}`);
    }

    // 3c. Without cats: returns diverse groups
    const resAll = await fetch(
      `${baseUrl}/places?bbox=100.525,13.735,100.540,13.750&limit=50`
    );
    assert.equal(resAll.status, 200);
    const bodyAll = await resAll.json();
    const groups = new Set(bodyAll.places.map((p) => p.g));
    assert.ok(groups.size >= 4, `Expected at least 4 groups, found: ${groups.size}`);
  });

  test('4. Strict 400 validation: invalid, inverted, oversize, out-of-Bangkok, injection strings', async () => {
    const invalidQueries = [
      // Missing bbox
      '',
      // Incomplete coordinates
      'bbox=100.52,13.74',
      // NaN coordinates
      'bbox=NaN,13.74,100.54,13.76',
      'bbox=100.52,abc,100.54,13.76',
      // Infinity / -Infinity
      'bbox=Infinity,13.74,100.54,13.76',
      'bbox=100.52,-Infinity,100.54,13.76',
      // Inverted bbox
      'bbox=100.54,13.74,100.52,13.76',
      'bbox=100.52,13.76,100.54,13.74',
      // Oversize bbox (> 0.06 deg span)
      'bbox=100.50,13.70,100.57,13.70',
      'bbox=100.50,13.70,100.50,13.77',
      // Out of Bangkok bounds
      'bbox=99.00,12.00,99.02,12.02',
      'bbox=102.00,15.00,102.02,15.02',
      // Unknown category groups
      'bbox=100.52,13.74,100.54,13.76&cats=unknown_group',
      'bbox=100.52,13.74,100.54,13.76&cats=food,,shop',
      'bbox=100.52,13.74,100.54,13.76&cats=',
      // Limit 0 or 501 or float
      'bbox=100.52,13.74,100.54,13.76&limit=0',
      'bbox=100.52,13.74,100.54,13.76&limit=501',
      'bbox=100.52,13.74,100.54,13.76&limit=-5',
      'bbox=100.52,13.74,100.54,13.76&limit=25.5',
      'bbox=100.52,13.74,100.54,13.76&limit=three',
      // Injection strings
      "bbox=100.52,13.74,100.54,13.76' OR '1'='1",
      'bbox=100.52,13.74,100.54,13.76&cats=<script>alert(1)</script>',
      'bbox=100.52,13.74,100.54,13.76&cats={"$gt":""}',
      'bbox=100.52,13.74,100.54,13.76&limit=10;DROP TABLE users;',
    ];

    for (const q of invalidQueries) {
      const url = q ? `${baseUrl}/places?${q}` : `${baseUrl}/places`;
      const res = await fetch(url);
      assert.equal(res.status, 400, `Query "${q}" should return 400, got ${res.status}`);
      const body = await res.json();
      assert.ok(body.error, `Query "${q}" should return { error: ... }`);
    }
  });

  test('5. Caching headers, ETag and 304 on If-None-Match', async () => {
    const url = `${baseUrl}/places?bbox=100.528,13.738,100.535,13.745`;
    const res1 = await fetch(url);
    assert.equal(res1.status, 200);

    const etag = res1.headers.get('etag');
    const cacheControl = res1.headers.get('cache-control');
    assert.ok(etag, 'Response must include ETag header');
    assert.equal(cacheControl, 'public, max-age=300');

    // Send conditional request with matching ETag
    const res2 = await fetch(url, {
      headers: { 'If-None-Match': etag },
    });
    assert.equal(res2.status, 304);
    const body2 = await res2.text();
    assert.equal(body2, '', '304 body must be empty');
  });

  test('6. CORS headers for allowed vs unknown origin', async () => {
    const url = `${baseUrl}/places?bbox=100.528,13.738,100.535,13.745`;

    // 6a. Allowed origin
    const resAllowed = await fetch(url, {
      headers: { Origin: 'http://localhost:5173' },
    });
    assert.equal(resAllowed.status, 200);
    assert.equal(resAllowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.ok(
      resAllowed.headers.get('access-control-expose-headers')?.includes('ETag'),
      'Must expose ETag header to client'
    );

    // 6b. Unknown origin
    const resUnknown = await fetch(url, {
      headers: { Origin: 'http://evil.com' },
    });
    assert.equal(resUnknown.status, 200);
    assert.equal(resUnknown.headers.get('access-control-allow-origin'), null);
  });

  test('7. Route rate limiter trips after exceeding max limit (separate bucket)', async () => {
    // Dedicated app with small rate limit max = 3
    const rateApp = buildApp({
      jwtSecret: 'test_jwt_secret_places_rate_32chars!',
      placesFile: testPlacesFile,
      placesRateLimitMax: 3,
      placesRateLimitWindowMs: 60000,
      logger: false,
    });
    await rateApp.listen({ port: 0, host: '127.0.0.1' });
    const rateBaseUrl = `http://127.0.0.1:${rateApp.server.address().port}`;

    try {
      const url = `${rateBaseUrl}/places?bbox=100.528,13.738,100.535,13.745`;

      // 3 allowed calls
      for (let i = 0; i < 3; i++) {
        const res = await fetch(url);
        assert.equal(res.status, 200);
      }

      // 4th call trips rate limit -> 429
      const resTripped = await fetch(url);
      assert.equal(resTripped.status, 429);
      assert.ok(resTripped.headers.get('retry-after'));
      const bodyTripped = await resTripped.json();
      assert.equal(bodyTripped.error, 'Too many requests, please try again later');

      // Regression check: /health still answers 200
      const resHealth = await fetch(`${rateBaseUrl}/health`);
      assert.equal(resHealth.status, 200);

      // Regression check: credential limiter is independent (remains untouched by /places hits)
      assert.equal(rateApp.rateLimiter.hits.has('127.0.0.1'), false);
      assert.equal(rateApp.placesRateLimiter.hits.has('127.0.0.1'), true);

      // Regression check: /rpc/hoopup_get_session without token still returns 401
      const resRpc = await fetch(`${rateBaseUrl}/rpc/hoopup_get_session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_session_id: '123' }),
      });
      assert.equal(resRpc.status, 401);
    } finally {
      await rateApp.close();
    }
  });

  test('8. Missing data file returns generic 503 without leaking paths', async () => {
    const missingApp = buildApp({
      jwtSecret: 'test_jwt_secret_places_missing_32chars!',
      placesFile: missingPlacesFile,
      logger: false,
    });
    await missingApp.listen({ port: 0, host: '127.0.0.1' });
    const missingBaseUrl = `http://127.0.0.1:${missingApp.server.address().port}`;

    try {
      const res = await fetch(`${missingBaseUrl}/places?bbox=100.528,13.738,100.535,13.745`);
      assert.equal(res.status, 503);
      const body = await res.json();
      assert.equal(body.error, 'Places data service unavailable');
      const text = JSON.stringify(body);
      assert.ok(!text.includes(tempDir), 'Must not leak file system paths');
      assert.ok(!text.includes('stack'), 'Must not leak stack traces');
    } finally {
      await missingApp.close();
    }
  });

  test('9. Real data file performance test: 200 dense Siam bboxes with p95 < 50ms and max < 250ms', async () => {
    if (!existsSync.existsSync(REAL_PLACES_FILE)) {
      console.log('Skipping performance test: real data file not found at', REAL_PLACES_FILE);
      return;
    }

    const realApp = buildApp({
      jwtSecret: 'test_jwt_secret_places_real_32chars!',
      placesFile: REAL_PLACES_FILE,
      placesRateLimitMax: 1000,
      logger: false,
    });
    await realApp.listen({ port: 0, host: '127.0.0.1' });
    const realBaseUrl = `http://127.0.0.1:${realApp.server.address().port}`;

    try {
      // Warm-up query (triggers lazy index build into memory)
      const tWarm0 = performance.now();
      const resWarm = await fetch(
        `${realBaseUrl}/places?bbox=100.525,13.735,100.540,13.750&limit=5`
      );
      const tWarm = performance.now() - tWarm0;
      assert.equal(resWarm.status, 200);
      const warmBody = await resWarm.json();
      assert.ok(warmBody.places.length > 0);
      console.log(`\n[Perf] Real data warm-up completed in ${tWarm.toFixed(1)}ms (${warmBody.total} places in warm-up bbox)`);

      // 200 random dense bboxes around Siam (Lon 100.525..100.545, Lat 13.735..13.755)
      const timings = [];
      const queryCount = 200;

      for (let i = 0; i < queryCount; i++) {
        // Random center around Siam
        const centerLon = 100.525 + Math.random() * 0.020;
        const centerLat = 13.735 + Math.random() * 0.020;
        const halfSpan = 0.005 + Math.random() * 0.015; // Span between 0.01 and 0.04 deg

        const minLon = Number((centerLon - halfSpan).toFixed(6));
        const maxLon = Number((centerLon + halfSpan).toFixed(6));
        const minLat = Number((centerLat - halfSpan).toFixed(6));
        const maxLat = Number((centerLat + halfSpan).toFixed(6));

        const t0 = performance.now();
        const res = await fetch(
          `${realBaseUrl}/places?bbox=${minLon},${minLat},${maxLon},${maxLat}&limit=300`
        );
        const elapsed = performance.now() - t0;
        assert.equal(res.status, 200);
        timings.push(elapsed);
      }

      timings.sort((a, b) => a - b);
      const min = timings[0];
      const max = timings[timings.length - 1];
      const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
      const p50 = timings[Math.floor(timings.length * 0.50)];
      const p90 = timings[Math.floor(timings.length * 0.90)];
      const p95 = timings[Math.floor(timings.length * 0.95)];
      const p99 = timings[Math.floor(timings.length * 0.99)];

      console.log('='.repeat(60));
      console.log(`REAL PLACES BENCHMARK (200 random dense Siam queries):`);
      console.log(`  Min:  ${min.toFixed(2)} ms`);
      console.log(`  Avg:  ${avg.toFixed(2)} ms`);
      console.log(`  p50:  ${p50.toFixed(2)} ms`);
      console.log(`  p90:  ${p90.toFixed(2)} ms`);
      console.log(`  p95:  ${p95.toFixed(2)} ms (requirement: < 50 ms)`);
      console.log(`  p99:  ${p99.toFixed(2)} ms`);
      console.log(`  Max:  ${max.toFixed(2)} ms (requirement: < 250 ms)`);
      console.log('='.repeat(60));

      assert.ok(p95 < 50, `p95 latency (${p95.toFixed(2)}ms) must be < 50ms`);
      assert.ok(max < 250, `max latency (${max.toFixed(2)}ms) must be < 250ms`);
    } finally {
      await realApp.close();
    }
  });
});

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import existsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { PlacesSearchIndex } from '../src/routes/placesSearch.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_DIR = path.resolve(__dirname, '..');
const REAL_PLACES_FILE = path.join(SERVER_DIR, 'data', 'places-bangkok.ndjson');

describe('HoopUp MAP7a Places Search Route Test Suite', () => {
  let tempDir;
  let testPlacesFile;
  let missingPlacesFile;
  let app;
  let baseUrl;

  // Test fixture dataset designed to test ranking, Thai substrings, distances, and categories
  const testPlaces = [
    // Ranking test fixtures for query "siam":
    // Tier 1: exact name
    { i: 'place-exact-siam', n: 'Siam', c: 'shopping_mall', x: 100.5340, y: 13.7460, f: 0.80 },
    // Tier 2: name starts with q
    { i: 'place-prefix-siam-paragon', n: 'Siam Paragon', c: 'shopping_mall', x: 100.5342, y: 13.7462, f: 0.95 },
    { i: 'place-prefix-siam-center', n: 'Siam Center', c: 'shopping_mall', x: 100.5330, y: 13.7455, f: 0.85 },
    // Tier 3: a word in the name starts with q
    { i: 'place-word-central-siam', n: 'Central World Siam', c: 'shopping_mall', x: 100.5390, y: 13.7465, f: 0.90 },
    { i: 'place-word-bts-siam', n: 'BTS Siam Station', c: 'light_rail_and_subway_station', x: 100.5345, y: 13.7455, f: 0.98 },
    { i: 'place-word-dash-siam', n: 'Mega-Siam Store', c: 'convenience_store', x: 100.5335, y: 13.7440, f: 0.88 },
    // Tier 4: name contains q as substring
    { i: 'place-contains-asiatique', n: 'AmazingMassiamFood', c: 'restaurant', x: 100.5310, y: 13.7410, f: 0.92 },

    // Thai places for Thai substring & ranking test
    { i: 'place-th-exact', n: 'สยาม', c: 'shopping_mall', x: 100.5340, y: 13.7460, f: 0.85 },
    { i: 'place-th-paragon', n: 'สยามพารากอน', c: 'shopping_mall', x: 100.5341, y: 13.7461, f: 0.99 },
    { i: 'place-th-bts', n: 'BTS สนามกีฬาแห่งชาติ', c: 'light_rail_and_subway_station', x: 100.5290, y: 13.7460, f: 0.96 },
    { i: 'place-th-seven', n: 'เซเว่น อีเลฟเว่น สาขาสยาม', c: 'convenience_store', x: 100.5330, y: 13.7430, f: 0.90 },
    { i: 'place-th-food', n: 'ร้านก๋วยเตี๋ยวเรือสยาม', c: 'restaurant', x: 100.5320, y: 13.7420, f: 0.82 },

    // Category filter fixtures
    { i: 'place-cat-sports-gym', n: 'National Stadium Gym Siam', c: 'gym', x: 100.5280, y: 13.7440, f: 0.91 },
    { i: 'place-cat-parking', n: 'Siam Square Parking Block', c: 'parking', x: 100.5325, y: 13.7435, f: 0.75 },
    { i: 'place-cat-health-hospital', n: 'Police General Hospital Siam', c: 'hospital', x: 100.5390, y: 13.7430, f: 0.90 },
    { i: 'place-cat-education', n: 'Chulalongkorn University Siam', c: 'college_university', x: 100.5310, y: 13.7370, f: 0.94 },
    { i: 'place-cat-lodging', n: 'Novotel Siam Square Hotel', c: 'hotel', x: 100.5335, y: 13.7445, f: 0.89 },

    // Near distance tie-break test fixtures (same tier 2, same confidence 0.90)
    { i: 'place-near-close', n: 'Siam Close Shop', c: 'convenience_store', x: 100.5341, y: 13.7461, f: 0.90 },
    { i: 'place-near-far', n: 'Siam Far Shop', c: 'convenience_store', x: 100.5400, y: 13.7500, f: 0.90 },

    // Case & NFC test fixtures
    { i: 'place-nfc-cafe', n: 'Nice Käffee Siam', c: 'cafe', x: 100.5315, y: 13.7415, f: 0.86 },
    { i: 'place-case-allcaps', n: 'SIAM DISCOVERY', c: 'shopping_mall', x: 100.5312, y: 13.7465, f: 0.88 },
  ];

  before(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hoopup-places-search-test-'));
    testPlacesFile = path.join(tempDir, 'places-search-test.ndjson');
    missingPlacesFile = path.join(tempDir, 'nonexistent.ndjson');

    const ndjsonContent = testPlaces.map((p) => JSON.stringify(p)).join('\n') + '\n';
    await fs.writeFile(testPlacesFile, ndjsonContent, 'utf8');

    const jwtSecret = 'test_jwt_secret_places_search_route_32chars!';
    process.env.JWT_SECRET = jwtSecret;

    app = buildApp({
      jwtSecret,
      placesFile: testPlacesFile,
      allowedOrigins: 'http://localhost:5173,http://localhost:5199',
      placesSearchRateLimitMax: 1000,
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

  test('1. Ranking order: exact > starts with > word starts with > contains, broken by confidence', async () => {
    const res = await fetch(`${baseUrl}/places/search?q=siam&limit=20`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.ok(Array.isArray(body.places));
    assert.ok(body.total >= 7);
    assert.equal(body.truncated, false);

    const ids = body.places.map((p) => p.i);

    // Tier 1: exact name must be FIRST, even with lower confidence (0.80) than other matches
    assert.equal(ids[0], 'place-exact-siam', 'Exact match must rank first');

    // Tier 2: name starts with q (Siam Paragon f=0.95, Siam Center f=0.85)
    const idxParagon = ids.indexOf('place-prefix-siam-paragon');
    const idxCenter = ids.indexOf('place-prefix-siam-center');
    assert.ok(idxParagon > 0, 'Siam Paragon must be present');
    assert.ok(idxCenter > 0, 'Siam Center must be present');
    assert.ok(idxParagon < idxCenter, 'Higher confidence (0.95) must precede lower confidence (0.85) within Tier 2');

    // Tier 3: word starts with q (BTS Siam Station f=0.98, Central World Siam f=0.90, Mega-Siam Store f=0.88)
    const idxBts = ids.indexOf('place-word-bts-siam');
    const idxCentral = ids.indexOf('place-word-central-siam');
    const idxMega = ids.indexOf('place-word-dash-siam');
    assert.ok(idxCenter < idxBts, 'Tier 2 (name startsWith) must precede Tier 3 (word startsWith)');
    assert.ok(idxBts < idxCentral, 'Tier 3 f=0.98 must precede Tier 3 f=0.90');
    assert.ok(idxCentral < idxMega, 'Tier 3 f=0.90 must precede Tier 3 f=0.88');

    // Tier 4: substring contains (AmazingMassiamFood f=0.92)
    const idxContains = ids.indexOf('place-contains-asiatique');
    assert.ok(idxContains > idxMega, 'Tier 3 must precede Tier 4 substring match');

    // Verify properties of returned places: {i, n, c, g, x, y}
    for (const p of body.places) {
      assert.ok(p.i, 'Must have id');
      assert.ok(p.n, 'Must have name');
      assert.ok(p.c, 'Must have category');
      assert.ok(p.g, 'Must have category group');
      assert.ok(typeof p.x === 'number', 'Must have x coord');
      assert.ok(typeof p.y === 'number', 'Must have y coord');
      assert.equal(p.d, undefined, 'd must not be included when near is omitted');
    }
  });

  test('2. Thai substring matching inside unspaced Thai strings', async () => {
    // 2a. Query "พารากอน" inside "สยามพารากอน" (unspaced Thai substring)
    const resParagon = await fetch(
      `${baseUrl}/places/search?q=${encodeURIComponent('พารากอน')}`
    );
    assert.equal(resParagon.status, 200);
    const bodyParagon = await resParagon.json();
    assert.ok(bodyParagon.places.some((p) => p.i === 'place-th-paragon'));
    assert.equal(bodyParagon.places[0].n, 'สยามพารากอน');

    // 2b. Query "สนามกีฬา" inside "BTS สนามกีฬาแห่งชาติ"
    const resStadium = await fetch(
      `${baseUrl}/places/search?q=${encodeURIComponent('สนามกีฬา')}`
    );
    assert.equal(resStadium.status, 200);
    const bodyStadium = await resStadium.json();
    assert.ok(bodyStadium.places.some((p) => p.i === 'place-th-bts'));

    // 2c. Query "เซเว่น"
    const resSeven = await fetch(
      `${baseUrl}/places/search?q=${encodeURIComponent('เซเว่น')}`
    );
    assert.equal(resSeven.status, 200);
    const bodySeven = await resSeven.json();
    assert.ok(bodySeven.places.some((p) => p.i === 'place-th-seven'));

    // 2d. Query Thai "สยาม": exact "สยาม" (Tier 1) > "สยามพารากอน" (Tier 2) > "ร้านก๋วยเตี๋ยวเรือสยาม" (Tier 4)
    const resSiamTh = await fetch(
      `${baseUrl}/places/search?q=${encodeURIComponent('สยาม')}`
    );
    assert.equal(resSiamTh.status, 200);
    const bodySiamTh = await resSiamTh.json();
    const thIds = bodySiamTh.places.map((p) => p.i);
    const idxExact = thIds.indexOf('place-th-exact');
    const idxPrefix = thIds.indexOf('place-th-paragon');
    const idxSub = thIds.indexOf('place-th-food');
    assert.ok(idxExact !== -1 && idxPrefix !== -1 && idxSub !== -1);
    assert.ok(idxExact < idxPrefix, 'Thai exact must rank before Thai startsWith');
    assert.ok(idxPrefix < idxSub, 'Thai startsWith must rank before Thai substring contains');
  });

  test('3. Case-insensitivity and Unicode NFC folding', async () => {
    // 3a. Uppercase query "SIAM" matches lowercase/mixed "Siam"
    const resUpper = await fetch(`${baseUrl}/places/search?q=SIAM`);
    assert.equal(resUpper.status, 200);
    const bodyUpper = await resUpper.json();
    assert.ok(bodyUpper.places.length > 0);
    assert.equal(bodyUpper.places[0].i, 'place-exact-siam');

    // 3b. Lowercase query matches ALLCAPS "SIAM DISCOVERY"
    const resDisc = await fetch(`${baseUrl}/places/search?q=siam%20discovery`);
    assert.equal(resDisc.status, 200);
    const bodyDisc = await resDisc.json();
    assert.ok(bodyDisc.places.some((p) => p.i === 'place-case-allcaps'));

    // 3c. Decomposed Unicode NFD query matches precomposed NFC in data ("Käffee")
    // 'a' + U+0308 (combining diaeresis) vs 'ä' (U+00E4)
    const decomposedKaffee = 'Nice K\u0061\u0308ffee';
    const resNfc = await fetch(
      `${baseUrl}/places/search?q=${encodeURIComponent(decomposedKaffee)}`
    );
    assert.equal(resNfc.status, 200);
    const bodyNfc = await resNfc.json();
    assert.ok(bodyNfc.places.some((p) => p.i === 'place-nfc-cafe'));
  });

  test('4. Limit and truncation handling', async () => {
    // 4a. Default limit = 10
    const resDefault = await fetch(`${baseUrl}/places/search?q=siam`);
    assert.equal(resDefault.status, 200);
    const bodyDefault = await resDefault.json();
    assert.ok(bodyDefault.total > 10);
    assert.equal(bodyDefault.places.length, 10);
    assert.equal(bodyDefault.truncated, true);

    // 4b. Explicit limit = 3
    const res3 = await fetch(`${baseUrl}/places/search?q=siam&limit=3`);
    assert.equal(res3.status, 200);
    const body3 = await res3.json();
    assert.equal(body3.places.length, 3);
    assert.equal(body3.truncated, true);

    // 4c. Limit = 20 (covers all test items)
    const res20 = await fetch(`${baseUrl}/places/search?q=siam&limit=20`);
    assert.equal(res20.status, 200);
    const body20 = await res20.json();
    assert.equal(body20.truncated, false);
    assert.equal(body20.places.length, body20.total);
  });

  test('5. Near ordering and distance calculation (d in metres, rounded)', async () => {
    // Center point near Siam Paragon: (100.534, 13.746)
    const res = await fetch(
      `${baseUrl}/places/search?q=siam&near=100.534,13.746&limit=20`
    );
    assert.equal(res.status, 200);
    const body = await res.json();

    // All returned items must include property 'd' as a rounded integer
    for (const p of body.places) {
      assert.ok(typeof p.d === 'number', 'Every hit must have numeric distance d');
      assert.equal(Number.isInteger(p.d), true, 'Distance d must be rounded to integer');
      assert.ok(p.d >= 0, 'Distance d must be non-negative');
    }

    // Between place-near-close and place-near-far:
    // Both are Tier 2 (startsWith "Siam"), both have f = 0.90
    // Close is ~14m away, Far is ~790m away -> Close MUST precede Far
    const ids = body.places.map((p) => p.i);
    const idxClose = ids.indexOf('place-near-close');
    const idxFar = ids.indexOf('place-near-far');
    assert.ok(idxClose !== -1 && idxFar !== -1);
    assert.ok(idxClose < idxFar, 'Closer place must precede farther place when tier and confidence are tied');

    const placeClose = body.places[idxClose];
    const placeFar = body.places[idxFar];
    assert.ok(placeClose.d < 50, `Expected close distance < 50m, got ${placeClose.d}`);
    assert.ok(placeFar.d > 500, `Expected far distance > 500m, got ${placeFar.d}`);
  });

  test('6. Cats filter (single and multiple category groups)', async () => {
    // 6a. Single group: sports
    const resSports = await fetch(`${baseUrl}/places/search?q=siam&cats=sports`);
    assert.equal(resSports.status, 200);
    const bodySports = await resSports.json();
    assert.ok(bodySports.places.length >= 1);
    for (const p of bodySports.places) {
      assert.equal(p.g, 'sports');
    }

    // 6b. Multiple groups: food,health
    const resMulti = await fetch(`${baseUrl}/places/search?q=siam&cats=food,health`);
    assert.equal(resMulti.status, 200);
    const bodyMulti = await resMulti.json();
    assert.ok(bodyMulti.places.length >= 2);
    for (const p of bodyMulti.places) {
      assert.ok(p.g === 'food' || p.g === 'health', `Unexpected group: ${p.g}`);
    }
  });

  test('7. Strict 400 validation: missing/short/long q, control chars, near, limit, cats, repeated params', async () => {
    const invalidQueries = [
      // Missing q
      '',
      'limit=5',
      // Empty or whitespace-only q
      'q=',
      'q=%20%20%20',
      // q length < 2
      'q=a',
      'q=%20b%20',
      // q length > 60
      `q=${'a'.repeat(61)}`,
      // Control characters in q
      'q=siam%00evil',
      'q=siam%1Fcontrol',
      'q=siam%7Fdel',
      'q=siam%0Anewline',
      'q=siam%09tab',
      // Invalid near: format, non-numbers, empty components
      'q=siam&near=100.534',
      'q=siam&near=100.534,13.746,10.0',
      'q=siam&near=100.534,',
      'q=siam&near=,13.746',
      'q=siam&near=abc,13.746',
      'q=siam&near=100.534,abc',
      'q=siam&near=NaN,13.746',
      'q=siam&near=100.534,Infinity',
      // Out of Bangkok bbox +- padding (QUERY_BOUNDS: 100.25..101.00, 13.45..14.15)
      'q=siam&near=100.20,13.746',
      'q=siam&near=101.05,13.746',
      'q=siam&near=100.534,13.40',
      'q=siam&near=100.534,14.20',
      // Invalid limit: 0, 21, negative, float, string
      'q=siam&limit=0',
      'q=siam&limit=21',
      'q=siam&limit=-5',
      'q=siam&limit=10.5',
      'q=siam&limit=three',
      // Unknown or empty category groups
      'q=siam&cats=',
      'q=siam&cats=unknown_group',
      'q=siam&cats=food,,shop',
      'q=siam&cats=sports,fake_category',
      // Repeated parameters
      'q=siam&q=paragon',
      'q=siam&limit=5&limit=10',
      'q=siam&near=100.534,13.746&near=100.534,13.746',
      'q=siam&cats=food&cats=shop',
    ];

    for (const q of invalidQueries) {
      const url = q ? `${baseUrl}/places/search?${q}` : `${baseUrl}/places/search`;
      const res = await fetch(url);
      assert.equal(res.status, 400, `Query "${q}" should return 400, got ${res.status}`);
      const body = await res.json();
      assert.ok(body.error, `Query "${q}" must return { error: ... }`);
    }

    // Characters like regex, SQL, HTML should be treated as literal text and return 200 without regex crashes
    const literalTextQueries = [
      'q=.*',
      'q=[a-z]+',
      'q=(siam|paragon)',
      "q=' OR '1'='1",
      'q=<script>alert(1)</script>',
      'q=7-Eleven',
      'q=Siam/Square',
    ];

    for (const q of literalTextQueries) {
      const res = await fetch(`${baseUrl}/places/search?${q}`);
      assert.equal(
        res.status,
        200,
        `Query "${q}" with regex/SQL/HTML characters should be treated as literal text and return 200`
      );
    }
  });

  test('8. Caching headers, ETag, and 304 on If-None-Match', async () => {
    const url = `${baseUrl}/places/search?q=siam&limit=5`;
    const res1 = await fetch(url);
    assert.equal(res1.status, 200);

    const etag = res1.headers.get('etag');
    const cacheControl = res1.headers.get('cache-control');
    assert.ok(etag, 'Must return ETag header');
    assert.equal(cacheControl, 'public, max-age=300');

    // Conditional request with matching ETag
    const res2 = await fetch(url, {
      headers: { 'If-None-Match': etag },
    });
    assert.equal(res2.status, 304);
    const body2 = await res2.text();
    assert.equal(body2, '', '304 body must be empty');
  });

  test('9. CORS headers for allowed vs unknown origin', async () => {
    const url = `${baseUrl}/places/search?q=siam&limit=5`;

    // 9a. Allowed origin
    const resAllowed = await fetch(url, {
      headers: { Origin: 'http://localhost:5173' },
    });
    assert.equal(resAllowed.status, 200);
    assert.equal(resAllowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.ok(
      resAllowed.headers.get('access-control-expose-headers')?.includes('ETag'),
      'Must expose ETag header'
    );

    // 9b. Unknown origin
    const resUnknown = await fetch(url, {
      headers: { Origin: 'http://evil-tracker.com' },
    });
    assert.equal(resUnknown.status, 200);
    assert.equal(resUnknown.headers.get('access-control-allow-origin'), null);
  });

  test('10. Route rate limiter trips after exceeding max on dedicated bucket (429)', async () => {
    // Dedicated app with small rate limit max = 3
    const rateApp = buildApp({
      jwtSecret: 'test_jwt_secret_places_search_rate_32!',
      placesFile: testPlacesFile,
      placesSearchRateLimitMax: 3,
      placesSearchRateLimitWindowMs: 60000,
      logger: false,
    });
    await rateApp.listen({ port: 0, host: '127.0.0.1' });
    const rateBaseUrl = `http://127.0.0.1:${rateApp.server.address().port}`;

    try {
      const url = `${rateBaseUrl}/places/search?q=siam`;

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

      // Regression checks:
      // 1. /health still answers 200
      const resHealth = await fetch(`${rateBaseUrl}/health`);
      assert.equal(resHealth.status, 200);

      // 2. Credential rate limiter remains untouched
      assert.equal(rateApp.rateLimiter.hits.has('127.0.0.1'), false);

      // 3. /places rate limiter remains untouched
      assert.equal(rateApp.placesRateLimiter.hits.has('127.0.0.1'), false);

      // 4. Search rate limiter recorded the hits
      assert.equal(rateApp.placesSearchRateLimiter.hits.has('127.0.0.1'), true);
    } finally {
      await rateApp.close();
    }
  });

  test('11. Missing data file returns generic 503 without leaking paths', async () => {
    const missingApp = buildApp({
      jwtSecret: 'test_jwt_secret_search_missing_32chars!',
      placesFile: missingPlacesFile,
      logger: false,
    });
    await missingApp.listen({ port: 0, host: '127.0.0.1' });
    const missingBaseUrl = `http://127.0.0.1:${missingApp.server.address().port}`;

    try {
      const res = await fetch(`${missingBaseUrl}/places/search?q=siam`);
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

  test('12. Real data file performance test: 200 random queries + 50 two-letter queries with p95 < 60ms and max < 250ms', async () => {
    if (!existsSync.existsSync(REAL_PLACES_FILE)) {
      console.log('Skipping performance test: real data file not found at', REAL_PLACES_FILE);
      return;
    }

    const realApp = buildApp({
      jwtSecret: 'test_jwt_secret_places_search_real_32!',
      placesFile: REAL_PLACES_FILE,
      placesSearchRateLimitMax: 1000,
      logger: false,
    });
    await realApp.listen({ port: 0, host: '127.0.0.1' });
    const realBaseUrl = `http://127.0.0.1:${realApp.server.address().port}`;

    try {
      // 1. Warm-up query (triggers lazy PlacesSearchIndex build into memory)
      const tWarm0 = performance.now();
      const resWarm = await fetch(
        `${realBaseUrl}/places/search?q=siam%20paragon&limit=3&near=100.534,13.746`
      );
      const tWarm = performance.now() - tWarm0;
      assert.equal(resWarm.status, 200);
      const warmBody = await resWarm.json();
      assert.ok(warmBody.places.length > 0);
      console.log(
        `\n[Search Perf] Real data warm-up completed in ${tWarm.toFixed(1)}ms (${warmBody.total} places matching "siam paragon")`
      );

      // Extract real names from loaded index to generate 200 realistic search terms
      const loadedNames = realApp.placesSearchIndex.normNames;
      const queries200 = [];
      for (let i = 0; i < 200; i++) {
        const name = loadedNames[Math.floor(Math.random() * loadedNames.length)];
        if (!name) continue;
        const words = name.split(' ');
        const word = words[Math.floor(Math.random() * words.length)];
        if (word && word.length >= 2) {
          const maxStart = Math.max(0, word.length - 2);
          const start = Math.floor(Math.random() * (maxStart + 1));
          const len = Math.min(word.length - start, 2 + Math.floor(Math.random() * 8));
          const sub = word.slice(start, start + len).trim();
          if (sub.length >= 2) {
            queries200.push(sub);
          }
        }
      }
      while (queries200.length < 200) {
        queries200.push('siam');
      }

      // 50 two-letter queries (Latin & Thai consonants)
      const sampleChars = 'abcdefghijklmnopqrstuvwxyzกขคงจชซดตทนบปพฟมยรลวสหอ';
      const queries50 = [];
      for (let i = 0; i < 50; i++) {
        const c1 = sampleChars[Math.floor(Math.random() * sampleChars.length)];
        const c2 = sampleChars[Math.floor(Math.random() * sampleChars.length)];
        queries50.push(c1 + c2);
      }

      const allQueries = [...queries200, ...queries50];
      const timings = [];

      for (const q of allQueries) {
        const t0 = performance.now();
        const res = await fetch(
          `${realBaseUrl}/places/search?q=${encodeURIComponent(q)}&limit=10&near=100.534,13.746`
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

      console.log('='.repeat(65));
      console.log(`REAL PLACES SEARCH BENCHMARK (250 queries: 200 real + 50 2-letter):`);
      console.log(`  Min:  ${min.toFixed(2)} ms`);
      console.log(`  Avg:  ${avg.toFixed(2)} ms`);
      console.log(`  p50:  ${p50.toFixed(2)} ms`);
      console.log(`  p90:  ${p90.toFixed(2)} ms`);
      console.log(`  p95:  ${p95.toFixed(2)} ms (target requirement: < 60 ms)`);
      console.log(`  p99:  ${p99.toFixed(2)} ms`);
      console.log(`  Max:  ${max.toFixed(2)} ms (target requirement: < 250 ms)`);
      console.log('='.repeat(65));

      assert.ok(p95 < 60, `p95 latency (${p95.toFixed(2)}ms) must be < 60ms`);
      assert.ok(max < 250, `max latency (${max.toFixed(2)}ms) must be < 250ms`);
    } finally {
      await realApp.close();
    }
  });
});

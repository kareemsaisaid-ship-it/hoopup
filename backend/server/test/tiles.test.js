import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app.js';

describe('HoopUp MAP4b Tiles Route Test Suite', () => {
  let tempDir;
  let app;
  let baseUrl;
  let fileData;
  let fileSha256;
  const fileName = 'bangkok.pmtiles';
  const fileSize = 100 * 1024; // 100 KB
  const largeFileSize = 20 * 1024 * 1024; // 20 MB

  before(async () => {
    // 1. Create isolated OS temp directory for TILES_DIR
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hoopup-tiles-test-'));

    // 2. Generate 100 KB pseudo-random data file
    fileData = crypto.randomBytes(fileSize);
    fileSha256 = crypto.createHash('sha256').update(fileData).digest('hex');
    await fs.writeFile(path.join(tempDir, fileName), fileData);

    // 3. Create a 20 MB sparse/dummy file to verify streaming memory efficiency
    const largeHandle = await fs.open(path.join(tempDir, 'large.pmtiles'), 'w');
    await largeHandle.truncate(largeFileSize);
    await largeHandle.close();

    // 4. Create a symlink to verify symlink rejection
    try {
      await fs.symlink(
        path.join(tempDir, fileName),
        path.join(tempDir, 'symlink.pmtiles')
      );
    } catch (_) {
      // Symlinks may require elevated privileges on some Windows setups; handled gracefully
    }

    // 5. Build Fastify app pointing to the temp directory
    const jwtSecret = 'test_jwt_secret_tiles_route_32chars_long!';
    process.env.JWT_SECRET = jwtSecret;

    app = buildApp({
      jwtSecret,
      tilesDir: tempDir,
      allowedOrigins: 'http://localhost:5173,http://localhost:5199',
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
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  // Helper request wrapper
  async function tileRequest(urlPath, options = {}) {
    const fullUrl = urlPath.startsWith('http') ? urlPath : `${baseUrl}${urlPath}`;
    const res = await fetch(fullUrl, options);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    let json = null;
    try {
      json = JSON.parse(buffer.toString('utf8'));
    } catch (_) {}

    return {
      status: res.status,
      headers: res.headers,
      buffer,
      json,
      text: buffer.toString('utf8'),
    };
  }

  test('1. Full GET returns entire file matching sha256, with correct headers and security headers', async () => {
    const res = await tileRequest(`/tiles/${fileName}`);
    assert.equal(res.status, 200);

    // Assert payload sha256 matches exact file
    const receivedSha256 = crypto.createHash('sha256').update(res.buffer).digest('hex');
    assert.equal(receivedSha256, fileSha256);
    assert.equal(res.buffer.length, fileSize);

    // Standard HTTP tile headers
    assert.equal(res.headers.get('content-type'), 'application/octet-stream');
    assert.equal(res.headers.get('accept-ranges'), 'bytes');
    assert.equal(res.headers.get('content-length'), String(fileSize));
    assert.equal(res.headers.get('cache-control'), 'public, max-age=3600');
    assert.ok(res.headers.get('etag'), 'ETag header must be present');
    assert.ok(res.headers.get('last-modified'), 'Last-Modified header must be present');

    // Security headers (nosniff, CSP, etc.)
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('content-security-policy'), "default-src 'none'");
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  });

  test('2. HEAD /tiles/:file returns exact headers with empty body', async () => {
    const res = await tileRequest(`/tiles/${fileName}`, { method: 'HEAD' });
    assert.equal(res.status, 200);
    assert.equal(res.buffer.length, 0);

    assert.equal(res.headers.get('content-type'), 'application/octet-stream');
    assert.equal(res.headers.get('accept-ranges'), 'bytes');
    assert.equal(res.headers.get('content-length'), String(fileSize));
    assert.equal(res.headers.get('cache-control'), 'public, max-age=3600');
    assert.ok(res.headers.get('etag'));
    assert.ok(res.headers.get('last-modified'));
  });

  test('3. Range: bytes=0-99 returns 206 Partial Content and 100 bytes', async () => {
    const res = await tileRequest(`/tiles/${fileName}`, {
      headers: { Range: 'bytes=0-99' },
    });
    assert.equal(res.status, 206);
    assert.equal(res.headers.get('content-range'), `bytes 0-99/${fileSize}`);
    assert.equal(res.headers.get('content-length'), '100');
    assert.equal(res.headers.get('accept-ranges'), 'bytes');
    assert.equal(res.headers.get('content-type'), 'application/octet-stream');
    assert.equal(res.buffer.length, 100);

    // Exact byte slice comparison
    const expected = fileData.subarray(0, 100);
    assert.deepEqual(res.buffer, expected);
  });

  test('4. Range: bytes=1000- returns 206 Partial Content to end of file', async () => {
    const res = await tileRequest(`/tiles/${fileName}`, {
      headers: { Range: 'bytes=1000-' },
    });
    assert.equal(res.status, 206);
    const expectedLength = fileSize - 1000;
    assert.equal(res.headers.get('content-range'), `bytes 1000-${fileSize - 1}/${fileSize}`);
    assert.equal(res.headers.get('content-length'), String(expectedLength));
    assert.equal(res.buffer.length, expectedLength);

    const expected = fileData.subarray(1000);
    assert.deepEqual(res.buffer, expected);
  });

  test('5. Range: bytes=-500 returns 206 Partial Content for suffix bytes', async () => {
    const res = await tileRequest(`/tiles/${fileName}`, {
      headers: { Range: 'bytes=-500' },
    });
    assert.equal(res.status, 206);
    const startByte = fileSize - 500;
    assert.equal(res.headers.get('content-range'), `bytes ${startByte}-${fileSize - 1}/${fileSize}`);
    assert.equal(res.headers.get('content-length'), '500');
    assert.equal(res.buffer.length, 500);

    const expected = fileData.subarray(startByte);
    assert.deepEqual(res.buffer, expected);
  });

  test('6. Range: bytes=99999999- returns 416 Unsatisfiable with Content-Range: bytes */<size>', async () => {
    const res = await tileRequest(`/tiles/${fileName}`, {
      headers: { Range: 'bytes=99999999-' },
    });
    assert.equal(res.status, 416);
    assert.equal(res.headers.get('content-range'), `bytes */${fileSize}`);
    assert.equal(res.headers.get('accept-ranges'), 'bytes');
  });

  test('7. Malformed range and multi-range requests return 416', async () => {
    const malformedCases = [
      'bytes=abc-def',
      'bytes=-',
      'bytes=500-100',
      'bytes=0-10,20-30', // multi-range
      'notbytes=0-100',
      'bytes=--10',
    ];

    for (const rangeHeader of malformedCases) {
      const res = await tileRequest(`/tiles/${fileName}`, {
        headers: { Range: rangeHeader },
      });
      assert.equal(
        res.status,
        416,
        `Expected 416 for Range "${rangeHeader}", got ${res.status}`
      );
      assert.equal(res.headers.get('content-range'), `bytes */${fileSize}`);
    }
  });

  test('8. Traversal attempts, invalid names, and missing files return generic 404 without path leakage', async () => {
    const invalidPaths = [
      '/tiles/..%2f..%2fpackage.json',
      '/tiles/%2e%2e%2fsrc%2fapp.js',
      '/tiles/a.pmtiles/../../x',
      '/tiles/Bangkok.pmtiles', // uppercase forbidden
      '/tiles/bang%20kok.pmtiles', // space forbidden
      '/tiles/bang kok.pmtiles', // raw space forbidden
      '/tiles/bang%00kok.pmtiles', // NUL byte forbidden
      '/tiles/nonexistent.pmtiles', // missing file
      '/tiles/something.txt', // extension not .pmtiles
      '/tiles/..',
      '/tiles/.pmtiles', // no basename
    ];

    for (const testPath of invalidPaths) {
      const res = await tileRequest(testPath);
      assert.equal(res.status, 404, `Path ${testPath} did not return 404 (status=${res.status})`);
      assert.ok(res.json, `Expected JSON 404 body for ${testPath}`);
      assert.equal(res.json.error, 'Not Found');
      assert.equal(res.json.statusCode, 404);

      // Verify strict zero path leakage
      assert.ok(
        !res.text.includes(tempDir),
        `Path ${testPath} leaked temp directory in 404 response`
      );
      assert.ok(
        !res.text.includes('hoopup-tiles-test'),
        `Path ${testPath} leaked temp directory marker in 404 response`
      );
    }
  });

  test('9. If-None-Match with matching ETag returns 304 with empty body', async () => {
    // Obtain ETag first
    const headRes = await tileRequest(`/tiles/${fileName}`, { method: 'HEAD' });
    const etag = headRes.headers.get('etag');
    assert.ok(etag);

    // Request with matching If-None-Match
    const res = await tileRequest(`/tiles/${fileName}`, {
      headers: { 'If-None-Match': etag },
    });
    assert.equal(res.status, 304);
    assert.equal(res.buffer.length, 0);
    assert.equal(res.headers.get('etag'), etag);
    assert.equal(res.headers.get('accept-ranges'), 'bytes');
    assert.equal(res.headers.get('cache-control'), 'public, max-age=3600');
  });

  test('10. CORS headers expose required headers for allowed origins and none for unknown origins', async () => {
    // Allowed origin
    const allowedRes = await tileRequest(`/tiles/${fileName}`, {
      headers: { Origin: 'http://localhost:5173' },
    });
    assert.equal(allowedRes.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    const exposeHeaders = allowedRes.headers.get('access-control-expose-headers');
    assert.ok(exposeHeaders, 'Access-Control-Expose-Headers must be set for allowed origin');
    assert.ok(exposeHeaders.includes('Content-Range'));
    assert.ok(exposeHeaders.includes('Content-Length'));
    assert.ok(exposeHeaders.includes('Accept-Ranges'));
    assert.ok(exposeHeaders.includes('ETag'));

    const allowHeaders = allowedRes.headers.get('access-control-allow-headers');
    assert.ok(allowHeaders, 'Access-Control-Allow-Headers must be set');
    assert.ok(allowHeaders.includes('Range'));
    assert.ok(allowHeaders.includes('If-None-Match'));

    // Unknown origin
    const unknownRes = await tileRequest(`/tiles/${fileName}`, {
      headers: { Origin: 'http://unknown-attacker.evil' },
    });
    assert.equal(unknownRes.headers.get('access-control-allow-origin'), null);
    assert.equal(unknownRes.headers.get('access-control-expose-headers'), null);
  });

  test('11. Memory stays low: 20 MB file served with 1 KB range answers quickly via stream', async () => {
    const startTime = performance.now();
    const res = await tileRequest('/tiles/large.pmtiles', {
      headers: { Range: 'bytes=0-1023' },
    });
    const elapsedMs = performance.now() - startTime;

    assert.equal(res.status, 206);
    assert.equal(res.headers.get('content-range'), `bytes 0-1023/${largeFileSize}`);
    assert.equal(res.headers.get('content-length'), '1024');
    assert.equal(res.buffer.length, 1024);

    // Assert streaming response returns quickly without buffering the entire 20 MB
    assert.ok(
      elapsedMs < 1000,
      `Range request on 20 MB file took too long (${elapsedMs.toFixed(1)} ms)`
    );
  });

  test('12. Regression: /rpc without token is still 401 and /tiles does not require auth or rate limiter', async () => {
    // Regression check: /rpc/hoopup_get_session without token must still be 401
    const rpcRes = await fetch(`${baseUrl}/rpc/hoopup_get_session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_session_id: crypto.randomUUID() }),
    });
    assert.equal(rpcRes.status, 401);
    const rpcJson = await rpcRes.json();
    assert.equal(rpcJson.code, 'unauthorized');

    // /tiles/:file does not require token and does not trip rate limiter (call 15 times)
    for (let i = 0; i < 15; i++) {
      const tileRes = await tileRequest(`/tiles/${fileName}`, {
        headers: { Range: 'bytes=0-9' },
      });
      assert.equal(tileRes.status, 206, `Tile call ${i} failed with status ${tileRes.status}`);
    }
  });
});

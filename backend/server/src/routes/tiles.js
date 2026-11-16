import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_DIR = path.resolve(__dirname, '..', '..');

// RFC 7233 / PMTiles route: file basename must be safe ASCII alphanumeric
export const TILE_FILE_REGEX = /^[a-z0-9][a-z0-9_-]{0,63}\.pmtiles$/;

/**
 * Registers HTTP GET and HEAD /tiles/:file with full HTTP Range request support
 * for PMTiles map tile archives.
 *
 * Range Policy:
 * - Single range (bytes=a-b, bytes=a-, bytes=-n) -> 206 Partial Content
 * - Unsatisfiable range (a >= size, -0, etc.) -> 416 Range Not Satisfiable (Content-Range: bytes * / <size>)
 * - Malformed or multi-range requests -> 416 Range Not Satisfiable (Content-Range: bytes * / <size>)
 */
export function registerTilesRoutes(app, options = {}) {
  const configuredDir =
    options.tilesDir || process.env.TILES_DIR || path.join(SERVER_DIR, 'tiles');
  const resolvedTilesDir = path.resolve(configuredDir);

  let realTilesDir = null;
  try {
    if (fs.existsSync(resolvedTilesDir)) {
      realTilesDir = fs.realpathSync(resolvedTilesDir);
    }
  } catch (_) {
    realTilesDir = null;
  }

  function getBaseDir() {
    if (!realTilesDir) {
      try {
        if (fs.existsSync(resolvedTilesDir)) {
          realTilesDir = fs.realpathSync(resolvedTilesDir);
        }
      } catch (_) {
        realTilesDir = null;
      }
    }
    return realTilesDir || resolvedTilesDir;
  }

  app.route({
    method: ['GET', 'HEAD'],
    url: '/tiles/:file',
    handler: async (request, reply) => {
      const rawFile = request.params.file;

      // 1. Validate filename: strictly match ^[a-z0-9][a-z0-9_-]{0,63}\.pmtiles$
      if (typeof rawFile !== 'string' || !TILE_FILE_REGEX.test(rawFile)) {
        return reply.callNotFound();
      }

      const baseDir = getBaseDir();
      const targetPath = path.join(baseDir, rawFile);

      // Verify lexical path containment
      const relToConfigured = path.relative(baseDir, targetPath);
      if (
        relToConfigured !== rawFile ||
        relToConfigured.includes('..') ||
        path.isAbsolute(relToConfigured)
      ) {
        return reply.callNotFound();
      }

      // Check file stats and refuse symlinks or non-regular files
      let stat;
      try {
        stat = await fs.promises.lstat(targetPath);
      } catch (_) {
        return reply.callNotFound();
      }

      if (stat.isSymbolicLink() || !stat.isFile()) {
        return reply.callNotFound();
      }

      // Verify realpath stays strictly inside real base directory
      try {
        const realTarget = await fs.promises.realpath(targetPath);
        const realBase = await fs.promises.realpath(baseDir);
        const rel = path.relative(realBase, realTarget);
        if (
          rel.startsWith('..') ||
          path.isAbsolute(rel) ||
          rel.toLowerCase() !== rawFile.toLowerCase() ||
          path.dirname(realTarget).toLowerCase() !== realBase.toLowerCase()
        ) {
          return reply.callNotFound();
        }
      } catch (_) {
        return reply.callNotFound();
      }

      const fileSize = stat.size;
      const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
      const mtimeUtc = stat.mtime.toUTCString();

      // Check If-None-Match -> 304
      const ifNoneMatch = request.headers['if-none-match'];
      if (ifNoneMatch) {
        const tags = ifNoneMatch.split(',').map((t) => t.trim());
        const isMatch = tags.some(
          (t) =>
            t === etag ||
            t === '*' ||
            t === `W/${etag}` ||
            t === etag.replace(/^"|"$/g, '')
        );
        if (isMatch) {
          reply.status(304);
          reply.header('Accept-Ranges', 'bytes');
          reply.header('ETag', etag);
          reply.header('Last-Modified', mtimeUtc);
          reply.header('Cache-Control', 'public, max-age=3600');
          return reply.send();
        }
      }

      const rangeHeader = request.headers.range;

      // Full representation if no Range header requested
      if (!rangeHeader) {
        reply.status(200);
        reply.header('Accept-Ranges', 'bytes');
        reply.header('Content-Type', 'application/octet-stream');
        reply.header('Content-Length', fileSize);
        reply.header('ETag', etag);
        reply.header('Last-Modified', mtimeUtc);
        reply.header('Cache-Control', 'public, max-age=3600');

        if (request.method === 'HEAD') {
          return reply.send();
        }
        return reply.send(fs.createReadStream(targetPath));
      }

      // Range request parsing
      // Multi-range (contains comma) or malformed (does not start with 'bytes=') -> 416
      if (!rangeHeader.startsWith('bytes=') || rangeHeader.includes(',')) {
        reply.status(416);
        reply.header('Accept-Ranges', 'bytes');
        reply.header('Content-Range', `bytes */${fileSize}`);
        reply.header('Content-Length', 0);
        reply.header('ETag', etag);
        reply.header('Last-Modified', mtimeUtc);
        reply.header('Cache-Control', 'public, max-age=3600');
        return reply.send();
      }

      const spec = rangeHeader.slice(6).trim();
      const match = spec.match(/^(\d*)-(\d*)$/);

      // Malformed range spec (e.g. bytes=-, bytes=abc-def)
      if (!match || (match[1] === '' && match[2] === '')) {
        reply.status(416);
        reply.header('Accept-Ranges', 'bytes');
        reply.header('Content-Range', `bytes */${fileSize}`);
        reply.header('Content-Length', 0);
        reply.header('ETag', etag);
        reply.header('Last-Modified', mtimeUtc);
        reply.header('Cache-Control', 'public, max-age=3600');
        return reply.send();
      }

      let start;
      let end;

      if (match[1] === '' && match[2] !== '') {
        // Suffix range: bytes=-n
        const suffixLength = Number(match[2]);
        if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0 || fileSize === 0) {
          reply.status(416);
          reply.header('Accept-Ranges', 'bytes');
          reply.header('Content-Range', `bytes */${fileSize}`);
          reply.header('Content-Length', 0);
          reply.header('ETag', etag);
          reply.header('Last-Modified', mtimeUtc);
          reply.header('Cache-Control', 'public, max-age=3600');
          return reply.send();
        }
        if (suffixLength >= fileSize) {
          start = 0;
          end = fileSize - 1;
        } else {
          start = fileSize - suffixLength;
          end = fileSize - 1;
        }
      } else if (match[1] !== '' && match[2] === '') {
        // Open range: bytes=a-
        start = Number(match[1]);
        if (!Number.isSafeInteger(start) || start >= fileSize || fileSize === 0) {
          reply.status(416);
          reply.header('Accept-Ranges', 'bytes');
          reply.header('Content-Range', `bytes */${fileSize}`);
          reply.header('Content-Length', 0);
          reply.header('ETag', etag);
          reply.header('Last-Modified', mtimeUtc);
          reply.header('Cache-Control', 'public, max-age=3600');
          return reply.send();
        }
        end = fileSize - 1;
      } else {
        // Explicit range: bytes=a-b
        start = Number(match[1]);
        end = Number(match[2]);
        if (
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start > end ||
          start >= fileSize ||
          fileSize === 0
        ) {
          reply.status(416);
          reply.header('Accept-Ranges', 'bytes');
          reply.header('Content-Range', `bytes */${fileSize}`);
          reply.header('Content-Length', 0);
          reply.header('ETag', etag);
          reply.header('Last-Modified', mtimeUtc);
          reply.header('Cache-Control', 'public, max-age=3600');
          return reply.send();
        }
        if (end >= fileSize) {
          end = fileSize - 1;
        }
      }

      const contentLength = end - start + 1;
      const contentRange = `bytes ${start}-${end}/${fileSize}`;

      reply.status(206);
      reply.header('Accept-Ranges', 'bytes');
      reply.header('Content-Type', 'application/octet-stream');
      reply.header('Content-Range', contentRange);
      reply.header('Content-Length', contentLength);
      reply.header('ETag', etag);
      reply.header('Last-Modified', mtimeUtc);
      reply.header('Cache-Control', 'public, max-age=3600');

      if (request.method === 'HEAD') {
        return reply.send();
      }

      return reply.send(fs.createReadStream(targetPath, { start, end }));
    },
  });
}

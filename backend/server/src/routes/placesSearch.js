import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { InMemoryRateLimiter } from '../auth.js';
import { QUERY_BOUNDS, ALLOWED_GROUPS, getCategoryGroup } from './places.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_DIR = path.resolve(__dirname, '..', '..');

/**
 * Calculates Haversine distance in meters between two coordinates [lon, lat].
 */
export function haversineMeters(lon1, lat1, lon2, lat2, cosLat1 = null) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const cos1 = cosLat1 !== null ? cosLat1 : Math.cos((lat1 * Math.PI) / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    cos1 *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Normalizes text for search matching: Unicode NFC, case-insensitive, whitespace-collapsed, trimmed.
 */
export function normalizeSearchText(str) {
  if (!str || typeof str !== 'string') return '';
  return str.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Evaluates ranking tier:
 * Tier 1: exact name (normName === normQ)
 * Tier 2: name starts with q (normName.startsWith(normQ))
 * Tier 3: a word in the name starts with q (word startsWith normQ)
 * Tier 4: name contains q (substring anywhere)
 * Returns 0 if no match.
 */
export function computeMatchTier(normName, normQ) {
  if (!normName.includes(normQ)) {
    return 0; // Not a match
  }
  if (normName === normQ) {
    return 1; // Tier 1: exact name
  }
  if (normName.startsWith(normQ)) {
    return 2; // Tier 2: name starts with q
  }

  // Tier 3: a word in the name starts with q
  // Fast word boundary check without regex allocations
  let idx = normName.indexOf(normQ);
  while (idx !== -1) {
    if (idx === 0) return 2;
    const prev = normName.charCodeAt(idx - 1);
    // Delimiters: space (32), dash (45), slash (47), dot (46), comma (44), paren (40), colon (58), semicolon (59), bracket (91), brace (123)
    if (
      prev === 32 ||
      prev === 45 ||
      prev === 47 ||
      prev === 46 ||
      prev === 44 ||
      prev === 40 ||
      prev === 58 ||
      prev === 59 ||
      prev === 91 ||
      prev === 123
    ) {
      return 3;
    }
    idx = normName.indexOf(normQ, idx + 1);
  }

  // Tier 4: name contains q (substring anywhere)
  return 4;
}

const EMPTY_POSTING = new Uint32Array(0);

/** Code-point bigrams: Thai combining marks and delimiters are literal characters.
 * One-code-point names have no bigrams; single-code-point queries use the reference. */
export function nameBigrams(name) {
  const chars = Array.from(name);
  const grams = new Set();
  for (let i = 1; i < chars.length; i++) grams.add(chars[i - 1] + chars[i]);
  return grams;
}

/**
 * In-memory index manager for places search.
 * Loaded lazily on first search request.
 */
export class PlacesSearchIndex {
  constructor(filePath) {
    this.filePath = filePath;
    this.loaded = false;
    this.loadingPromise = null;
    this.etag = null;
    this.stat = null;
    this.places = [];
    this.normNames = [];
    this.bigramPostings = null;
    this.bigramBuildStats = null;
    this.buildTimeMs = 0;
    this.heapDiffMb = '0.00';
  }

  async load(logger = null) {
    if (this.loaded) return;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      if (!fs.existsSync(this.filePath)) {
        const err = new Error(`Places data file not found: ${this.filePath}`);
        err.code = 'ENOENT';
        throw err;
      }

      const stat = await fs.promises.stat(this.filePath);
      this.stat = stat;
      this.etag = `"places-${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;

      const heapBefore = process.memoryUsage().heapUsed;
      const startTime = performance.now();

      const fileStream = fs.createReadStream(this.filePath, { encoding: 'utf8' });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      const loadedPlaces = [];
      const loadedNormNames = [];

      for await (const line of rl) {
        if (!line) continue;
        let place;
        try {
          place = JSON.parse(line);
        } catch (_) {
          continue;
        }

        // Attach category group
        place.g = getCategoryGroup(place.c) || 'other';
        const norm = normalizeSearchText(place.n);

        loadedPlaces.push(place);
        loadedNormNames.push(norm);
      }

      this.places = loadedPlaces;
      this.normNames = loadedNormNames;
      this.buildBigramIndex();
      this.loaded = true;

      const heapAfter = process.memoryUsage().heapUsed;
      this.heapDiffMb = ((heapAfter - heapBefore) / (1024 * 1024)).toFixed(2);
      const totalHeapMb = (heapAfter / (1024 * 1024)).toFixed(2);
      this.buildTimeMs = Math.round(performance.now() - startTime);

      const logMsg = `PlacesSearchIndex loaded ${this.places.length.toLocaleString()} places into memory in ${this.buildTimeMs}ms (heap added: ${this.heapDiffMb} MB, total heap: ${totalHeapMb} MB)`;
      if (logger && logger.info) {
        logger.info(
          {
            recordCount: this.places.length,
            heapDiffMb: this.heapDiffMb,
            totalHeapMb,
            durationMs: this.buildTimeMs,
          },
          logMsg
        );
      } else {
        console.log(`[placesSearch] ${logMsg}`);
      }
    })();

    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  /** Sorted, deduplicated postings of record positions, not place objects.
   * Two passes avoid a large temporary Map<string, number[]> during loading. */
  buildBigramIndex() {
    const before = process.memoryUsage();
    const start = performance.now();
    const counts = new Map();
    for (const name of this.normNames) {
      for (const gram of nameBigrams(name)) counts.set(gram, (counts.get(gram) || 0) + 1);
    }
    const postings = new Map();
    let postingCount = 0;
    for (const [gram, count] of counts) {
      postings.set(gram, new Uint32Array(count));
      postingCount += count;
      counts.set(gram, 0);
    }
    for (let i = 0; i < this.normNames.length; i++) {
      for (const gram of nameBigrams(this.normNames[i])) {
        const cursor = counts.get(gram);
        postings.get(gram)[cursor] = i;
        counts.set(gram, cursor + 1);
      }
    }
    this.bigramPostings = postings;
    this.bigramBuildStats = {
      durationMs: performance.now() - start,
      grams: postings.size,
      postingCount,
      postingBytes: postingCount * Uint32Array.BYTES_PER_ELEMENT,
      before,
      after: process.memoryUsage(),
    };
  }

  /** Any true substring contains every query bigram, including literal spaces
   * and delimiters. The rarest list is a complete candidate superset. Iteration
   * stays in original record order, preserving stable ties even for duplicate IDs. */
  searchCandidates(normQ) {
    if (!this.bigramPostings || !normQ.isWellFormed()) return null;
    const grams = nameBigrams(normQ);
    if (grams.size === 0) return null;
    let rarest = null;
    for (const gram of grams) {
      const posting = this.bigramPostings.get(gram);
      if (!posting) return EMPTY_POSTING;
      if (rarest === null || posting.length < rarest.length) rarest = posting;
    }
    return rarest;
  }

  search(options) {
    const { q, limit = 10, near = null, catsSet = null } = options;
    const normQ = normalizeSearchText(q);
    if (!normQ) {
      return { places: [], total: 0, truncated: false };
    }

    const candidates = this.searchCandidates(normQ);
    // NFC can collapse a two-code-unit input into one code point. The legacy
    // UTF-16 matcher also accepts lone surrogates; retain linear semantics there.
    if (candidates === null) return this.linearSearch(options);

    const hasNear = near !== null && Array.isArray(near) && near.length === 2;
    const nearLon = hasNear ? near[0] : 0;
    const nearLat = hasNear ? near[1] : 0;
    const cosNearLat = hasNear ? Math.cos((nearLat * Math.PI) / 180) : null;

    const tier1 = [];
    const tier2 = [];
    const tier3 = [];
    const tier4 = [];
    let total = 0;

    for (const i of candidates) {
      const normName = this.normNames[i];
      if (!normName.includes(normQ)) continue;

      if (catsSet !== null && !catsSet.has(this.places[i].g)) {
        continue;
      }

      total++;
      const tier = computeMatchTier(normName, normQ);
      if (tier === 1) tier1.push(i);
      else if (tier === 2) tier2.push(i);
      else if (tier === 3) tier3.push(i);
      else if (tier === 4) tier4.push(i);
    }

    const truncated = total > limit;

    // Helper to sort a list of place indices by confidence descending, then distance ascending, then id
    const sortTierIndices = (indices) => {
      const items = new Array(indices.length);
      for (let j = 0; j < indices.length; j++) {
        const idx = indices[j];
        const p = this.places[idx];
        const d = hasNear ? haversineMeters(nearLon, nearLat, p.x, p.y, cosNearLat) : undefined;
        items[j] = { p, d };
      }
      items.sort((a, b) => {
        if (b.p.f !== a.p.f) return b.p.f - a.p.f;
        if (hasNear && a.d !== b.d) return a.d - b.d;
        return a.p.i < b.p.i ? -1 : a.p.i > b.p.i ? 1 : 0;
      });
      return items;
    };

    const resultItems = [];
    const tiers = [tier1, tier2, tier3, tier4];
    for (let t = 0; t < tiers.length; t++) {
      if (resultItems.length >= limit) break;
      const tierIndices = tiers[t];
      if (tierIndices.length === 0) continue;
      const sorted = sortTierIndices(tierIndices);
      for (let j = 0; j < sorted.length && resultItems.length < limit; j++) {
        resultItems.push(sorted[j]);
      }
    }

    const places = resultItems.map((m) => {
      const hit = {
        i: m.p.i,
        n: m.p.n,
        c: m.p.c,
        g: m.p.g,
        x: m.p.x,
        y: m.p.y,
      };
      if (hasNear) {
        hit.d = m.d;
      }
      return hit;
    });

    return {
      places,
      total,
      truncated,
    };
  }

  // Frozen pre-SRCH2 reference matcher for equivalence tests and measurements.
  linearSearch({ q, limit = 10, near = null, catsSet = null }) {
    const normQ = normalizeSearchText(q);
    if (!normQ) {
      return { places: [], total: 0, truncated: false };
    }

    const hasNear = near !== null && Array.isArray(near) && near.length === 2;
    const nearLon = hasNear ? near[0] : 0;
    const nearLat = hasNear ? near[1] : 0;
    const cosNearLat = hasNear ? Math.cos((nearLat * Math.PI) / 180) : null;

    const tier1 = [];
    const tier2 = [];
    const tier3 = [];
    const tier4 = [];
    let total = 0;

    const count = this.places.length;
    for (let i = 0; i < count; i++) {
      const normName = this.normNames[i];
      if (!normName.includes(normQ)) continue;

      if (catsSet !== null && !catsSet.has(this.places[i].g)) {
        continue;
      }

      total++;
      const tier = computeMatchTier(normName, normQ);
      if (tier === 1) tier1.push(i);
      else if (tier === 2) tier2.push(i);
      else if (tier === 3) tier3.push(i);
      else if (tier === 4) tier4.push(i);
    }

    const truncated = total > limit;

    // Helper to sort a list of place indices by confidence descending, then distance ascending, then id
    const sortTierIndices = (indices) => {
      const items = new Array(indices.length);
      for (let j = 0; j < indices.length; j++) {
        const idx = indices[j];
        const p = this.places[idx];
        const d = hasNear ? haversineMeters(nearLon, nearLat, p.x, p.y, cosNearLat) : undefined;
        items[j] = { p, d };
      }
      items.sort((a, b) => {
        if (b.p.f !== a.p.f) return b.p.f - a.p.f;
        if (hasNear && a.d !== b.d) return a.d - b.d;
        return a.p.i < b.p.i ? -1 : a.p.i > b.p.i ? 1 : 0;
      });
      return items;
    };

    const resultItems = [];
    const tiers = [tier1, tier2, tier3, tier4];
    for (let t = 0; t < tiers.length; t++) {
      if (resultItems.length >= limit) break;
      const tierIndices = tiers[t];
      if (tierIndices.length === 0) continue;
      const sorted = sortTierIndices(tierIndices);
      for (let j = 0; j < sorted.length && resultItems.length < limit; j++) {
        resultItems.push(sorted[j]);
      }
    }

    const places = resultItems.map((m) => {
      const hit = {
        i: m.p.i,
        n: m.p.n,
        c: m.p.c,
        g: m.p.g,
        x: m.p.x,
        y: m.p.y,
      };
      if (hasNear) {
        hit.d = m.d;
      }
      return hit;
    });

    return {
      places,
      total,
      truncated,
    };
  }
}

export function registerPlacesSearchRoutes(app, options = {}) {
  const configuredFile =
    options.placesFile ||
    process.env.PLACES_FILE ||
    path.join(SERVER_DIR, 'data', 'places-bangkok.ndjson');
  const resolvedPlacesFile = path.resolve(configuredFile);

  const placesSearchIndex =
    options.placesSearchIndex || new PlacesSearchIndex(resolvedPlacesFile);

  // Dedicated in-memory rate limiter for /places/search (default 120 req/min per IP, separate bucket)
  const placesSearchRateLimitMax =
    options.placesSearchRateLimitMax ||
    parseInt(process.env.PLACES_SEARCH_RATE_LIMIT_MAX || '120', 10);
  const placesSearchRateLimitWindowMs =
    options.placesSearchRateLimitWindowMs ||
    parseInt(process.env.PLACES_SEARCH_RATE_LIMIT_WINDOW_MS || '60000', 10);

  const rateLimiter =
    options.placesSearchRateLimiter ||
    new InMemoryRateLimiter({
      max: placesSearchRateLimitMax,
      windowMs: placesSearchRateLimitWindowMs,
    });

  app.get('/places/search', async (request, reply) => {
    // 1. Route-specific rate limiter check (dedicated bucket)
    const clientIp = request.ip || request.socket?.remoteAddress || '127.0.0.1';
    const rateCheck = rateLimiter.check(clientIp);
    if (!rateCheck.allowed) {
      reply.header('Retry-After', Math.ceil(rateCheck.retryAfterMs / 1000));
      return reply.status(429).send({
        error: 'Too many requests, please try again later',
      });
    }

    // 2. Reject repeated query parameters
    const rawUrl = request.raw.url || '';
    const qIndex = rawUrl.indexOf('?');
    if (qIndex !== -1) {
      const queryString = rawUrl.slice(qIndex + 1);
      const seenKeys = new Set();
      const pairs = queryString.split('&');
      for (const pair of pairs) {
        if (!pair) continue;
        const rawKey = pair.split('=')[0];
        let key = rawKey;
        try {
          key = decodeURIComponent(rawKey);
        } catch (_) {}
        if (seenKeys.has(key)) {
          return reply.status(400).send({
            error: 'Invalid request: repeated parameters are not allowed',
          });
        }
        seenKeys.add(key);
      }
    }
    for (const [key, val] of Object.entries(request.query || {})) {
      if (Array.isArray(val)) {
        return reply.status(400).send({
          error: 'Invalid request: repeated parameters are not allowed',
        });
      }
    }

    // 3. Validate query parameters
    const query = request.query || {};

    // Validate q: required, trimmed length 2..60, no control characters
    const rawQ = query.q;
    if (rawQ === undefined || rawQ === null || typeof rawQ !== 'string') {
      return reply.status(400).send({
        error: 'Missing or invalid "q" parameter',
      });
    }

    const trimmedQ = rawQ.trim();
    if (trimmedQ.length < 2 || trimmedQ.length > 60) {
      return reply.status(400).send({
        error: 'Parameter "q" must have a trimmed length between 2 and 60 characters',
      });
    }

    if (/[\x00-\x1F\x7F]/.test(rawQ)) {
      return reply.status(400).send({
        error: 'Parameter "q" contains forbidden control characters',
      });
    }

    // Validate near: optional lon,lat
    let near = null;
    if (query.near !== undefined) {
      const rawNear = String(query.near);
      const parts = rawNear.split(',');
      if (parts.length !== 2) {
        return reply.status(400).send({
          error: 'Invalid "near" parameter: format must be lon,lat',
        });
      }
      const [rawLon, rawLat] = parts;
      if (rawLon.trim() === '' || rawLat.trim() === '') {
        return reply.status(400).send({
          error: 'Invalid "near" parameter: empty coordinate component',
        });
      }
      const lon = Number(rawLon);
      const lat = Number(rawLat);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
        return reply.status(400).send({
          error: 'Invalid "near" parameter: coordinates must be finite numbers',
        });
      }
      if (
        lon < QUERY_BOUNDS.minLon ||
        lon > QUERY_BOUNDS.maxLon ||
        lat < QUERY_BOUNDS.minLat ||
        lat > QUERY_BOUNDS.maxLat
      ) {
        return reply.status(400).send({
          error: 'Parameter "near" coordinates are outside the supported Bangkok metropolitan area',
        });
      }
      near = [lon, lat];
    }

    // Validate limit: integer 1..20, default 10
    let limit = 10;
    if (query.limit !== undefined) {
      const rawLimit = String(query.limit).trim();
      if (!/^\d+$/.test(rawLimit)) {
        return reply.status(400).send({
          error: 'Invalid "limit" parameter: must be an integer between 1 and 20',
        });
      }
      limit = parseInt(rawLimit, 10);
      if (limit < 1 || limit > 20) {
        return reply.status(400).send({
          error: 'Parameter "limit" must be between 1 and 20',
        });
      }
    }

    // Validate cats: optional comma-separated list of group names from ALLOWED_GROUPS
    let catsSet = null;
    if (query.cats !== undefined) {
      const rawCats = String(query.cats).trim();
      if (!rawCats) {
        return reply.status(400).send({
          error: 'Invalid "cats" parameter: cannot be empty when specified',
        });
      }
      const catTokens = rawCats.split(',').map((s) => s.trim());
      catsSet = new Set();
      for (const token of catTokens) {
        if (!token || !ALLOWED_GROUPS.has(token)) {
          return reply.status(400).send({
            error: `Unknown category group: "${token}". Allowed: ${Array.from(ALLOWED_GROUPS).join(', ')}`,
          });
        }
        catsSet.add(token);
      }
    }

    // 4. Lazy load placesSearchIndex
    try {
      await placesSearchIndex.load(app.log);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return reply.status(503).send({
          error: 'Places data service unavailable',
        });
      }
      app.log.error(err, 'Failed to load places data');
      return reply.status(503).send({
        error: 'Places data service unavailable',
      });
    }

    // 5. HTTP Caching & ETag handling
    const etag = placesSearchIndex.etag;
    reply.header('Cache-Control', 'public, max-age=300');
    reply.header('ETag', etag);

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
        return reply.status(304).send();
      }
    }

    // 6. Execute search
    const result = placesSearchIndex.search({
      q: trimmedQ,
      limit,
      near,
      catsSet,
    });

    return reply.status(200).send(result);
  });

  // Store references for testing
  app.placesSearchIndex = placesSearchIndex;
  app.placesSearchRateLimiter = rateLimiter;
}

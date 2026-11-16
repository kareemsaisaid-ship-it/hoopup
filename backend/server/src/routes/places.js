import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { InMemoryRateLimiter } from '../auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_DIR = path.resolve(__dirname, '..', '..');

export const BANGKOK_BBOX = {
  minLon: 100.30,
  minLat: 13.50,
  maxLon: 100.95,
  maxLat: 14.10,
};

// Bangkok bounding box with +- 0.05 deg padding for allowed queries
export const QUERY_BOUNDS = {
  minLon: 100.25,
  minLat: 13.45,
  maxLon: 101.00,
  maxLat: 14.15,
};

export const MAX_BBOX_SPAN = 0.06;
export const CELL_SIZE = 0.005;

export const ALLOWED_GROUPS = new Set([
  'food',
  'shop',
  'sports',
  'parking',
  'transport',
  'health',
  'education',
  'lodging',
]);

// Explicit Category to Group mapping
export const CATEGORY_GROUP_MAPPING = {
  // Parking
  parking: 'parking',
  parking_lot: 'parking',
  parking_garage: 'parking',
  valet_parking_service: 'parking',

  // Sports & Fitness
  gym: 'sports',
  fitness_center: 'sports',
  sports_club: 'sports',
  sports_complex: 'sports',
  stadium_arena: 'sports',
  stadium: 'sports',
  basketball_court: 'sports',
  sport_or_fitness_facility: 'sports',
  swimming_pool: 'sports',
  public_swimming_pool: 'sports',
  yoga_studio: 'sports',
  pilates_studio: 'sports',
  martial_arts_club: 'sports',
  badminton_court: 'sports',
  dance_studio: 'sports',
  muay_thai_club: 'sports',
  boxing_gym: 'sports',
  soccer_field: 'sports',
  tennis_court: 'sports',
  sports_and_recreation: 'sports',
  sport_league: 'sports',
  sports_school: 'sports',
  recreation_center: 'sports',
  skate_park: 'sports',
  sporting_goods_store: 'sports',
  sportswear_store: 'sports',
  outdoor_sports_store: 'sports',
  bicycle_shop: 'sports',
  running_store: 'sports',
  golf_course: 'sports',
  golf_driving_range: 'sports',
  bowling_alley: 'sports',
  climbing_gym: 'sports',
  amateur_sport_league: 'sports',
  esports_team: 'sports',
  professional_sport_team: 'sports',

  // Transport
  train_station: 'transport',
  bus_station: 'transport',
  light_rail_and_subway_station: 'transport',
  metro_station: 'transport',
  public_transit_facility_or_service: 'transport',
  pier: 'transport',
  ferry_boat_company: 'transport',
  airport: 'transport',
  transit_stop: 'transport',
  bus_stop: 'transport',
  subway_station: 'transport',
  heliport: 'transport',

  // Health
  hospital: 'health',
  pharmacy: 'health',
  dental_clinic: 'health',
  doctors_office: 'health',
  clinic: 'health',
  urgent_care_clinic: 'health',
  health_care: 'health',
  medical_service_organization: 'health',
  outpatient_care_facility: 'health',
  physical_therapy: 'health',
  medical_clinic: 'health',
  emergency_room: 'health',
  blood_bank: 'health',
  medical_center: 'health',
  pediatrician: 'health',
  optometrist: 'health',
  medical_lab: 'health',

  // Education
  school: 'education',
  college_university: 'education',
  education: 'education',
  elementary_school: 'education',
  preschool: 'education',
  language_school: 'education',
  music_school: 'education',
  high_school: 'education',
  middle_school: 'education',
  tutoring_service: 'education',
  vocational_school: 'education',
  art_school: 'education',
  flight_school: 'education',
  nursery_school: 'education',
  cooking_school: 'education',
  culinary_school: 'education',
  driving_school: 'education',
  educational_institution: 'education',
  campus_building: 'education',
  library: 'education',

  // Lodging
  lodging: 'lodging',
  hotel: 'lodging',
  hostel: 'lodging',
  resort: 'lodging',
  motel: 'lodging',
  bed_and_breakfast: 'lodging',
  inn: 'lodging',
  guest_house: 'lodging',
  serviced_apartment: 'lodging',
  lodge: 'lodging',
  campground: 'lodging',
};

export function getCategoryGroup(category) {
  if (!category || typeof category !== 'string') return null;
  const c = category.toLowerCase().trim();

  if (CATEGORY_GROUP_MAPPING[c]) {
    return CATEGORY_GROUP_MAPPING[c];
  }

  if (c.includes('parking')) return 'parking';
  if (c.includes('fitness') || c.includes('sports_') || c.includes('stadium') || c.includes('gym')) return 'sports';
  if (c.includes('hospital') || c.includes('clinic') || c.includes('medical') || c.includes('pharmacy')) return 'health';
  if (c.includes('school') || c.includes('university') || c.includes('college')) return 'education';

  if (
    (c.includes('hotel') || c.includes('hostel') || c.includes('resort') || c.includes('lodging')) &&
    !c.includes('supply') && !c.includes('service')
  ) {
    return 'lodging';
  }

  const isBar = (
    c === 'bar' || c.startsWith('bar_') || c.endsWith('_bar') || c.includes('_bar_') ||
    c === 'pub' || c.endsWith('_pub') || c === 'gastropub'
  ) && c !== 'barber' && c !== 'bartender';

  const isFood = (
    c.includes('restaurant') || c.includes('cafe') || c.includes('coffee') ||
    c.includes('bakery') || isBar || c.includes('bistro') ||
    c.includes('diner') || c.includes('food') || c.includes('ice_cream') ||
    c.includes('tea_room') || c.includes('bubble_tea') ||
    c.includes('steakhouse') || c.includes('pizzeria') || c.includes('buffet') ||
    c.includes('delicatessen') || c.includes('caterer') || c.includes('juice_shop') ||
    c.includes('dessert_shop') || c.includes('brewery') || c.includes('winery') ||
    c.includes('distillery') || c.includes('gastropub') || c.includes('noodle') ||
    c === 'donut_shop' || c === 'sandwich_shop' || c === 'patisserie' || c === 'bagel_shop'
  );
  if (isFood) {
    const isExcluded = ['exporter', 'pet_food', 'training', 'manufacturer', 'equipment', 'service', 'barber'].some(
      x => c.includes(x) && !c.includes('food_court') && !c.includes('catering_service')
    );
    if (!isExcluded) return 'food';
  }

  const isShop = (
    [
      'convenience_store', 'supermarket', 'grocery_store', 'shopping_mall', 'shopping',
      'department_store', 'flea_market', 'clothing_store', 'warehouse_club_store',
      'furniture_store', 'hardware_store', 'electronics_store', 'mobile_phone_store',
      'bookstore', 'pet_store', 'jewelry_store', 'shoe_store', 'beauty_supply_store',
      'home_improvement_store', 'discount_store', 'variety_store', 'liquor_store',
      'stationery_store', 'toy_store', 'optician', 'eyewear_store', 'florist',
      'flowers_and_gifts_store', 'market', 'farmers_market', 'night_market',
      'fruit_and_vegetable_store', 'butcher_shop', 'fish_and_seafood_market'
    ].includes(c) ||
    ((c.includes('store') || c.includes('shop') || c.includes('market')) &&
      !['repair', 'auto', 'motorcycle', 'service', 'tattoo', 'barber', 'salon', 'machinery', 'workshop'].some(x => c.includes(x)))
  );
  if (isShop) return 'shop';

  return null;
}

// In-memory places index manager
export class PlacesIndex {
  constructor(filePath) {
    this.filePath = filePath;
    this.loaded = false;
    this.loadingPromise = null;
    this.etag = null;
    this.stat = null;
    this.grid = new Map();
    this.count = 0;
  }

  gridKey(cellX, cellY) {
    return `${cellX}:${cellY}`;
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
      const startTime = Date.now();

      const fileStream = fs.createReadStream(this.filePath, { encoding: 'utf8' });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      this.grid.clear();
      let recordCount = 0;

      for await (const line of rl) {
        if (!line) continue;
        let place;
        try {
          place = JSON.parse(line);
        } catch (_) {
          continue;
        }

        // Ensure category group is attached
        place.g = getCategoryGroup(place.c) || 'other';

        const cellX = Math.floor((place.x - QUERY_BOUNDS.minLon) / CELL_SIZE);
        const cellY = Math.floor((place.y - QUERY_BOUNDS.minLat) / CELL_SIZE);
        const key = this.gridKey(cellX, cellY);

        let cell = this.grid.get(key);
        if (!cell) {
          cell = [];
          this.grid.set(key, cell);
        }
        cell.push(place);
        recordCount++;
      }

      this.count = recordCount;
      this.loaded = true;

      const heapAfter = process.memoryUsage().heapUsed;
      const heapDiffMb = ((heapAfter - heapBefore) / (1024 * 1024)).toFixed(2);
      const totalHeapMb = (heapAfter / (1024 * 1024)).toFixed(2);
      const durationMs = Date.now() - startTime;

      const logMsg = `Places index loaded ${recordCount.toLocaleString()} places into memory in ${durationMs}ms (heap added: ${heapDiffMb} MB, total heap: ${totalHeapMb} MB)`;
      if (logger && logger.info) {
        logger.info({ recordCount, heapDiffMb, totalHeapMb, durationMs }, logMsg);
      } else {
        console.log(`[places] ${logMsg}`);
      }
    })();

    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  query(minLon, minLat, maxLon, maxLat, limit = 300, catsSet = null) {
    const minCellX = Math.floor((minLon - QUERY_BOUNDS.minLon) / CELL_SIZE);
    const maxCellX = Math.floor((maxLon - QUERY_BOUNDS.minLon) / CELL_SIZE);
    const minCellY = Math.floor((minLat - QUERY_BOUNDS.minLat) / CELL_SIZE);
    const maxCellY = Math.floor((maxLat - QUERY_BOUNDS.minLat) / CELL_SIZE);

    const matches = [];

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const cell = this.grid.get(this.gridKey(cx, cy));
        if (!cell) continue;

        for (let i = 0; i < cell.length; i++) {
          const p = cell[i];
          if (p.x >= minLon && p.x <= maxLon && p.y >= minLat && p.y <= maxLat) {
            if (catsSet === null || catsSet.has(p.g)) {
              matches.push(p);
            }
          }
        }
      }
    }

    const total = matches.length;
    const truncated = total > limit;

    let resultItems;
    if (truncated) {
      // Sort highest confidence first (stable sort tie-breaking on id)
      matches.sort((a, b) => {
        if (b.f !== a.f) return b.f - a.f;
        return a.i < b.i ? -1 : a.i > b.i ? 1 : 0;
      });
      resultItems = matches.slice(0, limit);
    } else {
      resultItems = matches;
    }

    // Map to response format: [{i, n, c, g, x, y}]
    const places = resultItems.map((p) => ({
      i: p.i,
      n: p.n,
      c: p.c,
      g: p.g,
      x: p.x,
      y: p.y,
    }));

    return {
      places,
      total,
      truncated,
    };
  }
}

export function registerPlacesRoutes(app, options = {}) {
  const configuredFile =
    options.placesFile ||
    process.env.PLACES_FILE ||
    path.join(SERVER_DIR, 'data', 'places-bangkok.ndjson');
  const resolvedPlacesFile = path.resolve(configuredFile);

  const placesIndex = new PlacesIndex(resolvedPlacesFile);

  // Dedicated in-memory rate limiter for /places (240 req/min default, separate bucket)
  const placesRateLimitMax =
    options.placesRateLimitMax ||
    parseInt(process.env.PLACES_RATE_LIMIT_MAX || '240', 10);
  const placesRateLimitWindowMs =
    options.placesRateLimitWindowMs ||
    parseInt(process.env.PLACES_RATE_LIMIT_WINDOW_MS || '60000', 10);

  const rateLimiter =
    options.placesRateLimiter ||
    new InMemoryRateLimiter({
      max: placesRateLimitMax,
      windowMs: placesRateLimitWindowMs,
    });

  app.get('/places', async (request, reply) => {
    // 1. Rate limiter check for /places
    const clientIp = request.ip || request.socket?.remoteAddress || '127.0.0.1';
    const rateCheck = rateLimiter.check(clientIp);
    if (!rateCheck.allowed) {
      reply.header('Retry-After', Math.ceil(rateCheck.retryAfterMs / 1000));
      return reply.status(429).send({
        error: 'Too many requests, please try again later',
      });
    }

    // 2. Validate query parameters
    const query = request.query || {};

    // Validate bbox: must be strictly minLon,minLat,maxLon,maxLat
    const rawBbox = query.bbox;
    if (typeof rawBbox !== 'string') {
      return reply.status(400).send({
        error: 'Invalid or missing bbox parameter. Format: minLon,minLat,maxLon,maxLat',
      });
    }

    const bboxParts = rawBbox.split(',');
    if (bboxParts.length !== 4) {
      return reply.status(400).send({
        error: 'Invalid bbox format. Exactly 4 comma-separated numbers required',
      });
    }

    const [rawMinLon, rawMinLat, rawMaxLon, rawMaxLat] = bboxParts;

    // Reject non-numeric / whitespace-empty tokens
    if (
      rawMinLon.trim() === '' ||
      rawMinLat.trim() === '' ||
      rawMaxLon.trim() === '' ||
      rawMaxLat.trim() === ''
    ) {
      return reply.status(400).send({ error: 'Invalid bbox: empty coordinate components' });
    }

    const minLon = Number(rawMinLon);
    const minLat = Number(rawMinLat);
    const maxLon = Number(rawMaxLon);
    const maxLat = Number(rawMaxLat);

    if (
      !Number.isFinite(minLon) ||
      !Number.isFinite(minLat) ||
      !Number.isFinite(maxLon) ||
      !Number.isFinite(maxLat)
    ) {
      return reply.status(400).send({
        error: 'Invalid bbox: coordinates must be finite numbers',
      });
    }

    // Inverted check
    if (minLon > maxLon || minLat > maxLat) {
      return reply.status(400).send({
        error: 'Invalid bbox: min coordinate exceeds max coordinate',
      });
    }

    // Span check <= 0.06 degrees each side
    const spanLon = maxLon - minLon;
    const spanLat = maxLat - minLat;
    if (spanLon > MAX_BBOX_SPAN || spanLat > MAX_BBOX_SPAN) {
      return reply.status(400).send({
        error: `Bbox span exceeds maximum allowed ${MAX_BBOX_SPAN} degrees`,
      });
    }

    // Bangkok bounding box with padding check
    if (
      minLon < QUERY_BOUNDS.minLon ||
      maxLon > QUERY_BOUNDS.maxLon ||
      minLat < QUERY_BOUNDS.minLat ||
      maxLat > QUERY_BOUNDS.maxLat
    ) {
      return reply.status(400).send({
        error: 'Bbox coordinates are outside the supported Bangkok metropolitan area',
      });
    }

    // Validate limit: integer 1..500, default 300
    let limit = 300;
    if (query.limit !== undefined) {
      const rawLimit = String(query.limit).trim();
      if (!/^\d+$/.test(rawLimit)) {
        return reply.status(400).send({
          error: 'Invalid limit: must be a positive integer between 1 and 500',
        });
      }
      limit = parseInt(rawLimit, 10);
      if (limit < 1 || limit > 500) {
        return reply.status(400).send({
          error: 'Limit must be between 1 and 500',
        });
      }
    }

    // Validate cats: optional comma list of group names from ALLOWED_GROUPS
    let catsSet = null;
    if (query.cats !== undefined) {
      const rawCats = String(query.cats).trim();
      if (!rawCats) {
        return reply.status(400).send({
          error: 'Invalid cats parameter: cannot be empty when specified',
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

    // 3. Lazy load places data index
    try {
      await placesIndex.load(app.log);
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

    // 4. HTTP Caching & ETag handling
    const etag = placesIndex.etag;
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

    // 5. Execute query
    const result = placesIndex.query(minLon, minLat, maxLon, maxLat, limit, catsSet);

    return reply.status(200).send(result);
  });

  // Store references for testing
  app.placesIndex = placesIndex;
  app.placesRateLimiter = rateLimiter;
}

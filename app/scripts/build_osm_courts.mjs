#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

export const DEFAULT_RAW_PATH = path.join(ROOT_DIR, 'data', 'osm', 'overpass_raw_bangkok.json');
export const DEFAULT_OUT_PATH = path.join(ROOT_DIR, 'src', 'data', 'osmCourtsBangkok.json');

/**
 * Extract court name following OSM priority: name:th -> name -> name:en -> null
 */
export function parseName(tags) {
  if (!tags) return null;
  const val = tags['name:th'] || tags.name || tags['name:en'];
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Extract coordinates: element.lat/lon for nodes, element.center for ways/relations
 */
export function parseCoordinates(element) {
  const lat = element.lat ?? element.center?.lat ?? null;
  const lon = element.lon ?? element.center?.lon ?? null;
  const validLat = typeof lat === 'number' && Number.isFinite(lat) ? lat : null;
  const validLon = typeof lon === 'number' && Number.isFinite(lon) ? lon : null;
  return { latitude: validLat, longitude: validLon };
}

/**
 * Extract surface type only from tags.surface
 */
export function parseSurfaceType(tags) {
  if (!tags || !tags.surface || typeof tags.surface !== 'string') return null;
  const trimmed = tags.surface.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Extract isIndoor: only if tags.indoor or tags.building says so, else null
 */
export function parseIsIndoor(tags) {
  if (!tags) return null;
  if (tags.indoor != null) {
    const ind = String(tags.indoor).toLowerCase().trim();
    if (ind === 'yes' || ind === 'true') return true;
    if (ind === 'no' || ind === 'false') return false;
  }
  if (tags.building != null) {
    const bldg = String(tags.building).toLowerCase().trim();
    if (bldg === 'no' || bldg === 'false') return false;
    return true;
  }
  return null;
}

/**
 * Extract hasLighting: tags.lit yes/no else null
 */
export function parseHasLighting(tags) {
  if (!tags || tags.lit == null) return null;
  const lit = String(tags.lit).toLowerCase().trim();
  if (lit === 'yes' || lit === 'true') return true;
  if (lit === 'no' || lit === 'false') return false;
  return null;
}

/**
 * Extract hoopCount: tags.hoops if present else null
 */
export function parseHoopCount(tags) {
  if (!tags || tags.hoops == null) return null;
  const parsed = parseInt(String(tags.hoops).trim(), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Extract openingHoursNote: tags.opening_hours else null
 */
export function parseOpeningHoursNote(tags) {
  if (!tags || !tags.opening_hours || typeof tags.opening_hours !== 'string') return null;
  const trimmed = tags.opening_hours.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Extract access: tags.access else null
 */
export function parseAccess(tags) {
  if (!tags || !tags.access || typeof tags.access !== 'string') return null;
  const trimmed = tags.access.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Extract fee: tags.fee else null
 */
export function parseFee(tags) {
  if (!tags || !tags.fee || typeof tags.fee !== 'string') return null;
  const trimmed = tags.fee.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Extract operator: tags.operator else null
 */
export function parseOperator(tags) {
  if (!tags || !tags.operator || typeof tags.operator !== 'string') return null;
  const trimmed = tags.operator.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Quality categorization computed ONLY from hard facts:
 * - 'excluded' when name contains conflicting-sport word or access is private/permit/customers/members
 * - 'positive' when access is yes/permissive
 * - otherwise 'unverified'
 */
export function parseOsmQuality(tags, name = null) {
  const courtName = name ?? parseName(tags);
  const nameLower = courtName && typeof courtName === 'string' ? courtName.toLowerCase() : '';
  const accessVal = tags && tags.access && typeof tags.access === 'string' ? tags.access.trim().toLowerCase() : '';

  const conflictingSports = ['football', 'futsal', 'tennis', 'badminton', 'volleyball', 'ฟุตบอล', 'ฟุตซอล', 'เทนนิส'];
  const hasConflictingSport = conflictingSports.some((word) => nameLower.includes(word));

  const excludedAccess = ['private', 'permit', 'customers', 'members'];
  if (hasConflictingSport || excludedAccess.includes(accessVal)) {
    return 'excluded';
  }

  const positiveAccess = ['yes', 'permissive'];
  if (positiveAccess.includes(accessVal)) {
    return 'positive';
  }

  return 'unverified';
}

export const computeOsmQuality = parseOsmQuality;

/**
 * Pure mapping function transforming a single OSM element into the standard schema.
 */
export function transformOsmElement(element, fetchedAt) {
  const tags = element.tags || {};
  const { latitude, longitude } = parseCoordinates(element);
  const name = parseName(tags);

  return {
    osmType: element.type,
    osmId: element.id,
    name,
    latitude,
    longitude,
    surfaceType: parseSurfaceType(tags),
    isIndoor: parseIsIndoor(tags),
    hasLighting: parseHasLighting(tags),
    hoopCount: parseHoopCount(tags),
    openingHoursNote: parseOpeningHoursNote(tags),
    access: parseAccess(tags),
    fee: parseFee(tags),
    operator: parseOperator(tags),
    osmQuality: parseOsmQuality(tags, name),
    sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    fetchedAt,
  };
}

/**
 * Sort comparator: sorted by whether they have a name (named first), then by osmId ascending.
 */
export function compareOsmCourts(a, b) {
  const aHasName = Boolean(a.name && a.name.trim().length > 0);
  const bHasName = Boolean(b.name && b.name.trim().length > 0);

  if (aHasName !== bHasName) {
    return aHasName ? -1 : 1;
  }

  const idA = BigInt(a.osmId);
  const idB = BigInt(b.osmId);
  if (idA < idB) return -1;
  if (idA > idB) return 1;
  return 0;
}

/**
 * Pure builder function transforming raw Overpass JSON payload into deduplicated records.
 */
export function buildOsmCourts(rawPayload) {
  const elements = Array.isArray(rawPayload?.elements) ? rawPayload.elements : [];
  const fetchedAt =
    rawPayload?.fetchedAt ||
    rawPayload?.osm3s?.timestamp_osm_base ||
    new Date().toISOString();

  const seen = new Set();
  const records = [];

  for (const el of elements) {
    if (!el || !el.type || el.id == null) continue;
    const key = `${el.type}:${el.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    records.push(transformOsmElement(el, fetchedAt));
  }

  records.sort(compareOsmCourts);
  return records;
}

export function runBuild(rawPath = DEFAULT_RAW_PATH, outPath = DEFAULT_OUT_PATH) {
  if (!fs.existsSync(rawPath)) {
    throw new Error(`Raw Overpass data file not found at: ${rawPath}`);
  }

  const rawContent = fs.readFileSync(rawPath, 'utf-8');
  const rawPayload = JSON.parse(rawContent);

  const records = buildOsmCourts(rawPayload);

  const outDir = path.dirname(outPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(outPath, JSON.stringify(records, null, 2), 'utf-8');
  console.log(`Successfully built ${records.length} OSM court records into ${outPath}`);
  return records;
}

// Execute when run directly as CLI
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  try {
    runBuild();
  } catch (err) {
    console.error('Build OSM courts failed:', err.message);
    process.exit(1);
  }
}

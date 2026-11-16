#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve input path with fallback
const candidatePaths = [
  path.resolve(__dirname, '../../app/src/data/osmCourtsBangkok.json'),
  path.resolve(__dirname, '../../../app/src/data/osmCourtsBangkok.json'),
  path.resolve(process.cwd(), '../../app/src/data/osmCourtsBangkok.json'),
];
const INPUT_JSON_PATH = candidatePaths.find(p => fs.existsSync(p)) || candidatePaths[1];
const OUTPUT_SQL_PATH = path.resolve(__dirname, '../sql/005_seed_osm_courts.sql');

// Fixed namespace constant for HoopUp OSM courts (RFC 4122 URL namespace)
export const OSM_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

function parseUuidToBytes(uuidStr) {
  const hex = uuidStr.replace(/-/g, '');
  return Buffer.from(hex, 'hex');
}

/**
 * Deterministic UUID v5 generation using node:crypto (RFC 4122)
 * Derived from string "osm:<osmType>:<osmId>"
 */
export function generateUuidV5(name, namespace = OSM_NAMESPACE) {
  const nsBytes = typeof namespace === 'string' ? parseUuidToBytes(namespace) : namespace;
  const nameBytes = Buffer.from(name, 'utf8');

  const hash = crypto.createHash('sha1');
  hash.update(nsBytes);
  hash.update(nameBytes);
  const digest = hash.digest();

  // Set version to 5 (0101) in octet 6
  digest[6] = (digest[6] & 0x0f) | 0x50;
  // Set variant to RFC 4122 (10) in octet 8
  digest[8] = (digest[8] & 0x3f) | 0x80;

  const hex = digest.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function escapeSqlString(str) {
  if (str === null || str === undefined) return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
}

function formatSqlValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  return escapeSqlString(val);
}

export function generateSeedSql(rawCourts) {
  const counts = {
    total: rawCourts.length,
    excluded: 0,
    unverified: 0,
    positive: 0,
    seeded: 0,
  };

  const rows = [];

  for (const c of rawCourts) {
    if (c.osmQuality === 'excluded') {
      counts.excluded++;
      continue;
    }

    if (c.osmQuality === 'unverified') counts.unverified++;
    else if (c.osmQuality === 'positive') counts.positive++;
    counts.seeded++;

    const id = generateUuidV5(`osm:${c.osmType}:${c.osmId}`);

    const name = c.name && c.name.trim().length > 0
      ? c.name.trim()
      : `สนามบาสเกตบอล (OSM ${c.osmType} ${c.osmId})`;

    const address = c.address && c.address.trim().length > 0
      ? c.address.trim()
      : `แหล่งข้อมูล: ${c.sourceUrl}`;

    const latitude = typeof c.latitude === 'number' && Number.isFinite(c.latitude)
      ? c.latitude
      : null;

    const longitude = typeof c.longitude === 'number' && Number.isFinite(c.longitude)
      ? c.longitude
      : null;

    const surfaceType = c.surfaceType && c.surfaceType.trim().length > 0
      ? c.surfaceType.trim()
      : null;

    const isIndoor = c.isIndoor === true ? true : (c.isIndoor === false ? false : null);
    const hasLighting = c.hasLighting === true ? true : (c.hasLighting === false ? false : null);
    const hoopCount = typeof c.hoopCount === 'number' && Number.isInteger(c.hoopCount) && c.hoopCount >= 0
      ? c.hoopCount
      : null;

    const openingHoursNote = c.openingHoursNote && c.openingHoursNote.trim().length > 0
      ? c.openingHoursNote.trim()
      : null;

    const photoPath = null;
    const verifiedAt = null;

    const valuesTuple = [
      formatSqlValue(id),
      formatSqlValue(name),
      formatSqlValue(address),
      formatSqlValue(latitude),
      formatSqlValue(longitude),
      formatSqlValue(surfaceType),
      formatSqlValue(isIndoor),
      formatSqlValue(hasLighting),
      formatSqlValue(hoopCount),
      formatSqlValue(openingHoursNote),
      formatSqlValue(photoPath),
      formatSqlValue(verifiedAt),
    ].join(', ');

    rows.push(`  (${valuesTuple})`);
  }

  const sql = [
    '-- 005_seed_osm_courts.sql',
    '-- Seed real OSM courts in Bangkok into public.courts',
    '-- Generated deterministically by scripts/generate-osm-seed.mjs',
    '-- Re-running this seed is idempotent (ON CONFLICT (id) DO NOTHING).',
    'begin;',
    '',
    'insert into public.courts (',
    '  id,',
    '  name,',
    '  address,',
    '  latitude,',
    '  longitude,',
    '  surface_type,',
    '  is_indoor,',
    '  has_lighting,',
    '  hoop_count,',
    '  opening_hours_note,',
    '  photo_path,',
    '  verified_at',
    ') values',
    rows.join(',\n'),
    'on conflict (id) do nothing;',
    '',
    'commit;',
    '',
  ].join('\n');

  return { sql, counts };
}

export function run() {
  if (!fs.existsSync(INPUT_JSON_PATH)) {
    throw new Error(`Input JSON not found: ${INPUT_JSON_PATH}`);
  }

  const raw = fs.readFileSync(INPUT_JSON_PATH, 'utf8');
  const rawCourts = JSON.parse(raw);

  const { sql, counts } = generateSeedSql(rawCourts);

  const outDir = path.dirname(OUTPUT_SQL_PATH);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_SQL_PATH, sql, 'utf8');

  console.log(`Read ${counts.total} raw courts from ${path.relative(process.cwd(), INPUT_JSON_PATH)}`);
  console.log(`Skipped ${counts.excluded} excluded entries`);
  console.log(`Seeded ${counts.seeded} courts (${counts.unverified} unverified, ${counts.positive} positive)`);
  console.log(`Written deterministic seed to ${path.relative(process.cwd(), OUTPUT_SQL_PATH)}`);

  return counts;
}

// Auto-run if executed directly
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  run();
}

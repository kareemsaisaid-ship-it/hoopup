import type { Court } from './types';
import osmCourtsRaw from '../data/osmCourtsBangkok.json';
import courtNameOverrides from '../data/courtNameOverrides.json';

export interface OsmCourtRecord {
  osmType: string;
  osmId: number;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  surfaceType: string | null;
  isIndoor: boolean | null;
  hasLighting: boolean | null;
  hoopCount: number | null;
  openingHoursNote: string | null;
  access?: string | null;
  fee?: string | null;
  operator?: string | null;
  osmQuality: 'excluded' | 'positive' | 'unverified';
  sourceUrl: string;
  fetchedAt: string;
}

/**
 * Deterministic UUID-shaped generator derived from osmType and osmId.
 * Produces standard 8-4-4-4-12 hex UUID without random collision.
 */
export function osmToCourtId(osmType: string, osmId: string | number): string {
  const str = `osm:${osmType}:${osmId}`;
  let h1 = 0x811c9dc5 ^ 0xdeadbeef;
  let h2 = 0x811c9dc5 ^ 0x41c64e6d;
  let h3 = 0x811c9dc5 ^ 0x12345678;
  let h4 = 0x811c9dc5 ^ 0x9abcdef0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193);
    h2 = Math.imul(h2 ^ (ch * 31), 0x01000193);
    h3 = Math.imul(h3 ^ (ch * 127), 0x01000193);
    h4 = Math.imul(h4 ^ (ch * 8191), 0x01000193);
  }
  const p1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const p2 = ((h2 >>> 16) & 0xffff).toString(16).padStart(4, '0');
  const p3 = ('4' + (h2 & 0x0fff).toString(16).padStart(3, '0')).slice(0, 4);
  const p4 = (((h3 >>> 28) & 0x3) | 0x8).toString(16) + ((h3 >>> 16) & 0x0fff).toString(16).padStart(3, '0');
  const p5 = ((h4 >>> 0).toString(16).padStart(8, '0') + (h3 & 0xffff).toString(16).padStart(4, '0')).slice(0, 12);
  return (p1 + '-' + p2 + '-' + p3 + '-' + p4 + '-' + p5).toLowerCase();
}

/**
 * Load OSM courts into standard Court records.
 * Filters out excluded courts (osmQuality === 'excluded').
 * Keeps the first 200 elements sorted by whether they have a name, then by osmId.
 */
export function loadOsmCourts(): Court[] {
  const rawList = osmCourtsRaw as OsmCourtRecord[];

  // Courts with osmQuality === 'excluded' are NOT loaded (they stay in the JSON).
  // Reviewed names (courtNameOverrides.json) replace the OSM name; the JSON data file is generated, so it is not edited.
  const overrides = courtNameOverrides as Record<string, string>;
  const nonExcluded = rawList
    .filter((item) => item.osmQuality !== 'excluded')
    .map((item) => ({ ...item, name: overrides[`${item.osmType}:${item.osmId}`] ?? item.name }));

  // Sort by whether they have a name (named first), then by osmId ascending
  const sorted = [...nonExcluded].sort((a, b) => {
    const aHasName = Boolean(a.name && a.name.trim().length > 0);
    const bHasName = Boolean(b.name && b.name.trim().length > 0);
    if (aHasName !== bHasName) return aHasName ? -1 : 1;
    const idA = BigInt(a.osmId);
    const idB = BigInt(b.osmId);
    return idA < idB ? -1 : idA > idB ? 1 : 0;
  });

  // Limit to first 200
  const limited = sorted.slice(0, 200);

  return limited.map((item) => ({
    id: osmToCourtId(item.osmType, item.osmId),
    name: item.name ? item.name.trim() : `สนามบาสเกตบอล (OSM ${item.osmType} ${item.osmId})`,
    address: null,
    latitude: item.latitude,
    longitude: item.longitude,
    surfaceType: item.surfaceType,
    isIndoor: item.isIndoor,
    hasLighting: item.hasLighting,
    hoopCount: item.hoopCount,
    openingHoursNote: item.openingHoursNote,
    photoPath: null,
    verifiedAt: null,
    osmQuality: item.osmQuality,
    access: item.access ?? null,
    fee: item.fee ?? null,
    operator: item.operator ?? null,
  }));
}

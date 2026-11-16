import { describe, expect, it } from 'vitest';
import {
  buildOsmCourts,
  compareOsmCourts,
  computeOsmQuality,
  parseAccess,
  parseCoordinates,
  parseFee,
  parseHasLighting,
  parseHoopCount,
  parseIsIndoor,
  parseName,
  parseOpeningHoursNote,
  parseOperator,
  parseOsmQuality,
  parseSurfaceType,
  transformOsmElement,
} from '../../../scripts/build_osm_courts.mjs';
import { loadOsmCourts, osmToCourtId } from '../osmCourts';

describe('OSM Courts Build and Mapping Unit Tests', () => {
  describe('Pure field mapping functions', () => {
    it('null stays null when tags or elements are missing (never invent data)', () => {
      const minimalElement = {
        type: 'node',
        id: 123456,
        tags: {},
      };

      const result = transformOsmElement(minimalElement, '2026-11-01T00:00:00Z');

      expect(result.osmType).toBe('node');
      expect(result.osmId).toBe(123456);
      expect(result.name).toBeNull();
      expect(result.latitude).toBeNull();
      expect(result.longitude).toBeNull();
      expect(result.surfaceType).toBeNull();
      expect(result.isIndoor).toBeNull();
      expect(result.hasLighting).toBeNull();
      expect(result.hoopCount).toBeNull();
      expect(result.openingHoursNote).toBeNull();
      expect(result.access).toBeNull();
      expect(result.fee).toBeNull();
      expect(result.operator).toBeNull();
      expect(result.osmQuality).toBe('unverified');
      expect(result.sourceUrl).toBe('https://www.openstreetmap.org/node/123456');
      expect(result.fetchedAt).toBe('2026-11-01T00:00:00Z');

      // Individual tag parsing functions preserve null
      expect(parseAccess(null)).toBeNull();
      expect(parseAccess({})).toBeNull();
      expect(parseFee(null)).toBeNull();
      expect(parseFee({})).toBeNull();
      expect(parseOperator(null)).toBeNull();
      expect(parseOperator({})).toBeNull();
      expect(parseOsmQuality(null)).toBe('unverified');
    });

    it('implements name fallback priority: name:th -> name -> name:en -> null', () => {
      expect(parseName(undefined)).toBeNull();
      expect(parseName({})).toBeNull();
      expect(parseName({ name: '   ' })).toBeNull();

      // Only English
      expect(parseName({ 'name:en': 'Lumpini Court' })).toBe('Lumpini Court');

      // Default name overrides English
      expect(
        parseName({ name: 'สนามลุมพินี', 'name:en': 'Lumpini Court' })
      ).toBe('สนามลุมพินี');

      // Thai name:th overrides default name and English
      expect(
        parseName({
          'name:th': 'สนามบาสเกตบอล สวนลุมพินี',
          name: 'Lumpini Court',
          'name:en': 'Lumpini Basketball Court',
        })
      ).toBe('สนามบาสเกตบอล สวนลุมพินี');
    });

    it('extracts coordinates correctly for node (lat/lon) and way/relation (center)', () => {
      // Node
      const nodeEl = { type: 'node', id: 1, lat: 13.75, lon: 100.5 };
      expect(parseCoordinates(nodeEl)).toEqual({ latitude: 13.75, longitude: 100.5 });

      // Way / Relation with center
      const wayEl = { type: 'way', id: 2, center: { lat: 13.8, lon: 100.6 } };
      expect(parseCoordinates(wayEl)).toEqual({ latitude: 13.8, longitude: 100.6 });

      // Missing
      const missingEl = { type: 'way', id: 3 };
      expect(parseCoordinates(missingEl)).toEqual({ latitude: null, longitude: null });
    });

    it('parses surfaceType, isIndoor, hasLighting, hoopCount, and openingHours accurately', () => {
      // Surface
      expect(parseSurfaceType({ surface: 'concrete' })).toBe('concrete');
      expect(parseSurfaceType({ surface: '  ' })).toBeNull();
      expect(parseSurfaceType({})).toBeNull();

      // isIndoor
      expect(parseIsIndoor({ indoor: 'yes' })).toBe(true);
      expect(parseIsIndoor({ indoor: 'no' })).toBe(false);
      expect(parseIsIndoor({ building: 'yes' })).toBe(true);
      expect(parseIsIndoor({ building: 'no' })).toBe(false);
      expect(parseIsIndoor({})).toBeNull();

      // hasLighting
      expect(parseHasLighting({ lit: 'yes' })).toBe(true);
      expect(parseHasLighting({ lit: 'no' })).toBe(false);
      expect(parseHasLighting({})).toBeNull();

      // hoopCount
      expect(parseHoopCount({ hoops: '2' })).toBe(2);
      expect(parseHoopCount({ hoops: '0' })).toBe(0);
      expect(parseHoopCount({ hoops: 'invalid' })).toBeNull();
      expect(parseHoopCount({})).toBeNull();

      // openingHours
      expect(parseOpeningHoursNote({ opening_hours: '08:00-20:00' })).toBe('08:00-20:00');
      expect(parseOpeningHoursNote({})).toBeNull();
    });
    it('parses access, fee, and operator accurately', () => {
      expect(parseAccess({ access: 'yes' })).toBe('yes');
      expect(parseAccess({ access: 'private' })).toBe('private');
      expect(parseAccess({})).toBeNull();

      expect(parseFee({ fee: 'no' })).toBe('no');
      expect(parseFee({ fee: 'yes' })).toBe('yes');
      expect(parseFee({})).toBeNull();

      expect(parseOperator({ operator: 'Thammasat University' })).toBe('Thammasat University');
      expect(parseOperator({})).toBeNull();
    });
  });

  describe('Quality function (osmQuality) based only on hard facts', () => {
    it('classifies conflicting sport names as excluded', () => {
      // English sport keywords
      expect(parseOsmQuality({ name: 'Tippawas School Football Court' })).toBe('excluded');
      expect(parseOsmQuality({ name: 'Community Futsal Ground' })).toBe('excluded');
      expect(parseOsmQuality({ name: 'Central Tennis Club' })).toBe('excluded');
      expect(parseOsmQuality({ name: 'Badminton Hall 2' })).toBe('excluded');
      expect(parseOsmQuality({ name: 'Volleyball Court' })).toBe('excluded');

      // Thai sport keywords
      expect(parseOsmQuality({ 'name:th': 'สนามฟุตบอลโรงเรียน' })).toBe('excluded');
      expect(parseOsmQuality({ name: 'สนามฟุตซอลในร่ม' })).toBe('excluded');
      expect(parseOsmQuality({ name: 'คอร์ทเทนนิส' })).toBe('excluded');

      // Passing explicit name parameter
      expect(computeOsmQuality({}, 'Football Court')).toBe('excluded');
    });

    it('classifies private, permit, customers, and members access as excluded', () => {
      expect(parseOsmQuality({ access: 'private' })).toBe('excluded');
      expect(parseOsmQuality({ access: 'permit' })).toBe('excluded');
      expect(parseOsmQuality({ access: 'customers' })).toBe('excluded');
      expect(parseOsmQuality({ access: 'members' })).toBe('excluded');
      expect(computeOsmQuality({ access: 'Private' })).toBe('excluded');
    });

    it('classifies yes and permissive access as positive', () => {
      expect(parseOsmQuality({ access: 'yes' })).toBe('positive');
      expect(parseOsmQuality({ access: 'permissive' })).toBe('positive');
      expect(computeOsmQuality({ access: 'Permissive' })).toBe('positive');
    });

    it('classifies unnamed or untagged courts as unverified', () => {
      expect(parseOsmQuality({})).toBe('unverified');
      expect(parseOsmQuality({ access: 'unknown' })).toBe('unverified');
      expect(parseOsmQuality({ name: 'สนามบาสเกตบอลชุมชน' })).toBe('unverified');
      expect(computeOsmQuality(null)).toBe('unverified');
    });
  });

  describe('Deduplication and Sorting in buildOsmCourts', () => {
    it('drops duplicates with identical osmType and osmId, preserving first occurrence', () => {
      const rawPayload = {
        fetchedAt: '2026-11-01T12:00:00Z',
        elements: [
          {
            type: 'node',
            id: 1001,
            lat: 13.7,
            lon: 100.5,
            tags: { name: 'สนามแรก' },
          },
          {
            type: 'node',
            id: 1001, // duplicate id and type
            lat: 13.7,
            lon: 100.5,
            tags: { name: 'สนามแรก (duplicate)' },
          },
          {
            type: 'way',
            id: 1001, // different type (way vs node), should be kept
            center: { lat: 13.8, lon: 100.6 },
            tags: { name: 'สนามแบบ Way' },
          },
        ],
      };

      const result = buildOsmCourts(rawPayload);
      expect(result.length).toBe(2);
      expect(result.find((r: Record<string, any>) => r.osmType === 'node' && r.osmId === 1001)?.name).toBe('สนามแรก');
      expect(result.find((r: Record<string, any>) => r.osmType === 'way' && r.osmId === 1001)?.name).toBe('สนามแบบ Way');
    });

    it('sorts named courts before unnamed courts, then sorts by osmId ascending', () => {
      const courts = [
        { osmType: 'way', osmId: 500, name: null },
        { osmType: 'way', osmId: 200, name: 'สนาม B' },
        { osmType: 'way', osmId: 100, name: null },
        { osmType: 'node', osmId: 300, name: 'สนาม A' },
      ];

      courts.sort(compareOsmCourts);

      // Named courts come first, sorted by osmId
      expect(courts[0].osmId).toBe(200);
      expect(courts[0].name).toBe('สนาม B');
      expect(courts[1].osmId).toBe(300);
      expect(courts[1].name).toBe('สนาม A');

      // Unnamed courts come after, sorted by osmId
      expect(courts[2].osmId).toBe(100);
      expect(courts[3].osmId).toBe(500);
    });
  });

  describe('Deterministic UUID and MockAdapter Integration', () => {
    it('generates consistent, deterministic UUIDs for same osmType and osmId', () => {
      const uuid1 = osmToCourtId('way', 31988935);
      const uuid2 = osmToCourtId('way', 31988935);
      const uuidDifferentType = osmToCourtId('node', 31988935);
      const uuidDifferentId = osmToCourtId('way', 31988936);

      expect(uuid1).toBe(uuid2);
      expect(uuid1).not.toBe(uuidDifferentType);
      expect(uuid1).not.toBe(uuidDifferentId);
      expect(uuid1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('loadOsmCourts returns valid Court records with fallback name for unnamed courts', () => {
      const courts = loadOsmCourts();
      expect(courts.length).toBeGreaterThan(0);
      expect(courts.length).toBeLessThanOrEqual(200);
      expect(courts.length).toBe(148); // Exactly 148 loaded (156 raw minus 8 excluded)

      // Excluded courts (football court way 625500759, access=private) must NOT be loaded
      expect(courts.find((c) => c.name?.includes('Football'))).toBeUndefined();
      expect(courts.some((c) => c.osmQuality === 'excluded')).toBe(false);

      // Positive courts and unverified courts are loaded with quality tags
      const positiveCourt = courts.find((c) => c.osmQuality === 'positive');
      expect(positiveCourt).toBeDefined();

      // All loaded courts should have deterministic UUID and non-null name
      for (const court of courts) {
        expect(court.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        expect(typeof court.name).toBe('string');
        expect(court.name.length).toBeGreaterThan(0);
        expect(court.address).toBeNull();
        expect(court.photoPath).toBeNull();
        expect(court.verifiedAt).toBeNull();
        expect(['positive', 'unverified']).toContain(court.osmQuality);
      }

      // Check fallback name for unnamed courts
      const unnamed = courts.find((c) => c.name.startsWith('สนามบาสเกตบอล (OSM '));
      expect(unnamed).toBeDefined();
    });
  });
});

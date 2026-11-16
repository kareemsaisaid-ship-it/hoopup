import { describe, it, expect } from 'vitest';
import { PLACES_GROUPS, PlacesCache, placeCaption, placesCacheKey, placesRequestBoxes, resolvePlacesUrl, sanitizePlaces } from '../placesApi';

const valid = { i: 'one', n: ' ร้านไทย <img onerror=bad()> ', c: 'restaurant', g: 'food', x: 100.54, y: 13.73 };
describe('nearby places helpers', () => {
  it('bounds single-line map captions without splitting surrogate pairs; popup names are preserved', () => {
    expect(placeCaption('ร้าน\nไทย\u2028ทดสอบ')).toBe('ร้าน ไทย ทดสอบ');
    const name = '😀'.repeat(50);
    expect(Array.from(placeCaption(name))).toHaveLength(41);
    expect(placeCaption(name)).toBe(`${'😀'.repeat(40)}…`);
    expect(name).toHaveLength(100);
  });
  it('keeps viewport or centre coverage within 0.05 degrees and API bounds, including edges and tilt', () => {
    for (const bounds of [[100.53, 13.72, 100.55, 13.74], [100, 13, 102, 15], [100.24, 13.44, 100.27, 13.47], [100.98, 14.13, 101.02, 14.17]] as [number, number, number, number][]) {
      const boxes = placesRequestBoxes(bounds); expect(boxes).toHaveLength(1);
      for (const [w, s, e, n] of boxes) {
        expect(e - w).toBeLessThanOrEqual(0.05); expect(n - s).toBeLessThanOrEqual(0.05);
        expect(w).toBeGreaterThanOrEqual(100.25); expect(e).toBeLessThanOrEqual(101);
        expect(s).toBeGreaterThanOrEqual(13.45); expect(n).toBeLessThanOrEqual(14.15);
      }
    }
    expect(placesRequestBoxes([NaN, 1, 2, 3])).toEqual([]);
    expect(placesRequestBoxes([2, 2, 1, 1])).toEqual([]);
    expect(placesRequestBoxes([0, 0, 1, 1])).toEqual([]);
  });
  it('validates every used field, deduplicates, caps rows, and preserves HTML as text', () => {
    const bad = [null, {}, ...['i', 'n', 'c', 'g', 'x', 'y'].map(key => ({ ...valid, [key]: {} })),
      { ...valid, x: NaN }, { ...valid, y: Infinity }, { ...valid, x: '100.54' }, { ...valid, x: 180 },
      { ...valid, n: 'x'.repeat(257) }, { ...valid, g: '__proto__' }, { ...valid, n: ' ' }];
    expect(sanitizePlaces({ places: [...bad, valid, valid] })).toEqual([{ ...valid, n: valid.n.trim() }]);
    expect(sanitizePlaces({ places: Array.from({ length: 500 }, (_, i) => ({ ...valid, i: String(i) })) })).toHaveLength(300);
    expect(() => sanitizePlaces(null)).toThrow(); expect(() => sanitizePlaces({ places: {} })).toThrow();
  });
  it('rounds stable cache keys, expires at five minutes and evicts beyond 24 entries', () => {
    expect(placesCacheKey([100.54000001, 13.73, 100.55, 13.74])).toBe('100.54000,13.73000,100.55000,13.74000');
    const cache = new PlacesCache(); cache.set('first', [], 0);
    expect(cache.get('first', 299999)).toEqual([]); expect(cache.get('first', 300000)).toBeUndefined();
    for (let i = 0; i < 25; i++) cache.set(String(i), [], 1);
    expect(cache.get('0', 2)).toBeUndefined(); expect(cache.get('24', 2)).toEqual([]);
  });
  it('provides the eight Thai labels', () => {
    expect(Object.values(PLACES_GROUPS).map(g => g.label)).toEqual(['อาหารและเครื่องดื่ม', 'ร้านค้า', 'กีฬาและฟิตเนส', 'ที่จอดรถ', 'การเดินทาง', 'สุขภาพ', 'การศึกษา', 'ที่พัก']);
  });
  it('resolves only an HTTP endpoint, using PMTiles origin or app origin, and obeys off', () => {
    const origin = 'https://app.test';
    expect(resolvePlacesUrl({}, origin)).toBe('https://app.test/places');
    expect(resolvePlacesUrl({ VITE_MAP_PMTILES_URL: 'https://tiles.test/tiles/bkk.pmtiles' }, origin)).toBe('https://tiles.test/places');
    expect(resolvePlacesUrl({ VITE_MAP_PMTILES_URL: '/tiles/bkk.pmtiles' }, origin)).toBe('https://app.test/places');
    expect(resolvePlacesUrl({ VITE_PLACES_API_URL: 'https://api.test/custom' }, origin)).toBe('https://api.test/custom');
    expect(resolvePlacesUrl({ VITE_PLACES: 'off' }, origin)).toBeNull();
    expect(resolvePlacesUrl({ VITE_PLACES_API_URL: 'javascript:bad()' }, origin)).toBeNull();
    expect(resolvePlacesUrl({ VITE_PLACES_API_URL: 'https://user:password@api.test' }, origin)).toBeNull();
  });
});

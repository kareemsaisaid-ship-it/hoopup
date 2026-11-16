import { describe, it, expect } from 'vitest';
import { namedFlavor } from '@protomaps/basemaps';
import {
  BANGKOK_BBOX_PADDING,
  BANGKOK_MAX_BOUNDS,
  BANGKOK_MAX_BOUNDS_VISCOSITY,
  BANGKOK_PMTILES_BBOX,
  BANGKOK_PMTILES_MIN_ZOOM,
  createMapLabelRules,
  getLabelPalette,
  getMapOptions,
  getPoiFontSize,
  getPoiMinZoom,
  getRoadFontSize,
  getRoadMinZoom,
  isPriorityPoiKind,
} from '../mapLabels';

describe('HoopUp MAP4d — Map Labels & Bangkok Bounds (mapLabels.ts)', () => {
  describe('POI Kinds and Zoom Thresholds', () => {
    it('identifies all core civic and community POI kinds as priority kinds', () => {
      const coreKinds = [
        'university',
        'school',
        'hospital',
        'hotel',
        'retail',
        'mall',
        'station',
        'park',
        'stadium',
        'sports_centre',
        'place_of_worship',
        'government',
      ];

      for (const kind of coreKinds) {
        expect(isPriorityPoiKind(kind)).toBe(true);
        expect(getPoiMinZoom(kind)).toBe(15);
      }
    });

    it('identifies transit and secondary civic POIs as priority kinds', () => {
      const secondaryKinds = [
        'college',
        'clinic',
        'supermarket',
        'department_store',
        'subway_entrance',
        'bus_station',
        'ferry_terminal',
        'police',
        'post_office',
      ];

      for (const kind of secondaryKinds) {
        expect(isPriorityPoiKind(kind)).toBe(true);
        expect(getPoiMinZoom(kind)).toBe(15);
      }
    });

    it('treats commercial/retail and minor shop kinds as general POIs appearing at zoom >= 17', () => {
      const generalKinds = ['cafe', 'restaurant', 'bar', 'clothes', 'atm', 'pharmacy', 'optician'];

      for (const kind of generalKinds) {
        expect(isPriorityPoiKind(kind)).toBe(false);
        expect(getPoiMinZoom(kind)).toBe(17);
      }
    });

    it('handles null, undefined, empty, and mixed-case inputs gracefully', () => {
      expect(isPriorityPoiKind(null)).toBe(false);
      expect(isPriorityPoiKind(undefined)).toBe(false);
      expect(isPriorityPoiKind('')).toBe(false);
      expect(getPoiMinZoom(null)).toBe(17);
      expect(getPoiMinZoom(undefined)).toBe(17);

      expect(isPriorityPoiKind('UNIVERSITY')).toBe(true);
      expect(isPriorityPoiKind('HoSpItAl')).toBe(true);
      expect(getPoiMinZoom('MALL')).toBe(15);
    });

    it('ensures phone font size is readable (>= 12px) across all zoom levels', () => {
      for (const z of [14, 15, 16, 17, 18, 19]) {
        expect(getPoiFontSize(z, 'university')).toBeGreaterThanOrEqual(12);
        expect(getPoiFontSize(z, 'cafe')).toBeGreaterThanOrEqual(12);
      }
      expect(getPoiFontSize(15, 'university')).toBe(12);
      expect(getPoiFontSize(17, 'university')).toBe(13);
    });
  });

  describe('Road Kinds, Zoom Thresholds & Typography', () => {
    it('sets zoom 12 for major roads and highways', () => {
      expect(getRoadMinZoom('highway')).toBe(12);
      expect(getRoadMinZoom('major_road')).toBe(12);
      expect(getRoadMinZoom('HIGHWAY')).toBe(12);
    });

    it('sets zoom 15 for minor roads, residential sois, and paths', () => {
      expect(getRoadMinZoom('minor_road')).toBe(15);
      expect(getRoadMinZoom('residential')).toBe(15);
      expect(getRoadMinZoom('path')).toBe(15);
      expect(getRoadMinZoom('service')).toBe(15);
      expect(getRoadMinZoom('other')).toBe(15);
      expect(getRoadMinZoom(null)).toBe(15);
    });

    it('ensures road label font size is readable (>= 12px) at all zooms', () => {
      for (const z of [12, 14, 15, 16, 17, 18]) {
        expect(getRoadFontSize(z, 'major_road')).toBeGreaterThanOrEqual(12);
        expect(getRoadFontSize(z, 'minor_road')).toBeGreaterThanOrEqual(12);
      }
      expect(getRoadFontSize(15, 'minor_road')).toBe(12);
      expect(getRoadFontSize(17, 'minor_road')).toBe(13);
    });
  });

  describe('Bangkok PMTiles Bounds & Navigation Limits', () => {
    it('defines accurate Bangkok PMTiles bbox coordinates matching the file header', () => {
      expect(BANGKOK_PMTILES_BBOX.minLon).toBe(100.30);
      expect(BANGKOK_PMTILES_BBOX.minLat).toBe(13.50);
      expect(BANGKOK_PMTILES_BBOX.maxLon).toBe(100.95);
      expect(BANGKOK_PMTILES_BBOX.maxLat).toBe(14.10);
    });

    it('expands Bangkok max bounds with constant padding of 0.05 degrees (~5.5km)', () => {
      expect(BANGKOK_BBOX_PADDING).toBe(0.05);

      const [southWest, northEast] = BANGKOK_MAX_BOUNDS;
      expect(southWest[0]).toBeCloseTo(13.45, 4); // minLat - 0.05
      expect(southWest[1]).toBeCloseTo(100.25, 4); // minLon - 0.05
      expect(northEast[0]).toBeCloseTo(14.15, 4); // maxLat + 0.05
      expect(northEast[1]).toBeCloseTo(101.00, 4); // maxLon + 0.05
    });

    it('sets sensible minZoom and viscosity so user cannot scroll into grey blank area', () => {
      expect(BANGKOK_PMTILES_MIN_ZOOM).toBe(9);
      expect(BANGKOK_MAX_BOUNDS_VISCOSITY).toBe(0.8);
    });
  });

  describe('Custom Label Rules & Palettes', () => {
    const darkFlavor = namedFlavor('dark');
    const lightFlavor = namedFlavor('light');

    it('provides high contrast palette with halos for both dark and light flavors', () => {
      const darkPalette = getLabelPalette('dark', darkFlavor);
      expect(darkPalette.roadHalo).toBe('#0F172A');
      expect(darkPalette.roadText).toBe('#F8FAFC');

      const lightPalette = getLabelPalette('light', lightFlavor);
      expect(lightPalette.roadHalo).toBe('#FFFFFF');
      expect(lightPalette.roadText).toBe('#1E293B');
    });

    it('creates full set of custom label rules including places, roads, water, and pois', () => {
      const rules = createMapLabelRules(darkFlavor, 'dark', 'th');
      expect(rules.length).toBeGreaterThanOrEqual(8);

      const layers = rules.map((r) => r.dataLayer);
      expect(layers).toContain('places');
      expect(layers).toContain('roads');
      expect(layers).toContain('water');
      expect(layers).toContain('pois');
    });

    it('returns complete options ready for LeafletLayer GridLayer instantiation', () => {
      const darkOpts = getMapOptions('dark', 'th');
      expect(darkOpts.paintRules.length).toBeGreaterThan(0);
      expect(darkOpts.labelRules.length).toBeGreaterThan(0);
      expect(darkOpts.backgroundColor).toBe(darkFlavor.background);

      const lightOpts = getMapOptions('light', 'th');
      expect(lightOpts.paintRules.length).toBeGreaterThan(0);
      expect(lightOpts.labelRules.length).toBeGreaterThan(0);
      expect(lightOpts.backgroundColor).toBe(lightFlavor.background);
    });
  });
});

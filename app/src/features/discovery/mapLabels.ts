import {
  CenteredTextSymbolizer,
  LineLabelSymbolizer,
  paintRules,
  linear,
  type LabelRule,
  type PaintRule,
} from 'protomaps-leaflet';
import { namedFlavor, type Flavor } from '@protomaps/basemaps';

/**
 * Priority POI kinds shown from zoom 15 and above.
 * Includes educational, medical, lodging, retail, transit, recreational,
 * and government civic infrastructure in Bangkok.
 */
export const PRIORITY_POI_KINDS = [
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
  'police',
  'townhall',
  'courthouse',
  'post_office',
  'fire_station',
  'embassy',
  'college',
  'clinic',
  'garden',
  'pitch',
  'fitness_centre',
  'supermarket',
  'department_store',
  'subway_entrance',
  'bus_station',
  'ferry_terminal',
] as const;

const PRIORITY_POI_SET: ReadonlySet<string> = new Set(PRIORITY_POI_KINDS);

/**
 * Checks whether a given POI kind qualifies as a priority kind for display at z15+.
 */
export function isPriorityPoiKind(kind?: string | null): boolean {
  if (!kind) return false;
  return PRIORITY_POI_SET.has(kind.toLowerCase());
}

/**
 * Returns minimum zoom level for a POI kind:
 * - Priority kinds: zoom 15
 * - General named POIs: zoom 17
 */
export function getPoiMinZoom(kind?: string | null): number {
  return isPriorityPoiKind(kind) ? 15 : 17;
}

/**
 * Returns readable font size (px) on phone displays for POI labels:
 * Guaranteed >= 12px at all times.
 */
export function getPoiFontSize(zoom: number, kind?: string | null): number {
  if (zoom >= 17) {
    return isPriorityPoiKind(kind) ? 13 : 12;
  }
  return 12;
}

/**
 * Returns minimum zoom level for road kinds:
 * - Major roads and highways: zoom 12
 * - Minor roads, lanes (soi), paths, and all other named roads: zoom 15
 */
export function getRoadMinZoom(kind?: string | null): number {
  if (!kind) return 15;
  const k = kind.toLowerCase();
  if (k === 'highway' || k === 'major_road') {
    return 12;
  }
  return 15;
}

/**
 * Returns readable font size (px) on phone displays for road labels:
 * Guaranteed >= 12px at all times.
 */
export function getRoadFontSize(zoom: number, kind?: string | null): number {
  const k = kind?.toLowerCase();
  if (k === 'highway' || k === 'major_road') {
    return zoom >= 16 ? 13 : 12;
  }
  return zoom >= 17 ? 13 : 12;
}

/**
 * Bangkok PMTiles bounding box metadata (from bangkok.pmtiles header):
 * [100.30, 13.50, 100.95, 14.10] (minLon, minLat, maxLon, maxLat).
 */
export const BANGKOK_PMTILES_BBOX = {
  minLon: 100.30,
  minLat: 13.50,
  maxLon: 100.95,
  maxLat: 14.10,
} as const;

/** Constant padding (in degrees, ~5.5 km) added around Bangkok file bounds */
export const BANGKOK_BBOX_PADDING = 0.05;

/** Leaflet LatLngBoundsExpression: [[southWestLat, southWestLng], [northEastLat, northEastLng]] */
export const BANGKOK_MAX_BOUNDS: [[number, number], [number, number]] = [
  [BANGKOK_PMTILES_BBOX.minLat - BANGKOK_BBOX_PADDING, BANGKOK_PMTILES_BBOX.minLon - BANGKOK_BBOX_PADDING],
  [BANGKOK_PMTILES_BBOX.maxLat + BANGKOK_BBOX_PADDING, BANGKOK_PMTILES_BBOX.maxLon + BANGKOK_BBOX_PADDING],
];

/** Viscosity factor keeping panning comfortably within Bangkok bounds */
export const BANGKOK_MAX_BOUNDS_VISCOSITY = 0.8;

/** Sensible minZoom so user cannot zoom out into blank gray area beyond Bangkok */
export const BANGKOK_PMTILES_MIN_ZOOM = 9;

export interface LabelPalette {
  roadText: string;
  roadHalo: string;
  poiPriorityText: string;
  poiPriorityHalo: string;
  poiGeneralText: string;
  poiGeneralHalo: string;
  placeText: string;
  placeHalo: string;
  waterText: string;
}

export function getLabelPalette(flavorName: 'dark' | 'light', flavor: Flavor): LabelPalette {
  if (flavorName === 'light') {
    return {
      roadText: '#1E293B',
      roadHalo: '#FFFFFF',
      poiPriorityText: '#0F172A',
      poiPriorityHalo: '#FFFFFF',
      poiGeneralText: '#334155',
      poiGeneralHalo: '#FFFFFF',
      placeText: '#475569',
      placeHalo: '#FFFFFF',
      waterText: flavor.ocean_label || '#0284C7',
    };
  }

  // Dark flavor high-contrast palette
  return {
    roadText: '#F8FAFC',
    roadHalo: '#0F172A',
    poiPriorityText: '#F8FAFC',
    poiPriorityHalo: '#0F172A',
    poiGeneralText: '#CBD5E1',
    poiGeneralHalo: '#0F172A',
    placeText: '#94A3B8',
    placeHalo: '#0F172A',
    waterText: flavor.ocean_label || '#38BDF8',
  };
}

/**
 * Creates custom label rules tuned for Bangkok mobile map readability.
 * Pure, unit-testable function.
 */
export function createMapLabelRules(flavor: Flavor, flavorName: 'dark' | 'light' = 'dark', lang: string = 'th'): LabelRule[] {
  const palette = getLabelPalette(flavorName, flavor);
  const labelProps = [`name:${lang}`, 'name'];

  const rules: LabelRule[] = [
    // 1. Places: macrohood (subdistricts/districts, e.g. Wang Mai, Pathum Wan) at lower zooms
    {
      dataLayer: 'places',
      minzoom: 10,
      maxzoom: 14,
      symbolizer: new CenteredTextSymbolizer({
        labelProps,
        fill: palette.placeText,
        stroke: palette.placeHalo,
        width: 2,
        font: '600 13px sans-serif',
      }),
      filter: (_z, f) => f.props.kind === 'macrohood' && Boolean(f.props.name || f.props[`name:${lang}`]),
    },

    // 2. Places: neighbourhood (e.g. Siam, Ratchathewi)
    {
      dataLayer: 'places',
      minzoom: 12,
      maxzoom: 15,
      symbolizer: new CenteredTextSymbolizer({
        labelProps,
        fill: palette.placeText,
        stroke: palette.placeHalo,
        width: 2,
        font: '500 12px sans-serif',
      }),
      filter: (_z, f) => f.props.kind === 'neighbourhood' && Boolean(f.props.name || f.props[`name:${lang}`]),
    },

    // 3. Places: locality (cities, e.g. Bangkok)
    {
      dataLayer: 'places',
      minzoom: 7,
      maxzoom: 12,
      symbolizer: new CenteredTextSymbolizer({
        labelProps,
        fill: palette.placeText,
        stroke: palette.placeHalo,
        width: 2.5,
        font: '600 14px sans-serif',
      }),
      filter: (_z, f) => f.props.kind === 'locality' && Boolean(f.props.name || f.props[`name:${lang}`]),
    },

    // 4. Roads: Major roads & highways (minzoom 12)
    {
      dataLayer: 'roads',
      minzoom: 12,
      symbolizer: new LineLabelSymbolizer({
        labelProps,
        fill: palette.roadText,
        stroke: palette.roadHalo,
        width: 2.5,
        font: (z) => `${z >= 16 ? '600' : '500'} ${getRoadFontSize(z, 'major_road')}px sans-serif`,
      }),
      filter: (_z, f) => {
        const k = (f.props.kind as string) || '';
        return (k === 'highway' || k === 'major_road') && Boolean(f.props.name || f.props[`name:${lang}`]);
      },
    },

    // 5. Roads: Minor roads / lanes / soi / paths (minzoom 15 and overzoom)
    {
      dataLayer: 'roads',
      minzoom: 15,
      symbolizer: new LineLabelSymbolizer({
        labelProps,
        fill: palette.roadText,
        stroke: palette.roadHalo,
        width: 2.5,
        font: (z) => `500 ${getRoadFontSize(z, 'minor_road')}px sans-serif`,
      }),
      filter: (_z, f) => {
        const k = (f.props.kind as string) || '';
        return k !== 'highway' && k !== 'major_road' && Boolean(f.props.name || f.props[`name:${lang}`]);
      },
    },

    // 6. Water: rivers, canals, lakes (e.g. Khlong Saen Saep)
    {
      dataLayer: 'water',
      symbolizer: new CenteredTextSymbolizer({
        labelProps,
        fill: palette.waterText,
        lineHeight: 1.5,
        letterSpacing: 1,
        font: (z) => `400 ${linear([[3, 10], [10, 12]])(z)}px sans-serif`,
        textTransform: 'uppercase',
      }),
      filter: (_z, f) => f.geomType === 1 && ['ocean', 'bay', 'strait', 'fjord'].includes(f.props.kind as string),
    },
    {
      dataLayer: 'water',
      symbolizer: new CenteredTextSymbolizer({
        labelProps,
        fill: palette.waterText,
        lineHeight: 1.5,
        letterSpacing: 1,
        font: (z) => `400 ${linear([[3, 10], [6, 12], [10, 12]])(z)}px sans-serif`,
      }),
      filter: (_z, f) => f.geomType === 1 && ['sea', 'lake', 'water'].includes(f.props.kind as string),
    },

    // 7. POIs: Priority kinds from zoom 15+ (universities, hospitals, hotels, malls, stations, parks, etc.)
    {
      dataLayer: 'pois',
      minzoom: 15,
      symbolizer: new CenteredTextSymbolizer({
        labelProps,
        fill: palette.poiPriorityText,
        stroke: palette.poiPriorityHalo,
        width: 2.5,
        font: (z) => `${z >= 17 ? '600' : '600'} ${getPoiFontSize(z, 'university')}px sans-serif`,
      }),
      sort: (a, b) => {
        const mzA = typeof a.min_zoom === 'number' ? a.min_zoom : 15;
        const mzB = typeof b.min_zoom === 'number' ? b.min_zoom : 15;
        return mzA - mzB;
      },
      filter: (_z, f) => {
        const hasName = Boolean(f.props.name || f.props[`name:${lang}`]);
        return hasName && isPriorityPoiKind(f.props.kind as string);
      },
    },

    // 8. POIs: All other named POIs from zoom 17+ with collision handling
    {
      dataLayer: 'pois',
      minzoom: 17,
      symbolizer: new CenteredTextSymbolizer({
        labelProps,
        fill: palette.poiGeneralText,
        stroke: palette.poiGeneralHalo,
        width: 2,
        font: (z) => `500 ${getPoiFontSize(z)}px sans-serif`,
      }),
      sort: (a, b) => {
        const mzA = typeof a.min_zoom === 'number' ? a.min_zoom : 17;
        const mzB = typeof b.min_zoom === 'number' ? b.min_zoom : 17;
        return mzA - mzB;
      },
      filter: (_z, f) => {
        const hasName = Boolean(f.props.name || f.props[`name:${lang}`]);
        return hasName && !isPriorityPoiKind(f.props.kind as string);
      },
    },
  ];

  return rules;
}

/**
 * Returns full protomaps configuration including custom label rules and paint rules
 * for the requested flavor.
 */
export function getMapOptions(flavorName: 'dark' | 'light', lang: string = 'th'): {
  paintRules: PaintRule[];
  labelRules: LabelRule[];
  backgroundColor: string;
} {
  const flavor = namedFlavor(flavorName);
  return {
    paintRules: paintRules(flavor),
    labelRules: createMapLabelRules(flavor, flavorName, lang),
    backgroundColor: flavor.background,
  };
}

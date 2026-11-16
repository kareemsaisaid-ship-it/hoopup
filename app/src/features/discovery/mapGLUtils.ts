import { layers, namedFlavor } from '@protomaps/basemaps';
import type { FeatureCollection, Point } from 'geojson';
import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';
import type { Court } from '../../services';
import type { PinnedCourt } from './courtMapUtils';
import { PROTOMAPS_ATTRIBUTION, type MapEnv } from './mapConfig';

export const GL_MAX_BOUNDS: [[number, number], [number, number]] = [[100.25, 13.45], [101, 14.15]];

// All outputs exist in both bundled v4 sprite manifests. Unknown POI kinds use
// the building icon; never pass arbitrary tile properties to icon-image.
export const POI_ICON_BY_KIND: Record<string, string> = Object.fromEntries([
  'beach', 'forest', 'marina', 'park', 'peak', 'zoo', 'garden', 'bench',
  'aerodrome', 'bus_stop', 'ferry_terminal', 'stadium', 'university', 'library',
  'school', 'animal', 'toilets', 'drinking_water', 'post_office', 'building',
  'restaurant', 'fast_food', 'cafe', 'bar', 'supermarket', 'convenience', 'books',
  'beauty', 'electronics', 'clothes', 'attraction', 'museum', 'theatre', 'artwork',
].map(kind => [kind, kind]).concat([['station', 'train_station'], ['townhall', 'building']]));

export function placeLabelPaint(env: MapEnv) {
  const light = env.VITE_MAP_PMTILES_FLAVOR === 'light';
  return { 'text-color': light ? '#172033' : '#f8fafc',
    'text-halo-color': light ? '#f8fafc' : '#172033', 'text-halo-width': 1.5 };
}

export function buildGLStyle(env: MapEnv, origin: string, assetBase: string): StyleSpecification {
  const flavor = env.VITE_MAP_PMTILES_FLAVOR === 'light' ? 'light' : 'dark';
  const url = env.VITE_MAP_TILES === 'off' ? undefined : env.VITE_MAP_PMTILES_URL?.trim();
  const assets = new URL(`${assetBase}map-assets/`, origin).href;
  const basemapLayers = url ? layers('basemap', { ...namedFlavor(flavor), italic: 'Noto Sans Regular' }, { lang: 'th' }) : [];
  for (const layer of basemapLayers) {
    if (layer.type === 'symbol' && layer['source-layer'] === 'pois' && layer.layout) {
      layer.layout['icon-image'] = ['match', ['get', 'kind'],
        'station', 'train_station',
        ...Object.entries(POI_ICON_BY_KIND).filter(([kind]) => kind !== 'station').flat(), 'building'] as ExpressionSpecification;
    }
  }
  return {
    version: 8,
    glyphs: `${assets}fonts/{fontstack}/{range}.pbf`,
    ...(url ? { sprite: `${assets}sprites/v4/${flavor}` } : {}),
    sources: url ? { basemap: { type: 'vector', url: `pmtiles://${new URL(url, origin).href}`, maxzoom: 15, attribution: PROTOMAPS_ATTRIBUTION } } : {},
    layers: url ? basemapLayers : [
      { id: 'plain-background', type: 'background', paint: { 'background-color': flavor === 'dark' ? '#151d2a' : '#e8edf2' } },
    ],
  };
}

export function courtsGeoJSON(courts: PinnedCourt[]): FeatureCollection<Point> {
  return { type: 'FeatureCollection', features: courts.map(c => ({
    type: 'Feature', id: c.id, properties: { courtId: c.id },
    geometry: { type: 'Point', coordinates: [c.longitude, c.latitude] },
  })) };
}

/** Data goes only into text nodes; court names/addresses are never HTML. */
export function buildCourtPopup(court: Court, navigate: (url: string) => void): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'court-popup-card';
  const title = document.createElement('h3');
  title.dataset.testid = 'court-popup-name'; title.className = 'court-popup-title'; title.textContent = court.name;
  card.append(title);
  if (court.osmQuality === 'positive' || court.osmQuality === 'unverified') {
    const badge = document.createElement('div');
    badge.dataset.testid = 'court-popup-osm-badge'; badge.className = 'court-popup-osm-badge';
    badge.textContent = court.osmQuality === 'positive' ? 'เปิดสาธารณะตามข้อมูล OSM' : 'ข้อมูลจาก OSM ยังไม่ยืนยัน';
    card.append(badge);
  }
  if (court.address) {
    const address = document.createElement('div');
    address.dataset.testid = 'court-popup-address'; address.className = 'court-popup-address'; address.textContent = `📍 ${court.address}`;
    card.append(address);
  }
  const actions = document.createElement('div'); actions.className = 'court-popup-actions';
  for (const [testid, label, url, variant] of [
    ['court-popup-view-sessions', 'ดูห้องเล่น', `/?court=${encodeURIComponent(court.id)}`, 'outline'],
    ['court-popup-create-session', 'สร้างห้องที่นี่', `/sessions/new?court=${encodeURIComponent(court.id)}`, 'primary'],
  ]) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.testid = testid;
    button.className = `court-popup-btn court-popup-btn-${variant}`; button.textContent = label;
    button.style.minHeight = '44px'; button.style.minWidth = '44px';
    button.onclick = e => { e.stopPropagation(); navigate(url); }; actions.append(button);
  }
  card.append(actions); return card;
}

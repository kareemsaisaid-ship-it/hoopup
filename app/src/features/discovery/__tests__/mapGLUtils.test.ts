import { describe, it, expect, vi, afterEach } from 'vitest';
import darkSprite from '../../../../public/map-assets/sprites/v4/dark.json';
import lightSprite from '../../../../public/map-assets/sprites/v4/light.json';
import { buildGLStyle, courtsGeoJSON, POI_ICON_BY_KIND, placeLabelPaint } from '../mapGLUtils';
import { getEffectiveMapEnv, resolveMapEngine, resolveMapPreserveBuffer } from '../mapConfig';
import { splitCourtsByCoordinates } from '../courtMapUtils';
import type { Court } from '../../../services';

describe('MAP6 GL configuration and source data', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it('defaults to GL for unset/invalid flags and keeps explicit Leaflet', () => {
    expect(resolveMapEngine()).toBe('maplibre');
    expect(resolveMapEngine({ VITE_MAP_ENGINE: 'invalid' })).toBe('maplibre');
    expect(resolveMapEngine({ VITE_MAP_ENGINE: '' })).toBe('maplibre');
    expect(resolveMapEngine({ VITE_MAP_ENGINE: 'maplibre' })).toBe('maplibre');
    expect(resolveMapEngine({ VITE_MAP_ENGINE: 'leaflet' })).toBe('leaflet');
  });
  it('selects Leaflet from build env, storage and runtime config in precedence order', () => {
    vi.stubEnv('VITE_MAP_ENGINE', 'leaflet');
    expect(resolveMapEngine(getEffectiveMapEnv())).toBe('leaflet');
    vi.stubEnv('VITE_MAP_ENGINE', 'maplibre');
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => key === 'VITE_MAP_ENGINE' ? 'leaflet' : null } });
    expect(resolveMapEngine(getEffectiveMapEnv())).toBe('leaflet');
    vi.stubGlobal('window', { __HOOPUP_CONFIG__: { VITE_MAP_ENGINE: 'leaflet' }, localStorage: { getItem: () => 'maplibre' } });
    expect(resolveMapEngine(getEffectiveMapEnv())).toBe('leaflet');
  });
  it('preserves the drawing buffer only for explicit on, including runtime and storage overrides', () => {
    for (const flag of [undefined, '', 'off', 'true', 'invalid']) {
      expect(resolveMapPreserveBuffer({ VITE_MAP_PRESERVE_BUFFER: flag })).toBe(false);
    }
    expect(resolveMapPreserveBuffer()).toBe(false);
    expect(resolveMapPreserveBuffer({ VITE_MAP_PRESERVE_BUFFER: 'on' })).toBe(true);
    vi.stubEnv('VITE_MAP_PRESERVE_BUFFER', 'on');
    expect(resolveMapPreserveBuffer(getEffectiveMapEnv())).toBe(true);
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => key === 'VITE_MAP_PRESERVE_BUFFER' ? 'off' : null } });
    expect(resolveMapPreserveBuffer(getEffectiveMapEnv())).toBe(false);
    vi.stubGlobal('window', { __HOOPUP_CONFIG__: { VITE_MAP_PRESERVE_BUFFER: 'on' }, localStorage: { getItem: () => 'off' } });
    expect(resolveMapPreserveBuffer(getEffectiveMapEnv())).toBe(true);
  });
  for (const flavor of ['dark', 'light']) it(`uses only bundled ${flavor} POI icons, with a safe fallback for unknown kinds`, () => {
    const sprite = flavor === 'light' ? lightSprite : darkSprite;
    const style = buildGLStyle({ VITE_MAP_PMTILES_URL: '/tiles/x.pmtiles', VITE_MAP_PMTILES_FLAVOR: flavor }, 'http://localhost', '/');
    const poi = style.layers.find(layer => layer.type === 'symbol' && layer['source-layer'] === 'pois');
    expect(poi?.type).toBe('symbol');
    if (poi?.type !== 'symbol') throw new Error('POI layer missing');
    const expression = poi.layout!['icon-image'] as unknown[];
    expect(expression.slice(0, 2)).toEqual(['match', ['get', 'kind']]);
    const mappings = Object.fromEntries(Array.from({ length: (expression.length - 3) / 2 }, (_, i) => [expression[2 + i * 2], expression[3 + i * 2]]));
    expect(mappings).toEqual(POI_ICON_BY_KIND);
    expect(mappings.station).toBe('train_station'); expect(mappings.townhall).toBe('building');
    const kinds = (poi.filter as unknown[])[1] as unknown[];
    for (const kind of ((kinds[2] as unknown[])[1] as string[])) expect(mappings[kind], kind).toBeDefined();
    for (const icon of [...Object.values(mappings), expression.at(-1)]) expect(sprite).toHaveProperty(String(icon));
    expect(expression.at(-1)).toBe('building');
  });
  it('uses light text/dark halo on dark maps and dark text/light halo on light maps', () => {
    expect(placeLabelPaint({})).toEqual({ 'text-color': '#f8fafc', 'text-halo-color': '#172033', 'text-halo-width': 1.5 });
    expect(placeLabelPaint({ VITE_MAP_PMTILES_FLAVOR: 'light' })).toEqual({ 'text-color': '#172033', 'text-halo-color': '#f8fafc', 'text-halo-width': 1.5 });
  });
  it('uses a plain background without an archive, even if raster URL is configured', () => {
    const style = buildGLStyle({ VITE_MAP_TILE_URL: 'https://example.com/tile' }, 'http://localhost', '/');
    expect(style.sources).toEqual({}); expect(style.layers.map(l => l.type)).toEqual(['background']);
    expect(style.sprite).toBeUndefined();
  });
  it('tiles=off wins over a configured archive', () => {
    expect(buildGLStyle({ VITE_MAP_TILES: 'off', VITE_MAP_PMTILES_URL: '/tiles/x.pmtiles' }, 'http://localhost', '/').sources).toEqual({});
  });
  for (const flavor of ['dark', 'light']) it(`builds Thai ${flavor} labels and local assets under the app base`, () => {
    const style = buildGLStyle({ VITE_MAP_PMTILES_URL: '/tiles/x.pmtiles', VITE_MAP_PMTILES_FLAVOR: flavor }, 'http://localhost', '/app/');
    expect(style.sources.basemap).toMatchObject({ url: 'pmtiles://http://localhost/tiles/x.pmtiles', maxzoom: 15 });
    expect(style.glyphs).toBe('http://localhost/app/map-assets/fonts/{fontstack}/{range}.pbf');
    expect(style.sprite).toBe(`http://localhost/app/map-assets/sprites/v4/${flavor}`);
    const symbols = style.layers.filter(l => l.type === 'symbol');
    expect(symbols.length).toBeGreaterThan(0);
    expect(JSON.stringify(symbols)).toContain('name:th');
    expect(JSON.stringify(symbols)).toContain('icon-image');
    expect(JSON.stringify(symbols)).not.toContain('Noto Sans Italic');
  });
  it('maps valid court coordinates to GeoJSON longitude/latitude without dropping ids', () => {
    const courts = [{ id: 'safe-id', name: '<img onerror=alert(1)>', latitude: 13.7, longitude: 100.5 },
      { id: 'missing', latitude: null, longitude: 100.5 }] as Court[];
    const data = courtsGeoJSON(splitCourtsByCoordinates(courts).pinned);
    expect(data.features).toEqual([{ type: 'Feature', id: 'safe-id', properties: { courtId: 'safe-id' }, geometry: { type: 'Point', coordinates: [100.5, 13.7] } }]);
  });
});

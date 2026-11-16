/**
 * Map Configuration for HoopUp Discovery Map
 *
 * NOTE: The public OpenStreetMap standard tile server (tile.openstreetmap.org)
 * is for light / development use only under the OSM Tile Usage Policy.
 * Production environments require a dedicated tile provider (e.g. Mapbox, Stadia Maps, Protomaps, or self-hosted tile server).
 */

export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>';

export const PROTOMAPS_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> | <a href="https://protomaps.com" target="_blank" rel="noopener noreferrer">Protomaps</a>';

export const BANGKOK_FALLBACK_CENTER: [number, number] = [13.7563, 100.5018];
export const BANGKOK_FALLBACK_ZOOM = 11;

export interface MapEnv {
  VITE_PLACES_API_URL?: string;
  VITE_PLACES?: string;
  VITE_MAP_ENGINE?: string;
  VITE_MAP_PRESERVE_BUFFER?: string;
  VITE_MAP_TILES?: string;
  VITE_MAP_PMTILES_URL?: string;
  VITE_MAP_TILE_URL?: string;
  VITE_MAP_TILE_ATTRIBUTION?: string;
  VITE_MAP_PMTILES_FLAVOR?: string;
}

export type BasemapConfig =
  | { kind: 'none' }
  | { kind: 'pmtiles'; url: string; attribution: string; flavor: 'dark' | 'light' }
  | { kind: 'raster'; url: string; attribution: string };

/**
 * Resolves basemap provider based on env flags and priority rules:
 * Priority: PMTILES_URL > TILE_URL > OSM default.
 * VITE_MAP_TILES=off disables every basemap (pins only).
 */
export function resolveBasemap(env: MapEnv = {}): BasemapConfig {
  if (env.VITE_MAP_TILES === 'off') {
    return { kind: 'none' };
  }

  const pmtilesUrl = env.VITE_MAP_PMTILES_URL?.trim();
  if (pmtilesUrl) {
    const flavor: 'dark' | 'light' = env.VITE_MAP_PMTILES_FLAVOR === 'light' ? 'light' : 'dark';
    return {
      kind: 'pmtiles',
      url: pmtilesUrl,
      attribution: PROTOMAPS_ATTRIBUTION,
      flavor,
    };
  }

  const rasterUrl = env.VITE_MAP_TILE_URL?.trim();
  if (rasterUrl) {
    return {
      kind: 'raster',
      url: rasterUrl,
      attribution: env.VITE_MAP_TILE_ATTRIBUTION || OSM_ATTRIBUTION,
    };
  }

  return {
    kind: 'raster',
    url: OSM_TILE_URL,
    attribution: env.VITE_MAP_TILE_ATTRIBUTION || OSM_ATTRIBUTION,
  };
}

/**
 * Reads effective map configuration with support for test/runtime overrides via
 * window.__HOOPUP_CONFIG__ or localStorage.
 */
export function getEffectiveMapEnv(): MapEnv {
  let runtimeConfig: Record<string, string | undefined> | undefined;
  if (typeof window !== 'undefined') {
    const win = window as unknown as { __HOOPUP_CONFIG__?: Record<string, string | undefined> };
    runtimeConfig = win.__HOOPUP_CONFIG__;
  }

  const getStorage = (key: string): string | undefined => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key) ?? undefined;
      }
    } catch {
      // Ignore storage access errors in sandboxed test contexts
    }
    return undefined;
  };

  return {
    VITE_PLACES_API_URL:
      runtimeConfig?.VITE_PLACES_API_URL ?? getStorage('VITE_PLACES_API_URL') ?? import.meta.env.VITE_PLACES_API_URL,
    VITE_PLACES:
      runtimeConfig?.VITE_PLACES ?? getStorage('VITE_PLACES') ?? import.meta.env.VITE_PLACES,
    VITE_MAP_ENGINE:
      runtimeConfig?.VITE_MAP_ENGINE ?? getStorage('VITE_MAP_ENGINE') ?? import.meta.env.VITE_MAP_ENGINE,
    VITE_MAP_PRESERVE_BUFFER:
      runtimeConfig?.VITE_MAP_PRESERVE_BUFFER ?? getStorage('VITE_MAP_PRESERVE_BUFFER') ?? import.meta.env.VITE_MAP_PRESERVE_BUFFER,
    VITE_MAP_TILES:
      runtimeConfig?.VITE_MAP_TILES ??
      getStorage('VITE_MAP_TILES') ??
      import.meta.env.VITE_MAP_TILES,
    VITE_MAP_PMTILES_URL:
      runtimeConfig?.VITE_MAP_PMTILES_URL ??
      getStorage('VITE_MAP_PMTILES_URL') ??
      import.meta.env.VITE_MAP_PMTILES_URL,
    VITE_MAP_TILE_URL:
      runtimeConfig?.VITE_MAP_TILE_URL ??
      getStorage('VITE_MAP_TILE_URL') ??
      import.meta.env.VITE_MAP_TILE_URL,
    VITE_MAP_TILE_ATTRIBUTION:
      runtimeConfig?.VITE_MAP_TILE_ATTRIBUTION ??
      getStorage('VITE_MAP_TILE_ATTRIBUTION') ??
      import.meta.env.VITE_MAP_TILE_ATTRIBUTION,
    VITE_MAP_PMTILES_FLAVOR:
      runtimeConfig?.VITE_MAP_PMTILES_FLAVOR ??
      getStorage('VITE_MAP_PMTILES_FLAVOR') ??
      import.meta.env.VITE_MAP_PMTILES_FLAVOR,
  };
}

export function resolveMapEngine(env: MapEnv = {}): 'leaflet' | 'maplibre' {
  return env.VITE_MAP_ENGINE === 'leaflet' ? 'leaflet' : 'maplibre';
}

/** Opt in only for pixel readback tests; leave off for normal rendering. */
export function resolveMapPreserveBuffer(env: MapEnv = {}): boolean {
  return env.VITE_MAP_PRESERVE_BUFFER === 'on';
}

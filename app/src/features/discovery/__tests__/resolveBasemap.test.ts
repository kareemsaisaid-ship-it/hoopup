import { describe, it, expect } from 'vitest';
import {
  resolveBasemap,
  OSM_TILE_URL,
  OSM_ATTRIBUTION,
  PROTOMAPS_ATTRIBUTION,
} from '../mapConfig';

describe('resolveBasemap (MAP4c)', () => {
  it('disables every basemap when VITE_MAP_TILES="off"', () => {
    expect(resolveBasemap({ VITE_MAP_TILES: 'off' })).toEqual({ kind: 'none' });
  });

  it('disables basemap when VITE_MAP_TILES="off" even if PMTILES_URL is provided', () => {
    expect(
      resolveBasemap({
        VITE_MAP_TILES: 'off',
        VITE_MAP_PMTILES_URL: 'http://127.0.0.1:8787/tiles/bangkok.pmtiles',
      })
    ).toEqual({ kind: 'none' });
  });

  it('disables basemap when VITE_MAP_TILES="off" even if TILE_URL is provided', () => {
    expect(
      resolveBasemap({
        VITE_MAP_TILES: 'off',
        VITE_MAP_TILE_URL: 'https://tiles.example.com/{z}/{x}/{y}.png',
      })
    ).toEqual({ kind: 'none' });
  });

  it('resolves PMTiles basemap with dark flavor by default when VITE_MAP_PMTILES_URL is set', () => {
    const res = resolveBasemap({
      VITE_MAP_PMTILES_URL: 'http://127.0.0.1:8787/tiles/bangkok.pmtiles',
    });
    expect(res).toEqual({
      kind: 'pmtiles',
      url: 'http://127.0.0.1:8787/tiles/bangkok.pmtiles',
      attribution: PROTOMAPS_ATTRIBUTION,
      flavor: 'dark',
    });
  });

  it('resolves PMTiles basemap with light flavor when VITE_MAP_PMTILES_FLAVOR="light"', () => {
    const res = resolveBasemap({
      VITE_MAP_PMTILES_URL: 'http://127.0.0.1:8787/tiles/bangkok.pmtiles',
      VITE_MAP_PMTILES_FLAVOR: 'light',
    });
    expect(res).toEqual({
      kind: 'pmtiles',
      url: 'http://127.0.0.1:8787/tiles/bangkok.pmtiles',
      attribution: PROTOMAPS_ATTRIBUTION,
      flavor: 'light',
    });
  });

  it('prioritizes PMTILES_URL over TILE_URL and OSM default', () => {
    const res = resolveBasemap({
      VITE_MAP_PMTILES_URL: 'http://127.0.0.1:8787/tiles/bangkok.pmtiles',
      VITE_MAP_TILE_URL: 'https://custom-tiles.example.com/{z}/{x}/{y}.png',
    });
    expect(res.kind).toBe('pmtiles');
    if (res.kind === 'pmtiles') {
      expect(res.url).toBe('http://127.0.0.1:8787/tiles/bangkok.pmtiles');
    }
  });

  it('resolves custom raster provider when TILE_URL is set and PMTILES_URL is unset', () => {
    const res = resolveBasemap({
      VITE_MAP_TILE_URL: 'https://custom-tiles.example.com/{z}/{x}/{y}.png',
      VITE_MAP_TILE_ATTRIBUTION: '&copy; Custom Map Provider',
    });
    expect(res).toEqual({
      kind: 'raster',
      url: 'https://custom-tiles.example.com/{z}/{x}/{y}.png',
      attribution: '&copy; Custom Map Provider',
    });
  });

  it('falls back to OSM public raster tiles when neither PMTILES_URL nor TILE_URL is set', () => {
    const res = resolveBasemap({});
    expect(res).toEqual({
      kind: 'raster',
      url: OSM_TILE_URL,
      attribution: OSM_ATTRIBUTION,
    });
  });

  it('ignores empty/whitespace PMTILES_URL and falls back correctly', () => {
    const res = resolveBasemap({
      VITE_MAP_PMTILES_URL: '   ',
      VITE_MAP_TILE_URL: 'https://custom-tiles.example.com/{z}/{x}/{y}.png',
    });
    expect(res.kind).toBe('raster');
    if (res.kind === 'raster') {
      expect(res.url).toBe('https://custom-tiles.example.com/{z}/{x}/{y}.png');
    }
  });
});

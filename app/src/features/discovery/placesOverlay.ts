import * as gl from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import type { PinnedCourt } from './courtMapUtils';
import { PROTOMAPS_ATTRIBUTION, type MapEnv } from './mapConfig';
import { placeLabelPaint } from './mapGLUtils';
import { buildPlacePopup, PLACES_CREDIT, PLACES_GROUPS, PLACES_LABEL_ZOOM, PLACES_MIN_ZOOM,
  PlacesCache, placeCaption, placesCacheKey, placesRequestBoxes, resolvePlacesUrl, sanitizePlaces, type Place } from './placesApi';

/** One viewport request at a time. Every move invalidates work immediately,
 * including late JSON parsing; moveend debounces replacement work by 300 ms. */
export function attachPlacesOverlay(map: gl.Map, env: MapEnv, courts: () => PinnedCourt[], status: (failed: boolean) => void) {
  const endpoint = resolvePlacesUrl(env, location.origin);
  const cache = new PlacesCache();
  let enabled = endpoint !== null, disposed = false, revision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let popup: gl.Popup | undefined;
  let attribution: gl.AttributionControl;
  let shown: Place[] = [];
  const updateAttribution = () => {
    if (attribution) map.removeControl(attribution);
    attribution = new gl.AttributionControl({ compact: true,
      customAttribution: `${PROTOMAPS_ATTRIBUTION}${enabled ? ` | ${PLACES_CREDIT}` : ''}` });
    map.addControl(attribution, 'bottom-right');
  };
  updateAttribution();
  const draw = (places: Place[]) => {
    shown = places;
    const pins = courts().map(c => map.project([c.longitude, c.latitude]));
    const data: FeatureCollection<Point> = { type: 'FeatureCollection', features: places.map(p => {
      const screen = map.project([p.x, p.y]);
      const caption = placeCaption(p.n);
      // DOM court markers are outside native symbol collision detection. Suppress
      // nearby labels explicitly, including their estimated text width.
      const nearCourt = pins.some(pin => Math.abs(pin.x - screen.x) < 44 + caption.length * 8
        && Math.abs(pin.y - screen.y) < 55);
      const group = PLACES_GROUPS[p.g];
      return { type: 'Feature', id: p.i, geometry: { type: 'Point', coordinates: [p.x, p.y] },
        properties: { id: p.i, name: nearCourt ? '' : caption, color: group.color,
          icon: group.icon && map.hasImage(group.icon) ? group.icon : '' } };
    }) };
    (map.getSource('nearby-places') as gl.GeoJSONSource | undefined)?.setData(data);
    map.getContainer().dataset.placeCount = String(places.length);
  };
  const cancel = () => {
    revision++; clearTimeout(timer); controller?.abort(); controller = undefined;
  };
  const load = async () => {
    if (disposed || !enabled || !endpoint || map.getZoom() < PLACES_MIN_ZOOM) return;
    const bounds = map.getBounds();
    const boxes = placesRequestBoxes([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]);
    if (!boxes.length) { draw([]); return; }
    const box = boxes[0], key = placesCacheKey(box), cached = cache.get(key);
    if (cached) { draw(cached); status(false); return; }
    const current = revision;
    const request = new AbortController(); controller = request;
    try {
      const url = new URL(endpoint); url.searchParams.set('bbox', key); url.searchParams.set('limit', '300');
      url.searchParams.set('cats', Object.keys(PLACES_GROUPS).join(','));
      // Redirects are forbidden: the configured endpoint is the only allowed host.
      const response = await fetch(url, { signal: request.signal, credentials: 'omit', redirect: 'error' });
      if (!response.ok) throw new Error('Places unavailable');
      const places = sanitizePlaces(await response.json()).filter(p => p.x >= box[0] && p.x <= box[2] && p.y >= box[1] && p.y <= box[3]);
      if (disposed || request.signal.aborted || revision !== current) return;
      cache.set(key, places); draw(places); status(false);
    } catch {
      if (!disposed && !request.signal.aborted && revision === current) { draw([]); popup?.remove(); status(true); }
    } finally { if (controller === request) controller = undefined; }
  };
  const schedule = () => {
    cancel();
    if (!enabled || map.getZoom() < PLACES_MIN_ZOOM) { draw([]); popup?.remove(); status(false); return; }
    draw(shown); timer = setTimeout(() => { void load(); }, 300);
  };
  const moving = () => {
    cancel(); popup?.remove(); status(false);
    // Keep the last source while panning or awaiting replacement data. Reproject
    // court exclusions on moveend; only leaving the zoom gate clears on move.
    if (map.getZoom() < PLACES_MIN_ZOOM) draw([]);
  };
  const move = () => { if (map.getZoom() < PLACES_MIN_ZOOM && shown.length) draw([]); };
  const click = (event: gl.MapMouseEvent) => {
    if (!enabled || map.getZoom() < PLACES_MIN_ZOOM) return;
    const feature = map.queryRenderedFeatures(event.point, { layers: ['nearby-place-dots', 'nearby-place-icons'] })[0];
    const place = shown.find(p => p.i === feature?.properties.id);
    if (!place) return;
    popup?.remove();
    popup = new gl.Popup({ offset: 12, maxWidth: '240px', className: 'hoopup-place-popup' })
      .setLngLat([place.x, place.y]).setDOMContent(buildPlacePopup(place)).addTo(map);
  };
  map.addSource('nearby-places', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'nearby-place-dots', type: 'circle', source: 'nearby-places', minzoom: PLACES_MIN_ZOOM,
    filter: ['==', ['get', 'icon'], ''], paint: { 'circle-radius': 5, 'circle-color': ['get', 'color'],
      'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } });
  map.addLayer({ id: 'nearby-place-icons', type: 'symbol', source: 'nearby-places', minzoom: PLACES_MIN_ZOOM,
    filter: ['!=', ['get', 'icon'], ''], layout: { 'icon-image': ['get', 'icon'], 'icon-size': 0.9,
      'icon-allow-overlap': false, 'icon-padding': 4 } });
  map.addLayer({ id: 'nearby-place-labels', type: 'symbol', source: 'nearby-places', minzoom: PLACES_LABEL_ZOOM,
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 12,
      // Captions are capped at 40 characters; this large wrap width keeps them
      // on one line so the explicit court exclusion rectangle stays valid.
      'text-anchor': 'top', 'text-offset': [0, 1], 'text-max-width': 1000, 'text-allow-overlap': false, 'text-padding': 5 },
    paint: placeLabelPaint(env) });
  map.on('movestart', moving); map.on('move', move); map.on('moveend', schedule); map.on('click', click); schedule();
  return {
    setEnabled(value: boolean) {
      enabled = value && endpoint !== null; popup?.remove();
      for (const id of ['nearby-place-dots', 'nearby-place-icons', 'nearby-place-labels']) map.setLayoutProperty(id, 'visibility', enabled ? 'visible' : 'none');
      updateAttribution(); schedule();
    },
    refresh() { draw(shown); },
    dispose() {
      disposed = true; cancel(); popup?.remove();
      map.off('movestart', moving); map.off('move', move); map.off('moveend', schedule); map.off('click', click);
    },
  };
}

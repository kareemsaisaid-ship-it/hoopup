import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as gl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import './CourtsMapGL.css';
import type { CourtsMapProps } from './CourtsMap';
import { computeInitialMapBounds, splitCourtsByCoordinates, type PinnedCourt } from '../courtMapUtils';
import { getEffectiveMapEnv, resolveMapPreserveBuffer } from '../mapConfig';
import { resolvePlacesUrl } from '../placesApi';
import { attachPlacesOverlay } from '../placesOverlay';
import { buildCourtPopup, buildGLStyle, courtsGeoJSON, GL_MAX_BOUNDS } from '../mapGLUtils';

// One protocol registration per lazy module; Map.remove() releases map workers.
gl.setWorkerUrl(workerUrl);
gl.setWorkerCount(2);
const protocol = new Protocol();
gl.addProtocol('pmtiles', protocol.tile);

interface MapAdapter {
  setView: (lat: number | [number, number], lng: number, zoom?: number) => void;
  getCenter: () => { lat: number; lng: number };
  getZoom: () => number;
}
type MapWindow = Window & { __HOOPUP_MAP__?: MapAdapter };

export function CourtsMapGL({ courts, highlightCourtId }: CourtsMapProps) {
  const navigate = useNavigate();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<gl.Map | null>(null);
  const popupRef = useRef<gl.Popup | null>(null);
  const userRef = useRef<gl.Marker | null>(null);
  const syncRef = useRef<(() => void) | null>(null);
  const placesRef = useRef<ReturnType<typeof attachPlacesOverlay> | null>(null);
  const latest = useRef({ courts, highlightCourtId, navigate });
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [buildings, setBuildings] = useState(false);
  const [placesAvailable] = useState(() => resolvePlacesUrl(getEffectiveMapEnv(), location.origin) !== null);
  const [places, setPlaces] = useState(placesAvailable);
  const placesEnabledRef = useRef(placesAvailable);
  const [placesError, setPlacesError] = useState(false);
  const { pinned, missing } = useMemo(() => splitCourtsByCoordinates(courts), [courts]);

  useEffect(() => {
    latest.current = { courts, highlightCourtId, navigate };
    syncRef.current?.();
  }, [courts, highlightCourtId, navigate]);

  useEffect(() => {
    if (!container.current) return;
    let active = true;
    let initialized = false;
    let openedHighlight: string | null = null;
    let currentCourts: PinnedCourt[] = [];
    const markers = new Map<string, gl.Marker>();
    const env = getEffectiveMapEnv();
    let map: gl.Map;
    try {
      map = new gl.Map({
        container: container.current,
        style: buildGLStyle(env, location.origin, import.meta.env.BASE_URL),
        center: [100.5018, 13.7563], zoom: 11, minZoom: 9, maxZoom: 19,
        maxBounds: GL_MAX_BOUNDS, maxPitch: 70, cooperativeGestures: true,
        canvasContextAttributes: { preserveDrawingBuffer: resolveMapPreserveBuffer(env) },
        attributionControl: false,
      });
    } catch {
      queueMicrotask(() => { if (active) setMapError('ไม่สามารถเปิดแผนที่ WebGL ได้ กรุณาใช้มุมมองรายการ'); });
      return () => { active = false; };
    }
    mapRef.current = map;
    map.addControl(new gl.NavigationControl({ showCompass: false }), 'top-right');
    const adapter: MapAdapter = {
      setView: (lat, lng, zoom) => {
        const coords: [number, number] = Array.isArray(lat) ? [lat[1], lat[0]] : [lng, lat];
        map.jumpTo({ center: coords, zoom: Array.isArray(lat) ? lng : zoom });
      },
      getCenter: () => ({ lat: map.getCenter().lat, lng: map.getCenter().lng }),
      getZoom: () => map.getZoom(),
    };
    (window as MapWindow).__HOOPUP_MAP__ = adapter;
    const openCourt = (court: PinnedCourt) => {
      popupRef.current?.remove();
      popupRef.current = new gl.Popup({ offset: 24, maxWidth: '260px', className: 'hoopup-court-popup' })
        .setLngLat([court.longitude, court.latitude])
        .setDOMContent(buildCourtPopup(court, url => latest.current.navigate(url))).addTo(map);
    };
    const renderMarkers = () => {
      if (!active || !map.getSource('courts')) return;
      const visible = new Set<string>();
      for (const feature of map.querySourceFeatures('courts')) {
        if (feature.geometry.type !== 'Point') continue;
        const [lng, lat] = feature.geometry.coordinates;
        const screen = map.project([lng, lat]);
        if (screen.x < -30 || screen.y < -30 || screen.x > map.getCanvas().clientWidth + 30 || screen.y > map.getCanvas().clientHeight + 30) continue;
        const props = feature.properties;
        const cluster = Boolean(props.cluster);
        const key = cluster ? `cluster-${props.cluster_id}` : String(props.courtId);
        visible.add(key);
        if (markers.has(key)) continue;
        const court = cluster ? undefined : currentCourts.find(c => c.id === props.courtId);
        if (!cluster && !court) continue;
        const button = document.createElement('button'); button.type = 'button';
        button.className = cluster ? 'hoopup-gl-cluster' : 'hoopup-gl-pin';
        button.dataset.testid = cluster ? 'court-cluster' : 'court-pin';
        if (cluster) {
          button.textContent = String(props.point_count);
          button.dataset.clusterCount = String(props.point_count);
          button.setAttribute('aria-label', `${props.point_count} สนาม — ซูมเข้า`);
          button.onclick = event => {
            event.stopPropagation();
            const source = map.getSource('courts') as gl.GeoJSONSource;
            void source.getClusterExpansionZoom(Number(props.cluster_id)).then(zoom => {
              if (active) map.easeTo({ center: [lng, lat], zoom, duration: 250 });
            }).catch(() => { /* A source update may retire this cluster before expansion resolves. */ });
          };
        } else if (court) {
          button.dataset.courtId = court.id; button.title = court.name; button.setAttribute('aria-label', court.name);
          const ball = document.createElement('span'); ball.className = 'hoopup-gl-ball'; button.append(ball);
          button.onclick = event => { event.stopPropagation(); openCourt(court); };
        }
        markers.set(key, new gl.Marker({ element: button }).setLngLat([lng, lat]).addTo(map));
      }
      for (const [key, marker] of markers) if (!visible.has(key)) { marker.remove(); markers.delete(key); }
    };
    const sync = () => {
      if (!active || !map.getSource('courts')) return;
      currentCourts = splitCourtsByCoordinates(latest.current.courts).pinned;
      for (const marker of markers.values()) marker.remove(); markers.clear();
      (map.getSource('courts') as gl.GeoJSONSource).setData(courtsGeoJSON(currentCourts));
      placesRef.current?.refresh();
      const highlight = currentCourts.find(c => c.id === latest.current.highlightCourtId);
      if (highlight && openedHighlight !== highlight.id) {
        openedHighlight = highlight.id;
        map.jumpTo({ center: [highlight.longitude, highlight.latitude], zoom: 16 }); openCourt(highlight);
        initialized = true;
      } else if (!initialized && currentCourts.length) {
        const [[south, west], [north, east]] = computeInitialMapBounds(currentCourts, 0.8);
        map.fitBounds([[west, south], [east, north]], { padding: 40, maxZoom: 14, duration: 0 }); initialized = true;
      }
    };
    syncRef.current = sync;
    map.on('load', () => {
      if (!active) return;
      if (map.getSource('basemap')) {
        map.addLayer({ id: 'buildings-preview', type: 'fill-extrusion', source: 'basemap', 'source-layer': 'buildings', minzoom: 14,
          layout: { visibility: 'none' }, paint: {
            'fill-extrusion-color': env.VITE_MAP_PMTILES_FLAVOR === 'light' ? '#bcc3ca' : '#495971',
            'fill-extrusion-height': ['case', ['>', ['to-number', ['get', 'height'], 0], 0], ['to-number', ['get', 'height'], 8], 8],
            'fill-extrusion-base': ['max', 0, ['to-number', ['get', 'min_height'], 0]], 'fill-extrusion-opacity': 0.8,
          } }, map.getStyle().layers.find(layer => layer.type === 'symbol')?.id);
      }
      map.addSource('courts', { type: 'geojson', data: courtsGeoJSON([]), cluster: true, clusterRadius: 60, clusterMaxZoom: 14 });
      // This transparent layer drives native source loading. Accessible DOM markers above it
      // are reconciled from the actual Supercluster source, including its native counts/ids.
      map.addLayer({ id: 'courts-source', type: 'circle', source: 'courts', paint: { 'circle-radius': 1, 'circle-opacity': 0 } });
      placesRef.current = attachPlacesOverlay(map, env, () => currentCourts, failed => { if (active) setPlacesError(failed); });
      placesRef.current.setEnabled(placesEnabledRef.current);
      sync();
      if (container.current) container.current.dataset.ready = 'true';
    });
    map.on('render', renderMarkers);
    map.on('idle', () => { if (active && container.current) container.current.dataset.idle = 'true'; });
    map.on('moveend', () => {
      if (active && container.current) {
        container.current.dataset.bearing = String(map.getBearing());
        container.current.dataset.pitch = String(map.getPitch());
      }
    });
    map.on('error', event => { if (active) setMapError(`แผนที่โหลดไม่สำเร็จ: ${event.error.message}`); });
    return () => {
      active = false; syncRef.current = null;
      placesRef.current?.dispose(); placesRef.current = null;
      for (const marker of markers.values()) marker.remove(); markers.clear();
      popupRef.current?.remove(); popupRef.current = null;
      userRef.current?.remove(); userRef.current = null;
      map.off('render', renderMarkers); map.remove(); mapRef.current = null;
      if ((window as MapWindow).__HOOPUP_MAP__ === adapter) delete (window as MapWindow).__HOOPUP_MAP__;
    };
  }, []);

  const locate = () => {
    const map = mapRef.current;
    if (!map) return;
    if (!navigator.geolocation) { setLocateError('เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง'); return; }
    setLocating(true); setLocateError(null);
    navigator.geolocation.getCurrentPosition(position => {
      if (mapRef.current !== map) return;
      setLocating(false);
      const point: [number, number] = [position.coords.longitude, position.coords.latitude];
      map.jumpTo({ center: point, zoom: 14 });
      if (!userRef.current) {
        const element = document.createElement('div'); element.dataset.testid = 'user-location-pin';
        element.className = 'hoopup-gl-user'; element.title = 'ตำแหน่งของคุณ';
        const text = document.createElement('div'); text.textContent = 'ตำแหน่งของคุณ';
        userRef.current = new gl.Marker({ element }).setLngLat(point)
          .setPopup(new gl.Popup({ offset: 16 }).setDOMContent(text)).addTo(map);
      }
      userRef.current.setLngLat(point);
      if (!userRef.current.getPopup()?.isOpen()) userRef.current.togglePopup();
    }, error => {
      if (mapRef.current !== map) return;
      setLocating(false);
      setLocateError(error.code === 1 ? 'การเข้าถึงตำแหน่งถูกปฏิเสธ กรุณาอนุญาตการเข้าถึงตำแหน่งในเบราว์เซอร์'
        : error.code === 2 ? 'ไม่พบข้อมูลตำแหน่งปัจจุบันของคุณในขณะนี้'
        : error.code === 3 ? 'หมดเวลาค้นหาตำแหน่ง กรุณาตรวจสอบสัญญาณและลองใหม่อีกครั้ง'
        : 'ไม่สามารถเข้าถึงตำแหน่งของคุณได้ กรุณาลองใหม่อีกครั้ง');
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  };
  return <div className="hoopup-gl-wrapper">
    <div className="hoopup-gl-actions">
      <button type="button" data-testid="courts-locate" disabled={locating} onClick={locate}>{locating ? 'กำลังค้นหา...' : 'ใกล้ฉัน'}</button>
      <button type="button" data-testid="courts-north-up" onClick={() => mapRef.current?.easeTo({ bearing: 0, pitch: 0 })}>ทิศเหนือขึ้น</button>
      <button type="button" data-testid="courts-buildings" aria-pressed={buildings} onClick={() => {
        const map = mapRef.current; if (!map?.getLayer('buildings-preview')) return;
        map.setLayoutProperty('buildings-preview', 'visibility', buildings ? 'none' : 'visible');
        map.easeTo({ pitch: buildings ? 0 : 55 }); setBuildings(!buildings);
      }}>3D ตัวอย่าง{buildings ? ' · เปิด' : ''}</button>
      {placesAvailable && <button type="button" data-testid="courts-places" aria-pressed={places} onClick={() => {
        placesEnabledRef.current = !places; placesRef.current?.setEnabled(!places); setPlaces(!places);
      }}>ร้านค้า/สถานที่</button>}
      {missing.length > 0 && <span data-testid="courts-map-missing">{missing.length} สนามไม่มีพิกัด</span>}
    </div>
    {buildings && <small>ความสูงจากข้อมูลแผนที่ หรือ 8 ม. โดยประมาณ · ไม่ใช่ผลสำรวจ</small>}
    {places && placesAvailable && <small>สถานที่แสดงเมื่อซูมระดับ 16 ขึ้นไป · มุมมองกว้างแสดงเฉพาะกรอบกลางไม่เกิน 0.05°</small>}
    {placesError && <small role="status" data-testid="courts-places-status">ข้อมูลสถานที่ใกล้เคียงใช้ไม่ได้ชั่วคราว</small>}
    {locateError && <div role="alert" data-testid="courts-locate-error">{locateError}<button type="button" data-testid="courts-locate-error-close" aria-label="ปิดการแจ้งเตือนตำแหน่ง" onClick={() => setLocateError(null)}>✕</button></div>}
    {mapError && <div role="alert" data-testid="courts-map-error">{mapError}</div>}
    <div ref={container} className="hoopup-gl-map" data-testid="courts-map" data-map-engine="maplibre" data-pin-total={pinned.length} data-map-builds="1" />
  </div>;
}

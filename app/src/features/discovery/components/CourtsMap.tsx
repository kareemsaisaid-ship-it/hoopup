import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import type { Court } from '../../../services';
import { leafletLayer } from 'protomaps-leaflet';
import {
  BANGKOK_FALLBACK_CENTER,
  BANGKOK_FALLBACK_ZOOM,
  getEffectiveMapEnv,
  resolveBasemap,
} from '../mapConfig';
import {
  computeInitialMapBounds,
  splitCourtsByCoordinates,
} from '../courtMapUtils';
import {
  BANGKOK_MAX_BOUNDS,
  BANGKOK_MAX_BOUNDS_VISCOSITY,
  BANGKOK_PMTILES_MIN_ZOOM,
  getMapOptions,
} from '../mapLabels';

// Ensure Leaflet instance is accessible on global scope for protomaps-leaflet GridLayer subclassing
if (typeof window !== 'undefined' && !(window as unknown as { L?: typeof L }).L) {
  (window as unknown as { L: typeof L }).L = L;
}

export interface CourtsMapProps {
  courts: Court[];
  highlightCourtId?: string | null;
}

const courtPinIcon = L.divIcon({
  className: 'hoopup-court-pin-wrapper',
  html: `<div data-testid="court-pin" class="hoopup-court-pin" style="
    width: 32px;
    height: 32px;
    background: linear-gradient(135deg, var(--color-primary-hover, #FF8533) 0%, var(--color-primary, #FF6B00) 100%);
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid #FFFFFF;
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.35);
    cursor: pointer;
  "><span style="transform: rotate(45deg); font-size: 15px; line-height: 1; user-select: none;">🏀</span></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -30],
});

const userLocIcon = L.divIcon({
  className: 'hoopup-user-loc-wrapper',
  html: `<div data-testid="user-location-pin" class="hoopup-user-loc-pin" style="
    width: 22px;
    height: 22px;
    background-color: #3B82F6;
    border-radius: 50%;
    border: 3px solid #FFFFFF;
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.35), 0 2px 6px rgba(0, 0, 0, 0.3);
  "></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -11],
});

export const CourtsMap: React.FC<CourtsMapProps> = ({ courts, highlightCourtId }) => {
  const navigate = useNavigate();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const markerMapRef = useRef<Map<string, L.Marker>>(new Map());
  const userMarkerRef = useRef<L.Marker | null>(null);
  const hasInitialBoundsRef = useRef(false);
  const lastOpenedHighlightRef = useRef<string | null>(null);

  const [mapBuilds] = useState(1);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const { pinned, missing } = useMemo(() => splitCourtsByCoordinates(courts), [courts]);

  // 1. Initialize Leaflet Map once on mount, destroy on unmount
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: true,
      maxZoom: 19,
    });
    mapInstanceRef.current = map;
    if (typeof window !== 'undefined') {
      (window as unknown as { __HOOPUP_MAP__?: L.Map }).__HOOPUP_MAP__ = map;
    }

    // Add base layer based on resolved configuration (priority: PMTILES_URL > TILE_URL > OSM default).
    // VITE_MAP_TILES=off disables every basemap layer (used by Android demo).
    const basemap = resolveBasemap(getEffectiveMapEnv());
    if (basemap.kind === 'pmtiles') {
      map.setMaxBounds(BANGKOK_MAX_BOUNDS);
      map.setMinZoom(BANGKOK_PMTILES_MIN_ZOOM);
      map.options.maxBoundsViscosity = BANGKOK_MAX_BOUNDS_VISCOSITY;

      const { paintRules, labelRules, backgroundColor } = getMapOptions(basemap.flavor, 'th');

      leafletLayer({
        url: basemap.url,
        paintRules,
        labelRules,
        backgroundColor,
        lang: 'th',
        attribution: basemap.attribution,
        maxDataZoom: 15,
        maxZoom: 19,
      }).addTo(map);
    } else if (basemap.kind === 'raster') {
      L.tileLayer(basemap.url, {
        attribution: basemap.attribution,
        maxZoom: 19,
      }).addTo(map);
    }

    // Create marker cluster group with standard clustering options
    const clusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 80,
    });
    clusterGroupRef.current = clusterGroup;
    map.addLayer(clusterGroup);

    // Invalidate size to ensure clean tile rendering after layout paint
    const timer = setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 150);

    return () => {
      clearTimeout(timer);
      if (clusterGroupRef.current) {
        clusterGroupRef.current.clearLayers();
        clusterGroupRef.current = null;
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      if (typeof window !== 'undefined') {
        (window as unknown as { __HOOPUP_MAP__?: unknown }).__HOOPUP_MAP__ = undefined;
      }
      // F03: reset userMarkerRef.current = null whenever map is removed/unmounted
      userMarkerRef.current = null;
      hasInitialBoundsRef.current = false;
      lastOpenedHighlightRef.current = null;
    };
  }, []);

  // 2. When pinned courts or highlight change: only clear & re-add markers in clusterGroup
  useEffect(() => {
    const map = mapInstanceRef.current;
    const clusterGroup = clusterGroupRef.current;
    if (!map || !clusterGroup) return;

    // Clear previous markers
    clusterGroup.clearLayers();
    markerMapRef.current.clear();

    // Add pins for all courts with valid coordinates into cluster group
    pinned.forEach((court) => {
      const marker = L.marker([court.latitude, court.longitude], {
        icon: courtPinIcon,
        title: court.name,
      });

      // Construct popup DOM element to bind navigate cleanly
      const popupEl = document.createElement('div');
      popupEl.className = 'court-popup-card';
      popupEl.style.minWidth = '180px';
      popupEl.style.maxWidth = '240px';

      const titleEl = document.createElement('h3');
      titleEl.setAttribute('data-testid', 'court-popup-name');
      titleEl.className = 'court-popup-title';
      titleEl.textContent = court.name;
      popupEl.appendChild(titleEl);

      if (court.osmQuality === 'unverified') {
        const badgeEl = document.createElement('div');
        badgeEl.setAttribute('data-testid', 'court-popup-osm-badge');
        badgeEl.className = 'court-popup-osm-badge';
        badgeEl.style.fontSize = '0.7rem';
        badgeEl.style.fontWeight = '600';
        badgeEl.style.color = '#475569';
        badgeEl.style.backgroundColor = '#F1F5F9';
        badgeEl.style.border = '1px solid #E2E8F0';
        badgeEl.style.padding = '2px 6px';
        badgeEl.style.borderRadius = '9999px';
        badgeEl.style.marginTop = '2px';
        badgeEl.style.marginBottom = '4px';
        badgeEl.style.display = 'inline-block';
        badgeEl.textContent = 'ข้อมูลจาก OSM ยังไม่ยืนยัน';
        popupEl.appendChild(badgeEl);
      } else if (court.osmQuality === 'positive') {
        const badgeEl = document.createElement('div');
        badgeEl.setAttribute('data-testid', 'court-popup-osm-badge');
        badgeEl.className = 'court-popup-osm-badge';
        badgeEl.style.fontSize = '0.7rem';
        badgeEl.style.fontWeight = '600';
        badgeEl.style.color = '#15803D';
        badgeEl.style.backgroundColor = '#DCFCE7';
        badgeEl.style.border = '1px solid #86EFAC';
        badgeEl.style.padding = '2px 6px';
        badgeEl.style.borderRadius = '9999px';
        badgeEl.style.marginTop = '2px';
        badgeEl.style.marginBottom = '4px';
        badgeEl.style.display = 'inline-block';
        badgeEl.textContent = 'เปิดสาธารณะตามข้อมูล OSM';
        popupEl.appendChild(badgeEl);
      }

      if (court.address) {
        const addrEl = document.createElement('div');
        addrEl.setAttribute('data-testid', 'court-popup-address');
        addrEl.className = 'court-popup-address';
        addrEl.textContent = `📍 ${court.address}`;
        popupEl.appendChild(addrEl);
      }

      const actionsEl = document.createElement('div');
      actionsEl.className = 'court-popup-actions';

      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.setAttribute('data-testid', 'court-popup-view-sessions');
      viewBtn.className = 'court-popup-btn court-popup-btn-outline';
      viewBtn.textContent = 'ดูห้องเล่น';
      viewBtn.onclick = (e) => {
        e.stopPropagation();
        navigate(`/?court=${court.id}`);
      };
      actionsEl.appendChild(viewBtn);

      const createBtn = document.createElement('button');
      createBtn.type = 'button';
      createBtn.setAttribute('data-testid', 'court-popup-create-session');
      createBtn.className = 'court-popup-btn court-popup-btn-primary';
      createBtn.textContent = 'สร้างห้องที่นี่';
      createBtn.onclick = (e) => {
        e.stopPropagation();
        navigate(`/sessions/new?court=${court.id}`);
      };
      actionsEl.appendChild(createBtn);

      popupEl.appendChild(actionsEl);

      marker.bindPopup(popupEl, {
        className: 'hoopup-court-popup',
        closeButton: true,
        offset: [0, -10],
      });

      clusterGroup.addLayer(marker);
      markerMapRef.current.set(court.id, marker);
    });

    // Initial view:
    // 1. Highlighted pin -> set initial view at court, then zoomToShowLayer to uncluster if needed and open popup
    // 2. Dense area bounds (closest 80% around median, excluding far outliers like King's Court)
    // 3. Fallback to Bangkok center
    if (highlightCourtId && markerMapRef.current.has(highlightCourtId)) {
      if (lastOpenedHighlightRef.current !== highlightCourtId) {
        lastOpenedHighlightRef.current = highlightCourtId;
        const targetCourt = pinned.find((c) => c.id === highlightCourtId);
        const targetMarker = markerMapRef.current.get(highlightCourtId);
        if (targetCourt && targetMarker) {
          map.setView([targetCourt.latitude, targetCourt.longitude], 14);
          clusterGroup.zoomToShowLayer(targetMarker, () => {
            targetMarker.openPopup();
          });
        }
      }
    } else if (!hasInitialBoundsRef.current && pinned.length > 0) {
      hasInitialBoundsRef.current = true;
      const bounds = computeInitialMapBounds(pinned, 0.8);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    } else if (!hasInitialBoundsRef.current) {
      map.setView(BANGKOK_FALLBACK_CENTER, BANGKOK_FALLBACK_ZOOM);
    }
  }, [pinned, highlightCourtId, navigate, mapBuilds]);

  // Handle "ใกล้ฉัน" Locate Button click
  const handleLocateMe = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setLocateError('เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง');
      return;
    }

    setIsLocating(true);
    setLocateError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setIsLocating(false);
        setLocateError(null);

        const map = mapInstanceRef.current;
        if (map) {
          map.setView([latitude, longitude], 14);

          if (userMarkerRef.current) {
            userMarkerRef.current.setLatLng([latitude, longitude]);
          } else {
            const userMarker = L.marker([latitude, longitude], {
              icon: userLocIcon,
              title: 'ตำแหน่งของคุณ',
            })
              .bindPopup('<div style="font-weight: 600; color: #0F172A; padding: 2px 4px;">📍 ตำแหน่งของคุณ</div>', {
                offset: [0, -5],
              })
              .addTo(map);
            userMarkerRef.current = userMarker;
          }

          userMarkerRef.current?.openPopup();
        }
      },
      (err) => {
        setIsLocating(false);
        let msg = 'ไม่สามารถเข้าถึงตำแหน่งของคุณได้ กรุณาลองใหม่อีกครั้ง';
        if (err.code === 1) {
          // PERMISSION_DENIED
          msg = 'การเข้าถึงตำแหน่งถูกปฏิเสธ กรุณาอนุญาตการเข้าถึงตำแหน่งในเบราว์เซอร์';
        } else if (err.code === 2) {
          // POSITION_UNAVAILABLE
          msg = 'ไม่พบข้อมูลตำแหน่งปัจจุบันของคุณในขณะนี้';
        } else if (err.code === 3) {
          // TIMEOUT
          msg = 'หมดเวลาค้นหาตำแหน่ง กรุณาตรวจสอบสัญญาณและลองใหม่อีกครั้ง';
        }
        setLocateError(msg);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Top Map Action Bar: Locate Me button & Missing coordinates notice */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          data-testid="courts-locate"
          onClick={handleLocateMe}
          disabled={isLocating}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'var(--color-surface, #151D2A)',
            border: '1px solid var(--color-border, #233044)',
            color: 'var(--color-text-primary, #F8FAFC)',
            borderRadius: '10px',
            padding: '8px 14px',
            fontSize: 'var(--font-sm, 0.875rem)',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)',
            minHeight: '44px',
            minWidth: '44px',
            boxSizing: 'border-box',
          }}
        >
          <span>{isLocating ? '⏳' : '🎯'}</span>
          <span>{isLocating ? 'กำลังค้นหา...' : 'ใกล้ฉัน'}</span>
        </button>

        {missing.length > 0 && (
          <span
            data-testid="courts-map-missing"
            style={{
              fontSize: 'var(--font-xs, 0.75rem)',
              color: 'var(--color-text-muted, #64748B)',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid var(--color-border-subtle, #192333)',
            }}
          >
            {missing.length} สนามไม่มีพิกัด
          </span>
        )}
      </div>

      {/* Geolocation Error Alert */}
      {locateError && (
        <div
          data-testid="courts-locate-error"
          style={{
            padding: '10px 14px',
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid var(--color-status-error, #EF4444)',
            borderRadius: '12px',
            color: 'var(--color-status-error, #EF4444)',
            fontSize: 'var(--font-sm, 0.875rem)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚠️</span>
            <span>{locateError}</span>
          </div>
          <button
            type="button"
            data-testid="courts-locate-error-close"
            aria-label="ปิดการแจ้งเตือนตำแหน่ง"
            onClick={() => setLocateError(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-status-error, #EF4444)',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 700,
              padding: '0',
              minWidth: '44px',
              minHeight: '44px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Map Canvas Container */}
      <div
        data-testid="courts-map"
        data-pin-total={pinned.length}
        data-map-builds={mapBuilds}
        ref={mapContainerRef}
        style={{
          height: '60vh',
          minHeight: '360px',
          maxHeight: '520px',
          width: '100%',
          borderRadius: '16px',
          overflow: 'hidden',
          border: '1px solid var(--color-border, #233044)',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.3)',
          position: 'relative',
          zIndex: 1,
        }}
      />
    </div>
  );
};

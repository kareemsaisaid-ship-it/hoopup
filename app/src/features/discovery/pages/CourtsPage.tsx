import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppServices, type Court } from '../../../services';
import { Button, EmptyState, Input, LoadingSpinner } from '../../../shared';
import { CourtCard } from '../components/CourtCard';
import { getEffectiveMapEnv, resolveMapEngine } from '../mapConfig';

const CourtsMap = lazy(() =>
  import('../components/CourtsMap').then((m) => ({ default: m.CourtsMap }))
);
const CourtsMapGL = lazy(() =>
  import('../components/CourtsMapGL').then((m) => ({ default: m.CourtsMapGL }))
);

export const CourtsPage: React.FC = () => {
  const MapComponent = resolveMapEngine(getEffectiveMapEnv()) === 'maplibre' ? CourtsMapGL : CourtsMap;
  const { data } = useAppServices();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const highlightCourtId = searchParams.get('court');

  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'map'>(() => {
    return searchParams.get('view') === 'map' ? 'map' : 'list';
  });

  const loadCourts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await data.listCourts();
      setCourts(res);
    } catch {
      setError('ไม่สามารถโหลดข้อมูลสนามได้ กรุณาตรวจสอบการเชื่อมต่อและลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  }, [data]);

  useEffect(() => {
    let active = true;
    data
      .listCourts()
      .then((res) => {
        if (active) {
          setCourts(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError('ไม่สามารถโหลดข้อมูลสนามได้ กรุณาตรวจสอบการเชื่อมต่อและลองใหม่อีกครั้ง');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [data]);

  const filteredCourts = useMemo(() => {
    if (!search.trim()) return courts;
    const q = search.toLowerCase();
    return courts.filter((c) => {
      const matchName = c.name.toLowerCase().includes(q);
      const matchAddr = c.address ? c.address.toLowerCase().includes(q) : false;
      return matchName || matchAddr;
    });
  }, [courts, search]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        paddingBottom: '80px',
        maxWidth: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Top Header matching reference dark theme */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          backgroundColor: '#0F172A',
          color: '#FFFFFF',
          borderRadius: '20px',
          padding: '16px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.25rem' }}>🏀</span>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>
              สนามบาสเกตบอล
            </h2>
          </div>
          <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
            ทั้งหมด {courts.length} สนาม
          </span>
        </div>

        {/* Segment Tabs: ห้องหาคน (Feed) vs สนาม (Courts) */}
        <div
          style={{
            display: 'flex',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            padding: '4px',
            gap: '4px',
          }}
        >
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{
              flex: 1,
              padding: '8px 12px',
              minHeight: '44px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: 'transparent',
              color: '#94A3B8',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            ห้องหาคน
          </button>
          <button
            type="button"
            style={{
              flex: 1,
              padding: '8px 12px',
              minHeight: '44px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#FFFFFF',
              color: '#0F172A',
              fontWeight: 700,
              fontSize: '0.875rem',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
            }}
          >
            สนาม
          </button>
        </div>
      </div>

      {/* Segmented Toggle: รายการ | แผนที่ (courts-view-list / courts-view-map) */}
      <div
        style={{
          display: 'flex',
          backgroundColor: 'var(--color-surface, #151D2A)',
          border: '1px solid var(--color-border, #233044)',
          borderRadius: '12px',
          padding: '4px',
          gap: '4px',
        }}
      >
        <button
          type="button"
          data-testid="courts-view-list"
          onClick={() => setViewMode('list')}
          style={{
            flex: 1,
            padding: '8px 12px',
            minHeight: '44px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: viewMode === 'list' ? 'var(--color-primary, #FF6B00)' : 'transparent',
            color: viewMode === 'list' ? '#FFFFFF' : 'var(--color-text-secondary, #94A3B8)',
            fontWeight: viewMode === 'list' ? 700 : 500,
            fontSize: '0.875rem',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          📋 รายการ
        </button>
        <button
          type="button"
          data-testid="courts-view-map"
          onClick={() => setViewMode('map')}
          style={{
            flex: 1,
            padding: '8px 12px',
            minHeight: '44px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: viewMode === 'map' ? 'var(--color-primary, #FF6B00)' : 'transparent',
            color: viewMode === 'map' ? '#FFFFFF' : 'var(--color-text-secondary, #94A3B8)',
            fontWeight: viewMode === 'map' ? 700 : 500,
            fontSize: '0.875rem',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          🗺️ แผนที่
        </button>
      </div>

      {/* OSM Attribution Note */}
      <div
        data-testid="osm-attribution-note"
        style={{
          fontSize: '0.8rem',
          color: 'var(--color-text-secondary, #94A3B8)',
          marginTop: '-6px',
          marginBottom: '2px',
        }}
      >
        <span>ข้อมูลสนามจาก </span>
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: 'var(--color-primary, #FF6B00)',
            textDecoration: 'underline',
          }}
        >
          OpenStreetMap
        </a>
      </div>

      {/* Search Input */}
      <Input
        placeholder="🔍 ค้นหาชื่อสนาม หรือย่าน/สถานที่..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Content */}
      {loading ? (
        <LoadingSpinner message="กำลังโหลดข้อมูลสนามบาสเกตบอล..." />
      ) : error ? (
        <div
          style={{
            padding: '24px 16px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FCA5A5',
            borderRadius: '16px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: '1.5rem' }}>⚠️</div>
          <div style={{ fontSize: '0.9rem', color: '#B91C1C', fontWeight: 600 }}>
            {error}
          </div>
          <Button size="sm" variant="outline" onClick={loadCourts}>
            ลองใหม่อีกครั้ง
          </Button>
        </div>
      ) : filteredCourts.length === 0 ? (
        <EmptyState
          title="ไม่พบสนามที่ค้นหา"
          description="ลองค้นหาด้วยคำอื่น หรือตรวจสอบตัวสะกด"
          action={
            <Button size="sm" variant="outline" onClick={() => setSearch('')}>
              ล้างคำค้นหา
            </Button>
          }
        />
      ) : viewMode === 'map' ? (
        <Suspense fallback={<LoadingSpinner message="กำลังโหลดแผนที่สนาม..." />}>
          <MapComponent courts={filteredCourts} highlightCourtId={highlightCourtId} />
        </Suspense>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredCourts.map((court) => (
            <CourtCard
              key={court.id}
              court={court}
              isSelected={court.id === highlightCourtId}
              onSelect={() => {}}
              onViewSessions={() => {
                navigate(`/?court=${court.id}`);
              }}
              onCreateSession={() => {
                navigate(`/sessions/new?court=${court.id}`);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};


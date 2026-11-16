import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppServices, type Court, type SessionSummary } from '../../../services';
import { Input, Select } from '../../../shared';
import { SessionCard } from '../components/SessionCard';

export const FeedPage: React.FC = () => {
  const { data } = useAppServices();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Data states
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [search, setSearch] = useState('');
  const selectedCourt = searchParams.get('court') || 'all';
  const [teamSize, setTeamSize] = useState<string>('all');
  const [level, setLevel] = useState<string>('all');
  const [quickPill, setQuickPill] = useState<'all' | 'now' | '3x3' | '5x5'>('all');
  const [now] = useState(() => Date.now());

  // Load courts for filter dropdown
  useEffect(() => {
    let active = true;
    data
      .listCourts()
      .then((res) => {
        if (active) setCourts(res);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [data]);

  // Load sessions from DataService
  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await data.listSessions();
      setSessions(res);
    } catch {
      setError('ไม่สามารถโหลดรายการนัดได้ กรุณาตรวจสอบการเชื่อมต่อและลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  }, [data]);

  useEffect(() => {
    let active = true;
    data
      .listSessions()
      .then((res) => {
        if (active) {
          setSessions(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError('ไม่สามารถโหลดรายการนัดได้ กรุณาตรวจสอบการเชื่อมต่อและลองใหม่อีกครั้ง');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [data]);

  // Filter logic:
  // 1. By search term (title or court name)
  // 2. By court ID
  // 3. By team size (3 or 5)
  // 4. By skill level
  // 5. By quick pill (now, 3x3, 5x5)
  // 6. Only open sessions for recruitment: เต็ม/จบแล้วไม่แสดงเป็นนัดเปิดรับใน feed
  const filteredSessions = sessions.filter((s) => {
    // Only show active and open recruitment in discovery feed
    if (!s.recruitmentOpen || s.displayStatus !== 'open') {
      return false;
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchTitle = s.title.toLowerCase().includes(q);
      const matchCourt = s.court.name.toLowerCase().includes(q);
      if (!matchTitle && !matchCourt) return false;
    }

    if (selectedCourt !== 'all' && s.court.id !== selectedCourt) {
      return false;
    }

    if (teamSize !== 'all' && s.teamSize.toString() !== teamSize) {
      return false;
    }

    if (level !== 'all' && s.skillLevel !== level) {
      return false;
    }

    if (quickPill === '3x3' && s.teamSize !== 3) return false;
    if (quickPill === '5x5' && s.teamSize !== 5) return false;
    if (quickPill === 'now') {
      const diffMin = (new Date(s.startsAt).getTime() - now) / 60000;
      if (diffMin < -30 || diffMin > 180) return false;
    }

    return true;
  });

  const handleResetFilters = () => {
    setSearch('');
    setTeamSize('all');
    setLevel('all');
    setQuickPill('all');
    setSearchParams({});
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        paddingBottom: '24px',
        maxWidth: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Top Bar matching reference image */}
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
          {/* Location indicator */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.12)',
              padding: '6px 12px',
              borderRadius: '9999px',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            <span style={{ color: '#FF6B00' }}>📍</span>
            <span>
              {selectedCourt === 'all'
                ? 'สนามบาสเกตบอลทั้งหมด'
                : courts.find((c) => c.id === selectedCourt)?.name || 'สนามที่เลือก'}
            </span>
          </div>

          {/* Create Button in top header */}
          <button
            type="button"
            aria-label="สร้างนัดใหม่"
            onClick={() => navigate('/sessions/new')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '44px',
              height: '44px',
              minWidth: '44px',
              minHeight: '44px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-primary, #FF6B00)',
              color: 'var(--color-text-on-accent, #FFFFFF)',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.25rem',
              boxShadow: '0 2px 6px var(--color-primary-glow, rgba(255, 107, 0, 0.4))',
            }}
            title="สร้างนัดใหม่"
          >
            +
          </button>
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
            ห้องหาคน
          </button>
          <button
            type="button"
            onClick={() => navigate('/courts')}
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
            สนาม
          </button>
        </div>
      </div>

      {/* Quick Filter Pills */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          paddingBottom: '2px',
          scrollbarWidth: 'none',
        }}
      >
        <button
          type="button"
          onClick={() => setQuickPill('all')}
          style={{
            padding: '6px 14px',
            minHeight: '44px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '9999px',
            border: `1.5px solid ${quickPill === 'all' ? '#0F172A' : '#E2E8F0'}`,
            backgroundColor: quickPill === 'all' ? '#0F172A' : '#FFFFFF',
            color: quickPill === 'all' ? '#FFFFFF' : '#475569',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          ทั้งหมด
        </button>
        <button
          type="button"
          onClick={() => setQuickPill('now')}
          style={{
            padding: '6px 14px',
            minHeight: '44px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '9999px',
            border: `1.5px solid ${quickPill === 'now' ? '#FF6B00' : '#E2E8F0'}`,
            backgroundColor: quickPill === 'now' ? '#FFF3E0' : '#FFFFFF',
            color: quickPill === 'now' ? '#C2410C' : '#475569',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          ⚡ เล่นเลย
        </button>
        <button
          type="button"
          onClick={() => setQuickPill('3x3')}
          style={{
            padding: '6px 14px',
            minHeight: '44px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '9999px',
            border: `1.5px solid ${quickPill === '3x3' ? '#10B981' : '#E2E8F0'}`,
            backgroundColor: quickPill === '3x3' ? '#ECFDF5' : '#FFFFFF',
            color: quickPill === '3x3' ? '#047857' : '#475569',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          3x3
        </button>
        <button
          type="button"
          onClick={() => setQuickPill('5x5')}
          style={{
            padding: '6px 14px',
            minHeight: '44px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '9999px',
            border: `1.5px solid ${quickPill === '5x5' ? '#FF6B00' : '#E2E8F0'}`,
            backgroundColor: quickPill === '5x5' ? '#FFF3E0' : '#FFFFFF',
            color: quickPill === '5x5' ? '#C2410C' : '#475569',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          5x5
        </button>
      </div>

      {/* Search Input & Dropdown Filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Input
          data-testid="feed-search-input"
          placeholder="🔍 ค้นหาชื่อนัด หรือชื่อสนาม..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <Select
            data-testid="feed-teamsize-filter"
            value={teamSize}
            onChange={(e) => setTeamSize(e.target.value)}
          >
            <option value="all">รูปแบบ: ทั้งหมด</option>
            <option value="3">3x3</option>
            <option value="5">5x5</option>
          </Select>

          <Select
            data-testid="feed-level-filter"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            <option value="all">ระดับ: ทั้งหมด</option>
            <option value="casual">ชิลๆ (Casual)</option>
            <option value="regular">เล่นประจำ (Regular)</option>
            <option value="competitive">จริงจัง (Competitive)</option>
          </Select>
        </div>

        {courts.length > 0 && (
          <Select
            data-testid="feed-court-filter"
            value={selectedCourt}
            onChange={(e) => {
              if (e.target.value !== 'all') {
                setSearchParams({ court: e.target.value });
              } else {
                setSearchParams({});
              }
            }}
          >
            <option value="all">สนามทั้งหมดในระบบ ({courts.length} สนาม)</option>
            {courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.isIndoor ? '(Indoor)' : ''}
              </option>
            ))}
          </Select>
        )}
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }} data-testid="feed-loading-container">
          {/* Skeleton Card 1 */}
          <div className="card" style={{ gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="skeleton skeleton-pill" style={{ width: '90px' }}></div>
              <div className="skeleton skeleton-text" style={{ width: '50px' }}></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="skeleton skeleton-text-lg" style={{ width: '170px' }}></div>
              <div className="skeleton skeleton-pill" style={{ width: '45px' }}></div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div className="skeleton skeleton-circle" style={{ width: '32px', height: '32px' }}></div>
              <div className="skeleton skeleton-circle" style={{ width: '32px', height: '32px' }}></div>
              <div className="skeleton skeleton-circle" style={{ width: '32px', height: '32px' }}></div>
              <div className="skeleton skeleton-circle" style={{ width: '32px', height: '32px', opacity: 0.5 }}></div>
              <div className="skeleton skeleton-circle" style={{ width: '32px', height: '32px', opacity: 0.5 }}></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border-subtle)', paddingTop: '8px' }}>
              <div className="skeleton skeleton-text" style={{ width: '100px' }}></div>
              <div className="skeleton skeleton-btn" style={{ width: '80px', height: '30px' }}></div>
            </div>
          </div>

          {/* Skeleton Card 2 */}
          <div className="card" style={{ gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="skeleton skeleton-pill" style={{ width: '75px' }}></div>
              <div className="skeleton skeleton-text" style={{ width: '60px' }}></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="skeleton skeleton-text-lg" style={{ width: '140px' }}></div>
              <div className="skeleton skeleton-pill" style={{ width: '45px' }}></div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div className="skeleton skeleton-circle" style={{ width: '32px', height: '32px' }}></div>
              <div className="skeleton skeleton-circle" style={{ width: '32px', height: '32px' }}></div>
              <div className="skeleton skeleton-circle" style={{ width: '32px', height: '32px', opacity: 0.5 }}></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border-subtle)', paddingTop: '8px' }}>
              <div className="skeleton skeleton-text" style={{ width: '90px' }}></div>
              <div className="skeleton skeleton-btn" style={{ width: '80px', height: '30px' }}></div>
            </div>
          </div>

          {/* Skeleton Card 3 */}
          <div className="card" style={{ gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="skeleton skeleton-pill" style={{ width: '85px' }}></div>
              <div className="skeleton skeleton-text" style={{ width: '55px' }}></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="skeleton skeleton-text-lg" style={{ width: '160px' }}></div>
              <div className="skeleton skeleton-pill" style={{ width: '45px' }}></div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div className="skeleton skeleton-circle" style={{ width: '32px', height: '32px' }}></div>
              <div className="skeleton skeleton-circle" style={{ width: '32px', height: '32px', opacity: 0.5 }}></div>
              <div className="skeleton skeleton-circle" style={{ width: '32px', height: '32px', opacity: 0.5 }}></div>
            </div>
          </div>
        </div>
      ) : error ? (
        <div className="state-container" style={{ flex: 1, margin: 'auto 0' }} data-testid="feed-error-state">
          <div className="state-icon-circle state-icon-error">
            <span>⚠️</span>
          </div>
          <div className="state-title">ไม่สามารถโหลดรายการนัดได้</div>
          <div className="state-subtitle">
            การเชื่อมต่อบริการขัดข้องชั่วคราว หรือสัญญาณอินเทอร์เน็ตไม่เสถียร กรุณาตรวจสอบและลองใหม่อีกครั้ง
          </div>

          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '290px',
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              borderColor: 'rgba(239, 68, 68, 0.25)',
              textAlign: 'left',
              padding: '12px',
            }}
          >
            <div style={{ fontSize: 'var(--font-xs)', fontWeight: 600, color: 'var(--color-status-error)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>ℹ️ คำแนะนำสำหรับผู้เล่น</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '4px', lineHeight: 1.4 }}>
              ระบบได้ปกป้องข้อมูลของคุณไว้แล้ว คุณสามารถกดปุ่มลองใหม่ หรือเลือกดูรายชื่อสนามใกล้เคียงได้ตามปกติ
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '260px', marginTop: '8px' }}>
            <button
              type="button"
              className="btn btn-primary btn-block"
              data-testid="feed-retry-btn"
              onClick={loadSessions}
            >
              <span>🔄 ลองใหม่อีกครั้ง (Retry)</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => navigate('/courts')}
            >
              <span>📍 ดูรายชื่อสนามใกล้ฉัน</span>
            </button>
          </div>
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="state-container" style={{ flex: 1, margin: 'auto 0' }} data-testid="feed-empty-state">
          <div className="state-icon-circle state-icon-empty">
            <span>🏀</span>
          </div>
          <div className="state-title">ยังไม่มีนัดที่เปิดรับในช่วงนี้</div>
          <div className="state-subtitle">
            ไม่พบนัดที่ตรงกับตัวกรองของคุณ ลองเปลี่ยนสนาม ปรับช่วงเวลา หรือเป็นคนเปิดนัดแรกให้เพื่อนๆ เข้ามาแจมได้เลย!
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '260px', marginTop: '8px' }}>
            <button
              type="button"
              className="btn btn-primary btn-block"
              data-testid="feed-empty-create-btn"
              onClick={() => navigate('/sessions/new')}
            >
              <span>🏀 เปิดนัดใหม่ตอนนี้</span>
            </button>
            <button
              type="button"
              className="btn btn-outline btn-block"
              data-testid="feed-empty-reset-btn"
              onClick={handleResetFilters}
            >
              <span>🔄 ล้างตัวกรองทั้งหมด</span>
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div
            style={{
              fontSize: '0.85rem',
              color: '#64748B',
              fontWeight: 500,
              padding: '0 4px',
            }}
          >
            พบนัดเปิดรับ {filteredSessions.length} รายการ
          </div>

          {filteredSessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onClick={() => {
                navigate(`/sessions/${session.id}`);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

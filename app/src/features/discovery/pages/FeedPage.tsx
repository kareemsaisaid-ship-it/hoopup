import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppServices, type Court, type SessionSummary } from '../../../services';
import { Input, Select } from '../../../shared';
import { SessionCard } from '../components/SessionCard';
import '../styles/feed.css';

type QuickPill = 'all' | '3x3' | '5x5';

const LOAD_ERROR = 'ไม่สามารถโหลดรายการนัดได้ กรุณาตรวจสอบการเชื่อมต่อและลองใหม่อีกครั้ง';

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
  const [level, setLevel] = useState<string>('all');
  const [quickPill, setQuickPill] = useState<QuickPill>('all');

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

  // Load sessions from DataService (retry button reuses this)
  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await data.listSessions();
      setSessions(res);
    } catch {
      setError(LOAD_ERROR);
    } finally {
      setLoading(false);
    }
  }, [data]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Filter logic:
  // 1. By search term (title or court name)
  // 2. By court ID
  // 3. By team size (3 or 5)
  // 4. By skill level
  // 5. By quick pill (3x3, 5x5)
  // 6. Only open sessions for recruitment: เต็ม/จบแล้วไม่แสดงเป็นนัดเปิดรับใน feed
  const filteredSessions = sessions.filter((s) => {
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

    if (level !== 'all' && s.skillLevel !== level) {
      return false;
    }

    if (quickPill === '3x3' && s.teamSize !== 3) return false;
    if (quickPill === '5x5' && s.teamSize !== 5) return false;

    return true;
  });

  const handleResetFilters = () => {
    setSearch('');
    setLevel('all');
    setQuickPill('all');
    setSearchParams({});
  };

  const chips: { id: QuickPill; label: string }[] = [
    { id: 'all', label: 'ทั้งหมด' },
    { id: '3x3', label: '3x3' },
    { id: '5x5', label: '5x5' },
  ];

  // Advanced filters live behind one toggle so the first screen stays simple.
  const advancedCount =
    (level !== 'all' ? 1 : 0) + (selectedCourt !== 'all' ? 1 : 0);

  return (
    <div className="feed">
      <header className="feed-head">
        <h1 className="feed-title">นัดที่เปิดรับ</h1>
      </header>

      <button
        type="button"
        className="feed-create"
        aria-label="สร้างนัดใหม่"
        onClick={() => navigate('/sessions/new')}
      >
        + สร้างนัดใหม่
      </button>

      {/* One row of chips for format */}
      <div className="feed-chips" role="group" aria-label="รูปแบบ">
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className="feed-chip"
            aria-pressed={quickPill === chip.id}
            onClick={() => setQuickPill(chip.id)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <Input
        data-testid="feed-search-input"
        placeholder="ค้นหาชื่อนัด หรือชื่อสนาม"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <details className="feed-more">
        <summary>
          ตัวกรองเพิ่มเติม{advancedCount > 0 ? ` (${advancedCount})` : ''}
        </summary>
        <div className="feed-filters">
          <Select
            data-testid="feed-level-filter"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            <option value="all">ระดับ: ทั้งหมด</option>
            <option value="casual">ชิลๆ</option>
            <option value="regular">เล่นประจำ</option>
            <option value="competitive">จริงจัง</option>
          </Select>

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
              <option value="all">สนามทั้งหมด ({courts.length})</option>
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </div>
      </details>

      {/* Main content */}
      {loading ? (
        <div className="feed-list" data-testid="feed-loading-container" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="sc"
              style={{ cursor: 'default', gap: 14 }}
              aria-hidden="true"
            >
              <div className="sc-top">
                <div className="skeleton skeleton-text-lg" style={{ width: 80 }} />
                <div className="skeleton skeleton-text" style={{ width: 40 }} />
              </div>
              <div className="skeleton skeleton-text-lg" style={{ width: '75%' }} />
              <div className="skeleton skeleton-text" style={{ width: '45%' }} />
              <div className="sc-body">
                <div className="skeleton skeleton-text-lg" style={{ width: 60, height: 44 }} />
                <div className="skeleton" style={{ width: 120, height: 20 }} />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="state-container" style={{ flex: 1, margin: 'auto 0' }} data-testid="feed-error-state">
          <div className="state-icon-circle state-icon-error">
            <span>!</span>
          </div>
          <div className="state-title">ไม่สามารถโหลดรายการนัดได้</div>
          <div className="state-subtitle">
            การเชื่อมต่อขัดข้องชั่วคราว หรือสัญญาณอินเทอร์เน็ตไม่เสถียร กรุณาลองใหม่อีกครั้ง
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '260px', marginTop: '8px' }}>
            <button
              type="button"
              className="btn btn-primary btn-block"
              data-testid="feed-retry-btn"
              onClick={loadSessions}
            >
              <span>ลองใหม่อีกครั้ง</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => navigate('/courts')}
            >
              <span>ดูรายชื่อสนาม</span>
            </button>
          </div>
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="state-container" style={{ flex: 1, margin: 'auto 0' }} data-testid="feed-empty-state">
          <div className="state-icon-circle state-icon-empty">
            <span aria-hidden="true">○</span>
          </div>
          <div className="state-title">ยังไม่มีนัดที่เปิดรับในช่วงนี้</div>
          <div className="state-subtitle">
            ไม่พบนัดที่ตรงกับตัวกรอง ลองเปลี่ยนสนามหรือช่วงเวลา หรือเปิดนัดแรกให้เพื่อนเข้ามาร่วมได้เลย
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '260px', marginTop: '8px' }}>
            <button
              type="button"
              className="btn btn-primary btn-block"
              data-testid="feed-empty-create-btn"
              onClick={() => navigate('/sessions/new')}
            >
              <span>เปิดนัดใหม่ตอนนี้</span>
            </button>
            <button
              type="button"
              className="btn btn-outline btn-block"
              data-testid="feed-empty-reset-btn"
              onClick={handleResetFilters}
            >
              <span>ล้างตัวกรองทั้งหมด</span>
            </button>
          </div>
        </div>
      ) : (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="feed-count">
            <span className="feed-count-num" data-testid="feed-count">
              {filteredSessions.length}
            </span>
            <span className="feed-count-label">นัดเปิดรับ</span>
          </div>

          <div className="feed-list">
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
        </section>
      )}
    </div>
  );
};

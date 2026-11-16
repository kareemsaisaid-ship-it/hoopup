import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppServices } from '../../services';
import type { SessionSummary } from '../../services/types';
import { Badge } from '../../shared/components/Badge';
import { Button } from '../../shared/components/Button';
import './styles/sessions.css';
import { formatThaiDateTime } from './utils/dateTime';

type TabKey = 'all' | 'hosted' | 'joined' | 'pending' | 'ended';

export const MySessionsPage: React.FC = () => {
  const navigate = useNavigate();
  const { auth, data } = useAppServices();
  const currentUser = auth.getCurrentUser();

  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    data
      .listMySessions()
      .then((res) => {
        if (active) {
          setSessions(res);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setErrorMsg('เกิดข้อผิดพลาดในการโหลดรายการนัดของคุณ กรุณาลองใหม่อีกครั้ง');
          setIsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [data]);

  // Filter based on active tab
  const filteredSessions = React.useMemo(() => {
    if (!currentUser) return sessions;

    return sessions.filter((s) => {
      const isHost = s.hostId === currentUser.id;
      const isConfirmedJoiner = s.myMembershipStatus === 'confirmed' && !isHost;
      const isPending = s.myMembershipStatus === 'pending';
      const isEnded = s.lifecycle !== 'active';

      switch (activeTab) {
        case 'hosted':
          return isHost;
        case 'joined':
          return isConfirmedJoiner;
        case 'pending':
          return isPending;
        case 'ended':
          return isEnded;
        case 'all':
        default:
          return true;
      }
    });
  }, [sessions, activeTab, currentUser]);

  const getDisplayStatusLabel = (status: string) => {
    switch (status) {
      case 'open':
        return 'เปิดรับสมัคร';
      case 'full':
        return 'ผู้เล่นเต็มแล้ว';
      case 'closed':
        return 'ปิดรับสมัคร';
      case 'completed':
        return 'เสร็จสิ้น';
      case 'cancelled':
        return 'ยกเลิก';
      default:
        return status;
    }
  };

  return (
    <div className="sessions-container" data-testid="my-sessions-page">
      <div className="sessions-header">
        <h2 className="sessions-title">นัดของฉัน</h2>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => navigate('/sessions/new')}
        >
          + เปิดนัดใหม่
        </Button>
      </div>

      {errorMsg && (
        <div className="sessions-alert sessions-alert-danger" style={{ marginBottom: '16px' }}>
          {errorMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="segmented-control" style={{ marginBottom: '16px' }}>
        <button
          type="button"
          className={`segmented-btn ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          ทั้งหมด ({sessions.length})
        </button>
        <button
          type="button"
          className={`segmented-btn ${activeTab === 'hosted' ? 'active' : ''}`}
          onClick={() => setActiveTab('hosted')}
        >
          ที่ฉันจัด
        </button>
        <button
          type="button"
          className={`segmented-btn ${activeTab === 'joined' ? 'active' : ''}`}
          onClick={() => setActiveTab('joined')}
        >
          เข้าร่วมแล้ว
        </button>
        <button
          type="button"
          className={`segmented-btn ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          รออนุมัติ
        </button>
        <button
          type="button"
          className={`segmented-btn ${activeTab === 'ended' ? 'active' : ''}`}
          onClick={() => setActiveTab('ended')}
        >
          สิ้นสุดแล้ว
        </button>
      </div>

      {/* Content List */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748B' }}>
          กำลังโหลดรายการนัด...
        </div>
      ) : filteredSessions.length === 0 ? (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            border: '1px solid #E2E8F0',
            padding: '36px 20px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div style={{ fontSize: '2.5rem' }}>🏀</div>
          <h3 style={{ margin: 0, fontSize: '1rem', color: '#0F172A' }}>ยังไม่มีรายการนัดในหมวดนี้</h3>
          <p style={{ margin: 0, fontSize: '0.8125rem', color: '#64748B', maxWidth: '280px' }}>
            ค้นหานัดที่เปิดรับสมัครอยู่ หรือเปิดนัดเล่นเองเพื่อชวนเพื่อนๆ ในชุมชน
          </p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            <Button variant="secondary" size="sm" onClick={() => navigate('/')}>
              ค้นหานัดบาส
            </Button>
            <Button variant="primary" size="sm" onClick={() => navigate('/sessions/new')}>
              เปิดนัดใหม่
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {filteredSessions.map((sess) => {
            const isHost = sess.hostId === currentUser?.id;
            return (
              <div
                key={sess.id}
                data-testid={`my-session-card-${sess.id}`}
                className="session-card"
                onClick={() => navigate(`/sessions/${sess.id}`)}
              >
                <div className="session-card-header">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <Badge variant="status" status={sess.displayStatus} size="sm">
                        {getDisplayStatusLabel(sess.displayStatus)}
                      </Badge>

                      {isHost && (
                        <Badge variant="skill" size="sm">
                          👑 ผู้จัด
                        </Badge>
                      )}

                      {sess.myMembershipStatus === 'pending' && (
                        <Badge variant="status" status="pending" size="sm">
                          ⏳ รออนุมัติ
                        </Badge>
                      )}

                      <Badge variant="neutral" size="sm">
                        {sess.teamSize}v{sess.teamSize}
                      </Badge>
                    </div>

                    <h4 className="session-card-title">{sess.title}</h4>
                  </div>
                </div>

                <div className="session-meta-row">
                  <span>📍 {sess.court.name}</span>
                  <span>•</span>
                  <span>⏰ {formatThaiDateTime(sess.startsAt)}</span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '8px',
                    borderTop: '1px solid #F1F5F9',
                    fontSize: '0.8125rem',
                  }}
                >
                  <span style={{ color: '#C75100', fontWeight: 600 }}>
                    👥 {sess.occupiedCount}/{sess.teamSize} คน (ว่าง {sess.seatsRemaining} ที่)
                  </span>

                  <span style={{ color: '#FF6B00', fontWeight: 600 }}>ดูรายละเอียด →</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

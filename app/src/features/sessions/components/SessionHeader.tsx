import React, { useState } from 'react';
import type { SessionSummary } from '../../../services/types';
import { Badge } from '../../../shared/components/Badge';
import { formatThaiDateTime } from '../utils/dateTime';

export interface SessionHeaderProps {
  session: SessionSummary;
  onReportSession: () => void;
}

export const SessionHeader: React.FC<SessionHeaderProps> = ({ session, onReportSession }) => {
  const [showMenu, setShowMenu] = useState(false);

  const getDisplayStatusLabel = () => {
    switch (session.displayStatus) {
      case 'open':
        return 'เปิดรับสมัคร';
      case 'full':
        return 'ผู้เล่นเต็มแล้ว';
      case 'closed':
        return 'ปิดรับสมัคร';
      case 'completed':
        return 'สิ้นสุดแล้ว';
      case 'cancelled':
        return 'ยกเลิกนัด';
      default:
        return session.displayStatus;
    }
  };

  const getSkillLabel = () => {
    switch (session.skillLevel) {
      case 'casual':
        return 'เล่นสนุกๆ / ชิลๆ';
      case 'regular':
        return 'เล่นประจำ / ทั่วไป';
      case 'competitive':
        return 'จริงจัง / แข่งขัน';
      default:
        return session.skillLevel;
    }
  };

  return (
    <div className="detail-hero-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span data-testid="session-detail-status">
              <Badge variant="status" status={session.displayStatus} size="md">
                {getDisplayStatusLabel()}
              </Badge>
            </span>

            <span
              data-testid="session-detail-capacity"
              className="detail-capacity-badge"
            >
              🏀 {session.occupiedCount}/{session.teamSize} คน (ว่าง {session.seatsRemaining} ที่)
            </span>

            <Badge variant="neutral" size="sm">
              {session.teamSize}v{session.teamSize}
            </Badge>

            <Badge variant="neutral" size="sm">
              {session.joinPolicy === 'instant' ? '⚡ เข้าได้ทันที' : '✋ ต้องรออนุมัติ'}
            </Badge>
          </div>

          <h1
            data-testid="session-detail-title"
            style={{
              fontSize: '1.25rem',
              fontWeight: 800,
              color: '#0F172A',
              margin: '6px 0 0 0',
              lineHeight: 1.35,
            }}
          >
            {session.title}
          </h1>
        </div>

        {/* Secondary Menu */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setShowMenu((prev) => !prev)}
            aria-label="เมนูเพิ่มเติม"
            style={{
              background: '#F1F5F9',
              border: 'none',
              borderRadius: '8px',
              padding: '6px 10px',
              cursor: 'pointer',
              fontSize: '1.25rem',
              color: '#475569',
              width: '44px',
              height: '44px',
              minWidth: '44px',
              minHeight: '44px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box',
            }}
          >
            ⋮
          </button>

          {showMenu && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '6px',
                backgroundColor: '#FFFFFF',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 8px 16px rgba(0, 0, 0, 0.12)',
                padding: '6px',
                minWidth: '160px',
                zIndex: 50,
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  onReportSession();
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  textAlign: 'left',
                  padding: '8px 12px',
                  fontSize: '0.8125rem',
                  color: '#EF4444',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  minHeight: '44px',
                  boxSizing: 'border-box',
                }}
              >
                🚩 รายงานนัดนี้
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Info Grid */}
      <div className="detail-info-grid">
        <div className="detail-info-item">
          <span className="detail-info-label">📍 สนามบาส</span>
          <span className="detail-info-val">{session.court.name}</span>
        </div>

        <div className="detail-info-item">
          <span className="detail-info-label">⏰ วันและเวลา</span>
          <span className="detail-info-val">{formatThaiDateTime(session.startsAt)}</span>
        </div>

        <div className="detail-info-item">
          <span className="detail-info-label">👤 ผู้จัดนัด</span>
          <span className="detail-info-val">{session.hostName}</span>
        </div>

        <div className="detail-info-item">
          <span className="detail-info-label">🎯 ระดับฝีมือ</span>
          <span className="detail-info-val">{getSkillLabel()}</span>
        </div>
      </div>

      {/* Tags: Beginners & Wanted Positions */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        {session.welcomesBeginners && (
          <Badge variant="skill" size="sm">
            🌱 ยินดีต้อนรับมือใหม่
          </Badge>
        )}

        {session.wantedPositions && session.wantedPositions.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748B' }}>หาตำแหน่ง:</span>
            {session.wantedPositions.map((pos) => (
              <Badge key={pos} variant="position" size="sm">
                {pos}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Meeting Point and Notes */}
      {session.meetingPoint && (
        <div style={{ fontSize: '0.8125rem', color: '#1E293B', background: '#F8FAFC', padding: '10px 12px', borderRadius: '8px' }}>
          <strong>📌 จุดนัดพบ:</strong> {session.meetingPoint}
        </div>
      )}

      {session.notes && (
        <div style={{ fontSize: '0.8125rem', color: '#475569', background: '#F8FAFC', padding: '10px 12px', borderRadius: '8px' }}>
          <strong>📝 หมายเหตุ:</strong> {session.notes}
        </div>
      )}
    </div>
  );
};

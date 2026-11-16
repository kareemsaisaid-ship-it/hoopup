import React, { useState } from 'react';
import type { SessionSummary } from '../../../services';
import { Badge } from '../../../shared';

export interface SessionCardProps {
  session: SessionSummary;
  onClick?: () => void;
  userCoords?: { latitude: number; longitude: number } | null;
}

// Calculate distance in kilometers using Haversine formula
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const AVATAR_COLORS = [
  '#EA580C', // Orange (Host)
  '#2563EB', // Blue
  '#059669', // Emerald
  '#7C3AED', // Purple
  '#DB2777', // Pink
  '#0891B2', // Cyan
];

export const SessionCard: React.FC<SessionCardProps> = ({
  session,
  onClick,
  userCoords,
}) => {
  // Format start time
  const startDate = new Date(session.startsAt);
  const [now] = useState(() => Date.now());
  const diffMinutes = Math.round((startDate.getTime() - now) / 60000);
  const isNow = diffMinutes >= -30 && diffMinutes <= 45;

  let timeDisplay = '';
  if (isNow) {
    timeDisplay = '⚡ เล่นเลย';
  } else {
    timeDisplay = `🕒 ${startDate.toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })}`;
  }

  // Format distance only if both court and user have valid coordinates
  let distanceText: string | null = null;
  if (
    userCoords &&
    session.court.latitude !== null &&
    session.court.longitude !== null
  ) {
    const distKm = calculateDistance(
      userCoords.latitude,
      userCoords.longitude,
      session.court.latitude,
      session.court.longitude
    );
    distanceText = `${distKm.toFixed(1)} กม.`;
  }

  // Avatar circles calculation
  // Total occupied circles = session.occupiedCount (including host + confirmed + guests)
  // Remaining empty dotted circles = session.seatsRemaining
  const occupiedCircles = Math.min(session.occupiedCount, session.teamSize);
  const emptyCircles = Math.max(0, session.teamSize - occupiedCircles);

  // Skill level label & dot
  const skillLabels: Record<string, { label: string; color: string }> = {
    casual: { label: 'ชิลๆ', color: '#10B981' },
    regular: { label: 'ประจำ', color: '#F59E0B' },
    competitive: { label: 'จริงจัง', color: '#EF4444' },
  };
  const skillInfo = skillLabels[session.skillLevel] || {
    label: session.skillLevel,
    color: '#64748B',
  };

  return (
    <div
      data-testid={`session-card-${session.id}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        padding: '16px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
        border: '1px solid #E2E8F0',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.09)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.05)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Top row: Timing pill & Distance */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span
          data-testid="session-card-timing-badge"
          style={{
            fontSize: '0.8rem',
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: '9999px',
            backgroundColor: isNow ? '#FFF3E0' : '#F1F5F9',
            color: isNow ? '#C2410C' : '#475569',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          {timeDisplay}
        </span>

        {distanceText && (
          <span
            style={{
              fontSize: '0.8rem',
              color: '#64748B',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            📍 {distanceText}
          </span>
        )}
      </div>

      {/* Main Title & Format / Policy */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '8px',
        }}
      >
        <div>
          <h3
            data-testid="session-card-title"
            style={{
              margin: '0 0 4px 0',
              fontSize: '1.05rem',
              fontWeight: 700,
              color: '#0F172A',
              lineHeight: 1.35,
            }}
          >
            {session.title}
          </h3>
          <div
            style={{
              fontSize: '0.85rem',
              color: '#64748B',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>📍 {session.court.name}</span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: '6px',
              backgroundColor: session.teamSize === 5 ? '#FFF3E0' : '#ECFDF5',
              color: session.teamSize === 5 ? '#C2410C' : '#047857',
            }}
          >
            {session.teamSize}x{session.teamSize}
          </span>
          <span
            title={
              session.joinPolicy === 'approval'
                ? 'ต้องรอผู้จัดอนุมัติ'
                : 'เข้าร่วมได้ทันที'
            }
            style={{
              fontSize: '0.8rem',
              padding: '3px 6px',
              borderRadius: '6px',
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              color: '#64748B',
            }}
          >
            {session.joinPolicy === 'approval' ? '🔒' : '⚡'}
          </span>
        </div>
      </div>

      {/* Occupancy Avatars & Wanted Positions */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 0',
        }}
      >
        {/* Avatars */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {Array.from({ length: occupiedCircles }).map((_, idx) => {
            const letter =
              idx === 0
                ? session.hostName.charAt(0) || 'ผ'
                : String.fromCharCode(65 + (idx % 26));
            const bg =
              idx === 0
                ? 'var(--color-primary, #FF6B00)'
                : AVATAR_COLORS[idx % AVATAR_COLORS.length];
            const fg =
              idx === 0
                ? 'var(--color-text-on-accent, #FFFFFF)'
                : '#FFFFFF';
            return (
              <div
                key={`occ-${idx}`}
                title={idx === 0 ? `ผู้จัด: ${session.hostName}` : `ผู้เล่น ${idx + 1}`}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: bg,
                  color: fg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  boxShadow:
                    idx === 0
                      ? '0 1px 4px var(--color-primary-glow, rgba(0,0,0,0.1))'
                      : '0 1px 3px rgba(0,0,0,0.1)',
                }}
              >
                {letter}
              </div>
            );
          })}

          {Array.from({ length: emptyCircles }).map((_, idx) => (
            <div
              key={`emp-${idx}`}
              title="ที่ว่าง"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                border: '2px dashed #CBD5E1',
                backgroundColor: '#F8FAFC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748B',
                fontSize: '0.75rem',
                fontWeight: 500,
              }}
            >
              +
            </div>
          ))}
        </div>

        {/* Wanted Positions Badge */}
        {session.wantedPositions && session.wantedPositions.length > 0 ? (
          <div
            data-testid="session-card-wanted-positions"
            style={{
              fontSize: '0.75rem',
              color: '#C2410C',
              backgroundColor: '#FFF7ED',
              border: '1px solid rgba(194, 65, 12, 0.25)',
              padding: '3px 8px',
              borderRadius: '6px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            ต้องการ {session.wantedPositions.join(', ')}
          </div>
        ) : (
          <div
            style={{
              fontSize: '0.75rem',
              color: '#64748B',
              backgroundColor: '#F1F5F9',
              padding: '3px 8px',
              borderRadius: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            ตำแหน่งไหนก็ได้
          </div>
        )}
      </div>

      {/* Bottom Summary: Capacity, Skill & Status */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: '8px',
          borderTop: '1px solid #F1F5F9',
          fontSize: '0.825rem',
        }}
      >
        <span
          data-testid="session-card-capacity"
          style={{
            fontWeight: 600,
            color: session.seatsRemaining === 0 ? '#64748B' : '#C2410C',
          }}
        >
          {session.occupiedCount}/{session.teamSize} คน (ว่าง {session.seatsRemaining} ที่)
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              color: '#475569',
              fontSize: '0.8rem',
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: skillInfo.color,
                display: 'inline-block',
              }}
            />
            {skillInfo.label}
          </span>

          <Badge
            data-testid="session-card-status"
            variant="status"
            status={session.displayStatus}
          >
            {session.displayStatus === 'open'
              ? 'เปิดรับ'
              : session.displayStatus === 'full'
              ? 'เต็ม'
              : session.displayStatus === 'closed'
              ? 'ปิดรับ'
              : session.displayStatus === 'completed'
              ? 'จบแล้ว'
              : 'ยกเลิก'}
          </Badge>
        </div>
      </div>
    </div>
  );
};

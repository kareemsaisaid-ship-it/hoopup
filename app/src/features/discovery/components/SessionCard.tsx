import React, { useState } from 'react';
import type { SessionSummary } from '../../../services';
import '../styles/feed.css';

export interface SessionCardProps {
  session: SessionSummary;
  onClick?: () => void;
}

const SKILL_LABELS: Record<string, { label: string; color: string }> = {
  casual: { label: 'ชิลๆ', color: '#6FD3A0' },
  regular: { label: 'เล่นประจำ', color: '#E8B04A' },
  competitive: { label: 'จริงจัง', color: '#F0655A' },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: 'เปิดรับ', color: '#6FD3A0' },
  full: { label: 'เต็มแล้ว', color: '#8C8477' },
  closed: { label: 'ปิดรับ', color: '#6B645A' },
  completed: { label: 'จบแล้ว', color: '#7FA8F0' },
  cancelled: { label: 'ยกเลิก', color: '#F0655A' },
};

export const SessionCard: React.FC<SessionCardProps> = ({
  session,
  onClick,
}) => {
  const startDate = new Date(session.startsAt);
  const [now] = useState(() => Date.now());
  const diffMinutes = Math.round((startDate.getTime() - now) / 60000);
  const isNow = diffMinutes >= -30 && diffMinutes <= 45;

  const timeText = startDate.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  // Slots: one per team seat. Taken = occupied (host included). Empty = still needed.
  const occupied = Math.min(session.occupiedCount, session.teamSize);
  const slots = Array.from({ length: session.teamSize }, (_, i) => i < occupied);

  const skill = SKILL_LABELS[session.skillLevel] ?? {
    label: session.skillLevel,
    color: '#8C8477',
  };
  const status = STATUS_LABELS[session.displayStatus] ?? {
    label: session.displayStatus,
    color: '#8C8477',
  };
  const isFull = session.seatsRemaining === 0;

  return (
    <article
      data-testid={`session-card-${session.id}`}
      className="sc"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      {/* Time + format */}
      <div className="sc-top">
        <span
          data-testid="session-card-timing-badge"
          className={`sc-time ${isNow ? 'is-now' : ''}`}
        >
          {isNow ? 'เล่นเลย' : timeText}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="sc-format">
            {session.teamSize}x{session.teamSize}
          </span>
        </span>
      </div>

      {/* Title + court */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h3 data-testid="session-card-title" className="sc-title">
          {session.title}
        </h3>
        <p className="sc-court">{session.court.name}</p>
      </div>

      {/* Missing count (the point of the card) + slots */}
      <div className="sc-body">
        <div className="sc-missing">
          {isFull ? (
            <span className="sc-missing-label" style={{ fontWeight: 600 }}>
              ครบแล้ว
            </span>
          ) : (
            <>
              <span
                className="sc-missing-num"
                aria-label={`ขาดอีก ${session.seatsRemaining} คน`}
              >
                {session.seatsRemaining}
              </span>
              <span className="sc-missing-label">คนที่ยังขาด</span>
            </>
          )}
        </div>

        <div
          className="sc-slots"
          role="img"
          aria-label={`มี ${occupied} จาก ${session.teamSize} คน`}
        >
          {slots.map((taken, i) => (
            <span
              key={i}
              className={`sc-slot ${taken ? 'is-taken' : ''}`}
            />
          ))}
        </div>
      </div>

      {/* Footer: who it's for + status */}
      <div className="sc-foot">
        <div className="sc-foot-meta">
          <span data-testid="session-card-capacity">
            {session.occupiedCount}/{session.teamSize} คน
          </span>
          <span className="sc-skill">
            <span
              className="sc-skill-dot"
              style={{ background: skill.color }}
              aria-hidden="true"
            />
            {skill.label}
          </span>
        </div>

        <span data-testid="session-card-status" className="sc-status">
          <span
            className="sc-status-dot"
            style={{ background: status.color }}
            aria-hidden="true"
          />
          {status.label}
        </span>
      </div>
    </article>
  );
};

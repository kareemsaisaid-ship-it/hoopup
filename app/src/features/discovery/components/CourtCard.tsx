import React from 'react';
import type { Court } from '../../../services';
import { Badge, Button } from '../../../shared';

export interface CourtCardProps {
  court: Court;
  isSelected?: boolean;
  onSelect?: () => void;
  onViewSessions?: () => void;
  onCreateSession?: () => void;
  userCoords?: { latitude: number; longitude: number } | null;
}

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

export const CourtCard: React.FC<CourtCardProps> = ({
  court,
  isSelected,
  onSelect,
  onViewSessions,
  onCreateSession,
  userCoords,
}) => {
  let distanceText: string | null = null;
  if (
    userCoords &&
    court.latitude !== null &&
    court.longitude !== null
  ) {
    const dist = calculateDistance(
      userCoords.latitude,
      userCoords.longitude,
      court.latitude,
      court.longitude
    );
    distanceText = `${dist.toFixed(1)} กม.`;
  }

  return (
    <div
      className="court-card"
      data-testid="court-card"
      onClick={onSelect}
      style={{
        backgroundColor: isSelected ? '#FFF8F3' : '#FFFFFF',
        borderRadius: '16px',
        padding: '16px',
        border: `1.5px solid ${isSelected ? '#FF6B00' : '#E2E8F0'}`,
        boxShadow: isSelected
          ? '0 4px 12px rgba(255, 107, 0, 0.12)'
          : '0 2px 6px rgba(0, 0, 0, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Title & Badge */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '8px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
            <h3
              style={{
                margin: 0,
                fontSize: '1.05rem',
                fontWeight: 700,
                color: '#0F172A',
              }}
            >
              {court.name}
            </h3>
            {court.osmQuality === 'unverified' && (
              <Badge variant="neutral" size="sm" data-testid="court-osm-badge">
                ข้อมูลจาก OSM ยังไม่ยืนยัน
              </Badge>
            )}
            {court.osmQuality === 'positive' && (
              <Badge variant="status" status="open" size="sm" data-testid="court-osm-badge">
                เปิดสาธารณะตามข้อมูล OSM
              </Badge>
            )}
          </div>
          {court.address ? (
            <div style={{ fontSize: '0.85rem', color: '#64748B' }}>
              📍 {court.address}
            </div>
          ) : (
            <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
              (ยังไม่มีข้อมูลที่อยู่ระบุ)
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <Badge variant="neutral">
            {court.isIndoor ? '🏢 Indoor' : '☀️ Outdoor'}
          </Badge>
          {distanceText && (
            <span style={{ fontSize: '0.75rem', color: '#EA580C', fontWeight: 600 }}>
              📍 {distanceText}
            </span>
          )}
        </div>
      </div>

      {/* Attributes pills */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
          fontSize: '0.8rem',
          color: '#475569',
        }}
      >
        <span
          style={{
            backgroundColor: '#F1F5F9',
            padding: '3px 8px',
            borderRadius: '6px',
          }}
        >
          🏀 {court.hoopCount ? `${court.hoopCount} แป้น` : 'มีแป้นบาส'}
        </span>
        <span
          style={{
            backgroundColor: '#F1F5F9',
            padding: '3px 8px',
            borderRadius: '6px',
          }}
        >
          {court.hasLighting ? '💡 มีไฟส่องสว่าง' : '🌑 ไม่มีไฟ'}
        </span>
        {court.surfaceType && (
          <span
            style={{
              backgroundColor: '#F1F5F9',
              padding: '3px 8px',
              borderRadius: '6px',
            }}
          >
            พื้น{court.surfaceType}
          </span>
        )}
        {court.access && (
          <span
            data-testid="court-access-pill"
            style={{
              backgroundColor: '#F1F5F9',
              padding: '3px 8px',
              borderRadius: '6px',
            }}
          >
            การเข้าถึง: {court.access}
          </span>
        )}
        {court.fee && (
          <span
            data-testid="court-fee-pill"
            style={{
              backgroundColor: '#F1F5F9',
              padding: '3px 8px',
              borderRadius: '6px',
            }}
          >
            ค่าบริการ: {court.fee}
          </span>
        )}
        {court.operator && (
          <span
            data-testid="court-operator-pill"
            style={{
              backgroundColor: '#F1F5F9',
              padding: '3px 8px',
              borderRadius: '6px',
            }}
          >
            ผู้ดูแล: {court.operator}
          </span>
        )}
      </div>

      {/* Opening hours */}
      {court.openingHoursNote && (
        <div
          style={{
            fontSize: '0.8rem',
            color: '#64748B',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            backgroundColor: '#F8FAFC',
            padding: '6px 10px',
            borderRadius: '8px',
          }}
        >
          <span>🕒 {court.openingHoursNote}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginTop: '4px',
        }}
      >
        {onViewSessions && (
          <Button
            size="sm"
            variant="outline"
            style={{ flex: 1 }}
            onClick={(e) => {
              e.stopPropagation();
              onViewSessions();
            }}
          >
            🔍 ดูนัดที่สนามนี้
          </Button>
        )}
        {onCreateSession && (
          <Button
            size="sm"
            variant="primary"
            style={{ flex: 1 }}
            onClick={(e) => {
              e.stopPropagation();
              onCreateSession();
            }}
          >
            + สร้างนัดที่นี่
          </Button>
        )}
      </div>
    </div>
  );
};

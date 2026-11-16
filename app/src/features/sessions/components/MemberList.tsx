import React, { useState } from 'react';
import { useAppServices } from '../../../services';
import type { SessionMember, SessionSummary } from '../../../services/types';
import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';

export interface MemberListProps {
  session: SessionSummary;
  members: SessionMember[];
  isHost: boolean;
  onRefresh: () => void;
  onReportUser?: (userId: string, userName: string) => void;
  onBlockUser?: (userId: string, userName: string) => void;
}

export const MemberList: React.FC<MemberListProps> = ({
  session,
  members,
  isHost,
  onRefresh,
  onReportUser,
  onBlockUser,
}) => {
  const { data } = useAppServices();
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const confirmedMembers = members.filter((m) => m.status === 'confirmed');
  const pendingRequests = members.filter((m) => m.status === 'pending');

  const handleDecide = async (userId: string, approve: boolean) => {
    setProcessingUserId(userId);
    setActionError(null);

    try {
      const res = await data.decideRequest(session.id, userId, approve);
      if (!res.ok) {
        setActionError(res.message || 'ไม่สามารถดำเนินการคำขอได้');
      } else {
        onRefresh();
      }
    } catch {
      setActionError('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setProcessingUserId(null);
    }
  };

  return (
    <div style={{ marginTop: '16px' }}>
      {actionError && (
        <div className="sessions-alert sessions-alert-danger" style={{ marginBottom: '12px' }}>
          {actionError}
        </div>
      )}

      {/* Host Pending Approval Requests Section */}
      {isHost && pendingRequests.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div className="section-title" style={{ color: '#B45309' }}>
            <span>⏳ คำขอเข้าร่วมที่รอการอนุมัติ ({pendingRequests.length})</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#92400E' }}>
              (ยังไม่นับในจำนวนคน)
            </span>
          </div>

          <div className="member-list" data-testid="session-pending-requests">
            {pendingRequests.map((req) => (
              <div
                key={req.userId}
                data-testid={`member-row-${req.userId}`}
                className="member-item"
                style={{ backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }}
              >
                <div className="member-left">
                  <div className="member-avatar" style={{ backgroundColor: '#F59E0B' }}>
                    {req.displayName.slice(0, 1)}
                  </div>
                  <div className="member-info">
                    <div className="member-name">{req.displayName}</div>
                    <div className="member-sub">
                      <span data-testid={`member-status-${req.userId}`}>
                        <Badge variant="status" status="pending" size="sm">
                          รออนุมัติ
                        </Badge>
                      </span>
                      {req.position && (
                        <Badge variant="position" size="sm">
                          {req.position}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    data-testid={`request-approve-${req.userId}`}
                    isLoading={processingUserId === req.userId}
                    disabled={processingUserId !== null || session.seatsRemaining <= 0}
                    onClick={() => handleDecide(req.userId, true)}
                    style={{ fontSize: '0.75rem', padding: '6px 10px' }}
                  >
                    อนุมัติ
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    data-testid={`request-decline-${req.userId}`}
                    isLoading={processingUserId === req.userId}
                    disabled={processingUserId !== null}
                    onClick={() => handleDecide(req.userId, false)}
                    style={{ fontSize: '0.75rem', padding: '6px 10px' }}
                  >
                    ปฏิเสธ
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirmed Members List */}
      <div className="section-title">
        <span>
          👥 รายชื่อสมาชิกในทีม ({session.occupiedCount}/{session.teamSize} คน)
        </span>
        <span style={{ fontSize: '0.8125rem', color: '#64748B', fontWeight: 500 }}>
          {session.seatsRemaining > 0 ? `ว่าง ${session.seatsRemaining} ที่` : 'ครบแล้ว'}
        </span>
      </div>

      <div className="member-list">
        {/* Host always appears as confirmed */}
        {confirmedMembers.length === 0 ? (
          <div
            data-testid={`member-row-${session.hostId}`}
            className="member-item"
          >
            <div className="member-left">
              <div className="member-avatar">{session.hostName.slice(0, 1)}</div>
              <div className="member-info">
                <div className="member-name">{session.hostName}</div>
                <div className="member-sub">
                  <Badge variant="status" status="open" size="sm">
                    ผู้จัดนัด (Host)
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        ) : (
          confirmedMembers.map((member) => {
            const isThisHost = member.userId === session.hostId;
            return (
              <div
                key={member.userId}
                data-testid={`member-row-${member.userId}`}
                className="member-item"
              >
                <div className="member-left">
                  <div
                    className="member-avatar"
                    style={isThisHost ? { backgroundColor: '#FF6B00' } : { backgroundColor: '#3B82F6' }}
                  >
                    {member.displayName.slice(0, 1)}
                  </div>
                  <div className="member-info">
                    <div className="member-name">{member.displayName}</div>
                    <div className="member-sub">
                      {isThisHost ? (
                        <Badge variant="status" status="open" size="sm">
                          ผู้จัดนัด (Host)
                        </Badge>
                      ) : (
                        <span data-testid={`member-status-${member.userId}`}>
                          <Badge variant="status" status="open" size="sm">
                            เข้าร่วมแล้ว
                          </Badge>
                        </span>
                      )}

                      {member.position && (
                        <Badge variant="position" size="sm">
                          {member.position}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {!isThisHost && (onReportUser || onBlockUser) && (
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    {onReportUser && (
                      <button
                        type="button"
                        data-testid="member-report-btn"
                        aria-label="รายงานผู้ใช้นี้"
                        onClick={() => onReportUser(member.userId, member.displayName)}
                        title="รายงานผู้ใช้นี้"
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: '0.8rem',
                          color: '#94A3B8',
                          cursor: 'pointer',
                          padding: '0',
                          minWidth: '44px',
                          minHeight: '44px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        🚩
                      </button>
                    )}
                    {onBlockUser && (
                      <button
                        type="button"
                        data-testid="member-block-btn"
                        aria-label="บล็อกผู้ใช้นี้"
                        onClick={() => onBlockUser(member.userId, member.displayName)}
                        title="บล็อกผู้ใช้นี้"
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: '0.8rem',
                          color: '#94A3B8',
                          cursor: 'pointer',
                          padding: '0',
                          minWidth: '44px',
                          minHeight: '44px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        🚫
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Guest Friends row if guestCount > 0 */}
        {session.guestCount > 0 && (
          <div
            className="member-item"
            style={{ backgroundColor: '#F8FAFC', borderStyle: 'dashed' }}
          >
            <div className="member-left">
              <div
                className="member-avatar"
                style={{ backgroundColor: '#94A3B8', fontSize: '0.75rem' }}
              >
                +{session.guestCount}
              </div>
              <div className="member-info">
                <div className="member-name">เพื่อนที่มากับผู้จัด (Guest)</div>
                <div className="member-sub" style={{ color: '#64748B' }}>
                  {session.guestCount} คน (ไม่ได้ใช้บัญชีแอป)
                </div>
              </div>
            </div>
            <Badge variant="neutral" size="sm">
              {session.guestCount} คน
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
};

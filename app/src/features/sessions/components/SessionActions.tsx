import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppServices } from '../../../services';
import type { Position, SessionSummary } from '../../../services/types';
import { Button } from '../../../shared/components/Button';

export interface SessionActionsProps {
  session: SessionSummary;
  onRefresh: () => void;
}

export const SessionActions: React.FC<SessionActionsProps> = ({ session, onRefresh }) => {
  const navigate = useNavigate();
  const { data } = useAppServices();

  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // End Session modal state
  const [showEndModal, setShowEndModal] = useState(false);

  const { canJoin, canWithdraw, canManage } = session.actions;
  const isPending = session.myMembershipStatus === 'pending';
  const isConfirmed = session.myMembershipStatus === 'confirmed';

  const handleJoin = async () => {
    if (!canJoin || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await data.joinSession(session.id, selectedPosition);
      if (!res.ok) {
        setError(res.message || 'ไม่สามารถเข้าร่วมได้ กรุณาลองใหม่อีกครั้ง');
      } else {
        onRefresh();
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWithdraw = async () => {
    if (!canWithdraw || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await data.withdraw(session.id);
      if (!res.ok) {
        setError(res.message || 'ไม่สามารถถอนตัวได้');
      } else {
        onRefresh();
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleRecruitment = async () => {
    if (!canManage || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const nextOpen = !session.recruitmentOpen;
      const res = await data.setRecruitment(session.id, nextOpen);
      if (!res.ok) {
        setError(res.message || 'ไม่สามารถเปลี่ยนสถานะการรับสมัครได้');
      } else {
        onRefresh();
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEndSession = async (lifecycle: 'completed' | 'cancelled') => {
    if (!canManage || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await data.endSession(session.id, lifecycle);
      if (!res.ok) {
        setError(res.message || 'ไม่สามารถจบนัดได้');
      } else {
        setShowEndModal(false);
        onRefresh();
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {error && (
        <div className="sessions-alert sessions-alert-danger" style={{ margin: 0 }}>
          {error}
        </div>
      )}

      {/* User is Pending Status Banner */}
      {isPending && (
        <div
          className="sessions-alert sessions-alert-warning"
          style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          <div style={{ fontWeight: 600 }}>
            ⏳ คุณได้ส่งคำขอเข้าร่วมแล้ว อยู่ระหว่างรอผู้จัดนัดอนุมัติ
          </div>
          <div style={{ fontSize: '0.8125rem', color: '#92400E' }}>
            คุณสามารถยกเลิกคำขอนี้ได้ตลอดเวลาก่อนได้รับการอนุมัติ
          </div>
        </div>
      )}

      {/* User is Confirmed Member Banner */}
      {isConfirmed && !canManage && (
        <div className="sessions-alert sessions-alert-success" style={{ margin: 0 }}>
          ✅ คุณเป็นสมาชิกในนัดนี้แล้ว สามารถพูดคุยในห้องแชทด้านล่างได้เลย
        </div>
      )}

      {/* Join Action Area */}
      {!isConfirmed && !canManage && (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {canJoin && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#1E293B' }}>
                เลือกตำแหน่งที่ต้องการเล่น (ระบุหรือไม่ก็ได้):
              </span>
              <div className="positions-grid">
                {(['PG', 'SG', 'SF', 'PF', 'C'] as Position[]).map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    className={`position-chip ${selectedPosition === pos ? 'active' : ''}`}
                    onClick={() => setSelectedPosition((prev) => (prev === pos ? null : pos))}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Button
            type="button"
            variant="primary"
            fullWidth
            size="lg"
            data-testid="session-action-join"
            isLoading={isSubmitting}
            disabled={
              isSubmitting ||
              isPending ||
              session.lifecycle !== 'active' ||
              session.seatsRemaining <= 0 ||
              !session.recruitmentOpen
            }
            onClick={canJoin ? handleJoin : undefined}
          >
            {isPending
              ? '⏳ รออนุมัติ (ส่งคำขอแล้ว)'
              : session.lifecycle !== 'active'
              ? 'นัดสิ้นสุดแล้ว'
              : session.seatsRemaining <= 0
              ? 'ผู้เล่นเต็มแล้ว'
              : !session.recruitmentOpen
              ? 'ปิดรับสมาชิกแล้ว'
              : session.joinPolicy === 'instant'
              ? '⚡ เข้าร่วมทีมทันที'
              : '✋ ส่งคำขอเข้าร่วมทีม'}
          </Button>
        </div>
      )}

      {/* Withdraw Action (for Joiners / Members) */}
      {canWithdraw && (
        <Button
          type="button"
          variant="outline"
          size="md"
          data-testid="session-action-withdraw"
          isLoading={isSubmitting}
          disabled={isSubmitting}
          onClick={handleWithdraw}
          style={{ borderColor: '#CBD5E1', color: '#64748B' }}
        >
          {isPending ? 'ยกเลิกคำขอเข้าร่วม' : 'ถอนตัวออกจากนัดนี้'}
        </Button>
      )}

      {/* Host Management Tools */}
      {canManage && (
        <div
          style={{
            backgroundColor: '#F8FAFC',
            padding: '16px',
            borderRadius: '12px',
            border: '1.5px solid #FF6B00',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#C75100' }}>
              🛠️ เครื่องมือผู้จัดนัด (Host Tools)
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => navigate(`/sessions/${session.id}/edit`)}
              style={{ fontSize: '0.75rem', minHeight: '44px' }}
            >
              ✏️ แก้ไขข้อมูลนัด
            </Button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="session-manage-toggle-recruitment"
              isLoading={isSubmitting}
              disabled={isSubmitting || session.lifecycle !== 'active'}
              onClick={handleToggleRecruitment}
            >
              {session.recruitmentOpen ? '🔒 ปิดรับสมัคร' : '🔓 เปิดรับสมัคร'}
            </Button>

            <Button
              type="button"
              variant="danger"
              size="sm"
              data-testid="session-manage-end-session"
              isLoading={isSubmitting}
              disabled={isSubmitting || session.lifecycle !== 'active'}
              onClick={() => setShowEndModal(true)}
            >
              🏁 จบนัด
            </Button>
          </div>
        </div>
      )}

      {/* End Session Confirmation Modal */}
      {showEndModal && (
        <div className="modal-overlay" onClick={() => setShowEndModal(false)}>
          <div className="modal-content" data-testid="session-end-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">จัดการการสิ้นสุดนัดบาส</h3>
            <p style={{ fontSize: '0.875rem', color: '#475569', margin: 0 }}>
              กรุณาเลือกสถานะการสิ้นสุด เมื่อเปลี่ยนแล้วจะไม่สามารถกลับมาเปิดใหม่ได้:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
              <Button
                type="button"
                variant="primary"
                size="md"
                data-testid="session-end-confirm-completed"
                isLoading={isSubmitting}
                onClick={() => handleEndSession('completed')}
              >
                🏆 เล่นเสร็จสิ้นเรียบร้อย (Completed)
              </Button>
              <Button
                type="button"
                variant="danger"
                size="md"
                data-testid="session-end-confirm-cancelled"
                isLoading={isSubmitting}
                onClick={() => handleEndSession('cancelled')}
              >
                ❌ ยกเลิกนัดนี้ (Cancelled)
              </Button>
            </div>

            <div className="modal-actions">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowEndModal(false)}
                disabled={isSubmitting}
              >
                ปิดหน้าต่าง
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { useAppServices } from '../../../services';
import { Button } from '../../../shared/components/Button';
import { Textarea } from '../../../shared/components/Input';

export interface ReportModalProps {
  isOpen: boolean;
  targetType: 'user' | 'session' | 'message';
  targetId: string;
  targetTitle?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  targetType,
  targetId,
  targetTitle,
  onClose,
  onSuccess,
}) => {
  const { data } = useAppServices();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const targetTypeName =
    targetType === 'session' ? 'นัดบาสเกตบอล' : targetType === 'user' ? 'ผู้ใช้' : 'ข้อความแชท';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('กรุณาระบุเหตุผลในการรายงาน');
      return;
    }
    if (reason.length > 2000) {
      setError('เหตุผลต้องไม่เกิน 2000 ตัวอักษร');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await data.report(targetType, targetId, reason.trim());
      if (!res.ok) {
        setError(res.message || 'ไม่สามารถส่งรายงานได้ กรุณาลองใหม่อีกครั้ง');
      } else {
        setSubmitted(true);
        setTimeout(() => {
          setSubmitted(false);
          setReason('');
          onSuccess?.();
          onClose();
        }, 1200);
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} data-testid="report-modal">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">รายงาน{targetTypeName}</h3>

        {targetTitle && (
          <p style={{ fontSize: '0.8125rem', color: '#64748B', margin: 0 }}>
            เป้าหมาย: <strong>{targetTitle}</strong>
          </p>
        )}

        {submitted ? (
          <div className="sessions-alert sessions-alert-success">
            ส่งรายงานเรียบร้อยแล้ว ทีมงานจะตรวจสอบข้อมูลโดยเร็ว
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {error && <div className="sessions-alert sessions-alert-danger">{error}</div>}

            <Textarea
              label="เหตุผลในการรายงาน (เช่น พฤติกรรมไม่เหมาะสม, ข้อมูลเท็จ, สแปม)"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError(null);
              }}
              placeholder="กรุณาระบุรายละเอียดให้ชัดเจน..."
              rows={4}
              data-testid="report-reason-input"
              required
            />

            <div className="modal-actions">
              <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>
                ยกเลิก
              </Button>
              <Button
                type="submit"
                variant="danger"
                size="sm"
                isLoading={isSubmitting}
                data-testid="report-submit-btn"
              >
                ส่งรายงาน
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

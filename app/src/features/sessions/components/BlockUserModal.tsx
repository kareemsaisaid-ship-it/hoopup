import React, { useState } from 'react';
import { useAppServices } from '../../../services';
import { Button } from '../../../shared/components/Button';

export interface BlockUserModalProps {
  isOpen: boolean;
  targetUserId: string;
  targetUserName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export const BlockUserModal: React.FC<BlockUserModalProps> = ({
  isOpen,
  targetUserId,
  targetUserName,
  onClose,
  onSuccess,
}) => {
  const { data } = useAppServices();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleBlock = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await data.blockUser(targetUserId);
      if (!res.ok) {
        setError(res.message || 'ไม่สามารถบล็อกผู้ใช้ได้ กรุณาลองใหม่อีกครั้ง');
      } else {
        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
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
    <div className="modal-overlay" onClick={onClose} data-testid="block-modal">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">บล็อกผู้ใช้</h3>

        {success ? (
          <div className="sessions-alert sessions-alert-success">
            บล็อกผู้ใช้เรียบร้อยแล้ว
          </div>
        ) : (
          <>
            <p style={{ fontSize: '0.875rem', color: '#1E293B', margin: 0, lineHeight: 1.5 }}>
              คุณต้องการบล็อก <strong>{targetUserName}</strong> ใช่หรือไม่?
            </p>

            <div className="sessions-alert sessions-alert-warning" style={{ margin: 0, fontSize: '0.8125rem' }}>
              💡 <strong>หมายเหตุ:</strong> การบล็อกจะป้องกันการมองเห็นและติดต่อในอนาคต แต่จะไม่นำสมาชิกเก่าออกจากนัดที่มีอยู่แล้วโดยอัตโนมัติ
            </div>

            {error && <div className="sessions-alert sessions-alert-danger">{error}</div>}

            <div className="modal-actions">
              <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>
                ยกเลิก
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                isLoading={isSubmitting}
                onClick={handleBlock}
                data-testid="block-confirm-btn"
              >
                ยืนยันการบล็อก
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

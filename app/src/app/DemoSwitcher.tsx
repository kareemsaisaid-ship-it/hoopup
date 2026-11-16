import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppServices } from '../services';
import { tokens } from '../shared/tokens';

const DEMO_USER_TEST_LABELS: Record<string, string> = {
  '11111111-1111-4111-8111-111111111111': 'Host (ผู้จัด)',
  '22222222-2222-4222-8222-222222222222': 'Joiner (ผู้เข้าร่วม)',
  '33333333-3333-4333-8333-333333333333': 'Joiner 2',
  '44444444-4444-4444-8444-444444444444': 'Outsider',
};

export const DemoSwitcher: React.FC = () => {
  const navigate = useNavigate();
  const { auth, isDemo, resetDemoState } = useAppServices();
  const currentUser = auth.getCurrentUser();
  const demoUsers = auth.listDemoUsers();
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleUserChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    if (selectedId) {
      await auth.switchDemoUser(selectedId);
    }
  };

  const handleReset = () => {
    if (confirm('คุณต้องการรีเซ็ตข้อมูล Mock ทั้งหมดกลับเป็นค่าเริ่มต้นใช่หรือไม่?')) {
      resetDemoState();
      setResetSuccess(true);
      setTimeout(() => setResetSuccess(false), 2000);
      window.location.reload();
    }
  };

  const handleSignOut = async () => {
    await auth.signOut();
    navigate('/login');
  };

  return (
    <div
      style={{
        backgroundColor: isDemo ? '#FFF8F3' : '#F1F5F9',
        borderBottom: `1px solid ${isDemo ? '#FFE0CC' : '#E2E8F0'}`,
        padding: '6px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.75rem',
        gap: '8px',
        color: tokens.colors.textPrimary,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, overflow: 'hidden' }}>
        <span
          style={{
            backgroundColor: isDemo ? '#FF6B00' : '#3B82F6',
            color: '#FFFFFF',
            padding: '2px 6px',
            borderRadius: '4px',
            fontWeight: 700,
            fontSize: '0.65rem',
          }}
        >
          {isDemo ? 'DEMO' : 'LIVE'}
        </span>

        {isDemo ? (
          <select
            data-testid="auth-switch-user"
            aria-label="สลับบัญชีผู้ใช้ทดสอบ"
            value={currentUser?.id || ''}
            onChange={handleUserChange}
            style={{
              fontSize: '0.75rem',
              padding: '6px 8px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#0F172A',
              fontWeight: 500,
              maxWidth: '160px',
              minHeight: '44px',
              boxSizing: 'border-box',
              cursor: 'pointer',
            }}
          >
            {!currentUser && (
              <option value="" disabled hidden>
                เลือกผู้ใช้
              </option>
            )}
            {demoUsers.map((u) => {
              const label = DEMO_USER_TEST_LABELS[u.id] || u.displayName;
              return (
                <option key={u.id} value={u.id} label={label}>
                  {label}
                </option>
              );
            })}
          </select>
        ) : (
          <span
            data-testid="auth-current-user"
            style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {currentUser?.displayName || 'ผู้ใช้'}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {isDemo && (
          <button
            onClick={handleReset}
            title="รีเซ็ตข้อมูล Mock ทั้งหมด"
            aria-label="รีเซ็ตข้อมูลทดสอบทั้งหมด"
            style={{
              background: 'none',
              border: '1px solid #CBD5E1',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '0.75rem',
              cursor: 'pointer',
              color: '#64748B',
              minHeight: '44px',
              minWidth: '44px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box',
            }}
          >
            {resetSuccess ? '✓ รีเซ็ตแล้ว' : '🔄 รีเซ็ต'}
          </button>
        )}

        <button
          data-testid="auth-signout-btn"
          aria-label="ออกจากระบบ"
          onClick={handleSignOut}
          style={{
            background: 'none',
            border: 'none',
            color: '#EF4444',
            cursor: 'pointer',
            fontSize: '0.75rem',
            fontWeight: 600,
            padding: '6px 10px',
            minHeight: '44px',
            minWidth: '44px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
          }}
        >
          ออกจากระบบ
        </button>
      </div>
    </div>
  );
};

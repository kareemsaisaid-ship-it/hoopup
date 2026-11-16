import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppServices } from '../../services';
import type { ChatMessage, SessionMember, SessionSummary } from '../../services/types';
import { Button } from '../../shared/components/Button';
import { BlockUserModal } from './components/BlockUserModal';
import { MemberList } from './components/MemberList';
import { ReportModal } from './components/ReportModal';
import { SessionActions } from './components/SessionActions';
import { SessionChat } from './components/SessionChat';
import { SessionHeader } from './components/SessionHeader';
import './styles/sessions.css';

export const SessionDetailPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { auth, data } = useAppServices();
  const currentUser = auth.getCurrentUser();

  const [session, setSession] = useState<SessionSummary | null>(null);
  const [members, setMembers] = useState<SessionMember[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modals state
  const [reportModal, setReportModal] = useState<{
    isOpen: boolean;
    targetType: 'user' | 'session' | 'message';
    targetId: string;
    targetTitle?: string;
  }>({
    isOpen: false,
    targetType: 'session',
    targetId: '',
  });

  const [blockModal, setBlockModal] = useState<{
    isOpen: boolean;
    targetUserId: string;
    targetUserName: string;
  }>({
    isOpen: false,
    targetUserId: '',
    targetUserName: '',
  });

  // Fetch full session data, members, and messages
  const loadSessionData = useCallback(async (_isInitial = false) => {
    if (!sessionId) return;

    try {
      const sess = await data.getSession(sessionId);
      if (!sess) {
        setNotFound(true);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      setSession(sess);
      setNotFound(false);

      // Fetch members
      const mems = await data.listMembers(sessionId);
      setMembers(mems);

      // Fetch messages if allowed
      if (sess.actions.canReadChat) {
        const msgs = await data.listMessages(sessionId);
        setMessages(msgs);
      } else {
        setMessages([]);
      }
    } catch {
      setErrorMsg('เกิดข้อผิดพลาดในการโหลดข้อมูลนัด กรุณากดลองใหม่อีกครั้ง');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [sessionId, data]);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    const currentSessionId = sessionId;
    data
      .getSession(currentSessionId)
      .then(async (sess) => {
        if (!active) return;
        if (!sess) {
          setNotFound(true);
          setIsLoading(false);
          setIsRefreshing(false);
          return;
        }

        setSession(sess);
        setNotFound(false);

        const mems = await data.listMembers(currentSessionId);
        if (!active) return;
        setMembers(mems);

        if (sess.actions.canReadChat) {
          const msgs = await data.listMessages(currentSessionId);
          if (!active) return;
          setMessages(msgs);
        } else {
          setMessages([]);
        }
        setIsLoading(false);
      })
      .catch(() => {
        if (active) {
          setErrorMsg('เกิดข้อผิดพลาดในการโหลดข้อมูลนัด กรุณากดลองใหม่อีกครั้ง');
          setIsLoading(false);
        }
      });

    const interval = setInterval(() => {
      loadSessionData();
    }, 1000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [sessionId, data, loadSessionData]);

  // Handle reporting session
  const handleReportSession = () => {
    if (!session) return;
    setReportModal({
      isOpen: true,
      targetType: 'session',
      targetId: session.id,
      targetTitle: session.title,
    });
  };

  // Handle reporting user
  const handleReportUser = (userId: string, userName: string) => {
    setReportModal({
      isOpen: true,
      targetType: 'user',
      targetId: userId,
      targetTitle: userName,
    });
  };

  // Handle reporting message
  const handleReportMessage = (messageId: string, snippet: string) => {
    setReportModal({
      isOpen: true,
      targetType: 'message',
      targetId: messageId,
      targetTitle: `ข้อความ "${snippet.slice(0, 30)}..."`,
    });
  };

  // Handle blocking user
  const handleBlockUser = (userId: string, userName: string) => {
    setBlockModal({
      isOpen: true,
      targetUserId: userId,
      targetUserName: userName,
    });
  };

  if (isLoading) {
    return (
      <div className="sessions-container" data-testid="session-detail-loading-container" style={{ gap: '14px' }}>
        {/* Top Nav Skeleton */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1rem', fontWeight: 'bold' }}>
            <button
              type="button"
              className="sessions-back-btn"
              onClick={() => navigate('/')}
              aria-label="ย้อนกลับ"
            >
              ‹
            </button>
            <span>รายละเอียดห้อง</span>
          </div>
          <div className="skeleton skeleton-circle" style={{ width: '32px', height: '32px' }}></div>
        </div>

        {/* Hero Header Skeleton Card */}
        <div className="card" style={{ gap: '12px', backgroundColor: 'var(--color-header-bg)' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <div className="skeleton skeleton-pill" style={{ width: '80px', height: '22px' }}></div>
            <div className="skeleton skeleton-pill" style={{ width: '45px', height: '22px' }}></div>
            <div className="skeleton skeleton-pill" style={{ width: '75px', height: '22px' }}></div>
          </div>
          <div>
            <div className="skeleton skeleton-text-lg" style={{ width: '200px', height: '22px' }}></div>
            <div className="skeleton skeleton-text" style={{ width: '80px', marginTop: '6px' }}></div>
          </div>
        </div>

        {/* Team Members Section Skeleton */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="skeleton skeleton-text" style={{ width: '80px' }}></div>
            <div className="skeleton skeleton-text" style={{ width: '40px' }}></div>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', margin: '8px 0' }}>
            <div className="skeleton skeleton-circle" style={{ width: '44px', height: '44px' }}></div>
            <div className="skeleton skeleton-circle" style={{ width: '44px', height: '44px' }}></div>
            <div className="skeleton skeleton-circle" style={{ width: '44px', height: '44px' }}></div>
            <div className="skeleton skeleton-circle" style={{ width: '44px', height: '44px', opacity: 0.4 }}></div>
            <div className="skeleton skeleton-circle" style={{ width: '44px', height: '44px', opacity: 0.4 }}></div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <div className="skeleton skeleton-text" style={{ width: '60px' }}></div>
            <div className="skeleton skeleton-pill" style={{ width: '32px', height: '20px' }}></div>
          </div>

          <div className="skeleton" style={{ height: '36px', borderRadius: 'var(--radius-md)', marginTop: '6px' }}></div>
        </div>

        {/* Chat Preview Skeleton */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="skeleton skeleton-text" style={{ width: '50px' }}></div>
            <div className="skeleton skeleton-text" style={{ width: '70px' }}></div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <div className="skeleton skeleton-circle" style={{ width: '28px', height: '28px' }}></div>
              <div className="skeleton" style={{ flex: 1, height: '32px', borderRadius: 'var(--radius-md)' }}></div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <div className="skeleton skeleton-circle" style={{ width: '28px', height: '28px' }}></div>
              <div className="skeleton" style={{ flex: 1, height: '32px', borderRadius: 'var(--radius-md)' }}></div>
            </div>
          </div>
        </div>

        {/* Bottom Button Skeleton */}
        <div className="skeleton skeleton-btn" style={{ width: '100%', height: '46px', borderRadius: 'var(--radius-lg)', marginTop: '4px' }}></div>
      </div>
    );
  }

  if (errorMsg && !session) {
    return (
      <div className="sessions-container">
        <div className="sessions-header">
          <button type="button" className="sessions-back-btn" onClick={() => navigate('/')}>
            ‹ กลับหน้าแรก
          </button>
          <span style={{ fontSize: '1rem', fontWeight: 'bold' }}>รายละเอียดนัด</span>
        </div>

        <div className="state-container" style={{ flex: 1, margin: 'auto 0' }} data-testid="session-detail-error-state">
          <div className="state-icon-circle state-icon-error">
            <span>⚠️</span>
          </div>
          <div className="state-title">โหลดข้อมูลนัดไม่สำเร็จ</div>
          <div className="state-subtitle">
            ระบบไม่สามารถดึงข้อมูลสมาชิกและห้องเล่นบาสล่าสุดได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่อีกครั้ง
          </div>

          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '290px',
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              borderColor: 'rgba(239, 68, 68, 0.25)',
              textAlign: 'left',
              padding: '12px',
            }}
          >
            <div style={{ fontSize: 'var(--font-xs)', fontWeight: 600, color: 'var(--color-status-error)' }}>
              <span>🛡️ ปลอดภัย & พร้อมกู้คืน</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '4px', lineHeight: 1.4 }}>
              สถานะการเข้าร่วมของคุณยังคงเดิม ไม่สูญหาย คุณสามารถกดโหลดใหม่เพื่ออัปเดตสมาชิกห้องได้ทันที
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '260px', marginTop: '12px' }}>
            <button
              type="button"
              className="btn btn-primary btn-block"
              data-testid="session-detail-retry-btn"
              onClick={() => {
                setIsLoading(true);
                setErrorMsg(null);
                loadSessionData();
              }}
            >
              <span>🔄 ลองโหลดใหม่อีกครั้ง (Retry)</span>
            </button>
            <button
              type="button"
              className="btn btn-outline btn-block"
              onClick={() => navigate('/')}
            >
              <span>⬅️ กลับหน้ารายการนัด</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !session) {
    return (
      <div className="sessions-container">
        <div className="sessions-header">
          <button type="button" className="sessions-back-btn" onClick={() => navigate('/')}>
            ‹ กลับหน้าแรก
          </button>
          <span style={{ fontSize: '1rem', fontWeight: 'bold' }}>รายละเอียดนัด</span>
        </div>

        <div className="state-container" style={{ flex: 1, margin: 'auto 0' }} data-testid="session-detail-empty-state">
          <div className="state-icon-circle" style={{ backgroundColor: 'rgba(100, 116, 139, 0.15)', color: 'var(--color-text-secondary)', border: '1px dashed var(--color-border)' }}>
            <span>🚫</span>
          </div>
          <div className="state-title">ไม่พบนัดนี้ หรือนัดสิ้นสุดแล้ว</div>
          <div className="state-subtitle">
            นัดเล่นบาสนี้อาจถูกผู้จัดยกเลิก หมดระยะเวลา หรือคุณไม่มีสิทธิ์เข้าถึงห้องนี้
          </div>

          <div style={{ margin: '4px 0' }}>
            <span style={{ display: 'inline-flex', padding: '4px 10px', fontSize: 'var(--font-xs)', borderRadius: 'var(--radius-full)', backgroundColor: 'rgba(255, 255, 255, 0.1)', color: 'var(--color-text-primary)' }}>
              สถานะ: ยกเลิก / สิ้นสุดการรับคน
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', maxWidth: '260px', marginTop: '12px' }}>
            <button
              type="button"
              className="btn btn-primary btn-block"
              data-testid="session-detail-empty-feed-btn"
              onClick={() => navigate('/')}
            >
              <span>🏀 กลับไปที่ฟีดเพื่อหานัดอื่น</span>
            </button>
            <button
              type="button"
              className="btn btn-outline btn-block"
              data-testid="session-detail-empty-create-btn"
              onClick={() => navigate('/sessions/new')}
            >
              <span>➕ เปิดนัดใหม่ด้วยตัวเอง</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isHost = session.hostId === currentUser?.id;

  return (
    <div className="sessions-container">
      {/* Top Navigation Bar */}
      <div className="sessions-header">
        <button
          type="button"
          className="sessions-back-btn"
          onClick={() => navigate(-1)}
          aria-label="ย้อนกลับ"
        >
          ← ย้อนกลับ
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => loadSessionData(false)}
            isLoading={isRefreshing}
            style={{ fontSize: '0.75rem', padding: '4px 8px' }}
          >
            🔄 รีเฟรช
          </Button>
        </div>
      </div>

      {errorMsg && (
        <div className="sessions-alert sessions-alert-danger" style={{ marginBottom: '16px' }}>
          {errorMsg}
        </div>
      )}

      {/* Main Session Header */}
      <SessionHeader session={session} onReportSession={handleReportSession} />

      {/* Action Buttons (Join, Withdraw, Host Tools) */}
      <SessionActions session={session} onRefresh={() => loadSessionData(false)} />

      {/* Member List (Confirmed & Pending) */}
      <MemberList
        session={session}
        members={members}
        isHost={isHost}
        onRefresh={() => loadSessionData(false)}
        onReportUser={handleReportUser}
        onBlockUser={handleBlockUser}
      />

      {/* Chat Component */}
      <SessionChat
        session={session}
        messages={messages}
        isLoading={isRefreshing}
        onRefresh={() => loadSessionData(false)}
        onReportMessage={handleReportMessage}
      />

      {/* Report Modal */}
      <ReportModal
        isOpen={reportModal.isOpen}
        targetType={reportModal.targetType}
        targetId={reportModal.targetId}
        targetTitle={reportModal.targetTitle}
        onClose={() => setReportModal((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Block User Modal */}
      <BlockUserModal
        isOpen={blockModal.isOpen}
        targetUserId={blockModal.targetUserId}
        targetUserName={blockModal.targetUserName}
        onClose={() => setBlockModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};

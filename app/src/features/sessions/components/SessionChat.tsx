import React, { useEffect, useRef, useState } from 'react';
import { useAppServices } from '../../../services';
import type { ChatMessage, SessionSummary } from '../../../services/types';
import { Button } from '../../../shared/components/Button';
import { formatThaiTime } from '../utils/dateTime';

export interface SessionChatProps {
  session: SessionSummary;
  messages: ChatMessage[];
  isLoading: boolean;
  onRefresh: () => void;
  onReportMessage?: (messageId: string, snippet: string) => void;
}

export const SessionChat: React.FC<SessionChatProps> = ({
  session,
  messages,
  isLoading,
  onRefresh,
  onReportMessage,
}) => {
  const { auth, data } = useAppServices();
  const currentUser = auth.getCurrentUser();

  const [inputBody, setInputBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Stable client message ID across retries for the current message draft
  const [currentMessageId, setCurrentMessageId] = useState<string>(() => crypto.randomUUID());

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const canReadChat = session.actions.canReadChat;
  const canSendMessage = session.actions.canSendMessage && session.lifecycle === 'active';

  // Deduplicate messages by id or clientMessageId
  const deduplicatedMessages = React.useMemo(() => {
    const seen = new Set<string>();
    const list: ChatMessage[] = [];
    for (const msg of messages) {
      const key = msg.id || msg.clientMessageId;
      if (key && !seen.has(key)) {
        seen.add(key);
        list.push(msg);
      }
    }
    return list;
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputBody.trim();
    if (!text || isSending || !canSendMessage) return;

    setIsSending(true);
    setSendError(null);

    try {
      // Send using the stable clientMessageId
      const res = await data.sendMessage(session.id, currentMessageId, text);
      if (!res.ok) {
        setSendError(res.message || 'ไม่สามารถส่งข้อความได้ กรุณาลองใหม่อีกครั้ง');
        // Do NOT change currentMessageId here so retry will be idempotent
      } else {
        setInputBody('');
        // Generate a new stable UUID for the NEXT message
        setCurrentMessageId(crypto.randomUUID());
        onRefresh();
      }
    } catch {
      setSendError('การเชื่อมต่อขัดข้อง กรุณากดส่งอีกครั้งเพื่อลองใหม่');
      // Do NOT change currentMessageId here so retry will be idempotent
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="chat-container" data-testid="chat-container">
      <div className="chat-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1rem' }}>💬</span>
          <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#0F172A' }}>
            ห้องแชทนัดนี้
          </span>
          <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
            ({deduplicatedMessages.length} ข้อความ)
          </span>
        </div>

        {canReadChat && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            isLoading={isLoading}
            style={{ fontSize: '0.75rem', minHeight: '44px' }}
            title="รีเฟรชข้อความ"
          >
            🔄 รีเฟรช
          </Button>
        )}
      </div>

      {!canReadChat ? (
        <div
          data-testid="chat-forbidden-banner"
          className="sessions-alert sessions-alert-warning"
          style={{ margin: '16px', borderRadius: '10px' }}
        >
          🔒 <strong>เฉพาะสมาชิกที่เข้าร่วมแล้วเท่านั้น:</strong>{' '}
          ผู้ที่อยู่ในสถานะรออนุมัติหรือบุคคลภายนอกไม่สามารถอ่านหรือส่งข้อความในห้องนี้ได้
        </div>
      ) : (
        <>
          <div className="chat-messages" data-testid="chat-message-list">
            {deduplicatedMessages.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94A3B8', fontSize: '0.8125rem', padding: '24px 0' }}>
                ยังไม่มีข้อความ ทักทายเพื่อนร่วมทีมเพื่อพูดคุยจุดนัดพบกันได้เลย!
              </div>
            ) : (
              deduplicatedMessages.map((msg) => {
                const isMine = currentUser?.id === msg.senderId;
                return (
                  <div
                    key={msg.id || msg.clientMessageId}
                    data-testid="chat-message-item"
                    className={`chat-bubble ${isMine ? 'chat-bubble-mine' : 'chat-bubble-other'}`}
                  >
                    {!isMine && (
                      <div className="chat-sender-name">
                        {msg.senderName || 'ผู้เข้าร่วม'}
                      </div>
                    )}

                    <div style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                      {msg.body}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: '6px',
                        marginTop: '4px',
                      }}
                    >
                      <span className="chat-time">{formatThaiTime(msg.createdAt)}</span>

                      {!isMine && onReportMessage && (
                        <button
                          type="button"
                          data-testid="chat-report-message-btn"
                          aria-label="รายงานข้อความนี้"
                          onClick={() => onReportMessage(msg.id, msg.body)}
                          title="รายงานข้อความนี้"
                          style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '0.65rem',
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
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {sendError && (
            <div
              className="sessions-alert sessions-alert-danger"
              style={{ margin: '8px 14px', padding: '8px 12px', fontSize: '0.75rem' }}
            >
              {sendError}
            </div>
          )}

          <form onSubmit={handleSendMessage} className="chat-input-bar">
            <input
              type="text"
              data-testid="chat-input"
              value={inputBody}
              onChange={(e) => {
                setInputBody(e.target.value);
                if (sendError) setSendError(null);
              }}
              placeholder={
                !canSendMessage
                  ? '⚠️ นัดนี้สิ้นสุดลงแล้ว ไม่สามารถส่งข้อความได้'
                  : 'พิมพ์ข้อความทักทาย หรือจุดสังเกต...'
              }
              disabled={isSending || !canSendMessage}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '20px',
                border: '1px solid #CBD5E1',
                outline: 'none',
                fontSize: '0.875rem',
                minHeight: '44px',
                boxSizing: 'border-box',
              }}
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              data-testid="chat-send-btn"
              isLoading={isSending}
              disabled={!canSendMessage || !inputBody.trim() || isSending}
              style={{ borderRadius: '20px', padding: '8px 16px' }}
            >
              ส่ง
            </Button>
          </form>
          {!canSendMessage && (
            <div
              style={{
                padding: '6px 16px',
                backgroundColor: '#F1F5F9',
                color: '#64748B',
                fontSize: '0.8125rem',
                textAlign: 'center',
              }}
            >
              {session.lifecycle !== 'active'
                ? '⚠️ นัดนี้สิ้นสุดลงแล้ว ไม่สามารถส่งข้อความเพิ่มเติมได้'
                : 'เฉพาะสมาชิกที่ยืนยันแล้วจึงจะสามารถส่งข้อความได้'}
            </div>
          )}
        </>
      )}
    </div>
  );
};

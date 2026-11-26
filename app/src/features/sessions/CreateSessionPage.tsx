import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppServices } from '../../services';
import type { Court, Position, SessionInput, SkillLevel } from '../../services/types';
import { Button } from '../../shared/components/Button';
import { Input, Select, Textarea } from '../../shared/components/Input';
import './styles/sessions.css';
import { localInputToBangkokIso } from './utils/dateTime';
import { validateSessionInput, type ValidationErrorMap } from './utils/validation';

export const CreateSessionPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedCourtId = searchParams.get('court');
  const { auth, data } = useAppServices();

  const [courts, setCourts] = useState<Court[]>([]);
  const [isLoadingCourts, setIsLoadingCourts] = useState(true);

  // Form State
  const [title, setTitle] = useState('');
  const [courtId, setCourtId] = useState('');
  const [isTimingNow, setIsTimingNow] = useState(true);
  const [futureDateTime, setFutureDateTime] = useState('');
  const [teamSize, setTeamSize] = useState<3 | 5>(5);
  const [guestCount, setGuestCount] = useState<number>(0);
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('casual');
  const [welcomesBeginners, setWelcomesBeginners] = useState(true);
  const [wantedPositions, setWantedPositions] = useState<Position[]>([]);
  const [joinPolicy, setJoinPolicy] = useState<'instant' | 'approval'>('instant');
  const [meetingPoint, setMeetingPoint] = useState('');
  const [notes, setNotes] = useState('');

  // Stable client request UUID across retries
  const [requestId] = useState<string>(() => crypto.randomUUID());

  const [errors, setErrors] = useState<ValidationErrorMap>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Load available courts on mount
  useEffect(() => {
    let mounted = true;
    data
      .listCourts()
      .then((res) => {
        if (mounted) {
          setCourts(res);
          if (res.length > 0) {
            if (preselectedCourtId && res.some((c) => c.id === preselectedCourtId)) {
              setCourtId(preselectedCourtId);
            } else {
              setCourtId(res[0].id);
            }
          }
          setIsLoadingCourts(false);
        }
      })
      .catch(() => {
        if (mounted) setIsLoadingCourts(false);
      });
    return () => {
      mounted = false;
    };
  }, [data, preselectedCourtId]);

  // Handle position toggle
  const togglePosition = (pos: Position) => {
    setWantedPositions((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Check auth
    const currentUser = auth.getCurrentUser();
    if (!currentUser) {
      setServerError('กรุณาเข้าสู่ระบบก่อนสร้างนัดบาสเกตบอล');
      return;
    }

    const startsAtIso = isTimingNow ? null : localInputToBangkokIso(futureDateTime);

    const inputPayload: SessionInput = {
      title: title.trim(),
      courtId,
      startsAt: startsAtIso,
      teamSize,
      guestCount,
      skillLevel,
      welcomesBeginners,
      wantedPositions,
      joinPolicy,
      meetingPoint: meetingPoint.trim(),
      notes: notes.trim(),
    };

    // Client-side validation
    const validation = validateSessionInput(inputPayload, isTimingNow);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    setServerError(null);

    try {
      // Send with stable request UUID
      const res = await data.createSession(requestId, inputPayload);

      if (!res.ok) {
        setServerError(res.message || 'ไม่สามารถสร้างนัดได้ กรุณาตรวจสอบข้อมูลและลองใหม่อีกครั้ง');
      } else if (res.session) {
        // Navigate to the newly created session detail page
        navigate(`/sessions/${res.session.id}`);
      }
    } catch {
      setServerError('เกิดข้อผิดพลาดในการเชื่อมต่อเครือข่าย กรุณากดบันทึกอีกครั้ง');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="sessions-container">
      <div className="sessions-header">
        <button
          type="button"
          className="sessions-back-btn"
          onClick={() => navigate(-1)}
          aria-label="ย้อนกลับ"
        >
          ‹ ย้อนกลับ
        </button>
        <h2 className="sessions-title">สร้างห้องหาคน</h2>
        <div style={{ width: '40px' }} />
      </div>

      {(serverError || errors.startsAt || errors.title || errors.courtId || errors.guestCount) && (
        <div
          data-testid="session-form-error"
          className="sessions-alert sessions-alert-danger"
          style={{ marginBottom: '16px' }}
        >
          {serverError || errors.startsAt || errors.title || errors.courtId || errors.guestCount}
        </div>
      )}

      <form onSubmit={handleSubmit} className="sessions-form">
        {/* Title */}
        <Input
          label="ชื่อนัดบาส *"
          data-testid="session-form-title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
          }}
          placeholder="เช่น บาสเย็นชิลๆ รับคนเพิ่ม, 5v5 สวนลุม"
          error={errors.title}
          maxLength={120}
          required
        />

        {/* Court Select */}
        <div className="form-group">
          <label className="form-label form-label-required">สนามบาสเกตบอล</label>
          {isLoadingCourts ? (
            <div style={{ fontSize: '0.8125rem', color: '#64748B' }}>กำลังโหลดรายชื่อสนาม...</div>
          ) : (
            <Select
              data-testid="session-form-court-select"
              value={courtId}
              onChange={(e) => {
                setCourtId(e.target.value);
                if (errors.courtId) setErrors((prev) => ({ ...prev, courtId: undefined }));
              }}
              error={errors.courtId}
              required
            >
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.address ? `(${c.address})` : ''}
                </option>
              ))}
            </Select>
          )}
        </div>

        {/* Timing Segmented: ตอนนี้ vs กำหนดเวลา */}
        <div className="form-group">
          <label className="form-label form-label-required">เวลาที่นัดเล่น</label>
          <div className="segmented-control">
            <button
              type="button"
              data-testid="session-form-timing-now"
              className={`segmented-btn ${isTimingNow ? 'active' : ''}`}
              onClick={() => {
                setIsTimingNow(true);
                if (errors.startsAt) setErrors((prev) => ({ ...prev, startsAt: undefined }));
              }}
            >
              ⚡ ตอนนี้ (เริ่มเล่นทันที)
            </button>
            <button
              type="button"
              data-testid="session-form-timing-future"
              className={`segmented-btn ${!isTimingNow ? 'active' : ''}`}
              onClick={() => setIsTimingNow(false)}
            >
              📅 กำหนดวันเวลา
            </button>
          </div>

          {!isTimingNow && (
            <div style={{ marginTop: '8px' }}>
              <Input
                type="datetime-local"
                data-testid="session-form-starts-at"
                value={futureDateTime}
                onChange={(e) => {
                  setFutureDateTime(e.target.value);
                  if (errors.startsAt) setErrors((prev) => ({ ...prev, startsAt: undefined }));
                }}
                error={errors.startsAt}
                required={!isTimingNow}
              />
              <span className="form-help">
                ระบุเวลาตามเขตเวลาประเทศไทย (Asia/Bangkok) และต้องเป็นเวลาในอนาคต
              </span>
            </div>
          )}
        </div>

        {/* Team Size: 3v3 vs 5v5 */}
        <div className="form-group">
          <label className="form-label form-label-required">ขนาดทีม (ต่อหนึ่งทีม)</label>
          <div className="segmented-control">
            <button
              type="button"
              data-testid="session-form-teamsize-3"
              className={`segmented-btn ${teamSize === 3 ? 'active' : ''}`}
              onClick={() => {
                setTeamSize(3);
                if (guestCount > 2) setGuestCount(2);
              }}
            >
              3 คน (3v3 Half court)
            </button>
            <button
              type="button"
              data-testid="session-form-teamsize-5"
              className={`segmented-btn ${teamSize === 5 ? 'active' : ''}`}
              onClick={() => setTeamSize(5)}
            >
              5 คน (5v5 Full court)
            </button>
          </div>
        </div>

        {/* REDESIGN CORE: เพื่อนที่มาด้วย (ไม่รวมคุณ) แทนการเดาว่าขาดกี่คน */}
        <div className="card" style={{ border: '1px solid var(--color-primary-light)', backgroundColor: 'rgba(21, 29, 42, 0.95)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="card-title" style={{ color: 'var(--color-primary)' }}>
                <span>👥 เพื่อนที่มาด้วย (ไม่รวมคุณ)</span>
              </div>
              <div className="form-help" style={{ marginTop: '2px' }}>
                กรอกจำนวนเพื่อนที่มาด้วยกัน ระบบจะนับผู้จัด 1 คนอัตโนมัติ
              </div>
            </div>
            {/* Stepper with number input so both Playwright .fill() and click buttons work */}
            <div className="counter-box" style={{ minWidth: '110px' }}>
              <button
                type="button"
                className="counter-btn"
                data-testid="session-form-guest-decrement"
                aria-label="ลดจำนวนเพื่อน"
                onClick={() => {
                  const newVal = Math.max(0, guestCount - 1);
                  setGuestCount(newVal);
                  if (errors.guestCount) setErrors((prev) => ({ ...prev, guestCount: undefined }));
                }}
              >
                −
              </button>
              <input
                type="number"
                data-testid="session-form-guest-count"
                className="counter-value"
                value={guestCount}
                min={0}
                max={teamSize - 1}
                aria-label="จำนวนเพื่อนที่มาด้วย"
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10) || 0;
                  setGuestCount(val);
                  if (errors.guestCount) setErrors((prev) => ({ ...prev, guestCount: undefined }));
                }}
              />
              <button
                type="button"
                className="counter-btn"
                data-testid="session-form-guest-increment"
                aria-label="เพิ่มจำนวนเพื่อน"
                onClick={() => {
                  const newVal = Math.min(teamSize - 1, guestCount + 1);
                  setGuestCount(newVal);
                  if (errors.guestCount) setErrors((prev) => ({ ...prev, guestCount: undefined }));
                }}
              >
                +
              </button>
            </div>
          </div>

          {errors.guestCount && (
            <div className="form-error" style={{ marginTop: '4px' }}>
              {errors.guestCount}
            </div>
          )}

          {/* Dynamic Live Calculation Banner */}
          <div className="live-calc-banner" style={{ marginTop: '6px' }}>
            <span className="live-calc-icon">🏀</span>
            <div>
              <div>
                คุณ 1 คน + เพื่อน {guestCount} คน ={' '}
                <span className="live-calc-highlight">มีแล้ว {1 + guestCount} คน</span> ·{' '}
                รับเพิ่ม <span className="live-calc-highlight">{Math.max(0, teamSize - (1 + guestCount))} คน</span>
              </div>
              <div className="player-visual-dots">
                {/* Host dot */}
                <div className="player-dot host" title="ผู้จัด (คุณ)">
                  บ
                </div>
                {/* Friend dots */}
                {Array.from({ length: guestCount }).map((_, i) => (
                  <div key={`friend-${i}`} className="player-dot friend" title={`เพื่อนคนที่ ${i + 1}`}>
                    พ{i + 1}
                  </div>
                ))}
                {/* Empty spots */}
                {Array.from({ length: Math.max(0, teamSize - (1 + guestCount)) }).map((_, i) => (
                  <div key={`empty-${i}`} className="player-dot empty" title="ว่าง (รอคนเข้าร่วม)">
                    +
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Skill Level */}
        <div className="form-group">
          <label className="form-label form-label-required">ระดับการเล่น (Skill Level)</label>
          <Select
            data-testid="session-form-skill-level"
            value={skillLevel}
            onChange={(e) => setSkillLevel(e.target.value as SkillLevel)}
          >
            <option value="casual">🟢 เล่นสนุกๆ / สุขภาพ (Casual)</option>
            <option value="regular">🟠 เล่นประจำ / ทั่วไป (Regular)</option>
            <option value="competitive">🔴 จริงจัง / แข่งขัน (Competitive)</option>
          </Select>
        </div>

        {/* Beginner Welcome Toggle */}
        <div className="card" style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 'var(--font-xs)', fontWeight: 600 }}>🏀 ยินดีต้อนรับมือใหม่</div>
              <div className="form-help">เปิดรับผู้เล่นทุกระดับร่วมแจม</div>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                id="welcomesBeginners"
                checked={welcomesBeginners}
                onChange={(e) => setWelcomesBeginners(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>

        {/* Wanted Positions (Advisory) */}
        <div className="form-group">
          <label className="form-label" data-testid="session-form-positions">
            ตำแหน่งที่ต้องการเพิ่ม (เลือกหรือไม่ก็ได้)
          </label>
          <div className="positions-grid">
            {(['PG', 'SG', 'SF', 'PF', 'C'] as Position[]).map((pos) => {
              const active = wantedPositions.includes(pos);
              return (
                <button
                  key={pos}
                  type="button"
                  className={`position-chip ${active ? 'active' : ''}`}
                  onClick={() => togglePosition(pos)}
                >
                  {pos} {active ? '✓' : ''}
                </button>
              );
            })}
          </div>
          <span className="form-help">เป็นเพียงความต้องการแนะนำ ไม่ได้บังคับสลอตตายตัว</span>
        </div>

        {/* Join Policy: Instant vs Approval */}
        <div className="form-group">
          <label className="form-label form-label-required">นโยบายการเข้าร่วม</label>
          <div className="segmented-control">
            <button
              type="button"
              data-testid="session-form-policy-instant"
              className={`segmented-btn ${joinPolicy === 'instant' ? 'active' : ''}`}
              onClick={() => setJoinPolicy('instant')}
            >
              ⚡ เข้าได้ทันที (Instant Join)
            </button>
            <button
              type="button"
              data-testid="session-form-policy-approval"
              className={`segmented-btn ${joinPolicy === 'approval' ? 'active' : ''}`}
              onClick={() => setJoinPolicy('approval')}
            >
              ✋ ต้องรออนุมัติ (Host Approval)
            </button>
          </div>
          <span className="form-help">
            {joinPolicy === 'instant'
              ? 'ผู้เล่นอื่นสามารถกดเข้าทีมและยืนยันที่นั่งได้ทันทีจนกว่าจะเต็ม'
              : 'ผู้เล่นอื่นต้องส่งคำขอ และคุณสามารถเลือกอนุมัติหรือปฏิเสธได้'}
          </span>
        </div>

        {/* Meeting Point */}
        <Input
          label="จุดนัดพบในสนาม"
          data-testid="session-form-meeting-point"
          value={meetingPoint}
          onChange={(e) => setMeetingPoint(e.target.value)}
          placeholder="เช่น ม้านั่งยาวข้างทางเข้าสนาม, ใต้แป้นฝั่งทิศเหนือ"
          maxLength={500}
        />

        {/* Notes */}
        <Textarea
          label="หมายเหตุเพิ่มเติม"
          data-testid="session-form-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="เช่น พกลูกบาสมาด้วย, มีค่าลูกบาส/สนามคนละ 20 บาท"
          maxLength={2000}
          rows={3}
        />

        {/* Submit Button */}
        <div style={{ marginTop: '8px' }}>
          <Button
            type="submit"
            variant="primary"
            fullWidth
            size="lg"
            data-testid="session-form-submit-btn"
            isLoading={isSubmitting}
            disabled={isSubmitting}
          >
            🏀 ประกาศหาคน (รับเพิ่ม {Math.max(0, teamSize - (1 + guestCount))} คน)
          </Button>
        </div>
      </form>
    </div>
  );
};

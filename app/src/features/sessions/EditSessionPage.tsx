import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppServices } from '../../services';
import type { Court, Position, SessionInput, SessionSummary, SkillLevel } from '../../services/types';
import { Button } from '../../shared/components/Button';
import { Input, Select, Textarea } from '../../shared/components/Input';
import './styles/sessions.css';
import { isoToLocalInputValue, localInputToBangkokIso } from './utils/dateTime';
import { validateCapacityConflict, validateSessionInput, type ValidationErrorMap } from './utils/validation';

export const EditSessionPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { auth, data } = useAppServices();
  const currentUser = auth.getCurrentUser();

  const [session, setSession] = useState<SessionSummary | null>(null);
  const [courts, setCourts] = useState<Court[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form State
  const [title, setTitle] = useState('');
  const [courtId, setCourtId] = useState('');
  const [isTimingNow, setIsTimingNow] = useState(false);
  const [futureDateTime, setFutureDateTime] = useState('');
  const [initialFutureDateTime, setInitialFutureDateTime] = useState('');
  const [teamSize, setTeamSize] = useState<3 | 5>(5);
  const [guestCount, setGuestCount] = useState<number>(0);
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('casual');
  const [welcomesBeginners, setWelcomesBeginners] = useState(true);
  const [wantedPositions, setWantedPositions] = useState<Position[]>([]);
  const [joinPolicy, setJoinPolicy] = useState<'instant' | 'approval'>('instant');
  const [meetingPoint, setMeetingPoint] = useState('');
  const [notes, setNotes] = useState('');

  const [errors, setErrors] = useState<ValidationErrorMap>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Load session & courts
  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!sessionId) return;
      try {
        const [sess, courtList] = await Promise.all([
          data.getSession(sessionId),
          data.listCourts(),
        ]);

        if (!mounted) return;

        setCourts(courtList);
        if (sess) {
          setSession(sess);
          setTitle(sess.title);
          setCourtId(sess.court.id);
          setTeamSize(sess.teamSize);
          setGuestCount(sess.guestCount);
          setSkillLevel(sess.skillLevel);
          setWelcomesBeginners(sess.welcomesBeginners);
          setWantedPositions(sess.wantedPositions || []);
          setJoinPolicy(sess.joinPolicy);
          setMeetingPoint(sess.meetingPoint || '');
          setNotes(sess.notes || '');

          if (!sess.startsAt) {
            setIsTimingNow(true);
            setFutureDateTime('');
            setInitialFutureDateTime('');
          } else {
            setIsTimingNow(false);
            const localVal = isoToLocalInputValue(sess.startsAt);
            setFutureDateTime(localVal);
            setInitialFutureDateTime(localVal);
          }
        }
      } catch {
        if (mounted) setServerError('เกิดข้อผิดพลาดในการโหลดข้อมูล');
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [sessionId, data]);

  const togglePosition = (pos: Position) => {
    setWantedPositions((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId || !session || isSubmitting) return;

    // Check host permissions
    if (session.hostId !== currentUser?.id && !session.actions.canManage) {
      setServerError('คุณไม่มีสิทธิ์แก้ไขนัดนี้ เฉพาะผู้จัดนัดเท่านั้น');
      return;
    }

    let startsAtIso: string | null = null;
    if (isTimingNow) {
      startsAtIso = null;
    } else if (session.startsAt && futureDateTime === initialFutureDateTime) {
      // Unchanged from existing session -> retain exact original timestamp
      startsAtIso = session.startsAt;
    } else {
      startsAtIso = localInputToBangkokIso(futureDateTime);
    }

    const inputPayload: Partial<SessionInput> = {
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

    // Client-side form validation (skips past-date check if startsAt is unchanged)
    const validation = validateSessionInput(inputPayload, isTimingNow, {
      originalStartsAt: session.startsAt,
    });
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    // Capacity Conflict Check:
    // confirmedCount includes host and all confirmed joiners
    const capacityCheck = validateCapacityConflict(teamSize, guestCount, session.confirmedCount);
    if (capacityCheck.hasConflict) {
      setServerError(capacityCheck.message || 'จำนวนคนใหม่ต่ำกว่าสมาชิกปัจจุบันที่มีอยู่ (capacity_conflict)');
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    setServerError(null);

    try {
      const res = await data.updateSession(sessionId, inputPayload);
      if (!res.ok) {
        if (res.code === 'capacity_conflict') {
          setServerError('จำนวนคนใหม่ขัดแย้งกับสมาชิกที่มีอยู่แล้ว กรุณาปรับจำนวนผู้เล่นหรือเพื่อนที่มาด้วย');
        } else {
          setServerError(res.message || 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
        }
      } else {
        navigate(`/sessions/${sessionId}`);
      }
    } catch {
      setServerError('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="sessions-container" style={{ textAlign: 'center', paddingTop: '40px' }}>
        <div style={{ color: '#64748B', fontSize: '0.875rem' }}>กำลังโหลดข้อมูลนัด...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="sessions-container">
        <div className="sessions-alert sessions-alert-danger">ไม่พบนัดที่ต้องการแก้ไข</div>
        <Button variant="secondary" onClick={() => navigate(-1)}>
          ย้อนกลับ
        </Button>
      </div>
    );
  }

  // Permission Guard
  if (session.hostId !== currentUser?.id && !session.actions.canManage) {
    return (
      <div className="sessions-container">
        <div className="sessions-alert sessions-alert-danger">
          ⛔ <strong>ไม่มีสิทธิ์:</strong> เฉพาะผู้จัดนัด (Host) เท่านั้นที่สามารถแก้ไขข้อมูลนัดได้
        </div>
        <Button variant="secondary" onClick={() => navigate(`/sessions/${sessionId}`)}>
          กลับไปยังรายละเอียดนัด
        </Button>
      </div>
    );
  }

  return (
    <div className="sessions-container">
      <div className="sessions-header">
        <button
          type="button"
          className="sessions-back-btn"
          onClick={() => navigate(`/sessions/${sessionId}`)}
          aria-label="ย้อนกลับ"
        >
          ← ยกเลิก
        </button>
        <h2 className="sessions-title">แก้ไขรายละเอียดนัด</h2>
        <div style={{ width: '40px' }} />
      </div>

      {serverError && (
        <div className="sessions-alert sessions-alert-danger" style={{ marginBottom: '16px' }}>
          {serverError}
        </div>
      )}

      {/* Capacity Note */}
      <div className="sessions-alert sessions-alert-info" style={{ marginBottom: '16px' }}>
        ℹ️ ปัจจุบันมีสมาชิกที่ยืนยันแล้ว <strong>{session.confirmedCount} คน</strong> (รวมตัวคุณ)
        {session.guestCount > 0 ? ` + เพื่อน ${session.guestCount} คน` : ''}
      </div>

      <form onSubmit={handleSubmit} className="sessions-form">
        {/* Title */}
        <Input
          label="ชื่อนัดบาส *"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          maxLength={120}
          required
        />

        {/* Court */}
        <div className="form-group">
          <label className="form-label form-label-required">สนามบาสเกตบอล</label>
          <Select
            value={courtId}
            onChange={(e) => setCourtId(e.target.value)}
            error={errors.courtId}
            required
          >
            {courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.address ? `(${c.address})` : ''}
              </option>
            ))}
          </Select>
        </div>

        {/* Timing */}
        <div className="form-group">
          <label className="form-label form-label-required">เวลาที่นัดเล่น</label>
          <div className="segmented-control">
            <button
              type="button"
              className={`segmented-btn ${isTimingNow ? 'active' : ''}`}
              onClick={() => setIsTimingNow(true)}
            >
              ⚡ ตอนนี้
            </button>
            <button
              type="button"
              className={`segmented-btn ${!isTimingNow ? 'active' : ''}`}
              onClick={() => setIsTimingNow(false)}
            >
              📅 กำหนดวันเวลา
            </button>
          </div>

          {!isTimingNow && (
            <div style={{ marginTop: '8px' }}>
              <Input
                data-testid="session-edit-starts-at"
                type="datetime-local"
                value={futureDateTime}
                onChange={(e) => setFutureDateTime(e.target.value)}
                error={errors.startsAt}
                required={!isTimingNow}
              />
            </div>
          )}
        </div>

        {/* Team Size */}
        <div className="form-group">
          <label className="form-label form-label-required">ขนาดทีม (ต่อหนึ่งทีม)</label>
          <div className="segmented-control">
            <button
              type="button"
              className={`segmented-btn ${teamSize === 3 ? 'active' : ''}`}
              onClick={() => setTeamSize(3)}
            >
              3 คน (3v3 Half court)
            </button>
            <button
              type="button"
              className={`segmented-btn ${teamSize === 5 ? 'active' : ''}`}
              onClick={() => setTeamSize(5)}
            >
              5 คน (5v5 Full court)
            </button>
          </div>
        </div>

        {/* Guest Count */}
        <div className="form-group">
          <Input
            type="number"
            label={`เพื่อนที่มาด้วย ไม่รวมคุณ (0 ถึง ${teamSize - 1} คน)`}
            value={guestCount}
            min={0}
            max={teamSize - 1}
            onChange={(e) => setGuestCount(parseInt(e.target.value, 10) || 0)}
            error={errors.guestCount}
            helperText={`สมาชิกที่ยืนยันแล้ว: ${session.confirmedCount} คน + เพื่อนใหม่ ${guestCount} คน = รวม ${session.confirmedCount + guestCount} คน (ต้องไม่เกิน ${teamSize} คน)`}
          />
        </div>

        {/* Skill Level */}
        <div className="form-group">
          <label className="form-label">ระดับการเล่น</label>
          <Select
            value={skillLevel}
            onChange={(e) => setSkillLevel(e.target.value as SkillLevel)}
          >
            <option value="casual">เล่นสนุกๆ / สุขภาพ (Casual)</option>
            <option value="regular">เล่นประจำ / ทั่วไป (Regular)</option>
            <option value="competitive">จริงจัง / แข่งขัน (Competitive)</option>
          </Select>
        </div>

        {/* Welcomes Beginners */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            id="editWelcomesBeginners"
            checked={welcomesBeginners}
            onChange={(e) => setWelcomesBeginners(e.target.checked)}
            style={{ width: '18px', height: '18px', accentColor: '#FF6B00' }}
          />
          <label htmlFor="editWelcomesBeginners" style={{ fontSize: '0.875rem', color: '#1E293B' }}>
            🌱 ยินดีต้อนรับมือใหม่
          </label>
        </div>

        {/* Wanted Positions */}
        <div className="form-group">
          <label className="form-label">ตำแหน่งที่ต้องการเพิ่ม</label>
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
        </div>

        {/* Join Policy */}
        <div className="form-group">
          <label className="form-label form-label-required">นโยบายการเข้าร่วม</label>
          <div className="segmented-control">
            <button
              type="button"
              className={`segmented-btn ${joinPolicy === 'instant' ? 'active' : ''}`}
              onClick={() => setJoinPolicy('instant')}
            >
              ⚡ เข้าได้ทันที
            </button>
            <button
              type="button"
              className={`segmented-btn ${joinPolicy === 'approval' ? 'active' : ''}`}
              onClick={() => setJoinPolicy('approval')}
            >
              ✋ ต้องรออนุมัติ
            </button>
          </div>
        </div>

        {/* Meeting Point */}
        <Input
          data-testid="session-edit-meeting-point"
          label="จุดนัดพบในสนาม"
          value={meetingPoint}
          onChange={(e) => setMeetingPoint(e.target.value)}
          maxLength={500}
        />

        {/* Notes */}
        <Textarea
          label="หมายเหตุเพิ่มเติม"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={2000}
          rows={3}
        />

        <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
          <Button
            type="button"
            variant="secondary"
            fullWidth
            onClick={() => navigate(`/sessions/${sessionId}`)}
            disabled={isSubmitting}
          >
            ยกเลิก
          </Button>
          <Button
            data-testid="session-edit-submit-btn"
            type="submit"
            variant="primary"
            fullWidth
            isLoading={isSubmitting}
            disabled={isSubmitting}
          >
            บันทึกการแก้ไข
          </Button>
        </div>
      </form>
    </div>
  );
};

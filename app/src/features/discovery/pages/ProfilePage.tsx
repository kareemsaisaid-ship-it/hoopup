import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  useAppServices,
  type Position,
  type ProfileInput,
  type SkillLevel,
  type UserProfile,
} from '../../../services';
import { Button, Card, Input, LoadingSpinner, Select, tokens } from '../../../shared';
import { ThemePicker } from '../components/ThemePicker';
import { validateHeight } from '../utils/profileValidation';

const POSITIONS: { value: Position; label: string }[] = [
  { value: 'PG', label: 'PG - Point Guard' },
  { value: 'SG', label: 'SG - Shooting Guard' },
  { value: 'SF', label: 'SF - Small Forward' },
  { value: 'PF', label: 'PF - Power Forward' },
  { value: 'C', label: 'C - Center' },
];

export interface ProfilePageProps {
  userId?: string;
  src?: UserProfile;
}

const viewRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '8px 0',
  borderBottom: `1px solid ${tokens.colors.border}`,
};

// Keyed by the viewed player so opening another player's page starts from a clean loading state.
export const ProfilePage: React.FC<ProfilePageProps> = (props) => {
  const { userId: paramUserId } = useParams();
  const [searchParams] = useSearchParams();
  const viewedId = props.userId || paramUserId || searchParams.get('userId') || 'self';
  return <ProfileView key={viewedId} {...props} />;
};

const ProfileView: React.FC<ProfilePageProps> = ({ userId: propUserId, src: propSrc }) => {
  const { auth, data } = useAppServices();
  const currentUser = auth.getCurrentUser();
  const { userId: paramUserId } = useParams();
  const [searchParams] = useSearchParams();

  const targetUserId = propUserId || paramUserId || searchParams.get('userId') || currentUser?.id;
  const isOwner = Boolean(!propSrc && currentUser && targetUserId === currentUser.id);

  // Another player's page starts in the loading state so the form defaults
  // (casual, plays any position) are never shown as if they were real data.
  const [loading, setLoading] = useState(Boolean(!propSrc && targetUserId && !isOwner));
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Form states
  const [displayName, setDisplayName] = useState('');
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('casual');
  const [primaryPos, setPrimaryPos] = useState<Position | ''>('');
  const [secondaryPos, setSecondaryPos] = useState<Position | ''>('');
  const [playsAny, setPlaysAny] = useState(true);
  const [heightCm, setHeightCm] = useState('');
  const [heightVisible, setHeightVisible] = useState(false);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);

  // Load profile from backend/service
  useEffect(() => {
    let active = true;
    if (propSrc) {
      queueMicrotask(() => {
        if (!active) return;
        setDisplayName(propSrc.displayName || '');
        setSkillLevel(propSrc.skillLevel || 'casual');
        setPrimaryPos(propSrc.primaryPosition || '');
        setSecondaryPos(propSrc.secondaryPosition || '');
        setPlaysAny(propSrc.playsAnyPosition ?? true);
        setHeightCm(propSrc.heightCm ? propSrc.heightCm.toString() : '');
        setHeightVisible(propSrc.heightVisible ?? false);
        setAvatarPath(propSrc.avatarPath || null);
        setLoading(false);
      });
      return () => {
        active = false;
      };
    }

    if (targetUserId) {
      data
        .getProfile(targetUserId)
        .then((profile) => {
          if (!active) return;
          const src = profile || (isOwner ? currentUser : null);
          setNotFound(!src);
          if (src) {
            setDisplayName(src.displayName || '');
            setSkillLevel(src.skillLevel || 'casual');
            setPrimaryPos(src.primaryPosition || '');
            setSecondaryPos(src.secondaryPosition || '');
            setPlaysAny(src.playsAnyPosition ?? true);
            setHeightCm(src.heightCm ? src.heightCm.toString() : '');
            setHeightVisible(src.heightVisible ?? false);
            setAvatarPath(src.avatarPath || null);
          }
          setLoading(false);
        })
        .catch(() => {
          if (!active) return;
          setNotFound(!(isOwner && currentUser));
          if (isOwner && currentUser) {
            setDisplayName(currentUser.displayName || '');
            setSkillLevel(currentUser.skillLevel || 'casual');
            setPrimaryPos(currentUser.primaryPosition || '');
            setSecondaryPos(currentUser.secondaryPosition || '');
            setPlaysAny(currentUser.playsAnyPosition ?? true);
            setHeightCm(currentUser.heightCm ? currentUser.heightCm.toString() : '');
            setHeightVisible(currentUser.heightVisible ?? false);
            setAvatarPath(currentUser.avatarPath || null);
          }
          setLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [propSrc, targetUserId, isOwner, currentUser, data]);

  // Validation: duplicate positions check
  const validatePositions = (primary: string, secondary: string): string | null => {
    if (primary && secondary && primary === secondary) {
      return 'ตำแหน่งหลักและตำแหน่งรองต้องไม่ซ้ำกัน กรุณาเลือกตำแหน่งอื่นหรือเว้นว่างไว้';
    }
    return null;
  };

  const handlePrimaryChange = (val: Position | '') => {
    setPrimaryPos(val);
    setValidationError(validatePositions(val, secondaryPos));
    setSaveSuccess(false);
  };

  const handleSecondaryChange = (val: Position | '') => {
    setSecondaryPos(val);
    setValidationError(validatePositions(primaryPos, val));
    setSaveSuccess(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSaveSuccess(false);

    // 1. Display name validation
    if (!displayName.trim()) {
      setValidationError('กรุณาระบุชื่อที่ใช้แสดง');
      return;
    }

    // 2. Duplicate positions validation
    const posError = validatePositions(primaryPos, secondaryPos);
    if (posError) {
      setValidationError(posError);
      return;
    }

    // 3. Height range validation (100-250 cm, empty allowed)
    const heightError = validateHeight(heightCm);
    if (heightError) {
      setValidationError(heightError);
      return;
    }

    setValidationError(null);
    setSaving(true);

    try {
      // Build full ProfileInput preserving all loaded fields
      const input: ProfileInput = {
        displayName: displayName.trim(),
        avatarPath: avatarPath,
        skillLevel,
        primaryPosition: (primaryPos as Position) || null,
        secondaryPosition: (secondaryPos as Position) || null,
        playsAnyPosition: playsAny,
        heightCm: heightCm ? parseInt(heightCm, 10) : null,
        heightVisible,
      };

      const res = await data.saveProfile(input);
      if (res.ok) {
        setSaveSuccess(true);
      } else {
        setErrorMessage(res.message || 'บันทึกโปรไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      }
    } catch {
      setErrorMessage('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSaving(false);
    }
  };

  const initialLetter =
    displayName.charAt(0) || (isOwner ? currentUser?.displayName.charAt(0) : '') || 'ผ';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        paddingBottom: '24px',
        maxWidth: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Top Header Card matching reference image */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          backgroundColor: '#0F172A',
          color: '#FFFFFF',
          borderRadius: '20px',
          padding: '24px 16px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
          gap: '12px',
        }}
      >
        <div
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            backgroundColor: 'var(--color-primary, #FF6B00)',
            color: 'var(--color-text-on-accent, #FFFFFF)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem',
            fontWeight: 700,
            boxShadow: '0 4px 12px var(--color-primary-glow, rgba(255, 107, 0, 0.4))',
          }}
        >
          {initialLetter}
        </div>

        <div style={{ textAlign: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
            {displayName || 'ผู้เล่นบาสเกตบอล'}
          </h2>
          <span style={{ fontSize: '0.85rem', color: '#94A3B8' }}>
            {targetUserId ? `ID: ${targetUserId.slice(0, 8)}` : '@hooper'}
          </span>
        </div>
      </div>

      {/* Theme Picker Section (Own Profile Only) */}
      {isOwner && <ThemePicker />}

      {loading ? (
        <LoadingSpinner message="กำลังโหลดข้อมูลโปรไฟล์..." />
      ) : !isOwner && notFound ? (
        <Card
          data-testid="profile-not-found"
          style={{ color: tokens.colors.textSecondary, fontSize: '0.875rem', textAlign: 'center' }}
        >
          ไม่พบข้อมูลผู้เล่นคนนี้
        </Card>
      ) : !isOwner ? (
        <Card style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: tokens.colors.textPrimary }}>
              ข้อมูลผู้เล่น
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={viewRowStyle}>
                <span style={{ color: tokens.colors.textSecondary, fontSize: '0.875rem' }}>ระดับการเล่น</span>
                <span style={{ fontWeight: 600, fontSize: '0.875rem', color: tokens.colors.textPrimary }}>
                  {skillLevel === 'casual'
                    ? 'ชิลๆ (Casual)'
                    : skillLevel === 'regular'
                    ? 'ประจำ (Regular)'
                    : 'จริงจัง (Competitive)'}
                </span>
              </div>

              <div style={viewRowStyle}>
                <span style={{ color: tokens.colors.textSecondary, fontSize: '0.875rem' }}>ตำแหน่งหลัก</span>
                <span style={{ fontWeight: 600, fontSize: '0.875rem', color: tokens.colors.textPrimary }}>
                  {primaryPos || 'ไม่ระบุ'}
                </span>
              </div>

              {secondaryPos && (
                <div style={viewRowStyle}>
                  <span style={{ color: tokens.colors.textSecondary, fontSize: '0.875rem' }}>ตำแหน่งรอง</span>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem', color: tokens.colors.textPrimary }}>
                    {secondaryPos}
                  </span>
                </div>
              )}

              {playsAny && (
                <div style={viewRowStyle}>
                  <span style={{ color: tokens.colors.textSecondary, fontSize: '0.875rem' }}>ความยืดหยุ่น</span>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem', color: tokens.colors.textPrimary }}>
                    เล่นตำแหน่งใดก็ได้ตามที่ทีมต้องการ
                  </span>
                </div>
              )}

              {/* Height: ONLY when heightCm is present and non-null. When heightCm is null, show nothing for height */}
              {heightCm ? (
                <div
                  data-testid="profile-height-display"
                  style={viewRowStyle}
                >
                  <span style={{ color: tokens.colors.textSecondary, fontSize: '0.875rem' }}>ส่วนสูง</span>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem', color: tokens.colors.textPrimary }}>
                    {heightCm} ซม.
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </Card>
      ) : (
        <Card style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {saveSuccess && (
            <div
              data-testid="profile-save-success"
              style={{
                padding: '12px 14px',
                backgroundColor: '#ECFDF5',
                border: '1px solid #A7F3D0',
                color: '#065F46',
                borderRadius: '10px',
                fontSize: '0.875rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>✓</span>
              <span>บันทึกข้อมูลโปรไฟล์เรียบร้อยแล้ว</span>
            </div>
          )}

          {validationError && (
            <div
              style={{
                padding: '12px 14px',
                backgroundColor: '#FFFBEB',
                border: '1px solid #FDE68A',
                color: '#92400E',
                borderRadius: '10px',
                fontSize: '0.85rem',
                fontWeight: 500,
              }}
            >
              ⚠️ {validationError}
            </div>
          )}

          {errorMessage && (
            <div
              style={{
                padding: '12px 14px',
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#991B1B',
                borderRadius: '10px',
                fontSize: '0.85rem',
                fontWeight: 500,
              }}
            >
              ⚠️ {errorMessage}
            </div>
          )}

          <form
            onSubmit={handleSave}
            style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
          >
            {/* Display Name */}
            <Input
              data-testid="profile-display-name-input"
              label="ชื่อที่ใช้แสดงในสนาม"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setSaveSuccess(false);
              }}
              required
              maxLength={60}
            />

            {/* Skill Level */}
            <Select
              data-testid="profile-skill-level-select"
              label="ระดับการเล่น"
              value={skillLevel}
              onChange={(e) => {
                setSkillLevel(e.target.value as SkillLevel);
                setSaveSuccess(false);
              }}
            >
              <option value="casual">ชิลๆ (Casual - เล่นเพื่อสุขภาพและความสนุก)</option>
              <option value="regular">ประจำ (Regular - มีเบสิก เล่นประจำสม่ำเสมอ)</option>
              <option value="competitive">จริงจัง (Competitive - สายแข่ง ทักษะสูง)</option>
            </Select>

            {/* Positions Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <Select
                data-testid="profile-primary-position"
                label="ตำแหน่งหลัก"
                value={primaryPos}
                onChange={(e) => handlePrimaryChange(e.target.value as Position | '')}
              >
                <option value="">(ไม่ระบุ)</option>
                {POSITIONS.map((pos) => (
                  <option key={pos.value} value={pos.value}>
                    {pos.label}
                  </option>
                ))}
              </Select>

              <Select
                data-testid="profile-secondary-position"
                label="ตำแหน่งรอง"
                value={secondaryPos}
                onChange={(e) => handleSecondaryChange(e.target.value as Position | '')}
              >
                <option value="">(ไม่มี)</option>
                {POSITIONS.map((pos) => (
                  <option
                    key={pos.value}
                    value={pos.value}
                    disabled={primaryPos === pos.value}
                  >
                    {pos.label} {primaryPos === pos.value ? '(ซ้ำกับหลัก)' : ''}
                  </option>
                ))}
              </Select>
            </div>

            {/* Plays Any Position Checkbox */}
            <label
              htmlFor="profile-plays-any-checkbox"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: '#F8FAFC',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                minHeight: '44px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                id="profile-plays-any-checkbox"
                data-testid="profile-plays-any"
                checked={playsAny}
                onChange={(e) => {
                  setPlaysAny(e.target.checked);
                  setSaveSuccess(false);
                }}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <span
                style={{
                  fontSize: '0.875rem',
                  color: '#334155',
                  fontWeight: 500,
                }}
              >
                ยืดหยุ่น: เล่นตำแหน่งใดก็ได้ตามที่ทีมต้องการ
              </span>
            </label>

            {/* Height input */}
            <Input
              data-testid="profile-height-input"
              label="ส่วนสูง (เซนติเมตร) - ไม่บังคับ"
              type="number"
              min={100}
              max={250}
              placeholder="เช่น 180"
              value={heightCm}
              onChange={(e) => {
                const val = e.target.value;
                setHeightCm(val);
                setSaveSuccess(false);
                const hError = validateHeight(val);
                setValidationError(hError || validatePositions(primaryPos, secondaryPos));
              }}
            />

            {/* Height Visibility Toggle Row (HT2) */}
            <div
              data-testid="profile-height-visible-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#F8FAFC',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                gap: '12px',
                minHeight: '44px',
                boxSizing: 'border-box',
              }}
            >
              <label
                htmlFor="profile-height-visible-switch"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  cursor: 'pointer',
                  flex: 1,
                }}
              >
                <span
                  style={{
                    fontSize: '0.875rem',
                    color: '#334155',
                    fontWeight: 600,
                  }}
                >
                  แสดงส่วนสูงให้ผู้เล่นคนอื่นเห็น
                </span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: '#64748B',
                    lineHeight: 1.4,
                  }}
                >
                  ปิดไว้เป็นค่าเริ่มต้น เฉพาะคุณเท่านั้นที่เห็นส่วนสูงของตัวเอง
                </span>
              </label>

              <input
                type="checkbox"
                role="switch"
                id="profile-height-visible-switch"
                data-testid="profile-height-visible-switch"
                aria-label="แสดงส่วนสูงให้ผู้เล่นคนอื่นเห็น"
                aria-checked={heightVisible}
                checked={heightVisible}
                onChange={(e) => {
                  setHeightVisible(e.target.checked);
                  setSaveSuccess(false);
                }}
                className="height-visible-toggle"
              />
            </div>

            {/* Submit Button */}
            <div style={{ marginTop: '8px' }}>
              <Button
                data-testid="profile-save-btn"
                type="submit"
                fullWidth
                isLoading={saving}
                disabled={saving || !!validationError}
              >
                บันทึกการเปลี่ยนแปลง
              </Button>
            </div>
          </form>

          {/* Item 6 Notice: Features deferred from MVP */}
          <div
            style={{
              marginTop: '16px',
              padding: '12px 14px',
              backgroundColor: '#F1F5F9',
              borderRadius: '10px',
              fontSize: '0.8rem',
              color: '#64748B',
              lineHeight: 1.5,
              border: '1px dashed #CBD5E1',
            }}
          >
            <div style={{ fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
              📌 ฟีเจอร์ที่เลื่อนออกจาก MVP (Post-MVP Roadmap):
            </div>
            • สวิตช์ “ฉันว่าง” และการแจ้งเตือนห้องที่ขาดคนตามรัศมีระยะทาง
            <br />
            • การปักหมุด “สนามประจำ” ลงระบบ
            <br />
            <em>
              (ยังไม่มี contract จัดเก็บบน server จึงปิดการแสดงผลไว้เพื่อความโปร่งใส)
            </em>
          </div>
        </Card>
      )}
    </div>
  );
};

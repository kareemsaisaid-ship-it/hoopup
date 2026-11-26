import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DEMO_USERS } from '../services/mockAdapter';
import { useAppServices } from '../services';
import { Button, Card, Input } from '../shared';
import { tokens } from '../shared/tokens';

function validateEmailFormat(email: string): { valid: boolean; error?: string } {
  const trimmed = email.trim();
  if (!trimmed || trimmed.length > 254) {
    return { valid: false, error: 'กรุณากรอกอีเมลให้ถูกต้อง' };
  }
  const parts = trimmed.split('@');
  if (parts.length !== 2) {
    return { valid: false, error: 'กรุณากรอกอีเมลให้ถูกต้อง' };
  }
  const [local, domain] = parts;
  if (!local || !domain || !domain.includes('.')) {
    return { valid: false, error: 'กรุณากรอกอีเมลให้ถูกต้อง' };
  }
  const dots = domain.split('.');
  if (dots.some((d) => d.length === 0)) {
    return { valid: false, error: 'กรุณากรอกอีเมลให้ถูกต้อง' };
  }
  return { valid: true };
}

function validatePasswordFormat(password: string): { valid: boolean; error?: string } {
  const byteLen = new TextEncoder().encode(password).length;
  if (byteLen < 10) {
    return { valid: false, error: 'รหัสผ่านต้องมีความยาวอย่างน้อย 10 ตัวอักษร' };
  }
  if (byteLen > 72) {
    return { valid: false, error: 'รหัสผ่านต้องมีความยาวไม่เกิน 72 ไบต์' };
  }
  return { valid: true };
}

type AuthMode = 'signin' | 'signup';
type FieldErrors = { displayName?: string; email?: string; password?: string };

const FIELD_IDS = {
  displayName: 'login-display-name',
  email: 'login-email',
  password: 'login-password',
} as const;

const SKILL_LABELS: Record<string, string> = {
  casual: 'ชิลๆ',
  regular: 'เล่นประจำ',
  competitive: 'จริงจัง',
};

// 16px stops iOS Safari from zooming into the field on focus.
const fieldStyle: React.CSSProperties = { fontSize: '1rem' };

const EyeIcon: React.FC<{ off?: boolean }> = ({ off }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    {off && <path d="M3 3l18 18" />}
  </svg>
);

const AlertIcon: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: '1px' }}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4M12 16h.01" />
  </svg>
);

const linkButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: tokens.colors.primary,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 'inherit',
  fontFamily: 'inherit',
  minHeight: '44px',
  padding: '0 8px',
};

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { auth, isConfigured, connectedModeType } = useAppServices();

  const isConnectedApi = connectedModeType === 'connected-api';

  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const destination = (location.state as any)?.from?.pathname || '/';

  const switchMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setError(null);
    setFieldErrors({});
  };

  const clearFieldError = (field: keyof FieldErrors) => {
    if (fieldErrors[field]) setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validateFields = (): FieldErrors => {
    const next: FieldErrors = {};
    const emailCheck = validateEmailFormat(email);
    if (!emailCheck.valid) next.email = emailCheck.error || 'กรุณากรอกอีเมลให้ถูกต้อง';
    const pwCheck = validatePasswordFormat(password);
    if (!pwCheck.valid) next.password = pwCheck.error || 'รหัสผ่านไม่ถูกต้องตามเงื่อนไข';
    if (authMode === 'signup' && displayName.trim().length > 60) {
      next.displayName = 'ชื่อที่ใช้แสดงต้องไม่เกิน 60 ตัวอักษร';
    }
    return next;
  };

  const handleDemoLogin = async (demoUserId: string) => {
    setLoading(true);
    setError(null);
    const res = await auth.signIn({ demoUserId });
    setLoading(false);
    if (res.ok) {
      navigate(destination, { replace: true });
    } else {
      setError(res.error || 'เข้าสู่ระบบไม่สำเร็จ');
    }
  };

  const handleConnectedApiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Client-side validations matching backend constraints, shown next to each field
    const errors = validateFields();
    setFieldErrors(errors);
    const firstInvalid = (['displayName', 'email', 'password'] as const).find((f) => errors[f]);
    if (firstInvalid) {
      document.getElementById(FIELD_IDS[firstInvalid])?.focus();
      return;
    }

    setLoading(true);
    try {
      if (authMode === 'signup') {
        if (typeof auth.signUp === 'function') {
          const res = await auth.signUp({
            email: email.trim(),
            password,
            displayName: displayName.trim() || undefined,
          });
          if (res.ok) {
            navigate(destination, { replace: true });
          } else {
            setError(res.error || 'สมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
          }
        } else {
          setError('ฟังก์ชันสมัครสมาชิกยังไม่พร้อมใช้งานในโหมดนี้');
        }
      } else {
        const res = await auth.signIn({ email: email.trim(), password });
        if (res.ok) {
          navigate(destination, { replace: true });
        } else {
          setError(res.error || 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
        }
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  const handleConnectedSupabaseLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConfigured) {
      setError('ยังไม่ได้ตั้งค่าการเชื่อมต่อ Supabase ใน .env กรุณาเข้าสู่ระบบผ่าน Demo บัญชีทดสอบ');
      return;
    }

    setLoading(true);
    setError(null);
    const res = await auth.signIn({ email, password });
    setLoading(false);
    if (res.ok) {
      navigate(destination, { replace: true });
    } else {
      setError(res.error || 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }
  };

  const passwordToggle = (
    <button
      type="button"
      onClick={() => setShowPassword((v) => !v)}
      aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
      aria-pressed={showPassword}
      aria-controls={FIELD_IDS.password}
      style={{
        width: '44px',
        height: '44px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'none',
        border: 'none',
        borderRadius: tokens.radius.md,
        color: tokens.colors.textSecondary,
        cursor: 'pointer',
      }}
    >
      <EyeIcon off={showPassword} />
    </button>
  );

  const heading = !isConnectedApi
    ? 'เข้าสู่ HoopUp'
    : authMode === 'signup'
      ? 'สร้างบัญชีใหม่'
      : 'ยินดีต้อนรับกลับมา';

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    minHeight: '44px',
    background: active ? tokens.colors.surfaceHover : 'transparent',
    border: 'none',
    borderRadius: tokens.radius.sm,
    color: active ? tokens.colors.textPrimary : tokens.colors.textSecondary,
    fontWeight: active ? 700 : 500,
    fontSize: '0.95rem',
    fontFamily: 'inherit',
    cursor: 'pointer',
    boxShadow: active ? `inset 0 -2px 0 ${tokens.colors.primary}` : 'none',
    transition: 'background-color 0.15s ease, color 0.15s ease',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px 0 8px' }}>
      <div>
        <h1
          style={{
            margin: '0 0 6px 0',
            fontFamily: tokens.typography.displayFontFamily,
            fontSize: '2rem',
            fontWeight: 800,
            lineHeight: 1.15,
            color: tokens.colors.textPrimary,
          }}
        >
          {heading}
        </h1>
        <p style={{ margin: 0, fontSize: '1rem', lineHeight: 1.5, color: tokens.colors.textSecondary }}>
          หาคนเติมทีม นัดเล่นบาสที่สนามใกล้คุณ
        </p>
      </div>

      {error && (
        <div
          data-testid="auth-error-banner"
          role="alert"
          style={{
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-start',
            padding: '12px 14px',
            backgroundColor: tokens.colors.status.errorBg,
            color: '#FCA5A5',
            borderRadius: tokens.radius.md,
            fontSize: '0.875rem',
            lineHeight: 1.5,
            border: '1px solid rgba(239, 68, 68, 0.4)',
          }}
        >
          <AlertIcon />
          <span>{error}</span>
        </div>
      )}

      {isConnectedApi ? (
        <Card style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div
            role="tablist"
            aria-label="เลือกการเข้าใช้งาน"
            style={{
              display: 'flex',
              gap: '4px',
              padding: '4px',
              backgroundColor: tokens.colors.surfaceAlt,
              borderRadius: tokens.radius.md,
              border: `1px solid ${tokens.colors.borderSubtle}`,
            }}
          >
            <button
              type="button"
              role="tab"
              id="auth-tab-signin"
              aria-selected={authMode === 'signin'}
              aria-controls="auth-panel"
              data-testid="auth-tab-signin"
              onClick={() => switchMode('signin')}
              style={tabStyle(authMode === 'signin')}
            >
              เข้าสู่ระบบ
            </button>
            <button
              type="button"
              role="tab"
              id="auth-tab-signup"
              aria-selected={authMode === 'signup'}
              aria-controls="auth-panel"
              data-testid="auth-tab-signup"
              onClick={() => switchMode('signup')}
              style={tabStyle(authMode === 'signup')}
            >
              สมัครสมาชิก
            </button>
          </div>

          <form
            id="auth-panel"
            role="tabpanel"
            aria-labelledby={authMode === 'signup' ? 'auth-tab-signup' : 'auth-tab-signin'}
            onSubmit={handleConnectedApiSubmit}
            noValidate
            style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            {authMode === 'signup' && (
              <Input
                id={FIELD_IDS.displayName}
                label="ชื่อที่ใช้แสดง (ไม่บังคับ)"
                type="text"
                placeholder="เช่น ก้อง มือชู้ต"
                autoComplete="nickname"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  clearFieldError('displayName');
                }}
                maxLength={60}
                error={fieldErrors.displayName}
                helperText="ชื่อนี้จะแสดงให้เพื่อนร่วมทีมเห็น"
                style={fieldStyle}
                data-testid="auth-name-input"
              />
            )}

            <Input
              id={FIELD_IDS.email}
              label="อีเมล"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="name@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearFieldError('email');
              }}
              onBlur={() => {
                if (!email) return;
                const check = validateEmailFormat(email);
                setFieldErrors((prev) => ({ ...prev, email: check.valid ? undefined : check.error }));
              }}
              required
              error={fieldErrors.email}
              style={fieldStyle}
              data-testid="auth-email-input"
            />

            <Input
              id={FIELD_IDS.password}
              label="รหัสผ่าน"
              type={showPassword ? 'text' : 'password'}
              autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
              autoCapitalize="none"
              spellCheck={false}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearFieldError('password');
              }}
              onBlur={() => {
                if (!password || authMode !== 'signup') return;
                const check = validatePasswordFormat(password);
                setFieldErrors((prev) => ({ ...prev, password: check.valid ? undefined : check.error }));
              }}
              required
              error={fieldErrors.password}
              helperText={authMode === 'signup' ? 'อย่างน้อย 10 ตัวอักษร' : undefined}
              endAdornment={passwordToggle}
              style={fieldStyle}
              data-testid="auth-password-input"
            />

            <Button
              type="submit"
              fullWidth
              size="lg"
              isLoading={loading}
              data-testid="auth-submit-btn"
              style={{ marginTop: '4px', fontSize: '1rem' }}
            >
              {authMode === 'signup' ? 'สร้างบัญชี' : 'เข้าสู่ระบบ'}
            </Button>
          </form>

          <div style={{ textAlign: 'center', fontSize: '0.875rem', color: tokens.colors.textSecondary }}>
            {authMode === 'signup' ? 'มีบัญชีแล้ว?' : 'ยังไม่มีบัญชี?'}
            <button
              type="button"
              data-testid="auth-toggle-mode-btn"
              onClick={() => switchMode(authMode === 'signup' ? 'signin' : 'signup')}
              style={linkButtonStyle}
            >
              {authMode === 'signup' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิกใหม่'}
            </button>
          </div>
        </Card>
      ) : (
        /* Demo Mode (default) */
        <>
          <Card style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: tokens.colors.textPrimary }}>
                  ทดลองใช้ด้วยบัญชีตัวอย่าง
                </h2>
                <span
                  style={{
                    backgroundColor: tokens.colors.primaryLight,
                    color: tokens.colors.primary,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: tokens.radius.full,
                  }}
                >
                  Demo
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', lineHeight: 1.5, color: tokens.colors.textSecondary }}>
                เลือกผู้เล่นเพื่อเข้าใช้งานได้ทันที ไม่ต้องสมัคร
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {DEMO_USERS.map((user) => (
                <Button
                  key={user.id}
                  variant="ghost"
                  onClick={() => handleDemoLogin(user.id)}
                  disabled={loading}
                  style={{
                    justifyContent: 'flex-start',
                    gap: '12px',
                    padding: '10px 12px',
                    minHeight: '56px',
                    textAlign: 'left',
                    backgroundColor: tokens.colors.surfaceAlt,
                    border: `1px solid ${tokens.colors.border}`,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: tokens.radius.full,
                      backgroundColor: tokens.colors.primaryLight,
                      color: tokens.colors.primary,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '1rem',
                      flexShrink: 0,
                    }}
                  >
                    {user.displayName.charAt(0)}
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem', color: tokens.colors.textPrimary }}>
                      {user.displayName}
                    </span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 400, color: tokens.colors.textSecondary }}>
                      {user.primaryPosition || 'ทุกตำแหน่ง'} · {SKILL_LABELS[user.skillLevel] || user.skillLevel}
                    </span>
                  </span>
                </Button>
              ))}
            </div>
          </Card>

          {isConfigured ? (
            <Card style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: tokens.colors.textPrimary }}>
                เข้าสู่ระบบด้วยบัญชีจริง
              </h2>
              <form onSubmit={handleConnectedSupabaseLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <Input
                  label="อีเมล"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={fieldStyle}
                />
                <Input
                  id={FIELD_IDS.password}
                  label="รหัสผ่าน"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  endAdornment={passwordToggle}
                  style={fieldStyle}
                />
                <Button type="submit" fullWidth isLoading={loading} style={{ marginTop: '4px', fontSize: '1rem' }}>
                  เข้าสู่ระบบ
                </Button>
              </form>
            </Card>
          ) : (
            <p style={{ margin: 0, fontSize: '0.8rem', lineHeight: 1.5, color: tokens.colors.textMuted, textAlign: 'center' }}>
              การเข้าสู่ระบบด้วยบัญชีจริงยังไม่เปิดใช้ (ยังไม่ได้ตั้งค่า Supabase ใน <code>.env</code>)
            </p>
          )}
        </>
      )}
    </div>
  );
};

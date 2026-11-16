import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DEMO_USERS } from '../services/mockAdapter';
import { useAppServices } from '../services';
import { Button, Card, Input } from '../shared';

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

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { auth, isConfigured, connectedModeType } = useAppServices();

  const isConnectedApi = connectedModeType === 'connected-api';

  // Connected API tab mode: 'signin' | 'signup'
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destination = (location.state as any)?.from?.pathname || '/';

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

    // Client-side validations matching backend constraints
    const emailCheck = validateEmailFormat(email);
    if (!emailCheck.valid) {
      setError(emailCheck.error || 'กรุณากรอกอีเมลให้ถูกต้อง');
      return;
    }

    const pwCheck = validatePasswordFormat(password);
    if (!pwCheck.valid) {
      setError(pwCheck.error || 'รหัสผ่านไม่ถูกต้องตามเงื่อนไข');
      return;
    }

    if (authMode === 'signup' && displayName.trim().length > 60) {
      setError('ชื่อที่ใช้แสดงต้องไม่เกิน 60 ตัวอักษร');
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '16px 0' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '1.75rem', fontWeight: 800, color: '#FF6B00' }}>
          HoopUp 🏀
        </h1>
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748B' }}>
          แพลตฟอร์มรวมพลคนรักบาสเกตบอล ชวนเล่น นัดแข่ง ทันใจ
        </p>
      </div>

      {error && (
        <div
          data-testid="auth-error-banner"
          role="alert"
          style={{
            padding: '12px 16px',
            backgroundColor: '#FEF2F2',
            color: '#B91C1C',
            borderRadius: '10px',
            fontSize: '0.85rem',
            border: '1px solid #FECACA',
          }}
        >
          {error}
        </div>
      )}

      {/* Connected API Mode: Primary Real Email/Password Form */}
      {isConnectedApi ? (
        <Card style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Toggle Sign In / Sign Up */}
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid #E2E8F0',
              paddingBottom: '8px',
              gap: '12px',
            }}
          >
            <button
              type="button"
              data-testid="auth-tab-signin"
              onClick={() => {
                setAuthMode('signin');
                setError(null);
              }}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: authMode === 'signin' ? '2.5px solid #FF6B00' : 'none',
                color: authMode === 'signin' ? '#FF6B00' : '#64748B',
                fontWeight: authMode === 'signin' ? 700 : 500,
                fontSize: '0.95rem',
                padding: '6px 12px',
                cursor: 'pointer',
              }}
            >
              เข้าสู่ระบบ
            </button>
            <button
              type="button"
              data-testid="auth-tab-signup"
              onClick={() => {
                setAuthMode('signup');
                setError(null);
              }}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: authMode === 'signup' ? '2.5px solid #FF6B00' : 'none',
                color: authMode === 'signup' ? '#FF6B00' : '#64748B',
                fontWeight: authMode === 'signup' ? 700 : 500,
                fontSize: '0.95rem',
                padding: '6px 12px',
                cursor: 'pointer',
              }}
            >
              สมัครสมาชิก
            </button>
          </div>

          <form
            onSubmit={handleConnectedApiSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            {authMode === 'signup' && (
              <Input
                label="ชื่อที่ใช้แสดง"
                type="text"
                placeholder="เช่น ก้อง มือชู้ต"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={60}
                data-testid="auth-name-input"
              />
            )}

            <Input
              label="อีเมล"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              data-testid="auth-email-input"
            />

            <Input
              label="รหัสผ่าน"
              type="password"
              placeholder="รหัสผ่านอย่างน้อย 10 ตัวอักษร"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              data-testid="auth-password-input"
            />

            <Button
              type="submit"
              fullWidth
              isLoading={loading}
              data-testid="auth-submit-btn"
              style={{ marginTop: '8px' }}
            >
              {authMode === 'signup' ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}
            </Button>
          </form>

          <div style={{ textAlign: 'center', fontSize: '0.8rem', color: '#64748B' }}>
            {authMode === 'signup' ? (
              <span>
                มีบัญชีแล้วใช่ไหม?{' '}
                <button
                  type="button"
                  data-testid="auth-toggle-mode-btn"
                  onClick={() => {
                    setAuthMode('signin');
                    setError(null);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#FF6B00',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  เข้าสู่ระบบ
                </button>
              </span>
            ) : (
              <span>
                ยังไม่มีบัญชี?{' '}
                <button
                  type="button"
                  data-testid="auth-toggle-mode-btn"
                  onClick={() => {
                    setAuthMode('signup');
                    setError(null);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#FF6B00',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  สมัครสมาชิกใหม่
                </button>
              </span>
            )}
          </div>
        </Card>
      ) : (
        /* Demo Mode (default, looks exactly as before) */
        <>
          {/* Demo Users Card */}
          <Card style={{ display: 'flex', flexDirection: 'column', gap: '14px', border: '1.5px solid #FF6B00' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    backgroundColor: '#FF6B00',
                    color: '#FFFFFF',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}
                >
                  แนะนำ
                </span>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                  เข้าสู่ระบบด้วยบัญชีทดสอบ (Demo Mode)
                </h3>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                คลิกเลือกผู้เล่นจำลองเพื่อทดลองใช้งานหรือทำ E2E testing ได้ทันที:
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {DEMO_USERS.map((user) => (
                <Button
                  key={user.id}
                  variant="outline"
                  onClick={() => handleDemoLogin(user.id)}
                  disabled={loading}
                  style={{ justifyContent: 'space-between', padding: '12px 16px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.2rem' }}>🏀</span>
                    <span style={{ fontWeight: 600 }}>{user.displayName}</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                    {user.primaryPosition || 'Any'} · {user.skillLevel}
                  </span>
                </Button>
              ))}
            </div>
          </Card>

          {/* Live / Connected Supabase Login */}
          <Card style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>
                เข้าสู่ระบบด้วย Supabase จริง (Connected Mode)
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                {isConfigured
                  ? 'เชื่อมต่อกับฐานข้อมูล Supabase แล้ว'
                  : 'ยังไม่ได้ตั้งค่า VITE_SUPABASE_URL ใน .env (Not Configured)'}
              </p>
            </div>

            {!isConfigured ? (
              <div
                style={{
                  padding: '12px',
                  backgroundColor: '#F8FAFC',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  color: '#64748B',
                  lineHeight: 1.5,
                }}
              >
                ⚠️ โหมด Connected ต้องระบุ URL และ Anon Key ใน <code>.env</code> ก่อนใช้งาน หากยังไม่มี environment ให้ใช้ <strong>Demo Mode</strong> ด้านบน
              </div>
            ) : (
              <form onSubmit={handleConnectedSupabaseLogin} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <Input
                  label="อีเมล"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Input
                  label="รหัสผ่าน"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Button type="submit" fullWidth isLoading={loading} style={{ marginTop: '6px' }}>
                  เข้าสู่ระบบ Supabase
                </Button>
              </form>
            )}
          </Card>
        </>
      )}
    </div>
  );
};

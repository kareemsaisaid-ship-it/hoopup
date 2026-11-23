import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppServices } from '../services';
import { mapOidcErrorMessage } from '../services/oidcConfig';
import { Button, Card } from '../shared';
import { tokens } from '../shared/tokens';

export const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const { auth } = useAppServices();

  // 1. Read parameters once and immediately strip from address bar (security)
  const initialParams = useMemo(() => {
    if (typeof window === 'undefined') return { code: null, errorParam: null };
    try {
      const currentUrl = new URL(window.location.href);
      const code = currentUrl.searchParams.get('code');
      const errorParam = currentUrl.searchParams.get('error');

      if (code || errorParam) {
        currentUrl.searchParams.delete('code');
        currentUrl.searchParams.delete('error');
        const cleanUrl =
          currentUrl.pathname +
          (currentUrl.search ? currentUrl.search : '') +
          currentUrl.hash;
        window.history.replaceState(null, '', cleanUrl);
      }

      return { code, errorParam };
    } catch {
      return { code: null, errorParam: null };
    }
  }, []);

  // 2. Initialize error/loading directly from parameters
  const [loading, setLoading] = useState<boolean>(() => {
    return Boolean(!initialParams.errorParam && initialParams.code);
  });

  const [error, setError] = useState<string | null>(() => {
    if (initialParams.errorParam) {
      return mapOidcErrorMessage(initialParams.errorParam);
    }
    if (!initialParams.code) {
      return mapOidcErrorMessage('missing_code');
    }
    return null;
  });

  // StrictMode guard: ensures exchange is triggered only once across dev remounts
  const exchangeStartedRef = useRef(false);

  useEffect(() => {
    const { code, errorParam } = initialParams;
    if (errorParam || !code) {
      return;
    }

    if (exchangeStartedRef.current) {
      return;
    }
    exchangeStartedRef.current = true;

    const performExchange = async () => {
      try {
        if (typeof (auth as any).exchangeOidcCode === 'function') {
          const res = await (auth as any).exchangeOidcCode(code);
          if (res.ok) {
            navigate('/', { replace: true });
          } else {
            setLoading(false);
            setError(res.error || mapOidcErrorMessage(res.errorCode || 'invalid_code'));
          }
        } else {
          setLoading(false);
          setError('ระบบไม่รองรับการยืนยันตัวตน OIDC ในโหมดปัจจุบัน');
        }
      } catch {
        setLoading(false);
        setError(mapOidcErrorMessage('token_endpoint_error'));
      }
    };

    performExchange();
  }, [auth, initialParams, navigate]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
        minHeight: '60vh',
      }}
    >
      <Card
        style={{
          maxWidth: '420px',
          width: '100%',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {loading && (
          <div
            data-testid="auth-callback-loading"
            style={{
              padding: '24px 0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <span
              style={{
                fontSize: '2rem',
                display: 'inline-block',
                animation: 'spin 1s linear infinite',
              }}
            >
              🏀
            </span>
            <p
              style={{
                margin: 0,
                fontSize: '0.95rem',
                color: tokens.colors.textSecondary,
              }}
            >
              กำลังตรวจสอบข้อมูลเข้าสู่ระบบ...
            </p>
          </div>
        )}

        {error && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              padding: '8px 0',
            }}
          >
            <div
              data-testid="auth-callback-error"
              role="alert"
              style={{
                padding: '14px 16px',
                backgroundColor: tokens.colors.status.errorBg,
                color: tokens.colors.status.error,
                borderRadius: tokens.radius.md,
                fontSize: '0.9rem',
                border: `1px solid ${tokens.colors.status.error}`,
                lineHeight: 1.5,
                textAlign: 'left',
              }}
            >
              {error}
            </div>

            <Button
              data-testid="auth-back-to-login"
              fullWidth
              onClick={() => navigate('/login', { replace: true })}
            >
              กลับไปหน้าเข้าสู่ระบบ
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};

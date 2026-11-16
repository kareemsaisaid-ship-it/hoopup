import React from 'react';
import { useLocation } from 'react-router-dom';
import { DemoSwitcher } from './DemoSwitcher';
import { BottomNavBar } from './navigation';
import { tokens } from '../shared/tokens';

export interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#05070B', // Desktop background backdrop
        display: 'flex',
        justifyContent: 'center',
        fontFamily: tokens.typography.fontFamily,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: tokens.layout.maxWidth,
          minHeight: '100vh',
          backgroundColor: tokens.colors.background,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          boxShadow: '0 0 35px rgba(0,0,0,0.8)',
          borderLeft: `1px solid ${tokens.colors.border}`,
          borderRight: `1px solid ${tokens.colors.border}`,
        }}
      >
        {/* App Top Header */}
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 40,
            backgroundColor: tokens.colors.headerBg,
            borderBottom: `1px solid ${tokens.colors.border}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>🏀</span>
              <span
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  color: tokens.colors.primary,
                  letterSpacing: '-0.5px',
                }}
              >
                HoopUp
              </span>
            </div>
          </div>
          {!isLoginPage && <DemoSwitcher />}
        </header>

        {/* Scrollable Main Content */}
        <main
          style={{
            flex: 1,
            padding: '16px',
            paddingBottom: isLoginPage ? '24px' : '84px', // Extra padding for fixed bottom nav
            boxSizing: 'border-box',
          }}
        >
          {children}
        </main>

        {/* Fixed Bottom Navigation */}
        {!isLoginPage && <BottomNavBar />}
      </div>
    </div>
  );
};

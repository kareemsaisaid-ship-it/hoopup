import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { tokens } from '../shared/tokens';


export const BottomNavBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  const navItems = [
    { id: 'nav-feed', label: 'หน้าแรก', path: '/', icon: '🏀' },
    { id: 'nav-courts', label: 'สนาม', path: '/courts', icon: '📍' },
    { id: 'nav-create-session', label: 'สร้างนัด', path: '/sessions/new', icon: '+', highlight: true },
    { id: 'nav-my-sessions', label: 'นัดของฉัน', path: '/my-sessions', icon: '📋' },
    { id: 'nav-profile', label: 'โปรไฟล์', path: '/profile', icon: '👤' },
  ];

  return (
    <nav
      className="bottom-nav"
      style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: tokens.layout.maxWidth,
        height: '64px',
        backgroundColor: tokens.colors.headerBg,
        borderTop: `1px solid ${tokens.colors.border}`,
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        padding: '0 4px',
        zIndex: 50,
        boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.4)',
        boxSizing: 'border-box',
      }}
    >
      {navItems.map((item) => {
        const isActive =
          item.path === '/'
            ? currentPath === '/'
            : currentPath.startsWith(item.path);

        if (item.highlight) {
          return (
            <button
              key={item.id}
              data-testid={item.id}
              aria-label="สร้างนัดใหม่"
              onClick={() => navigate(item.path)}
              className="bottom-nav-create"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '48px',
                height: '48px',
                minWidth: '48px',
                minHeight: '48px',
                borderRadius: '50%',
                backgroundColor: tokens.colors.primary,
                color: 'var(--color-text-on-accent, #FFFFFF)',
                border: `3px solid ${tokens.colors.bg}`,
                boxShadow: tokens.shadow.glow,
                cursor: 'pointer',
                marginTop: '-20px',
                fontSize: '1.5rem',
                fontWeight: 'bold',
                lineHeight: 1,
                flexShrink: 0,
                transition: 'transform 0.15s ease, background-color 0.15s ease',
              }}
              title={item.label}
            >
              <span className="bottom-nav-create-icon">{item.icon}</span>
            </button>
          );
        }

        return (
          <button
            key={item.id}
            data-testid={item.id}
            onClick={() => navigate(item.path)}
            className={`bottom-nav-item ${isActive ? 'active' : ''}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: isActive ? tokens.colors.primary : tokens.colors.textSecondary,
              gap: '2px',
              padding: '6px 10px',
              minWidth: '52px',
              minHeight: '48px',
              userSelect: 'none',
              transition: 'color 0.15s ease',
            }}
          >
            <span className="bottom-nav-icon" style={{ fontSize: '1.25rem', lineHeight: 1 }}>
              {item.icon}
            </span>
            <span
              className="bottom-nav-label"
              style={{
                fontSize: '0.68rem',
                fontWeight: isActive
                  ? tokens.typography.fontWeight.bold
                  : tokens.typography.fontWeight.medium,
              }}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

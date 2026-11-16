import React from 'react';
import { tokens } from '../tokens';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
  interactive?: boolean;
  'data-testid'?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  padding = 'md',
  interactive = false,
  style,
  'data-testid': testId,
  ...props
}) => {
  const getPadding = () => {
    switch (padding) {
      case 'none':
        return 0;
      case 'sm':
        return '12px';
      case 'lg':
        return '24px';
      default:
        return '16px';
    }
  };

  return (
    <div
      data-testid={testId}
      style={{
        backgroundColor: tokens.colors.surface,
        borderRadius: tokens.radius.lg,
        border: `1px solid ${tokens.colors.border}`,
        boxShadow: tokens.shadow.sm,
        padding: getPadding(),
        boxSizing: 'border-box',
        cursor: interactive ? 'pointer' : 'default',
        transition: interactive ? 'transform 0.15s ease, box-shadow 0.15s ease' : undefined,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
};

export interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  'data-testid'?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = '🏀',
  title,
  description,
  action,
  actionLabel,
  onAction,
  'data-testid': testId,
}) => {
  return (
    <div
      data-testid={testId}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '36px 20px',
        textAlign: 'center',
        gap: '12px',
        color: tokens.colors.textSecondary,
      }}
    >
      <div style={{ fontSize: '2.5rem' }}>{icon}</div>
      <h3
        style={{
          margin: 0,
          fontSize: tokens.typography.fontSize.base,
          fontWeight: tokens.typography.fontWeight.semibold,
          color: tokens.colors.textPrimary,
        }}
      >
        {title}
      </h3>
      {description && (
        <p style={{ margin: 0, fontSize: tokens.typography.fontSize.sm, maxWidth: '300px' }}>
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: '8px' }}>{action}</div>}
      {!action && actionLabel && onAction && (
        <div style={{ marginTop: '8px' }}>
          <button
            onClick={onAction}
            style={{
              padding: '8px 16px',
              backgroundColor: tokens.colors.primary,
              color: '#FFFFFF',
              border: 'none',
              borderRadius: tokens.radius.md,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
};

export interface LoadingSpinnerProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message = 'กำลังโหลดข้อมูล...', size = 'md' }) => {
  const s = size === 'sm' ? '20px' : size === 'lg' ? '40px' : '28px';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
        gap: '12px',
        color: tokens.colors.textSecondary,
      }}
    >
      <div
        style={{
          width: s,
          height: s,
          border: `3px solid ${tokens.colors.border}`,
          borderTopColor: tokens.colors.primary,
          borderRadius: '50%',
          animation: 'hoopup-spin 0.8s linear infinite',
        }}
      />
      {message && <span style={{ fontSize: tokens.typography.fontSize.xs }}>{message}</span>}
      <style>{`
        @keyframes hoopup-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  'data-testid'?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  'data-testid': testId,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999,
        backgroundColor: 'rgba(15, 23, 42, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        backdropFilter: 'blur(2px)',
      }}
      onClick={onClose}
    >
      <div
        data-testid={testId}
        style={{
          backgroundColor: tokens.colors.surface,
          borderRadius: tokens.radius.lg,
          maxWidth: '440px',
          width: '100%',
          boxShadow: tokens.shadow.lg,
          boxSizing: 'border-box',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: `1px solid ${tokens.colors.border}`,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: tokens.typography.fontSize.base,
              fontWeight: tokens.typography.fontWeight.bold,
              color: tokens.colors.textPrimary,
            }}
          >
            {title}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.25rem',
              cursor: 'pointer',
              color: tokens.colors.textSecondary,
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: '20px', maxHeight: '70vh', overflowY: 'auto' }}>{children}</div>
        {footer && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px',
              padding: '12px 20px',
              borderTop: `1px solid ${tokens.colors.border}`,
              backgroundColor: tokens.colors.background,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

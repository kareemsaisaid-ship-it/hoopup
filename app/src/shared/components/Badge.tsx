import React from 'react';
import { tokens } from '../tokens';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'status' | 'skill' | 'position' | 'neutral';
  status?: 'open' | 'full' | 'closed' | 'completed' | 'cancelled' | 'pending';
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
  'data-testid'?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  status = 'open',
  size = 'md',
  style,
  'data-testid': testId,
}) => {
  const getColors = () => {
    if (variant === 'status') {
      switch (status) {
        // Solid tint + dark text so the chip reads (>= 4.5:1) on any surface; the translucent
        // token backgrounds measured only 2.2:1 for "open" on the white session card.
        case 'open':
          return { bg: '#D1FAE5', text: '#065F46' };
        case 'full':
          return { bg: '#E2E8F0', text: '#334155' };
        case 'closed':
          return { bg: '#E2E8F0', text: '#334155' };
        case 'completed':
          return { bg: '#DBEAFE', text: '#1E40AF' };
        case 'cancelled':
          return { bg: '#FEE2E2', text: '#991B1B' };
        case 'pending':
          return { bg: '#FEF3C7', text: '#92400E' };
      }
    }

    if (variant === 'skill') {
      return { bg: tokens.colors.primaryLight, text: tokens.colors.primaryDark };
    }

    if (variant === 'position') {
      return { bg: tokens.colors.secondaryLight, text: tokens.colors.secondary };
    }

    return { bg: '#F1F5F9', text: '#475569' };
  };

  const { bg, text } = getColors();

  return (
    <span
      data-testid={testId}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: size === 'sm' ? '2px 6px' : '4px 10px',
        fontSize: size === 'sm' ? '0.7rem' : tokens.typography.fontSize.xs,
        fontWeight: tokens.typography.fontWeight.semibold,
        borderRadius: tokens.radius.full,
        backgroundColor: bg,
        color: text,
        border: `1px solid ${bg === '#F1F5F9' ? '#E2E8F0' : 'transparent'}`,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  );
};

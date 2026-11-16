import React from 'react';
import { tokens } from '../tokens';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  'data-testid'?: string;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  isLoading = false,
  leftIcon,
  rightIcon,
  disabled,
  style,
  'data-testid': testId,
  ...props
}) => {
  const getPadding = () => {
    switch (size) {
      case 'sm':
        return '6px 12px';
      case 'lg':
        return '14px 24px';
      default:
        return '10px 18px';
    }
  };

  const getFontSize = () => {
    switch (size) {
      case 'sm':
        return tokens.typography.fontSize.xs;
      case 'lg':
        return tokens.typography.fontSize.lg;
      default:
        return tokens.typography.fontSize.sm;
    }
  };

  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'secondary':
        return {
          backgroundColor: tokens.colors.secondaryLight,
          color: tokens.colors.secondary,
          border: '1px solid ' + tokens.colors.border,
        };
      case 'outline':
        return {
          backgroundColor: 'transparent',
          color: tokens.colors.primary,
          border: '1.5px solid ' + tokens.colors.primary,
        };
      case 'danger':
        return {
          backgroundColor: tokens.colors.status.cancelled,
          color: tokens.colors.textInverted,
          border: 'none',
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          color: tokens.colors.textSecondary,
          border: 'none',
        };
      default:
        return {
          backgroundColor: tokens.colors.primary,
          color: tokens.colors.textInverted,
          border: 'none',
          boxShadow: tokens.shadow.sm,
        };
    }
  };

  const buttonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: getPadding(),
    fontSize: getFontSize(),
    fontWeight: tokens.typography.fontWeight.semibold,
    fontFamily: tokens.typography.fontFamily,
    borderRadius: tokens.radius.md,
    cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
    opacity: disabled || isLoading ? 0.6 : 1,
    transition: 'all 0.15s ease-in-out',
    width: fullWidth ? '100%' : 'auto',
    minHeight: '44px',
    minWidth: '44px',
    outline: 'none',
    boxSizing: 'border-box',
    userSelect: 'none',
    ...getVariantStyles(),
    ...style,
  };

  return (
    <button
      disabled={disabled || isLoading}
      style={buttonStyle}
      data-testid={testId}
      {...props}
    >
      {isLoading ? (
        <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
      ) : (
        leftIcon
      )}
      {children}
      {!isLoading && rightIcon}
    </button>
  );
};

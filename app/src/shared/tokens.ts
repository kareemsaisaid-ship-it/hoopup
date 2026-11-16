export const tokens = {
  colors: {
    // Brand Primary (Mapped to CSS variables)
    primary: 'var(--color-primary, #FF6B00)',
    primaryHover: 'var(--color-primary-hover, #E05E00)',
    primaryLight: 'var(--color-primary-light, rgba(255, 107, 0, 0.15))',
    primaryGlow: 'var(--color-primary-glow, rgba(255, 107, 0, 0.35))',
    primaryDark: 'var(--color-primary-hover, #C75100)',

    // Dark Theme Surfaces
    bg: '#0B0F19',
    background: '#0B0F19',
    surface: '#151D2A',
    surfaceHover: '#1C2738',
    surfaceAlt: '#0F1622',
    headerBg: '#0F172A',

    // Borders
    border: '#233044',
    borderSubtle: '#192333',
    borderFocus: 'var(--color-border-focus, #FF6B00)',

    // Typography & Contrast
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    textDim: '#475569',
    textInverted: '#0F172A',
    textOnAccent: 'var(--color-text-on-accent, #0F172A)',

    // Secondary / Accent
    secondary: 'var(--color-secondary, #1E293B)',
    secondaryHover: '#0F172A',
    secondaryLight: 'var(--color-secondary-light, #1C2738)',

    // Semantic Statuses
    status: {
      open: '#10B981',
      openBg: 'rgba(16, 185, 129, 0.15)',
      pending: '#F59E0B',
      pendingBg: 'rgba(245, 158, 11, 0.15)',
      error: '#EF4444',
      errorBg: 'rgba(239, 68, 68, 0.15)',
      cancelled: '#EF4444',
      cancelledBg: 'rgba(239, 68, 68, 0.15)',
      completed: '#3B82F6',
      completedBg: 'rgba(59, 130, 246, 0.15)',
      full: '#64748B',
      fullBg: 'rgba(100, 116, 139, 0.15)',
      closed: '#475569',
      closedBg: '#192333',
    },
  },
  typography: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Thai", Helvetica, Arial, sans-serif',
    fontSize: {
      xs: '0.75rem', // 12px
      sm: '0.875rem', // 14px
      base: '1rem', // 16px
      lg: '1.125rem', // 18px
      xl: '1.25rem', // 20px
      '2xl': '1.5rem', // 24px
      '3xl': '1.875rem', // 30px
    },
    fontWeight: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    },
  },
  spacing: {
    space1: '4px',
    space2: '8px',
    space3: '12px',
    space4: '16px',
    space5: '20px',
    space6: '24px',
    space8: '32px',
  },
  radius: {
    xs: '4px',
    sm: '6px',
    md: '10px',
    lg: '16px',
    xl: '20px',
    full: '9999px',
  },
  shadow: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
    md: '0 4px 8px rgba(0, 0, 0, 0.4)',
    lg: '0 10px 20px rgba(0, 0, 0, 0.5)',
    glow: '0 4px 14px var(--color-primary-glow, rgba(255, 107, 0, 0.4))',
  },
  layout: {
    maxWidth: '480px',
    mobileWidth: '360px',
    mobileHeight: '800px',
  },
} as const;

export type DesignTokens = typeof tokens;

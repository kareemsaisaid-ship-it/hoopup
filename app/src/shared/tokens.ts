export const tokens = {
  colors: {
    // Brand Primary (Mapped to CSS variables)
    primary: 'var(--color-primary, #FF5B1F)',
    primaryHover: 'var(--color-primary-hover, #E84A10)',
    primaryLight: 'var(--color-primary-light, rgba(255, 91, 31, 0.15))',
    primaryGlow: 'var(--color-primary-glow, rgba(255, 91, 31, 0.3))',
    primaryDark: 'var(--color-primary-hover, #C23D0C)',

    // Court-night surfaces (warm ink, not slate)
    bg: '#14120F',
    background: '#14120F',
    surface: '#1F1C18',
    surfaceHover: '#28241F',
    surfaceAlt: '#191612',
    headerBg: '#0F0D0B',

    // Borders
    border: '#3A342C',
    borderSubtle: '#2A251F',
    borderFocus: 'var(--color-border-focus, #FF5B1F)',

    // Typography & Contrast (chalk on ink)
    textPrimary: '#F4EFE6',
    textSecondary: '#B3AA9B',
    textMuted: '#8C8477',
    textDim: '#6B645A',
    textInverted: '#14120F',
    textOnAccent: 'var(--color-text-on-accent, #14120F)',

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
      '"Noto Sans Thai", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    displayFontFamily:
      '"Barlow Condensed", "Noto Sans Thai", -apple-system, BlinkMacSystemFont, sans-serif',
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

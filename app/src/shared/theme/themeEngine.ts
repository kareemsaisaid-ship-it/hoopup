/**
 * HoopUp Theme Engine (THEME2)
 * Pure typed module for WCAG 2.1 AA Contrast automation and NBA theme management.
 */

import rawThemesData from '../../data/nbaThemes.json';

export interface RawTheme {
  id: string;
  displayName: string;
  teamName?: string;
  city?: string;
  nickname?: string;
  primary: string;
  secondary: string;
  sourceUrl: string;
}

export interface EvaluatedTheme extends RawTheme {
  rawPrimary: string;
  rawSecondary: string;
  rawCrBg: number;
  effectiveAccent: string;
  accentHover: string;
  accentLight: string;
  accentGlow: string;
  surfaceTint: string;
  secondaryColor: string;
  secondaryLight: string;
  textOnAccent: string;
  finalCrBg: number;
  finalCrText: number;
  isAdjusted: boolean;
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export const THEME_STORAGE_KEY = 'hoopup_theme_v1';
export const DEFAULT_THEME_ID = 'default-hoopup';
export const DARK_BASE_BG = '#0B0F19';

const HEX_REGEX = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Validates and converts hex string to RGB object.
 * Throws Error for invalid hex format.
 */
export function hexToRgb(hex: string): RGB {
  if (typeof hex !== 'string' || !HEX_REGEX.test(hex.trim())) {
    throw new Error(`Invalid hex color: "${hex}"`);
  }
  let cleanHex = hex.trim().replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const num = parseInt(cleanHex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Converts RGB numbers to uppercase 6-digit hex format (#RRGGBB).
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (c: number): string => {
    const v = Math.max(0, Math.min(255, Math.round(c)));
    return v.toString(16).padStart(2, '0').toUpperCase();
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Computes WCAG 2.1 relative luminance for an sRGB color.
 */
export function relativeLuminance(rgb: RGB): number {
  const channels = [rgb.r, rgb.g, rgb.b].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/**
 * Computes WCAG 2.1 contrast ratio between two hex colors: (L1 + 0.05) / (L2 + 0.05).
 * Validates inputs and returns a value between 1.0 and 21.0.
 */
export function contrastRatio(hex1: string, hex2: string): number {
  const lum1 = relativeLuminance(hexToRgb(hex1));
  const lum2 = relativeLuminance(hexToRgb(hex2));
  const lMax = Math.max(lum1, lum2);
  const lMin = Math.min(lum1, lum2);
  return (lMax + 0.05) / (lMin + 0.05);
}

/**
 * Converts RGB values [0-255] to HSL { h: [0-360), s: [0-1], l: [0-1] }.
 */
export function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
  }
  return { h, s, l };
}

/**
 * Converts HSL { h: [0-360), s: [0-1], l: [0-1] } to RGB [0-255].
 */
export function hslToRgb(h: number, s: number, l: number): RGB {
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hue2rgb(p, q, h / 360 + 1 / 3);
  const g = hue2rgb(p, q, h / 360);
  const b = hue2rgb(p, q, h / 360 - 1 / 3);
  return {
    r: r * 255,
    g: g * 255,
    b: b * 255,
  };
}

export type ThemeEvaluation = Omit<EvaluatedTheme, keyof RawTheme>;

/**
 * Evaluates raw primary and secondary colors against the dark background.
 * If contrast ratio is under 4.5:1, lightens the accent to ensure WCAG AA readability.
 * Also chooses readable text on accent (>= 4.5:1).
 */
export function evaluateAndAdjustTheme(
  rawPrimary: string,
  rawSecondary: string,
  darkBg: string = DARK_BASE_BG
): ThemeEvaluation {
  // Validate inputs
  const pRgb = hexToRgb(rawPrimary);
  const sRgb = hexToRgb(rawSecondary);
  hexToRgb(darkBg);

  const rawCrBg = contrastRatio(rawPrimary, darkBg);
  let currentAccent = rawPrimary;
  const hsl = rgbToHsl(pRgb.r, pRgb.g, pRgb.b);
  let isAdjusted = false;

  // Condition 1: Accent on dark surface must be >= 4.5:1
  if (rawCrBg < 4.5) {
    isAdjusted = true;
    if (hsl.s < 0.05) {
      // Pure black / achromatic dark
      hsl.s = 0;
      hsl.l = 0.4;
    }
    while (contrastRatio(currentAccent, darkBg) < 4.5 && hsl.l < 0.96) {
      hsl.l += 0.01;
      const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
      currentAccent = rgbToHex(rgb.r, rgb.g, rgb.b);
    }
  }

  // Condition 2: Text on accent must be >= 4.5:1
  const crWhite = contrastRatio('#FFFFFF', currentAccent);
  const crDark = contrastRatio('#0F172A', currentAccent);
  let bestText = crDark >= crWhite ? '#0F172A' : '#FFFFFF';
  let bestTextCr = Math.max(crDark, crWhite);

  if (bestTextCr < 4.5) {
    isAdjusted = true;
    while (bestTextCr < 4.5 && hsl.l < 0.98) {
      hsl.l += 0.01;
      const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
      currentAccent = rgbToHex(rgb.r, rgb.g, rgb.b);
      bestText = '#0F172A';
      bestTextCr = contrastRatio(bestText, currentAccent);
    }
  }

  const finalCrBg = contrastRatio(currentAccent, darkBg);
  const finalCrText = contrastRatio(bestText, currentAccent);

  const rgbAccent = hexToRgb(currentAccent);
  const hoverHsl = { ...hsl, l: Math.max(0.1, hsl.l - 0.08) };
  const hoverRgb = hslToRgb(hoverHsl.h, hoverHsl.s, hoverHsl.l);
  const accentHover = rgbToHex(hoverRgb.r, hoverRgb.g, hoverRgb.b);

  return {
    rawPrimary,
    rawSecondary,
    rawCrBg: parseFloat(rawCrBg.toFixed(2)),
    effectiveAccent: currentAccent,
    accentHover,
    accentLight: `rgba(${rgbAccent.r}, ${rgbAccent.g}, ${rgbAccent.b}, 0.15)`,
    accentGlow: `rgba(${rgbAccent.r}, ${rgbAccent.g}, ${rgbAccent.b}, 0.35)`,
    surfaceTint: `rgba(${rgbAccent.r}, ${rgbAccent.g}, ${rgbAccent.b}, 0.05)`,
    secondaryColor: rawSecondary,
    secondaryLight: `rgba(${sRgb.r}, ${sRgb.g}, ${sRgb.b}, 0.15)`,
    textOnAccent: bestText,
    finalCrBg: parseFloat(finalCrBg.toFixed(2)),
    finalCrText: parseFloat(finalCrText.toFixed(2)),
    isAdjusted,
  };
}

// In-memory cache of evaluated themes
const evaluatedThemesMap = new Map<string, EvaluatedTheme>();

export function getRawThemes(): RawTheme[] {
  return rawThemesData as RawTheme[];
}

export function getAllThemes(): EvaluatedTheme[] {
  if (evaluatedThemesMap.size === 0) {
    const raw = getRawThemes();
    for (const t of raw) {
      const evaluation = evaluateAndAdjustTheme(t.primary, t.secondary);
      evaluatedThemesMap.set(t.id, {
        ...t,
        ...evaluation,
      });
    }
  }
  return Array.from(evaluatedThemesMap.values());
}

export function getTheme(id: string): EvaluatedTheme {
  const all = getAllThemes();
  const found = evaluatedThemesMap.get(id);
  if (found) return found;
  const fallback = evaluatedThemesMap.get(DEFAULT_THEME_ID) || all[0];
  return fallback;
}

/**
 * Applies theme CSS variables to :root documentElement style.
 */
export function applyThemeToRoot(theme: EvaluatedTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--color-primary', theme.effectiveAccent);
  root.style.setProperty('--color-primary-hover', theme.accentHover);
  root.style.setProperty('--color-primary-light', theme.accentLight);
  root.style.setProperty('--color-primary-glow', theme.accentGlow);
  root.style.setProperty('--color-border-focus', theme.effectiveAccent);
  root.style.setProperty('--color-text-on-accent', theme.textOnAccent);
  root.style.setProperty('--color-surface-tint', theme.surfaceTint);
  root.style.setProperty('--color-secondary', theme.secondaryColor);
  root.style.setProperty('--color-secondary-light', theme.secondaryLight);
}

/**
 * Persists theme ID into localStorage under versioned key hoopup_theme_v1.
 * Wrapped in try/catch to survive privacy mode or restricted environments.
 */
export function saveThemeId(themeId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, themeId);
  } catch (e) {
    console.warn('[ThemeEngine] localStorage write blocked:', e);
  }
}

/**
 * Loads theme ID from localStorage under versioned key hoopup_theme_v1.
 * Wrapped in try/catch, fallback to DEFAULT_THEME_ID.
 */
export function loadSavedThemeId(): string {
  if (typeof window === 'undefined') return DEFAULT_THEME_ID;
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved) return saved;
  } catch (e) {
    console.warn('[ThemeEngine] localStorage read error:', e);
  }
  return DEFAULT_THEME_ID;
}

/**
 * Applies a theme by ID, persists it, and returns the EvaluatedTheme.
 */
export function applyTheme(themeId: string): EvaluatedTheme {
  const theme = getTheme(themeId);
  applyThemeToRoot(theme);
  saveThemeId(theme.id);
  return theme;
}

/**
 * Initializes theme on app startup: loads saved choice and applies tokens to root.
 */
export function initTheme(): EvaluatedTheme {
  const savedId = loadSavedThemeId();
  return applyTheme(savedId);
}

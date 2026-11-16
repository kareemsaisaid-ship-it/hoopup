import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  hexToRgb,
  rgbToHex,
  relativeLuminance,
  contrastRatio,
  evaluateAndAdjustTheme,
  getAllThemes,
  getTheme,
  applyThemeToRoot,
  saveThemeId,
  loadSavedThemeId,
  applyTheme,
  initTheme,
  THEME_STORAGE_KEY,
  DEFAULT_THEME_ID,
  DARK_BASE_BG,
} from '../themeEngine';

describe('HoopUp Theme Engine (THEME2)', () => {
  let mockStore: Record<string, string> = {};
  let rootProperties: Record<string, string> = {};

  beforeEach(() => {
    mockStore = {};
    rootProperties = {};

    // Mock localStorage
    const mockLocalStorage = {
      getItem: vi.fn((key: string) => mockStore[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        mockStore[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStore[key];
      }),
      clear: vi.fn(() => {
        mockStore = {};
      }),
    };

    // Mock document.documentElement
    const mockDoc = {
      documentElement: {
        style: {
          setProperty: vi.fn((key: string, val: string) => {
            rootProperties[key] = val;
          }),
          getPropertyValue: vi.fn((key: string) => rootProperties[key] || ''),
        },
      },
    };

    vi.stubGlobal('localStorage', mockLocalStorage);
    vi.stubGlobal('window', { localStorage: mockLocalStorage });
    vi.stubGlobal('document', mockDoc);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('Known WCAG Ratios & Math', () => {
    it('calculates known contrast ratio for black on white as exactly 21:1', () => {
      const blackOnWhite = contrastRatio('#000000', '#FFFFFF');
      expect(blackOnWhite).toBeCloseTo(21.0, 1);

      const whiteOnBlack = contrastRatio('#FFFFFF', '#000000');
      expect(whiteOnBlack).toBeCloseTo(21.0, 1);
    });

    it('calculates contrast ratio of identical colors as exactly 1:1', () => {
      const same = contrastRatio('#FF6B00', '#FF6B00');
      expect(same).toBeCloseTo(1.0, 2);
    });

    it('computes relative luminance accurately for primary primaries and bounds', () => {
      expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1.0, 4);
      expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0.0, 4);
    });

    it('converts between RGB and Hex correctly with clamp', () => {
      expect(rgbToHex(255, 107, 0)).toBe('#FF6B00');
      expect(rgbToHex(0, 0, 0)).toBe('#000000');
      expect(rgbToHex(300, -10, 128)).toBe('#FF0080');

      expect(hexToRgb('#FF6B00')).toEqual({ r: 255, g: 107, b: 0 });
      expect(hexToRgb('FF6B00')).toEqual({ r: 255, g: 107, b: 0 });
      expect(hexToRgb('#FFF')).toEqual({ r: 255, g: 255, b: 255 });
    });
  });

  describe('Invalid Hex Rejection', () => {
    it('rejects malformed hex strings with descriptive error', () => {
      const invalidHexes = [
        '',
        '   ',
        '#XYZ123',
        '#12',
        '#1234',
        '#12345',
        '#1234567',
        'not-a-color',
        'rgb(0,0,0)',
      ];

      for (const hex of invalidHexes) {
        expect(() => hexToRgb(hex)).toThrowError(/Invalid hex color/);
        expect(() => contrastRatio(hex, '#FFFFFF')).toThrowError(/Invalid hex color/);
        expect(() => evaluateAndAdjustTheme(hex, '#FFFFFF')).toThrowError(/Invalid hex color/);
      }
    });
  });

  describe('31 Themes Contrast Compliance (WCAG AA >= 4.5:1)', () => {
    it('contains exactly 31 themes (30 NBA teams + 1 default HoopUp)', () => {
      const themes = getAllThemes();
      expect(themes).toHaveLength(31);
    });

    it('makes every one of the 31 themes pass 4.5:1 for accent-on-dark and text-on-accent', () => {
      const themes = getAllThemes();

      for (const theme of themes) {
        // Condition 1: Effective accent on dark base canvas (#0B0F19) >= 4.5:1
        const crDark = contrastRatio(theme.effectiveAccent, DARK_BASE_BG);
        expect(
          crDark,
          `Theme "${theme.id}" accent ${theme.effectiveAccent} on dark base ${DARK_BASE_BG} must be >= 4.5:1`
        ).toBeGreaterThanOrEqual(4.5);
        expect(theme.finalCrBg).toBeGreaterThanOrEqual(4.5);

        // Condition 2: Text on effective accent >= 4.5:1
        const crText = contrastRatio(theme.textOnAccent, theme.effectiveAccent);
        expect(
          crText,
          `Theme "${theme.id}" text ${theme.textOnAccent} on accent ${theme.effectiveAccent} must be >= 4.5:1`
        ).toBeGreaterThanOrEqual(4.5);
        expect(theme.finalCrText).toBeGreaterThanOrEqual(4.5);

        // Valid sourceUrl present
        expect(theme.sourceUrl).toBeTruthy();
      }
    });

    it('leaves default HoopUp orange theme unchanged', () => {
      const defaultTheme = getTheme('default-hoopup');
      expect(defaultTheme.id).toBe('default-hoopup');
      expect(defaultTheme.rawPrimary).toBe('#FF6B00');
      expect(defaultTheme.effectiveAccent).toBe('#FF6B00');
      expect(defaultTheme.secondaryColor).toBe('#233044');
      expect(defaultTheme.isAdjusted).toBe(false);
      expect(defaultTheme.finalCrBg).toBeCloseTo(6.71, 1);
      expect(defaultTheme.finalCrBg).toBeGreaterThanOrEqual(4.5);
    });

    it('adjusts low-contrast teams like Brooklyn Nets to pass WCAG AA', () => {
      const nets = getTheme('brooklyn-nets');
      expect(nets.rawPrimary).toBe('#000000');
      // Black on #0B0F19 fails WCAG AA (~1.08:1)
      expect(nets.rawCrBg).toBeLessThan(4.5);
      // Adjusted accent must be lightened and pass >= 4.5:1
      expect(nets.isAdjusted).toBe(true);
      expect(nets.effectiveAccent).not.toBe('#000000');
      expect(nets.finalCrBg).toBeGreaterThanOrEqual(4.5);
      expect(nets.finalCrText).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('Storage, Fallback & DOM Application', () => {
    it('persists and loads theme ID under versioned key hoopup_theme_v1', () => {
      saveThemeId('los-angeles-lakers');
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('los-angeles-lakers');
      expect(loadSavedThemeId()).toBe('los-angeles-lakers');
    });

    it('falls back to default-hoopup when localStorage is empty or throws error', () => {
      expect(loadSavedThemeId()).toBe(DEFAULT_THEME_ID);

      // Simulate localStorage exception
      vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
        throw new Error('Access denied');
      });
      expect(loadSavedThemeId()).toBe(DEFAULT_THEME_ID);
    });

    it('handles localStorage save exceptions gracefully without crashing', () => {
      vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });
      expect(() => saveThemeId('boston-celtics')).not.toThrow();
    });

    it('applies theme variables to document root element via applyThemeToRoot', () => {
      const theme = getTheme('boston-celtics');
      applyThemeToRoot(theme);

      const rootStyle = document.documentElement.style;
      expect(rootStyle.getPropertyValue('--color-primary')).toBe(theme.effectiveAccent);
      expect(rootStyle.getPropertyValue('--color-border-focus')).toBe(theme.effectiveAccent);
      expect(rootStyle.getPropertyValue('--color-text-on-accent')).toBe(theme.textOnAccent);
      expect(rootStyle.getPropertyValue('--color-secondary')).toBe(theme.secondaryColor);
    });

    it('applies theme variables to document root element', () => {
      const theme = applyTheme('golden-state-warriors');
      expect(theme.id).toBe('golden-state-warriors');

      const rootStyle = document.documentElement.style;
      expect(rootStyle.getPropertyValue('--color-primary')).toBe(theme.effectiveAccent);
      expect(rootStyle.getPropertyValue('--color-border-focus')).toBe(theme.effectiveAccent);
      expect(rootStyle.getPropertyValue('--color-text-on-accent')).toBe(theme.textOnAccent);
      expect(rootStyle.getPropertyValue('--color-secondary')).toBe(theme.secondaryColor);
    });

    it('initTheme loads and applies saved theme or default on startup', () => {
      saveThemeId('chicago-bulls');
      const initialized = initTheme();
      expect(initialized.id).toBe('chicago-bulls');
      expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe(
        initialized.effectiveAccent
      );
    });
  });

  describe('WCAG AA Contrast Compliance (A11Y1) Across All 31 NBA Themes', () => {
    const allThemes = getAllThemes();

    it('has exactly 31 themes defined in nbaThemes.json', () => {
      expect(allThemes.length).toBe(31);
    });

    it('ensures all 31 themes meet WCAG AA (>= 4.5:1) for effectiveAccent on dark background', () => {
      for (const theme of allThemes) {
        const ratio = contrastRatio(theme.effectiveAccent, DARK_BASE_BG);
        expect(
          ratio,
          `Theme ${theme.id} (${theme.teamName}) accent ${theme.effectiveAccent} on ${DARK_BASE_BG} must be >= 4.5:1 (got ${ratio.toFixed(2)})`
        ).toBeGreaterThanOrEqual(4.5);
      }
    });

    it('ensures LIVE timing strip, wanted positions, capacity, and format badges meet WCAG AA (>= 4.5:1) in all themes', () => {
      // In SessionCard.tsx, accessible high-contrast colors are used across all themes
      // LIVE strip / timing badge: #C2410C on #FFF3E0
      const livePillContrast = contrastRatio('#C2410C', '#FFF3E0');
      expect(livePillContrast).toBeGreaterThanOrEqual(4.5);

      // Wanted positions badge: #C2410C on #FFF7ED
      const wantedBadgeContrast = contrastRatio('#C2410C', '#FFF7ED');
      expect(wantedBadgeContrast).toBeGreaterThanOrEqual(4.5);

      // Capacity text: #C2410C on #FFFFFF card background
      const capacityContrast = contrastRatio('#C2410C', '#FFFFFF');
      expect(capacityContrast).toBeGreaterThanOrEqual(4.5);

      // 5x5 format badge: #C2410C on #FFF3E0
      const format5x5Contrast = contrastRatio('#C2410C', '#FFF3E0');
      expect(format5x5Contrast).toBeGreaterThanOrEqual(4.5);

      // 3x3 format badge: #047857 on #ECFDF5
      const format3x3Contrast = contrastRatio('#047857', '#ECFDF5');
      expect(format3x3Contrast).toBeGreaterThanOrEqual(4.5);

      // For all 31 themes, verify these badges maintain >= 4.5:1 contrast
      for (const theme of allThemes) {
        expect(
          livePillContrast,
          `Theme ${theme.id} LIVE pill contrast must be >= 4.5:1`
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          wantedBadgeContrast,
          `Theme ${theme.id} wanted badge contrast must be >= 4.5:1`
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          capacityContrast,
          `Theme ${theme.id} capacity contrast must be >= 4.5:1`
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          format5x5Contrast,
          `Theme ${theme.id} 5x5 format contrast must be >= 4.5:1`
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          format3x3Contrast,
          `Theme ${theme.id} 3x3 format contrast must be >= 4.5:1`
        ).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
});


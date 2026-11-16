import React, { useMemo, useState } from 'react';
import {
  applyTheme,
  getAllThemes,
  getTheme,
  loadSavedThemeId,
  type EvaluatedTheme,
} from '../../../shared/theme/themeEngine';

export const ThemePicker: React.FC = () => {
  const [activeThemeId, setActiveThemeId] = useState<string>(() => loadSavedThemeId());
  const [searchQuery, setSearchQuery] = useState('');

  const allThemes = useMemo(() => getAllThemes(), []);

  const activeTheme = useMemo(
    () => getTheme(activeThemeId),
    [activeThemeId]
  );

  const filteredThemes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allThemes;
    return allThemes.filter((t) => {
      return (
        t.displayName.toLowerCase().includes(q) ||
        (t.teamName && t.teamName.toLowerCase().includes(q)) ||
        (t.city && t.city.toLowerCase().includes(q)) ||
        (t.nickname && t.nickname.toLowerCase().includes(q)) ||
        t.id.toLowerCase().includes(q)
      );
    });
  }, [allThemes, searchQuery]);

  const handleSelectTheme = (theme: EvaluatedTheme) => {
    setActiveThemeId(theme.id);
    applyTheme(theme.id);
  };

  return (
    <section
      data-testid="theme-picker"
      style={{
        backgroundColor: 'var(--color-surface, #151D2A)',
        border: '1px solid var(--color-border, #233044)',
        borderRadius: '16px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.3))',
      }}
    >
      {/* Header & Active Theme Info */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h3
            style={{
              margin: '0 0 4px 0',
              fontSize: '1rem',
              fontWeight: 700,
              color: 'var(--color-text-primary, #F8FAFC)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>🎨</span>
            <span>ธีมสี</span>
          </h3>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary, #94A3B8)' }}>
            ชุดสีตกแต่งทีมโปรด ({allThemes.length} ชุดสี)
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'var(--color-surface-alt, #0F1622)',
            border: '1px solid var(--color-border, #233044)',
            padding: '4px 10px',
            borderRadius: '9999px',
          }}
        >
          <span
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: activeTheme.effectiveAccent,
              display: 'inline-block',
              boxShadow: `0 0 6px ${activeTheme.effectiveAccent}`,
            }}
          />
          <span
            data-testid="theme-active-label"
            style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              color: 'var(--color-text-primary, #F8FAFC)',
            }}
          >
            {activeTheme.displayName}
          </span>
        </div>
      </div>

      {/* Search Input */}
      <div style={{ position: 'relative' }}>
        <input
          data-testid="theme-search"
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ค้นหาทีม NBA (เช่น เลเกอร์ส, Lakers, Bulls, Celtics, Nets)..."
          style={{
            width: '100%',
            backgroundColor: 'var(--color-surface-alt, #0F1622)',
            border: '1px solid var(--color-border, #233044)',
            borderRadius: '10px',
            padding: '9px 12px 9px 34px',
            color: 'var(--color-text-primary, #F8FAFC)',
            fontSize: '0.85rem',
            outline: 'none',
            minHeight: '44px',
            boxSizing: 'border-box',
          }}
        />
        <span
          style={{
            position: 'absolute',
            left: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '0.85rem',
            color: 'var(--color-text-muted, #64748B)',
            pointerEvents: 'none',
          }}
        >
          🔍
        </span>
        {searchQuery && (
          <button
            type="button"
            data-testid="theme-search-clear-btn"
            aria-label="ล้างคำค้นหาธีม"
            onClick={() => setSearchQuery('')}
            style={{
              position: 'absolute',
              right: '6px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: 'var(--color-text-muted, #64748B)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              padding: '0',
              minWidth: '44px',
              minHeight: '44px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Chips Grid */}
      <div
        role="radiogroup"
        aria-label="รายการธีมสี NBA"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: '8px',
          maxHeight: '340px',
          overflowY: 'auto',
          paddingRight: '2px',
        }}
      >
        {filteredThemes.map((theme) => {
          const isSelected = theme.id === activeThemeId;
          return (
            <button
              key={theme.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              data-testid={`theme-option-${theme.id}`}
              onClick={() => handleSelectTheme(theme)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                minHeight: '44px',
                boxSizing: 'border-box',
                backgroundColor: isSelected
                  ? 'var(--color-surface-hover, #1C2738)'
                  : 'var(--color-surface-alt, #0F1622)',
                border: isSelected
                  ? `2px solid ${theme.effectiveAccent}`
                  : '1px solid var(--color-border, #233044)',
                borderRadius: '10px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
                boxShadow: isSelected ? `0 0 8px ${theme.accentGlow}` : 'none',
              }}
            >
              {/* Dual Color Swatches */}
              <div
                style={{
                  display: 'flex',
                  width: '24px',
                  height: '24px',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  flexShrink: 0,
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                }}
              >
                <div
                  style={{
                    flex: 1,
                    backgroundColor: theme.primary,
                  }}
                  title={`Primary: ${theme.primary}`}
                />
                <div
                  style={{
                    flex: 1,
                    backgroundColor: theme.secondary,
                  }}
                  title={`Secondary: ${theme.secondary}`}
                />
              </div>

              {/* Text Meta */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: isSelected
                      ? 'var(--color-text-primary, #F8FAFC)'
                      : 'var(--color-text-secondary, #94A3B8)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    lineHeight: 1.2,
                  }}
                  title={theme.displayName}
                >
                  {theme.displayName}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    marginTop: '2px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.65rem',
                      color: 'var(--color-text-muted, #64748B)',
                      fontFamily: 'monospace',
                    }}
                  >
                    {theme.primary}
                  </span>
                  {theme.isAdjusted && (
                    <span
                      style={{
                        fontSize: '0.6rem',
                        color: '#F59E0B',
                        backgroundColor: 'rgba(245, 158, 11, 0.15)',
                        padding: '1px 3px',
                        borderRadius: '3px',
                        lineHeight: 1,
                      }}
                      title="ปรับความสว่างของสีเพื่อให้อ่านง่ายตามเกณฑ์ WCAG 2.1 AA (4.5:1)"
                    >
                      A11y
                    </span>
                  )}
                </div>
              </div>

              {/* Selection indicator */}
              {isSelected && (
                <span
                  style={{
                    color: theme.effectiveAccent,
                    fontSize: '0.85rem',
                    fontWeight: 'bold',
                  }}
                >
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Short Legal Note (Requirement 3: NO logos, NO team images) */}
      <div
        style={{
          fontSize: '0.75rem',
          color: 'var(--color-text-muted, #64748B)',
          lineHeight: 1.4,
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          border: '1px dashed var(--color-border-subtle, #192333)',
          borderRadius: '8px',
          padding: '8px 10px',
        }}
      >
        ℹ️ สีตกแต่งตามทีมที่ชอบ ไม่เกี่ยวข้องกับ/ไม่ได้รับการรับรองจาก NBA หรือทีมใด
      </div>
    </section>
  );
};

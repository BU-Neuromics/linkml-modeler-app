/**
 * DisplayPanel — consolidated visual display controls sidebar (B0).
 *
 * Current contents (migrated from SchemaCanvas overlay toolbar):
 *  - Edge Filters: per-type visibility toggles (range, is_a, mixin, union_of)
 *  - Highlight: hover + selection edge-highlight toggles
 *
 * Placeholder sections reserved for future work:
 *  - B1: Inline range rendering mode
 *  - B2: Edge density / layout controls
 *  - B3: Hop-distance dimming
 *  - A3: Selection operations
 *  - D1: Clustering
 */
import React from 'react';
import { useAppStore } from '../store/index.js';

const EDGE_TOGGLE_DEFS = [
  { type: 'range',    label: 'range',    color: 'var(--color-state-success)' },
  { type: 'is_a',     label: 'is_a',     color: 'var(--color-accent-hover)' },
  { type: 'mixin',    label: 'mixin',    color: 'var(--color-edge-mixin)' },
  { type: 'union_of', label: 'union_of', color: 'var(--color-edge-union)' },
] as const;

export function DisplayPanel() {
  const hiddenEdgeTypes = useAppStore((s) => s.hiddenEdgeTypes);
  const toggleEdgeTypeVisibility = useAppStore((s) => s.toggleEdgeTypeVisibility);
  const highlightOnHover = useAppStore((s) => s.highlightOnHover);
  const highlightOnSelection = useAppStore((s) => s.highlightOnSelection);
  const setHighlightOnHover = useAppStore((s) => s.setHighlightOnHover);
  const setHighlightOnSelection = useAppStore((s) => s.setHighlightOnSelection);

  return (
    <div id="lme-display-panel" style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>Display</span>
      </div>

      {/* Edge Filters */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>Edge Filters</div>
        <div style={styles.sectionBody}>
          {EDGE_TOGGLE_DEFS.map(({ type, label, color }) => {
            const hidden = hiddenEdgeTypes.has(type);
            return (
              <button
                key={type}
                id={`lme-display-toggle-${type}`}
                style={{
                  ...styles.toggleBtn,
                  borderColor: hidden ? 'var(--color-border-default)' : color,
                  color: hidden ? 'var(--color-fg-muted)' : color,
                  opacity: hidden ? 0.5 : 1,
                  textDecoration: hidden ? 'line-through' : 'none',
                }}
                onClick={() => toggleEdgeTypeVisibility(type)}
                title={`${hidden ? 'Show' : 'Hide'} ${label} edges`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Highlight */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>Highlight</div>
        <div style={styles.sectionBody}>
          <button
            id="lme-display-highlight-hover"
            style={{
              ...styles.toggleBtn,
              borderColor: highlightOnHover ? 'var(--color-accent-hover)' : 'var(--color-border-default)',
              color: highlightOnHover ? 'var(--color-accent-hover)' : 'var(--color-fg-muted)',
            }}
            onClick={() => setHighlightOnHover(!highlightOnHover)}
            title={`${highlightOnHover ? 'Disable' : 'Enable'} edge highlight on hover`}
          >
            Hover
          </button>
          <button
            id="lme-display-highlight-selection"
            style={{
              ...styles.toggleBtn,
              borderColor: highlightOnSelection ? 'var(--color-accent-hover)' : 'var(--color-border-default)',
              color: highlightOnSelection ? 'var(--color-accent-hover)' : 'var(--color-fg-muted)',
            }}
            onClick={() => setHighlightOnSelection(!highlightOnSelection)}
            title={`${highlightOnSelection ? 'Disable' : 'Enable'} edge highlight on selection`}
          >
            Selection
          </button>
        </div>
      </div>

      {/* B1: Inline range rendering — placeholder */}
      {/* B2: Edge density controls — placeholder */}
      {/* B3: Hop-distance dimming — placeholder */}
      {/* A3: Selection operations — placeholder */}
      {/* D1: Clustering — placeholder */}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    width: 160,
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-deep)',
    flexShrink: 0,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    borderBottom: '1px solid var(--color-border-subtle)',
    flexShrink: 0,
  },
  headerTitle: {
    fontWeight: 600,
    fontSize: 12,
    color: 'var(--color-fg-muted)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  section: {
    borderBottom: '1px solid var(--color-border-subtle)',
    flexShrink: 0,
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--color-border-strong)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '6px 12px 4px',
  },
  sectionBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '4px 8px 8px',
  },
  toggleBtn: {
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-default)',
    borderRadius: 4,
    padding: '4px 8px',
    fontSize: 11,
    fontFamily: 'var(--font-family-mono)',
    cursor: 'pointer',
    textAlign: 'left' as const,
    width: '100%',
  },
};

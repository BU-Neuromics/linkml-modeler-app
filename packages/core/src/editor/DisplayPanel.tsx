/**
 * DisplayPanel — consolidated visual display controls sidebar (B0).
 *
 * Current contents (migrated from SchemaCanvas overlay toolbar):
 *  - Edge Filters: per-type visibility toggles (range, is_a, mixin, union_of)
 *  - Highlight: hover + selection edge-highlight toggles
 *  - Selection Ops (A3): neighborhood expansion operations
 *
 * Placeholder sections reserved for future work:
 *  - B1: Inline range rendering mode
 *  - B2: Edge density / layout controls
 *  - B3: Hop-distance dimming
 *  - D1: Clustering
 */
import React, { useMemo, useState } from 'react';
import { useAppStore } from '../store/index.js';
import { collectReferencedImportedEntities } from '../io/importResolver.js';
import { usePlatform } from '../platform/PlatformContext.js';
import { buildManifestData, writeEditorManifest } from '../io/editorManifest.js';
import {
  buildAdjacency,
  getAncestors,
  getDescendants,
  getDirectNeighbors,
  getNHopNeighbors,
  getRangeTargets,
  getRangeSources,
  getConnectedComponent,
  invertSelection,
  applyOp,
} from '../canvas/selectionOps.js';

const EDGE_TOGGLE_DEFS = [
  { type: 'range',    label: 'range',    color: 'var(--color-state-success)' },
  { type: 'is_a',     label: 'is_a',     color: 'var(--color-accent-hover)' },
  { type: 'mixin',    label: 'mixin',    color: 'var(--color-edge-mixin)' },
  { type: 'union_of', label: 'union_of', color: 'var(--color-edge-union)' },
] as const;

export function DisplayPanel() {
  const platform = usePlatform();
  const hiddenEdgeTypes = useAppStore((s) => s.hiddenEdgeTypes);
  const toggleEdgeTypeVisibility = useAppStore((s) => s.toggleEdgeTypeVisibility);
  const highlightOnHover = useAppStore((s) => s.highlightOnHover);
  const highlightOnSelection = useAppStore((s) => s.highlightOnSelection);
  const setHighlightOnHover = useAppStore((s) => s.setHighlightOnHover);
  const setHighlightOnSelection = useAppStore((s) => s.setHighlightOnSelection);
  const globalRenderMode = useAppStore((s) => s.globalRenderMode);
  const setGlobalRenderMode = useAppStore((s) => s.setGlobalRenderMode);
  const groupByImportSource = useAppStore((s) => s.groupByImportSource);
  const setGroupByImportSource = useAppStore((s) => s.setGroupByImportSource);
  const updateView = useAppStore((s) => s.updateView);
  const hopDimmingEnabled = useAppStore((s) => s.hopDimmingEnabled);
  const hopDimmingN = useAppStore((s) => s.hopDimmingN);
  const setHopDimmingEnabled = useAppStore((s) => s.setHopDimmingEnabled);
  const setHopDimmingN = useAppStore((s) => s.setHopDimmingN);
  const globalRangeEdgesMode = useAppStore((s) => s.globalRangeEdgesMode);
  const setGlobalRangeEdgesMode = useAppStore((s) => s.setGlobalRangeEdgesMode);

  // A3: Selection state and schema info
  const selectedNodeIds = useAppStore((s) => s.selectedNodeIds);
  const setSelection = useAppStore((s) => s.setSelection);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const activeProject = useAppStore((s) => s.activeProject);
  const activeSchemaFile = useAppStore((s) => s.getActiveSchema());
  const hiddenSchemaIds = useAppStore((s) => s.hiddenSchemaIds);
  const views = useAppStore((s) => s.views);
  const createView = useAppStore((s) => s.createView);
  const setActiveViewId = useAppStore((s) => s.setActiveViewId);
  const activeViewId = useAppStore((s) => s.activeViewId);

  const [nHop, setNHop] = useState(1);

  const tableModeEnabled = useAppStore((s) => s.tableModeEnabled);
  const setTableModeEnabled = useAppStore((s) => s.setTableModeEnabled);

  // Compute effective render mode: active view wins over global default
  const activeView = views.find((v) => v.id === activeViewId) ?? null;
  const rawRenderMode = activeView ? activeView.renderMode : globalRenderMode;
  // Fall back to canvas for unknown/unsupported modes (e.g. 'table' when flag is off)
  const activeRenderMode: 'canvas' | 'outline' | 'table' = (rawRenderMode === 'table' && !tableModeEnabled)
    ? 'canvas'
    : (rawRenderMode as 'canvas' | 'outline' | 'table');

  // B1: Effective range-edges mode — active view override > global setting
  const activeRangeEdgesMode = activeView?.edgeFilters?.rangeEdges ?? globalRangeEdgesMode;

  function setRangeEdgesMode(mode: 'show' | 'inline' | 'auto') {
    if (activeView) {
      updateView(activeView.id, {
        edgeFilters: { ...(activeView.edgeFilters ?? {}), rangeEdges: mode },
      });
    } else {
      setGlobalRangeEdgesMode(mode);
    }
  }

  function setRenderMode(mode: 'canvas' | 'outline' | 'table') {
    if (activeView) {
      updateView(activeView.id, { renderMode: mode });
    } else {
      setGlobalRenderMode(mode);
    }
  }

  // Ghost entity names for node-ID bridging
  const ghostEntityNames = useMemo((): ReadonlySet<string> => {
    if (!activeSchemaFile || !activeProject) return new Set();
    const entities = collectReferencedImportedEntities(activeSchemaFile, activeProject.schemas);
    return new Set(entities.map((e) => e.name));
  }, [activeSchemaFile, activeProject]);

  // Adjacency built from the active schema
  const adj = useMemo(() => {
    if (!activeSchemaFile) return null;
    return buildAdjacency(activeSchemaFile.schema, ghostEntityNames);
  }, [activeSchemaFile, ghostEntityNames]);

  const hasSelection = selectedNodeIds.length > 0;

  function runOp(op: (seeds: Set<string>) => Set<string>, additive = false) {
    if (!adj) return;
    const newIds = applyOp(selectedNodeIds, ghostEntityNames, op, additive);
    setSelection(newIds, []);
  }

  function saveAsView() {
    if (!activeProject || !activeSchemaFile || selectedNodeIds.length === 0) return;
    const schemaClasses = activeSchemaFile.schema.classes ?? {};
    const schemaEnums = activeSchemaFile.schema.enums ?? {};
    const members = selectedNodeIds
      .filter((id) => {
        // Strip ghost__ prefix for lookup; include only entities in the active schema
        const name = id.startsWith('ghost__') ? id.slice(7) : id;
        return name in schemaClasses || name in schemaEnums;
      })
      .map((id) => {
        const name = id.startsWith('ghost__') ? id.slice(7) : id;
        const isEnum = name in schemaEnums;
        return { schemaFilePath: activeSchemaFile.filePath, name, kind: (isEnum ? 'enum' : 'class') as 'class' | 'enum' };
      });
    if (members.length === 0) return;
    const view = createView({ name: `View ${views.length + 1}`, members });
    const nextViews = [...views, view];
    setActiveViewId(view.id);
    if (activeProject.rootPath) {
      const manifest = buildManifestData(activeProject, null, null, hiddenSchemaIds, nextViews, view.id);
      writeEditorManifest(platform, activeProject.rootPath, manifest).catch(() => {});
    }
  }

  return (
    <div id="lme-display-panel" style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.headerTitle}>Display</span>
      </div>

      {/* A2: Rendering mode switcher */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>Rendering</div>
        <div style={styles.sectionBody}>
          <button
            id="lme-display-mode-canvas"
            style={{
              ...styles.toggleBtn,
              borderColor: activeRenderMode === 'canvas' ? 'var(--color-accent-hover)' : 'var(--color-border-default)',
              color: activeRenderMode === 'canvas' ? 'var(--color-accent-hover)' : 'var(--color-fg-muted)',
            }}
            onClick={() => setRenderMode('canvas')}
            title="ERD canvas rendering mode"
          >
            canvas
          </button>
          <button
            id="lme-display-mode-outline"
            style={{
              ...styles.toggleBtn,
              borderColor: activeRenderMode === 'outline' ? 'var(--color-accent-hover)' : 'var(--color-border-default)',
              color: activeRenderMode === 'outline' ? 'var(--color-accent-hover)' : 'var(--color-fg-muted)',
            }}
            onClick={() => setRenderMode('outline')}
            title="Collapsible outline/tree rendering mode"
          >
            outline
          </button>
          {tableModeEnabled && (
            <button
              id="lme-display-mode-table"
              style={{
                ...styles.toggleBtn,
                borderColor: activeRenderMode === 'table' ? 'var(--color-accent-hover)' : 'var(--color-border-default)',
                color: activeRenderMode === 'table' ? 'var(--color-accent-hover)' : 'var(--color-fg-muted)',
              }}
              onClick={() => setRenderMode('table')}
              title="Spreadsheet-style bulk-edit table (C2)"
            >
              table
            </button>
          )}
        </div>
      </div>

      {/* C2: Table mode feature flag toggle (dev tool) */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>Developer</div>
        <div style={styles.sectionBody}>
          <button
            id="lme-display-table-mode-flag"
            style={{
              ...styles.toggleBtn,
              borderColor: tableModeEnabled ? 'var(--color-accent-hover)' : 'var(--color-border-default)',
              color: tableModeEnabled ? 'var(--color-accent-hover)' : 'var(--color-fg-muted)',
            }}
            onClick={() => setTableModeEnabled(!tableModeEnabled)}
            title="Enable the table (spreadsheet) rendering mode (C2 feature flag)"
          >
            {tableModeEnabled ? 'table: on' : 'table: off'}
          </button>
        </div>
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

      {/* A3: Selection neighborhood operations */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>Selection</div>
        <div style={styles.sectionBody}>
          <button
            id="lme-sel-neighbors-both"
            style={{ ...styles.toggleBtn, ...(hasSelection ? {} : styles.disabledBtn) }}
            disabled={!hasSelection || !adj}
            title="Select direct neighbors in both directions (n)"
            onClick={() => runOp((s) => getDirectNeighbors(adj!, s, 'both'))}
          >
            neighbors
          </button>
          <button
            id="lme-sel-neighbors-in"
            style={{ ...styles.toggleBtn, ...(hasSelection ? {} : styles.disabledBtn) }}
            disabled={!hasSelection || !adj}
            title="Select incoming neighbors"
            onClick={() => runOp((s) => getDirectNeighbors(adj!, s, 'in'))}
          >
            ← in
          </button>
          <button
            id="lme-sel-neighbors-out"
            style={{ ...styles.toggleBtn, ...(hasSelection ? {} : styles.disabledBtn) }}
            disabled={!hasSelection || !adj}
            title="Select outgoing neighbors"
            onClick={() => runOp((s) => getDirectNeighbors(adj!, s, 'out'))}
          >
            out →
          </button>
          <button
            id="lme-sel-ancestors"
            style={{ ...styles.toggleBtn, ...(hasSelection ? {} : styles.disabledBtn) }}
            disabled={!hasSelection || !adj}
            title="Select ancestors via is_a + mixin (a)"
            onClick={() => runOp((s) => getAncestors(adj!, s))}
          >
            ancestors
          </button>
          <button
            id="lme-sel-descendants"
            style={{ ...styles.toggleBtn, ...(hasSelection ? {} : styles.disabledBtn) }}
            disabled={!hasSelection || !adj}
            title="Select descendants via is_a + mixin (d)"
            onClick={() => runOp((s) => getDescendants(adj!, s))}
          >
            descendants
          </button>
          <button
            id="lme-sel-component"
            style={{ ...styles.toggleBtn, ...(hasSelection ? {} : styles.disabledBtn) }}
            disabled={!hasSelection || !adj}
            title="Select full connected component"
            onClick={() => runOp((s) => getConnectedComponent(adj!, s))}
          >
            component
          </button>
          <button
            id="lme-sel-range-targets"
            style={{ ...styles.toggleBtn, ...(hasSelection ? {} : styles.disabledBtn) }}
            disabled={!hasSelection || !adj}
            title="Select slot range targets"
            onClick={() => runOp((s) => getRangeTargets(adj!, s))}
          >
            range →
          </button>
          <button
            id="lme-sel-range-sources"
            style={{ ...styles.toggleBtn, ...(hasSelection ? {} : styles.disabledBtn) }}
            disabled={!hasSelection || !adj}
            title="Select classes whose slots reference selection as range"
            onClick={() => runOp((s) => getRangeSources(adj!, s))}
          >
            ← range
          </button>
          {/* N-hop expansion */}
          <div style={styles.nHopRow}>
            <input
              id="lme-sel-nhop-input"
              type="number"
              min={1}
              max={9}
              value={nHop}
              onChange={(e) => setNHop(Math.max(1, Math.min(9, parseInt(e.target.value, 10) || 1)))}
              style={styles.nHopInput}
              title="Number of hops"
              aria-label="N-hop distance"
            />
            <button
              id="lme-sel-nhop"
              style={{ ...styles.toggleBtn, ...(hasSelection ? {} : styles.disabledBtn), flex: 1 }}
              disabled={!hasSelection || !adj}
              title={`Expand ${nHop}-hop neighbors`}
              onClick={() => runOp((s) => getNHopNeighbors(adj!, s, nHop, 'both'))}
            >
              {nHop}-hop
            </button>
          </div>
          {/* Utility operations */}
          <div style={styles.utilRow}>
            <button
              id="lme-sel-invert"
              style={{ ...styles.utilBtn, ...(adj ? {} : styles.disabledBtn) }}
              disabled={!adj}
              title="Invert selection"
              onClick={() => {
                if (!adj) return;
                const inverted = invertSelection(adj, selectedNodeIds.map((id) => id.startsWith('ghost__') ? id.slice(7) : id));
                const allGhostNames = ghostEntityNames;
                const nodeIds = [...inverted].map((name) => allGhostNames.has(name) ? `ghost__${name}` : name);
                setSelection(nodeIds, []);
              }}
            >
              invert
            </button>
            <button
              id="lme-sel-clear"
              style={{ ...styles.utilBtn, ...(hasSelection ? {} : styles.disabledBtn) }}
              disabled={!hasSelection}
              title="Clear selection (Esc)"
              onClick={() => clearSelection()}
            >
              clear
            </button>
          </div>
          <button
            id="lme-sel-save-view"
            style={{ ...styles.toggleBtn, ...(hasSelection ? {} : styles.disabledBtn) }}
            disabled={!hasSelection || !activeSchemaFile}
            title="Save current selection as a new view"
            onClick={saveAsView}
          >
            save as view
          </button>
        </div>
      </div>

      {/* B1: Range edge rendering mode */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>Range Edges</div>
        <div style={styles.sectionBody}>
          {(['show', 'inline', 'auto'] as const).map((mode) => (
            <button
              key={mode}
              id={`lme-display-range-edges-${mode}`}
              style={{
                ...styles.toggleBtn,
                borderColor: activeRangeEdgesMode === mode ? 'var(--color-state-success)' : 'var(--color-border-default)',
                color: activeRangeEdgesMode === mode ? 'var(--color-state-success)' : 'var(--color-fg-muted)',
              }}
              onClick={() => setRangeEdgesMode(mode)}
              title={
                mode === 'show' ? 'Draw range relationships as ERD edges' :
                mode === 'inline' ? 'Show range type as a clickable chip inside the class box' :
                'Auto-choose based on schema density'
              }
            >
              {mode}
            </button>
          ))}
        </div>
        {activeView && activeView.edgeFilters?.rangeEdges && (
          <div style={styles.viewOverrideNote}>view override</div>
        )}
      </div>

      {/* B2: Edge density controls — placeholder */}

      {/* B3: Hop-distance dimming */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>Hop Dimming</div>
        <div style={styles.sectionBody}>
          <button
            id="lme-display-hop-dimming-toggle"
            style={{
              ...styles.toggleBtn,
              borderColor: hopDimmingEnabled ? 'var(--color-accent-hover)' : 'var(--color-border-default)',
              color: hopDimmingEnabled ? 'var(--color-accent-hover)' : 'var(--color-fg-muted)',
            }}
            onClick={() => setHopDimmingEnabled(!hopDimmingEnabled)}
            title={`${hopDimmingEnabled ? 'Disable' : 'Enable'} hop-distance dimming on selection`}
          >
            {hopDimmingEnabled ? 'on' : 'off'}
          </button>
          <div style={styles.nHopRow}>
            <input
              id="lme-display-hop-dimming-n"
              type="number"
              min={1}
              max={9}
              value={hopDimmingN}
              onChange={(e) => setHopDimmingN(parseInt(e.target.value, 10) || 1)}
              style={{ ...styles.nHopInput, opacity: hopDimmingEnabled ? 1 : 0.4 }}
              disabled={!hopDimmingEnabled}
              title="Number of hops to keep visible"
              aria-label="Hop-dimming distance"
            />
            <span
              style={{
                fontSize: 11,
                fontFamily: 'var(--font-family-mono)',
                color: hopDimmingEnabled ? 'var(--color-fg-secondary)' : 'var(--color-fg-muted)',
                flex: 1,
              }}
            >
              hops
            </span>
          </div>
        </div>
      </div>

      {/* D1: Import-source clustering */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>Clustering</div>
        <div style={styles.sectionBody}>
          <button
            id="lme-display-group-by-import-source"
            onClick={() => setGroupByImportSource(!groupByImportSource)}
            style={{
              ...styles.toggleBtn,
              borderColor: groupByImportSource ? 'var(--color-accent-hover)' : 'var(--color-border-default)',
              color: groupByImportSource ? 'var(--color-accent-hover)' : 'var(--color-fg-muted)',
            }}
          >
            by import source
          </button>
        </div>
      </div>
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
  disabledBtn: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  nHopRow: {
    display: 'flex',
    gap: 4,
    alignItems: 'center',
  },
  nHopInput: {
    width: 36,
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-default)',
    borderRadius: 4,
    padding: '4px 4px',
    fontSize: 11,
    fontFamily: 'var(--font-family-mono)',
    color: 'var(--color-fg-default)',
    textAlign: 'center' as const,
    flexShrink: 0,
  },
  utilRow: {
    display: 'flex',
    gap: 4,
  },
  utilBtn: {
    flex: 1,
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-default)',
    borderRadius: 4,
    padding: '4px 4px',
    fontSize: 11,
    fontFamily: 'var(--font-family-mono)',
    cursor: 'pointer',
    textAlign: 'center' as const,
  },
  viewOverrideNote: {
    fontSize: 9,
    color: 'var(--color-fg-muted)',
    fontStyle: 'italic',
    padding: '0 8px 6px',
    textAlign: 'right' as const,
  },
};

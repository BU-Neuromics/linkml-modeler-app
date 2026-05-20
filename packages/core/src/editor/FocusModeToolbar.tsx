/**
 * FocusModeToolbar — ephemeral focus mode controls + "Save as View" shortcut.
 *
 * Provides:
 *  1. Subset-based focus: dropdown of available subsets → dim non-member classes
 *  2. Selection-based focus: "Focus Selection" button → isolate selected nodes
 *  3. "Save as View" — persists current selection as a named View (A1)
 *
 * Placed as an overlay inside SchemaCanvas (or as a standalone toolbar strip).
 */
import React, { useCallback, useMemo } from 'react';
import { useAppStore } from '../store/index.js';
import { usePlatform } from '../platform/PlatformContext.js';
import { buildManifestData, writeEditorManifest } from '../io/editorManifest.js';
import { Hexagon, X } from '../ui/icons/index.js';

export function FocusModeToolbar() {
  const platform = usePlatform();
  const activeSchemaFile = useAppStore((s) => s.getActiveSchema());
  const activeProject = useAppStore((s) => s.activeProject);
  const hiddenSchemaIds = useAppStore((s) => s.hiddenSchemaIds);
  const focusMode = useAppStore((s) => s.focusMode);
  const setFocusMode = useAppStore((s) => s.setFocusMode);
  const selectedNodeIds = useAppStore((s) => s.selectedNodeIds);
  const views = useAppStore((s) => s.views);
  const createView = useAppStore((s) => s.createView);
  const setActiveViewId = useAppStore((s) => s.setActiveViewId);

  // Collect subsets from the active schema
  const subsets = useMemo(() => {
    if (!activeSchemaFile) return [];
    return Object.keys(activeSchemaFile.schema.subsets);
  }, [activeSchemaFile]);

  // Enter subset focus
  const handleSubsetFocus = useCallback(
    (subsetName: string) => {
      if (!subsetName) {
        setFocusMode(null);
        return;
      }
      setFocusMode({ type: 'subset', subsetName });
    },
    [setFocusMode]
  );

  // Enter selection focus — show only the selected nodes, grey out all others
  const handleSelectionFocus = useCallback(() => {
    const ids = useAppStore.getState().selectedNodeIds;
    if (ids.length === 0) return;
    setFocusMode({ type: 'selection', nodeIds: ids });
  }, [setFocusMode]);

  const handleExit = useCallback(() => setFocusMode(null), [setFocusMode]);

  // Save current selection as a persistent named View
  const handleSaveAsView = useCallback(() => {
    if (!activeSchemaFile || !activeProject || selectedNodeIds.length === 0) return;
    const schemaClasses = activeSchemaFile.schema.classes ?? {};
    const schemaEnums = activeSchemaFile.schema.enums ?? {};
    const members = selectedNodeIds
      .filter((name) => name in schemaClasses || name in schemaEnums)
      .map((name) => {
        const isEnum = name in schemaEnums;
        return { schemaFilePath: activeSchemaFile.filePath, name, kind: (isEnum ? 'enum' : 'class') as 'class' | 'enum' };
      });
    if (members.length === 0) return;
    const view = createView({ name: `View ${views.length + 1}`, members });
    setActiveViewId(view.id);
    const nextViews = [...views, view];
    writeEditorManifest(
      platform,
      activeProject.rootPath,
      buildManifestData(activeProject, null, null, hiddenSchemaIds, nextViews, view.id)
    );
  }, [activeSchemaFile, activeProject, hiddenSchemaIds, selectedNodeIds, views, createView, setActiveViewId, platform]);

  if (!activeSchemaFile) return null;

  const activeSubset =
    focusMode?.type === 'subset' ? focusMode.subsetName : '';

  return (
    <div id="lme-focus-toolbar" style={styles.toolbar}>
      {/* Subset focus */}
      {subsets.length > 0 && (
        <div style={styles.group}>
          <span style={styles.groupLabel}>Subset:</span>
          <select
            style={styles.subsetSelect}
            value={activeSubset}
            onChange={(e) => handleSubsetFocus(e.target.value)}
            title="Enter subset focus mode"
          >
            <option value="">(none)</option>
            {subsets.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Selection focus */}
      <button
        style={{
          ...styles.focusBtn,
          ...(selectedNodeIds.length === 0 ? styles.focusBtnDisabled : {}),
          ...(focusMode?.type === 'selection' ? styles.focusBtnActive : {}),
        }}
        onClick={handleSelectionFocus}
        disabled={selectedNodeIds.length === 0}
        title={
          selectedNodeIds.length === 0
            ? 'Select nodes on the canvas first (rubber-band or click)'
            : `Focus ${selectedNodeIds.length} selected node(s)`
        }
      >
        <Hexagon size={13} style={{ marginRight: 4 }} />Focus Selection
        {selectedNodeIds.length > 0 && (
          <span style={styles.selCount}>{selectedNodeIds.length}</span>
        )}
      </button>

      {/* Save as View */}
      <button
        style={{
          ...styles.saveViewBtn,
          ...(selectedNodeIds.length === 0 ? styles.focusBtnDisabled : {}),
        }}
        onClick={handleSaveAsView}
        disabled={selectedNodeIds.length === 0}
        title={
          selectedNodeIds.length === 0
            ? 'Select nodes first to save them as a persistent view'
            : `Save ${selectedNodeIds.length} selected node(s) as a named view`
        }
      >
        + Save View
      </button>

      {/* Exit focus */}
      {focusMode && (
        <button style={styles.exitBtn} onClick={handleExit} title="Exit focus mode">
          <X size={12} style={{ marginRight: 4 }} />Exit Focus
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 8px',
    background: 'var(--color-bg-surface-sunken)',
    borderBottom: '1px solid var(--color-border-subtle)',
    flexShrink: 0,
    flexWrap: 'wrap',
  },
  group: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  groupLabel: {
    fontSize: 10,
    color: 'var(--color-border-strong)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    whiteSpace: 'nowrap',
  },
  subsetSelect: {
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-default)',
    borderRadius: 4,
    color: 'var(--color-fg-primary)',
    fontSize: 11,
    padding: '2px 6px',
    cursor: 'pointer',
    outline: 'none',
  },
  focusBtn: {
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-default)',
    color: 'var(--color-fg-secondary)',
    borderRadius: 4,
    padding: '3px 10px',
    fontSize: 11,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  focusBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  focusBtnActive: {
    background: 'var(--color-state-info-bg)',
    border: '1px solid var(--color-accent-active)',
    color: 'var(--color-state-info-fg)',
  },
  selCount: {
    background: 'var(--color-border-default)',
    borderRadius: 10,
    padding: '0 5px',
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--color-fg-primary)',
  },
  exitBtn: {
    background: 'transparent',
    border: '1px solid var(--color-border-focus)',
    color: 'var(--color-accent-hover)',
    borderRadius: 4,
    padding: '3px 10px',
    fontSize: 11,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  },
  saveViewBtn: {
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-default)',
    color: 'var(--color-fg-secondary)',
    borderRadius: 4,
    padding: '3px 10px',
    fontSize: 11,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
};

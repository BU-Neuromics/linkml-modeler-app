/**
 * ProjectPanel — three-section tree view of the active project.
 *
 * Section 1: Local schema files editable in this project.
 * Section 2: External schemas transitively imported (isReadOnly).
 * Section 3: Saved Views — persistent named view definitions (A1).
 * Section 4: Subsets — LinkML subset definitions with editing UI (A4).
 */
import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store/index.js';
import { usePlatform } from '../platform/PlatformContext.js';
import { buildManifestData, writeEditorManifest } from '../io/editorManifest.js';
import type { ViewDefinition } from '../io/editorManifest.js';
import { EntitySearchPanel } from './EntitySearchPanel.js';
import { Diamond, Hexagon } from '../ui/icons/index.js';

function basename(filePath: string): string {
  // Handle both / and \ separators, and strip trailing slashes
  return filePath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? filePath;
}

function shortSource(sf: { filePath: string; sourceUrl?: string }): string {
  const src = sf.sourceUrl ?? sf.filePath;
  // Shorten URLs: just show host + last path segment
  try {
    const url = new URL(src);
    const last = url.pathname.split('/').filter(Boolean).pop() ?? '';
    return `${url.hostname}/…/${last}`;
  } catch {
    return basename(src);
  }
}

export function ProjectPanel() {
  const platform = usePlatform();
  const activeProject = useAppStore((s) => s.activeProject);
  const activeSchemaId = useAppStore((s) => s.activeSchemaId);
  const setActiveSchema = useAppStore((s) => s.setActiveSchema);
  const clearActiveEntity = useAppStore((s) => s.clearActiveEntity);
  const hiddenSchemaIds = useAppStore((s) => s.hiddenSchemaIds);
  const setSchemaVisible = useAppStore((s) => s.setSchemaVisible);
  const views = useAppStore((s) => s.views);
  const activeViewId = useAppStore((s) => s.activeViewId);
  const setActiveViewId = useAppStore((s) => s.setActiveViewId);
  const createView = useAppStore((s) => s.createView);
  const updateView = useAppStore((s) => s.updateView);
  const deleteView = useAppStore((s) => s.deleteView);
  const duplicateView = useAppStore((s) => s.duplicateView);
  const selectedNodeIds = useAppStore((s) => s.selectedNodeIds);
  const focusMode = useAppStore((s) => s.focusMode);
  const setFocusMode = useAppStore((s) => s.setFocusMode);
  const createSubset = useAppStore((s) => s.createSubset);
  const renameSubset = useAppStore((s) => s.renameSubset);
  const deleteSubset = useAppStore((s) => s.deleteSubset);
  const addEntityToSubset = useAppStore((s) => s.addEntityToSubset);
  const [searchMode, setSearchMode] = useState(false);
  const [importsCollapsed, setImportsCollapsed] = useState(false);
  const [viewsCollapsed, setViewsCollapsed] = useState(false);
  const [subsetsCollapsed, setSubsetsCollapsed] = useState(false);
  const [renamingViewId, setRenamingViewId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renamingSubset, setRenamingSubset] = useState<string | null>(null);
  const [subsetRenameValue, setSubsetRenameValue] = useState('');
  const [newSubsetName, setNewSubsetName] = useState('');
  const [addingSubset, setAddingSubset] = useState(false);

  // Writable active schema — used for subset editing (read-only imports cannot own subsets)
  const writableActiveSchemaFile = useMemo(
    () => activeProject?.schemas.find((s) => s.id === activeSchemaId && !s.isReadOnly),
    [activeProject, activeSchemaId]
  );
  const subsets = useMemo(
    () => writableActiveSchemaFile ? Object.keys(writableActiveSchemaFile.schema.subsets) : [],
    [writableActiveSchemaFile]
  );

  const saveManifestWithViews = (nextViews: ViewDefinition[], nextActiveViewId: string | null) => {
    if (!activeProject?.rootPath) return;
    const manifest = buildManifestData(
      activeProject, null, null, hiddenSchemaIds, nextViews, nextActiveViewId
    );
    writeEditorManifest(platform, activeProject.rootPath, manifest);
  };

  const handleToggleVisibility = (e: React.MouseEvent, schemaId: string) => {
    e.stopPropagation();
    const isCurrentlyHidden = hiddenSchemaIds.has(schemaId);
    setSchemaVisible(schemaId, isCurrentlyHidden);
    if (!activeProject) return;
    const nextHidden = new Set(hiddenSchemaIds);
    if (isCurrentlyHidden) nextHidden.delete(schemaId);
    else nextHidden.add(schemaId);
    const manifest = buildManifestData(activeProject, null, null, nextHidden, views, activeViewId);
    writeEditorManifest(platform, activeProject.rootPath, manifest);
  };

  const handleActivateView = (viewId: string) => {
    const next = activeViewId === viewId ? null : viewId;
    setActiveViewId(next);
    saveManifestWithViews(views, next);
  };

  const handleCreateViewFromSelection = () => {
    if (!activeProject) return;
    const activeSchemaFile = activeProject.schemas.find((s) => s.id === activeSchemaId);
    if (!activeSchemaFile || selectedNodeIds.length === 0) return;
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
    saveManifestWithViews([...views, view], view.id);
    setRenamingViewId(view.id);
    setRenameValue(view.name);
  };

  const handleDeleteView = (e: React.MouseEvent, viewId: string) => {
    e.stopPropagation();
    const nextViews = views.filter((v) => v.id !== viewId);
    const nextActive = activeViewId === viewId ? null : activeViewId;
    deleteView(viewId);
    saveManifestWithViews(nextViews, nextActive);
  };

  const handleDuplicateView = (e: React.MouseEvent, viewId: string) => {
    e.stopPropagation();
    const copy = duplicateView(viewId);
    if (!copy) return;
    const nextViews = [...views, copy];
    saveManifestWithViews(nextViews, activeViewId);
  };

  const handleStartRename = (e: React.MouseEvent, view: ViewDefinition) => {
    e.stopPropagation();
    setRenamingViewId(view.id);
    setRenameValue(view.name);
  };

  const handleCommitRename = (viewId: string) => {
    const name = renameValue.trim();
    if (name) {
      updateView(viewId, { name });
      const nextViews = views.map((v) => (v.id === viewId ? { ...v, name } : v));
      saveManifestWithViews(nextViews, activeViewId);
    }
    setRenamingViewId(null);
  };

  const handleSelectSchema = (schemaId: string) => {
    clearActiveEntity();
    setActiveSchema(schemaId);
  };

  // ── Subset handlers ────────────────────────────────────────────────────────

  const handleActivateSubset = (subsetName: string) => {
    const next = focusMode?.type === 'subset' && focusMode.subsetName === subsetName ? null : { type: 'subset' as const, subsetName };
    setFocusMode(next);
  };

  const handleCreateSubset = () => {
    const name = newSubsetName.trim();
    if (!name || !writableActiveSchemaFile) return;
    createSubset(writableActiveSchemaFile.id, name);
    setNewSubsetName('');
    setAddingSubset(false);
    setRenamingSubset(name);
    setSubsetRenameValue(name);
  };

  const handleCommitSubsetRename = (oldName: string) => {
    const newName = subsetRenameValue.trim();
    if (newName && newName !== oldName && writableActiveSchemaFile) {
      renameSubset(writableActiveSchemaFile.id, oldName, newName);
      if (focusMode?.type === 'subset' && focusMode.subsetName === oldName) {
        setFocusMode({ type: 'subset', subsetName: newName });
      }
    }
    setRenamingSubset(null);
  };

  const handleDeleteSubset = (e: React.MouseEvent, subsetName: string) => {
    e.stopPropagation();
    if (!writableActiveSchemaFile) return;
    deleteSubset(writableActiveSchemaFile.id, subsetName);
    if (focusMode?.type === 'subset' && focusMode.subsetName === subsetName) {
      setFocusMode(null);
    }
  };

  const handlePromoteViewToSubset = (e: React.MouseEvent, viewId: string) => {
    e.stopPropagation();
    const view = views.find((v) => v.id === viewId);
    if (!view || !writableActiveSchemaFile) return;
    // Promote only if all members live in the writable active schema
    const sf = writableActiveSchemaFile;
    const allInSchema = view.members.every((m) => m.schemaFilePath === sf.filePath);
    if (!allInSchema) {
      alert('Cannot promote: view members span multiple schemas. Ensure all members are in the active writable schema first.');
      return;
    }
    // Create the subset and tag each member
    createSubset(sf.id, view.name);
    for (const member of view.members) {
      if (member.kind === 'class' || member.kind === 'enum') {
        addEntityToSubset(sf.id, member.name, view.name, member.kind);
      }
    }
  };

  const handleDemoteSubsetToView = (e: React.MouseEvent, subsetName: string) => {
    e.stopPropagation();
    if (!writableActiveSchemaFile) return;
    const sf = writableActiveSchemaFile;
    const schema = sf.schema;
    // Collect all classes/enums tagged with this subset
    const members: Array<{ schemaFilePath: string; name: string; kind: 'class' | 'enum' }> = [];
    for (const [name, cls] of Object.entries(schema.classes)) {
      if (cls.subsetOf?.includes(subsetName)) {
        members.push({ schemaFilePath: sf.filePath, name, kind: 'class' });
      }
    }
    for (const [name, enm] of Object.entries(schema.enums)) {
      if (enm.subsetOf?.includes(subsetName)) {
        members.push({ schemaFilePath: sf.filePath, name, kind: 'enum' });
      }
    }
    const view = createView({ name: `${subsetName} (view)`, members });
    setActiveViewId(view.id);
    saveManifestWithViews([...views, view], view.id);
  };

  if (!activeProject) {
    return (
      <div id="lme-project-panel" style={styles.panel}>
        <div style={styles.header}>
          <span style={styles.title}>Project</span>
        </div>
        <div style={styles.empty}>No project open</div>
      </div>
    );
  }

  const localSchemas = activeProject.schemas.filter((s) => !s.isReadOnly);
  const importedSchemas = activeProject.schemas.filter((s) => s.isReadOnly);

  return (
    <div id="lme-project-panel" style={styles.panel}>
      {/* Panel header */}
      <div style={styles.header}>
        {searchMode ? (
          <button style={styles.searchToggleBtn} onClick={() => setSearchMode(false)}>
            ← Files
          </button>
        ) : (
          <>
            <span style={{ ...styles.title, flex: 1, display: 'flex', alignItems: 'center', gap: 5 }}><Hexagon size={13} />{activeProject.name}</span>
            <button
              style={styles.searchToggleBtn}
              onClick={() => setSearchMode(true)}
              title="Search entities"
            >
              🔍
            </button>
          </>
        )}
      </div>

      {/* Search mode */}
      {searchMode && <EntitySearchPanel />}

      {/* File list mode */}
      {!searchMode && (
        <>
          {/* ── Local schema files ─────────────────────────────────────────── */}
          <div style={styles.sectionHeader}>
            <span style={styles.sectionLabel}>Project Files</span>
            <span style={styles.sectionCount}>{localSchemas.length}</span>
          </div>

          <div style={styles.fileList}>
            {localSchemas.map((sf) => {
              const isActive = sf.id === activeSchemaId;
              const isHidden = hiddenSchemaIds.has(sf.id);
              const classCount = Object.keys(sf.schema.classes).length;
              const enumCount = Object.keys(sf.schema.enums).length;
              const name = basename(sf.filePath);

              return (
                <div
                  key={sf.id}
                  style={{
                    ...styles.fileRow,
                    ...(isActive ? styles.fileRowActive : {}),
                    ...(isHidden ? styles.fileRowHidden : {}),
                  }}
                  onClick={() => handleSelectSchema(sf.id)}
                  title={sf.filePath}
                >
                  <div style={styles.fileNameRow}>
                    <span style={styles.fileIcon}>◼</span>
                    <span style={styles.fileName}>{name}</span>
                    {sf.isDirty && (
                      <span style={styles.dirtyDot} title="Unsaved changes">●</span>
                    )}
                    <button
                      style={styles.visibilityBtn}
                      onClick={(e) => handleToggleVisibility(e, sf.id)}
                      title={isHidden ? 'Show schema' : 'Hide schema'}
                    >
                      {isHidden ? '○' : '●'}
                    </button>
                  </div>
                  {sf.schema.name && (
                    <div style={styles.schemaNameRow}>
                      <span style={styles.schemaName} title={sf.schema.id}>
                        {sf.schema.name}
                      </span>
                    </div>
                  )}
                  <div style={styles.statsRow}>
                    <span style={{ ...styles.stat, display: 'inline-flex', alignItems: 'center', gap: 3 }} title={`${classCount} class(es)`}><Hexagon size={10} />{classCount}</span>
                    <span style={{ ...styles.stat, display: 'inline-flex', alignItems: 'center', gap: 3 }} title={`${enumCount} enum(s)`}><Diamond size={10} />{enumCount}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Imported schemas ──────────────────────────────────────────── */}
          {importedSchemas.length > 0 && (
            <>
              <button
                type="button"
                style={styles.importsSectionHeader}
                onClick={() => setImportsCollapsed((c) => !c)}
                title={importsCollapsed ? 'Expand imports' : 'Collapse imports'}
              >
                <span style={styles.chevron}>{importsCollapsed ? '▶' : '▼'}</span>
                <span style={styles.sectionLabel}>Imports</span>
                <span style={styles.sectionCount}>{importedSchemas.length}</span>
              </button>

              {!importsCollapsed && (
                <div style={styles.importsList}>
                  {importedSchemas.map((sf) => {
                    const isActive = sf.id === activeSchemaId;
                    const classCount = Object.keys(sf.schema.classes).length;
                    const enumCount = Object.keys(sf.schema.enums).length;
                    const displayName = sf.schema.name || basename(sf.filePath);
                    const source = shortSource(sf);

                    return (
                      <div
                        key={sf.id}
                        style={{
                          ...styles.fileRow,
                          ...styles.importRow,
                          ...(isActive ? styles.importRowActive : {}),
                        }}
                        onClick={() => handleSelectSchema(sf.id)}
                        title={sf.sourceUrl ?? sf.filePath}
                      >
                        <div style={styles.fileNameRow}>
                          <span style={styles.fileIcon}>◻</span>
                          <span style={styles.importName}>{displayName}</span>
                          <span style={styles.readOnlyBadge}>ro</span>
                        </div>
                        <div style={styles.importSourceRow}>
                          <span style={styles.importSource}>{source}</span>
                        </div>
                        <div style={styles.statsRow}>
                          <span style={{ ...styles.stat, display: 'inline-flex', alignItems: 'center', gap: 3 }} title={`${classCount} class(es)`}><Hexagon size={10} />{classCount}</span>
                          <span style={{ ...styles.stat, display: 'inline-flex', alignItems: 'center', gap: 3 }} title={`${enumCount} enum(s)`}><Diamond size={10} />{enumCount}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Views section ────────────────────────────────────────────────────── */}
      {!searchMode && (
        <>
          <button
            id="lme-views-section"
            type="button"
            style={styles.importsSectionHeader}
            onClick={() => setViewsCollapsed((c) => !c)}
            title={viewsCollapsed ? 'Expand views' : 'Collapse views'}
          >
            <span style={styles.chevron}>{viewsCollapsed ? '▶' : '▼'}</span>
            <span style={styles.sectionLabel}>Views</span>
            <span style={styles.sectionCount}>{views.length}</span>
            <button
              type="button"
              style={styles.addViewBtn}
              onClick={(e) => { e.stopPropagation(); handleCreateViewFromSelection(); }}
              title={
                selectedNodeIds.length === 0
                  ? 'Select nodes on the canvas first, then click to save as a view'
                  : `Save ${selectedNodeIds.length} selected node(s) as a view`
              }
              disabled={!activeProject || selectedNodeIds.length === 0}
            >
              +
            </button>
          </button>

          {!viewsCollapsed && (
            <div style={styles.viewsList}>
              {views.length === 0 ? (
                <div style={styles.viewsEmpty}>
                  Select nodes and click + to save a view
                </div>
              ) : (
                views.map((view) => {
                  const isActive = view.id === activeViewId;
                  return (
                    <div
                      key={view.id}
                      style={{
                        ...styles.viewRow,
                        ...(isActive ? styles.viewRowActive : {}),
                      }}
                      onClick={() => handleActivateView(view.id)}
                      title={view.description ?? view.name}
                    >
                      {renamingViewId === view.id ? (
                        <input
                          style={styles.viewRenameInput}
                          value={renameValue}
                          autoFocus
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => handleCommitRename(view.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCommitRename(view.id);
                            if (e.key === 'Escape') setRenamingViewId(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span style={styles.viewName}>{view.name}</span>
                      )}
                      <span style={styles.viewMemberCount}>{view.members.length}</span>
                      <div style={styles.viewActions}>
                        <button
                          type="button"
                          style={styles.viewActionBtn}
                          title="Rename view"
                          onClick={(e) => handleStartRename(e, view)}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          style={styles.viewActionBtn}
                          title="Duplicate view"
                          onClick={(e) => handleDuplicateView(e, view.id)}
                        >
                          ⧉
                        </button>
                        <button
                          type="button"
                          style={styles.viewActionBtn}
                          title="Promote to LinkML subset"
                          onClick={(e) => handlePromoteViewToSubset(e, view.id)}
                          disabled={!writableActiveSchemaFile}
                        >
                          ⬆
                        </button>
                        <button
                          type="button"
                          style={{ ...styles.viewActionBtn, ...styles.viewDeleteBtn }}
                          title="Delete view"
                          onClick={(e) => handleDeleteView(e, view.id)}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </>
      )}

      {/* ── Subsets section (A4) ─────────────────────────────────────────────── */}
      {!searchMode && (
        <>
          <button
            id="lme-subsets-section"
            type="button"
            style={styles.importsSectionHeader}
            onClick={() => setSubsetsCollapsed((c) => !c)}
            title={subsetsCollapsed ? 'Expand subsets' : 'Collapse subsets'}
          >
            <span style={styles.chevron}>{subsetsCollapsed ? '▶' : '▼'}</span>
            <span style={styles.sectionLabel}>Subsets</span>
            <span style={styles.sectionCount}>{subsets.length}</span>
            {writableActiveSchemaFile && (
              <button
                type="button"
                style={styles.addViewBtn}
                onClick={(e) => { e.stopPropagation(); setAddingSubset(true); setNewSubsetName(''); }}
                title="Create a new LinkML subset"
              >
                +
              </button>
            )}
          </button>

          {!subsetsCollapsed && (
            <div style={styles.viewsList}>
              {addingSubset && (
                <div style={styles.viewRow}>
                  <input
                    style={styles.viewRenameInput}
                    value={newSubsetName}
                    autoFocus
                    placeholder="subset name…"
                    onChange={(e) => setNewSubsetName(e.target.value)}
                    onBlur={() => { if (!newSubsetName.trim()) setAddingSubset(false); else handleCreateSubset(); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateSubset();
                      if (e.key === 'Escape') { setAddingSubset(false); }
                    }}
                  />
                </div>
              )}
              {subsets.length === 0 && !addingSubset ? (
                <div style={styles.viewsEmpty}>
                  {writableActiveSchemaFile
                    ? 'No subsets — click + to create one'
                    : 'Open a writable schema to edit subsets'}
                </div>
              ) : (
                subsets.map((subsetName) => {
                  const isActive = focusMode?.type === 'subset' && focusMode.subsetName === subsetName;
                  return (
                    <div
                      key={subsetName}
                      style={{
                        ...styles.viewRow,
                        ...(isActive ? styles.subsetRowActive : {}),
                      }}
                      onClick={() => handleActivateSubset(subsetName)}
                      title={`LinkML subset: ${subsetName}`}
                    >
                      {renamingSubset === subsetName ? (
                        <input
                          style={styles.viewRenameInput}
                          value={subsetRenameValue}
                          autoFocus
                          onChange={(e) => setSubsetRenameValue(e.target.value)}
                          onBlur={() => handleCommitSubsetRename(subsetName)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCommitSubsetRename(subsetName);
                            if (e.key === 'Escape') setRenamingSubset(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <>
                          <span style={styles.subsetIcon}>⊂</span>
                          <span style={styles.viewName}>{subsetName}</span>
                        </>
                      )}
                      {writableActiveSchemaFile && renamingSubset !== subsetName && (
                        <div style={styles.viewActions}>
                          <button
                            type="button"
                            style={styles.viewActionBtn}
                            title="Rename subset"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenamingSubset(subsetName);
                              setSubsetRenameValue(subsetName);
                            }}
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            style={styles.viewActionBtn}
                            title="Demote to view (copy members into a new editor view)"
                            onClick={(e) => handleDemoteSubsetToView(e, subsetName)}
                          >
                            ⬇
                          </button>
                          <button
                            type="button"
                            style={{ ...styles.viewActionBtn, ...styles.viewDeleteBtn }}
                            title="Delete subset"
                            onClick={(e) => handleDeleteSubset(e, subsetName)}
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </>
      )}

      {/* Footer */}
      {!searchMode && (
        <div style={styles.footer}>
          <span style={styles.footerText}>
            {localSchemas.length} file{localSchemas.length !== 1 ? 's' : ''}
            {importedSchemas.length > 0 && ` · ${importedSchemas.length} imported`}
            {views.length > 0 && ` · ${views.length} view${views.length !== 1 ? 's' : ''}`}
            {subsets.length > 0 && ` · ${subsets.length} subset${subsets.length !== 1 ? 's' : ''}`}
          </span>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    display: 'flex',
    flexDirection: 'column',
    width: 220,
    minWidth: 180,
    borderRight: '1px solid var(--color-border-subtle)',
    background: 'var(--color-bg-deep)',
    flexShrink: 0,
    overflow: 'hidden',
  },
  header: {
    padding: '8px 10px',
    borderBottom: '1px solid var(--color-border-subtle)',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
  },
  title: {
    fontWeight: 700,
    fontSize: 11,
    color: 'var(--color-accent-hover)',
    letterSpacing: 0.3,
    textTransform: 'uppercase' as const,
    flex: 1,
  },
  empty: {
    padding: 12,
    fontSize: 12,
    color: 'var(--color-border-strong)',
    fontStyle: 'italic',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderBottom: '1px solid var(--color-bg-surface-sunken)',
    flexShrink: 0,
  },
  importsSectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderTop: '1px solid var(--color-border-subtle)',
    borderBottom: '1px solid var(--color-bg-surface-sunken)',
    borderLeft: 'none',
    borderRight: 'none',
    flexShrink: 0,
    cursor: 'pointer',
    userSelect: 'none' as const,
    background: 'none',
    width: '100%',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    color: 'inherit',
    textAlign: 'left' as const,
  },
  chevron: {
    fontSize: 8,
    color: 'var(--color-border-strong)',
    flexShrink: 0,
  },
  sectionLabel: {
    fontSize: 9,
    color: 'var(--color-border-strong)',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    flex: 1,
  },
  sectionCount: {
    fontSize: 9,
    color: 'var(--color-border-default)',
    background: 'var(--color-bg-surface-sunken)',
    borderRadius: 8,
    padding: '0 5px',
  },
  fileList: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '4px 0',
    minHeight: 0,
  },
  importsList: {
    overflowY: 'auto' as const,
    padding: '4px 0',
    maxHeight: 220,
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  fileRow: {
    padding: '6px 10px',
    cursor: 'pointer',
    borderBottom: '1px solid var(--color-bg-surface-sunken)',
    userSelect: 'none' as const,
  },
  fileRowActive: {
    background: 'var(--color-bg-surface)',
    borderLeft: '2px solid var(--color-accent-hover)',
    paddingLeft: 8,
  },
  fileRowHidden: {
    opacity: 0.35,
  },
  importRow: {
    opacity: 0.85,
  },
  importRowActive: {
    background: 'var(--color-bg-surface-sunken)',
    borderLeft: '2px solid var(--color-fg-secondary)',
    paddingLeft: 8,
  },
  visibilityBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-border-default)',
    cursor: 'pointer',
    padding: '0 2px',
    fontSize: 8,
    lineHeight: 1,
    flexShrink: 0,
    marginLeft: 'auto',
  },
  fileNameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    marginBottom: 3,
  },
  fileIcon: {
    fontSize: 10,
    color: 'var(--color-border-strong)',
    flexShrink: 0,
  },
  fileName: {
    fontSize: 12,
    fontFamily: 'var(--font-family-mono)',
    color: 'var(--color-fg-primary)',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    fontWeight: 600,
  },
  importName: {
    fontSize: 12,
    fontFamily: 'var(--font-family-mono)',
    color: 'var(--color-fg-secondary)',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    fontWeight: 500,
    fontStyle: 'italic' as const,
  },
  importSourceRow: {
    marginBottom: 3,
  },
  importSource: {
    fontSize: 9,
    fontFamily: 'var(--font-family-mono)',
    color: 'var(--color-border-default)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    display: 'block',
  },
  dirtyDot: {
    color: 'var(--color-state-warning)',
    fontSize: 10,
    flexShrink: 0,
  },
  readOnlyBadge: {
    fontSize: 8,
    background: 'var(--color-bg-surface)',
    borderRadius: 3,
    padding: '1px 4px',
    color: 'var(--color-border-strong)',
    flexShrink: 0,
    letterSpacing: 0.5,
  },
  schemaNameRow: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: 3,
  },
  schemaName: {
    fontSize: 10,
    fontFamily: 'var(--font-family-mono)',
    color: 'var(--color-fg-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  statsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  stat: {
    fontSize: 10,
    color: 'var(--color-border-strong)',
  },
  footer: {
    padding: '6px 10px',
    borderTop: '1px solid var(--color-border-subtle)',
    flexShrink: 0,
    marginTop: 'auto',
  },
  footerText: {
    fontSize: 10,
    color: 'var(--color-border-default)',
  },
  searchToggleBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-border-strong)',
    cursor: 'pointer',
    fontSize: 11,
    padding: '0 2px',
    flexShrink: 0,
  },
  addViewBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-border-strong)',
    cursor: 'pointer',
    fontSize: 14,
    padding: '0 2px',
    lineHeight: 1,
    flexShrink: 0,
    marginLeft: 'auto',
  },
  viewsList: {
    overflowY: 'auto' as const,
    padding: '2px 0',
    maxHeight: 200,
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  viewsEmpty: {
    padding: '8px 10px',
    fontSize: 10,
    color: 'var(--color-border-default)',
    fontStyle: 'italic' as const,
    lineHeight: 1.4,
  },
  viewRow: {
    paddingTop: 5,
    paddingRight: 8,
    paddingBottom: 5,
    paddingLeft: 10,
    cursor: 'pointer',
    borderBottom: '1px solid var(--color-bg-surface-sunken)',
    userSelect: 'none' as const,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  viewRowActive: {
    background: 'var(--color-bg-surface)',
    borderLeft: '2px solid var(--color-accent-hover)',
    paddingLeft: 8,
  },
  viewName: {
    fontSize: 11,
    color: 'var(--color-fg-primary)',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  viewMemberCount: {
    fontSize: 9,
    color: 'var(--color-border-default)',
    background: 'var(--color-bg-surface-sunken)',
    borderRadius: 8,
    padding: '0 4px',
    flexShrink: 0,
  },
  viewActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 1,
    flexShrink: 0,
  },
  viewActionBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-border-strong)',
    cursor: 'pointer',
    fontSize: 11,
    padding: '0 3px',
    lineHeight: 1,
    opacity: 0.6,
  },
  viewDeleteBtn: {
    color: 'var(--color-state-error-fg)',
    fontSize: 14,
  },
  viewRenameInput: {
    flex: 1,
    background: 'var(--color-bg-deep)',
    border: '1px solid var(--color-border-focus)',
    borderRadius: 3,
    color: 'var(--color-fg-primary)',
    fontSize: 11,
    padding: '1px 4px',
    outline: 'none',
    minWidth: 0,
  },
  subsetRowActive: {
    background: 'var(--color-bg-surface)',
    borderLeft: '2px solid var(--color-state-success)',
    paddingLeft: 8,
  },
  subsetIcon: {
    fontSize: 11,
    color: 'var(--color-state-success)',
    flexShrink: 0,
    marginRight: 3,
    fontFamily: 'var(--font-family-mono)',
  },
};

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useAppStore } from '../store/index.js';
import { usePlatform } from '../platform/PlatformContext.js';
import { buildManifestData, writeEditorManifest } from '../io/editorManifest.js';
import type { ViewDefinition } from '../store/index.js';
import type { SchemaFile } from '../model/index.js';

// ── Types ─────────────────────────────────────────────────────────────────────

type ItemKind = 'action' | 'view' | 'class' | 'enum' | 'subset' | 'slot';

interface PaletteItem {
  id: string;
  kind: ItemKind;
  label: string;
  hint?: string;
  activate: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const KIND_ORDER: ItemKind[] = ['action', 'view', 'class', 'enum', 'subset', 'slot'];

const KIND_LABELS: Record<ItemKind, string> = {
  action: 'Actions',
  view: 'Views',
  class: 'Classes',
  enum: 'Enums',
  subset: 'Subsets',
  slot: 'Slots',
};

// ── Fuzzy match (subsequence) ─────────────────────────────────────────────────

function fuzzyMatch(query: string, target: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

// ── Build helpers ─────────────────────────────────────────────────────────────

function buildViewItems(
  views: ViewDefinition[],
  onActivate: (viewId: string) => void
): PaletteItem[] {
  return views.map((v) => ({
    id: `view:${v.id}`,
    kind: 'view' as ItemKind,
    label: v.name,
    hint: v.members.length === 1 ? '1 member' : `${v.members.length} members`,
    activate: () => onActivate(v.id),
  }));
}

function buildEntityItems(
  schemas: SchemaFile[],
  onActivateClass: (sf: SchemaFile, name: string) => void,
  onActivateEnum: (sf: SchemaFile, name: string) => void,
  onActivateSubset: (name: string) => void,
  onActivateSlot: (sf: SchemaFile, slotName: string, firstClass: string | undefined) => void
): PaletteItem[] {
  const items: PaletteItem[] = [];
  for (const sf of schemas) {
    for (const [name, cls] of Object.entries(sf.schema.classes)) {
      items.push({
        id: `class:${sf.id}:${name}`,
        kind: 'class',
        label: name,
        hint: cls.description ? cls.description.slice(0, 60) : undefined,
        activate: () => onActivateClass(sf, name),
      });
    }
    for (const [name, enumDef] of Object.entries(sf.schema.enums)) {
      items.push({
        id: `enum:${sf.id}:${name}`,
        kind: 'enum',
        label: name,
        hint: enumDef.description ? enumDef.description.slice(0, 60) : undefined,
        activate: () => onActivateEnum(sf, name),
      });
    }
    for (const [name] of Object.entries(sf.schema.subsets)) {
      items.push({
        id: `subset:${sf.id}:${name}`,
        kind: 'subset',
        label: name,
        activate: () => onActivateSubset(name),
      });
    }
    for (const [slotName, slotDef] of Object.entries(sf.schema.slots)) {
      const firstClass = Object.entries(sf.schema.classes).find(
        ([, cls]) =>
          cls.slots?.includes(slotName) || slotName in (cls.slotUsage ?? {})
      )?.[0];
      items.push({
        id: `slot:${sf.id}:${slotName}`,
        kind: 'slot',
        label: slotName,
        hint: slotDef.description ? slotDef.description.slice(0, 60) : undefined,
        activate: () => onActivateSlot(sf, slotName, firstClass),
      });
    }
  }
  return items;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CommandPalette() {
  const platform = usePlatform();

  const commandPaletteOpen = useAppStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const activeProject = useAppStore((s) => s.activeProject);
  const activeSchemaFile = useAppStore((s) => s.getActiveSchema());
  const activeSchemaId = useAppStore((s) => s.activeSchemaId);
  const selectedNodeIds = useAppStore((s) => s.selectedNodeIds);
  const views = useAppStore((s) => s.views);
  const hiddenSchemaIds = useAppStore((s) => s.hiddenSchemaIds);
  const setActiveSchema = useAppStore((s) => s.setActiveSchema);
  const setActiveEntity = useAppStore((s) => s.setActiveEntity);
  const requestFocusNode = useAppStore((s) => s.requestFocusNode);
  const setFocusMode = useAppStore((s) => s.setFocusMode);
  const setActiveViewId = useAppStore((s) => s.setActiveViewId);
  const createView = useAppStore((s) => s.createView);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [prevQuery, setPrevQuery] = useState('');
  if (prevQuery !== query) {
    setPrevQuery(query);
    setActiveIndex(0);
  }
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setCommandPaletteOpen(false);
    setQuery('');
    setActiveIndex(0);
  }, [setCommandPaletteOpen]);

  useEffect(() => {
    if (commandPaletteOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [commandPaletteOpen]);

  const schemas = useMemo(() => activeProject?.schemas ?? [], [activeProject]);

  const handleSaveAsView = useCallback(() => {
    if (!activeSchemaFile || !activeProject || selectedNodeIds.length === 0) return;
    const schemaClasses = activeSchemaFile.schema.classes ?? {};
    const schemaEnums = activeSchemaFile.schema.enums ?? {};
    const members = selectedNodeIds
      .filter((name) => name in schemaClasses || name in schemaEnums)
      .map((name) => {
        const isEnum = name in schemaEnums;
        return {
          schemaFilePath: activeSchemaFile.filePath,
          name,
          kind: (isEnum ? 'enum' : 'class') as 'class' | 'enum',
        };
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
    close();
  }, [
    activeSchemaFile,
    activeProject,
    selectedNodeIds,
    hiddenSchemaIds,
    views,
    createView,
    setActiveViewId,
    platform,
    close,
  ]);

  const allItems = useMemo((): PaletteItem[] => {
    const actionItems: PaletteItem[] = [];
    if (selectedNodeIds.length > 0 && activeSchemaFile) {
      actionItems.push({
        id: 'action:save-as-view',
        kind: 'action',
        label: `Save ${selectedNodeIds.length} selected node(s) as View`,
        hint: 'Action',
        activate: handleSaveAsView,
      });
    }

    const viewItems = buildViewItems(views, (viewId) => {
      setActiveViewId(viewId);
      close();
    });

    const entityItems = buildEntityItems(
      schemas,
      (sf, name) => {
        if (sf.id !== activeSchemaId) setActiveSchema(sf.id);
        requestFocusNode(name);
        setActiveEntity({ type: 'class', className: name });
        close();
      },
      (sf, name) => {
        if (sf.id !== activeSchemaId) setActiveSchema(sf.id);
        requestFocusNode(name);
        setActiveEntity({ type: 'enum', enumName: name });
        close();
      },
      (name) => {
        setFocusMode({ type: 'subset', subsetName: name });
        close();
      },
      (sf, slotName, firstClass) => {
        if (sf.id !== activeSchemaId) setActiveSchema(sf.id);
        if (firstClass) {
          setActiveEntity({ type: 'slot', className: firstClass, slotName });
        }
        close();
      }
    );

    return [...actionItems, ...viewItems, ...entityItems];
  }, [
    selectedNodeIds,
    activeSchemaFile,
    views,
    schemas,
    activeSchemaId,
    handleSaveAsView,
    setActiveViewId,
    setActiveSchema,
    requestFocusNode,
    setActiveEntity,
    setFocusMode,
    close,
  ]);

  const filteredItems = useMemo(() => {
    const q = query.trim();
    if (!q) return allItems;
    return allItems.filter((item) => fuzzyMatch(q, item.label));
  }, [allItems, query]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-palette-index="${activeIndex}"]`
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const groups = useMemo(() => {
    const result: { kind: ItemKind; items: { item: PaletteItem; idx: number }[] }[] = [];
    for (const kind of KIND_ORDER) {
      const items = filteredItems
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => item.kind === kind);
      if (items.length > 0) result.push({ kind, items });
    }
    return result;
  }, [filteredItems]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((i) => Math.min(i + 1, filteredItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        filteredItems[activeIndex]?.activate();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    },
    [filteredItems, activeIndex, close]
  );

  if (!commandPaletteOpen) return null;

  return ReactDOM.createPortal(
    <div style={styles.overlay} onClick={close} onKeyDown={handleKeyDown}>
      <div
        style={styles.palette}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <input
          ref={inputRef}
          style={styles.input}
          type="text"
          placeholder="Search classes, enums, slots, views, actions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
        {filteredItems.length === 0 ? (
          <div style={styles.empty}>No results for &quot;{query}&quot;</div>
        ) : (
          <div ref={listRef} style={styles.list} role="listbox">
            {groups.map(({ kind, items }) => (
              <div key={kind}>
                <div style={styles.groupHeader}>{KIND_LABELS[kind]}</div>
                {items.map(({ item, idx }) => (
                  <div
                    key={item.id}
                    data-palette-index={idx}
                    style={{
                      ...styles.item,
                      ...(idx === activeIndex ? styles.itemActive : {}),
                    }}
                    role="option"
                    aria-selected={idx === activeIndex}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => item.activate()}
                  >
                    <span style={styles.itemLabel}>{item.label}</span>
                    {item.hint && <span style={styles.itemHint}>{item.hint}</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.55)',
    zIndex: 'var(--z-modal)' as unknown as number,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: 80,
  },
  palette: {
    width: 560,
    maxWidth: 'calc(100vw - 32px)',
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-default)',
    borderRadius: 8,
    boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 'calc(100vh - 160px)',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    border: 'none',
    borderBottom: '1px solid var(--color-border-subtle)',
    background: 'transparent',
    color: 'var(--color-fg-primary)',
    fontSize: 14,
    padding: '12px 16px',
    outline: 'none',
  },
  list: {
    overflowY: 'auto',
    flexShrink: 1,
    minHeight: 0,
  },
  empty: {
    padding: '16px',
    color: 'var(--color-fg-tertiary)',
    fontSize: 13,
    textAlign: 'center',
  },
  groupHeader: {
    padding: '6px 12px 3px',
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: 'var(--color-fg-tertiary)',
    background: 'var(--color-bg-surface-sunken)',
    borderTop: '1px solid var(--color-border-subtle)',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '7px 16px',
    cursor: 'pointer',
    gap: 8,
  },
  itemActive: {
    background: 'var(--color-state-info-bg)',
    color: 'var(--color-state-info-fg)',
  },
  itemLabel: {
    fontSize: 13,
    flexShrink: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  itemHint: {
    fontSize: 11,
    color: 'var(--color-fg-tertiary)',
    flexShrink: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 180,
  },
};

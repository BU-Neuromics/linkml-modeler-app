/**
 * OutlineView — collapsible tree rendering mode for schema navigation (A2).
 *
 * Hierarchical by is_a with mixins shown as sub-branches. Clicking a class or
 * enum drives the same Zustand selection state as a canvas click, so the
 * properties panel works unchanged. Read-only navigation — no inline editing.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../store/index.js';
import type { LinkMLSchema, SlotDefinition } from '../model/index.js';

// ── Row types emitted by the tree derivation ────────────────────────────────

interface ClassRow {
  kind: 'class';
  name: string;
  depth: number;
  isExpandable: boolean;
  isMixinClass: boolean;
  isAbstract: boolean;
  mixins: string[]; // mixins this class uses
}

interface SlotRow {
  kind: 'slot';
  name: string;
  depth: number;
  parentClass: string;
  required: boolean;
  multivalued: boolean;
  range?: string;
  inherited: boolean;
  inheritedFrom?: string;
}

interface EnumRow {
  kind: 'enum';
  name: string;
  depth: number;
  isExpandable: boolean;
}

interface EnumValueRow {
  kind: 'enumValue';
  name: string;
  depth: number;
  parentEnum: string;
}

interface SectionRow {
  kind: 'section';
  label: string;
}

type OutlineRow = ClassRow | SlotRow | EnumRow | EnumValueRow | SectionRow;

// ── Slot collection (mirrors deriveGraph gatherAncestorSlots) ────────────────

interface CollectedSlot {
  slot: SlotDefinition;
  inherited: boolean;
  inheritedFrom?: string;
}

function collectSlots(
  className: string,
  schema: LinkMLSchema,
  visited: Set<string> = new Set()
): CollectedSlot[] {
  const classDef = schema.classes[className];
  if (!classDef) return [];

  const own: CollectedSlot[] = [];
  const ownNames = new Set<string>();

  for (const slot of Object.values(classDef.attributes)) {
    own.push({ slot, inherited: false });
    ownNames.add(slot.name);
  }
  const schemaSlots = schema.slots ?? {};
  for (const slotName of classDef.slots) {
    const base = schemaSlots[slotName];
    if (!base) continue;
    const usage = classDef.slotUsage[slotName];
    const eff = usage ? { ...base, ...usage, name: slotName } : base;
    own.push({ slot: eff, inherited: false });
    ownNames.add(slotName);
  }

  // Collect inherited from is_a + mixins
  const inherited: CollectedSlot[] = [];
  const addFrom = (parentName: string) => {
    if (visited.has(parentName)) return;
    const parentDef = schema.classes[parentName];
    if (!parentDef) return;
    visited.add(parentName);
    for (const slot of Object.values(parentDef.attributes)) {
      if (!ownNames.has(slot.name) && !inherited.some((c) => c.slot.name === slot.name)) {
        inherited.push({ slot, inherited: true, inheritedFrom: parentName });
      }
    }
    for (const slotName of parentDef.slots) {
      const base = schemaSlots[slotName];
      if (!base) continue;
      if (ownNames.has(slotName) || inherited.some((c) => c.slot.name === slotName)) continue;
      const usage = parentDef.slotUsage[slotName];
      const eff = usage ? { ...base, ...usage, name: slotName } : base;
      inherited.push({ slot: eff, inherited: true, inheritedFrom: parentName });
    }
    if (parentDef.isA) addFrom(parentDef.isA);
    for (const m of parentDef.mixins) addFrom(m);
  };

  if (classDef.isA) addFrom(classDef.isA);
  for (const m of classDef.mixins) addFrom(m);

  return [...own, ...inherited].sort((a, b) => a.slot.name.localeCompare(b.slot.name));
}

// ── Tree derivation ──────────────────────────────────────────────────────────

function deriveOutlineRows(
  schema: LinkMLSchema,
  visibleNames: Set<string> | null,
  expanded: Set<string>
): OutlineRow[] {
  const rows: OutlineRow[] = [];
  const classes = schema.classes ?? {};
  const enums = schema.enums ?? {};

  // ── Classes section ─────────────────────────────────────────────────────────
  const visibleClasses = visibleNames
    ? Object.keys(classes).filter((n) => visibleNames.has(n))
    : Object.keys(classes);

  const visibleClassSet = new Set(visibleClasses);

  // Build is_a parent → children map (only for visible classes)
  const isaChildren = new Map<string, string[]>();
  for (const name of visibleClasses) {
    const def = classes[name];
    if (def.isA && visibleClassSet.has(def.isA)) {
      const arr = isaChildren.get(def.isA) ?? [];
      arr.push(name);
      isaChildren.set(def.isA, arr);
    }
  }

  // Build mixin → users map
  const mixinUsers = new Map<string, string[]>();
  for (const name of visibleClasses) {
    const def = classes[name];
    for (const mixin of def.mixins) {
      if (visibleClassSet.has(mixin)) {
        const arr = mixinUsers.get(mixin) ?? [];
        arr.push(name);
        mixinUsers.set(mixin, arr);
      }
    }
  }

  // Find roots: classes whose is_a parent is not in the visible set (or no is_a)
  const hasVisibleParent = new Set<string>();
  for (const name of visibleClasses) {
    const def = classes[name];
    if (def.isA && visibleClassSet.has(def.isA)) {
      hasVisibleParent.add(name);
    }
  }
  const roots = visibleClasses.filter((n) => !hasVisibleParent.has(n)).sort();

  function emitClass(name: string, depth: number) {
    const def = classes[name];
    if (!def) return;

    const isaKids = (isaChildren.get(name) ?? []).sort();
    const mixinKids = (mixinUsers.get(name) ?? []).sort();
    const isExpandable =
      isaKids.length > 0 || mixinKids.length > 0 || Object.keys(def.attributes).length > 0 || def.slots.length > 0;

    rows.push({
      kind: 'class',
      name,
      depth,
      isExpandable,
      isMixinClass: !!def.mixin,
      isAbstract: !!def.abstract,
      mixins: def.mixins.filter((m) => visibleClassSet.has(m)),
    });

    if (!expanded.has(name)) return;

    // Slots first
    const slots = collectSlots(name, schema);
    for (const cs of slots) {
      rows.push({
        kind: 'slot',
        name: cs.slot.name,
        depth: depth + 1,
        parentClass: name,
        required: cs.slot.required ?? false,
        multivalued: cs.slot.multivalued ?? false,
        range: cs.slot.range,
        inherited: cs.inherited,
        inheritedFrom: cs.inheritedFrom,
      });
    }

    // is_a children
    for (const child of isaKids) {
      emitClass(child, depth + 1);
    }

    // Mixin users (shown as sub-branches under the mixin class)
    if (mixinKids.length > 0) {
      for (const user of mixinKids) {
        // Only emit mixin user if it would be a duplicate
        // (it already appears under its own is_a parent; here it appears with a badge)
        emitClass(user, depth + 1);
      }
    }
  }

  if (visibleClasses.length > 0) {
    rows.push({ kind: 'section', label: 'Classes' });
    for (const root of roots) {
      emitClass(root, 0);
    }
  }

  // ── Enums section ───────────────────────────────────────────────────────────
  const visibleEnums = visibleNames
    ? Object.keys(enums).filter((n) => visibleNames.has(n))
    : Object.keys(enums);
  const sortedEnums = [...visibleEnums].sort();

  if (sortedEnums.length > 0) {
    rows.push({ kind: 'section', label: 'Enums' });
    for (const name of sortedEnums) {
      const def = enums[name];
      const pvCount = Object.keys(def.permissibleValues ?? {}).length;
      rows.push({ kind: 'enum', name, depth: 0, isExpandable: pvCount > 0 });

      if (expanded.has(`enum:${name}`)) {
        for (const pv of Object.keys(def.permissibleValues ?? {}).sort()) {
          rows.push({ kind: 'enumValue', name: pv, depth: 1, parentEnum: name });
        }
      }
    }
  }

  return rows;
}

// ── Icons ────────────────────────────────────────────────────────────────────

function TriangleRight({ size = 10, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" style={{ flexShrink: 0 }}>
      <polygon points="2,1 9,5 2,9" fill={color} />
    </svg>
  );
}
function TriangleDown({ size = 10, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" style={{ flexShrink: 0 }}>
      <polygon points="1,2 9,2 5,9" fill={color} />
    </svg>
  );
}

// ── Row renderers ────────────────────────────────────────────────────────────

const INDENT_PX = 16;
const ROW_HEIGHT = 24;

function ClassRowItem({
  row,
  isSelected,
  isFocused,
  isExpanded,
  onSelect,
  onToggle,
  rowRef,
}: {
  row: ClassRow;
  isSelected: boolean;
  isFocused: boolean;
  isExpanded: boolean;
  onSelect: (name: string) => void;
  onToggle: (name: string) => void;
  rowRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={rowRef}
      id={`lme-outline-class-${row.name}`}
      role="treeitem"
      aria-selected={isSelected}
      aria-expanded={row.isExpandable ? isExpanded : undefined}
      tabIndex={isFocused ? 0 : -1}
      style={{
        ...rowStyles.row,
        paddingLeft: 8 + row.depth * INDENT_PX,
        background: isSelected
          ? 'var(--color-accent-subtle)'
          : isFocused
          ? 'var(--color-bg-elevated)'
          : undefined,
        color: isSelected ? 'var(--color-accent-fg)' : 'var(--color-fg-primary)',
        outline: 'none',
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(row.name);
      }}
    >
      {/* Disclosure triangle */}
      <span
        style={rowStyles.triangle}
        onClick={(e) => {
          e.stopPropagation();
          if (row.isExpandable) onToggle(row.name);
        }}
        title={row.isExpandable ? (isExpanded ? 'Collapse' : 'Expand') : undefined}
      >
        {row.isExpandable ? (
          isExpanded ? (
            <TriangleDown color="var(--color-fg-muted)" />
          ) : (
            <TriangleRight color="var(--color-fg-muted)" />
          )
        ) : (
          <span style={{ display: 'inline-block', width: 10 }} />
        )}
      </span>

      {/* Name */}
      <span
        style={{
          ...rowStyles.label,
          fontStyle: row.isAbstract ? 'italic' : undefined,
          color: row.isMixinClass
            ? 'var(--color-accent-hover)'
            : isSelected
            ? 'var(--color-accent-fg)'
            : 'var(--color-fg-primary)',
        }}
        title={[
          row.isAbstract ? 'abstract' : '',
          row.isMixinClass ? 'mixin' : '',
          row.mixins.length > 0 ? `mixins: ${row.mixins.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join(' | ') || undefined}
      >
        {row.name}
      </span>

      {/* Badges */}
      {row.isAbstract && <span style={rowStyles.badge}>abs</span>}
      {row.isMixinClass && <span style={{ ...rowStyles.badge, color: 'var(--color-accent-hover)' }}>mixin</span>}
      {row.mixins.length > 0 && (
        <span style={{ ...rowStyles.badge, color: 'var(--color-fg-muted)' }}>
          +{row.mixins.join(',')}
        </span>
      )}
    </div>
  );
}

function SlotRowItem({
  row,
  isFocused,
  onFocus,
  rowRef,
}: {
  row: SlotRow;
  isFocused: boolean;
  onFocus: (id: string) => void;
  rowRef?: React.Ref<HTMLDivElement>;
}) {
  const id = `slot:${row.parentClass}:${row.name}`;
  return (
    <div
      ref={rowRef}
      id={`lme-outline-slot-${row.parentClass}-${row.name}`}
      role="treeitem"
      tabIndex={isFocused ? 0 : -1}
      style={{
        ...rowStyles.row,
        paddingLeft: 8 + row.depth * INDENT_PX,
        background: isFocused ? 'var(--color-bg-elevated)' : undefined,
        color: row.inherited ? 'var(--color-fg-muted)' : 'var(--color-fg-secondary)',
        outline: 'none',
      }}
      onClick={() => onFocus(id)}
      title={[
        row.range ? `range: ${row.range}` : '',
        row.required ? 'required' : '',
        row.multivalued ? 'multivalued' : '',
        row.inherited && row.inheritedFrom ? `inherited from ${row.inheritedFrom}` : '',
      ]
        .filter(Boolean)
        .join(' | ') || undefined}
    >
      <span style={rowStyles.slotDot}>•</span>
      <span
        style={{
          ...rowStyles.label,
          fontSize: 11,
          fontStyle: row.inherited ? 'italic' : undefined,
        }}
      >
        {row.name}
      </span>
      {row.required && <span style={{ ...rowStyles.badge, color: 'var(--color-state-success)' }}>req</span>}
      {row.multivalued && <span style={rowStyles.badge}>[]</span>}
      {row.range && (
        <span style={{ ...rowStyles.badge, color: 'var(--color-fg-muted)', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.range}
        </span>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function OutlineView() {
  const activeSchemaFile = useAppStore((s) => s.getActiveSchema());
  const activeViewId = useAppStore((s) => s.activeViewId);
  const views = useAppStore((s) => s.views);
  const selectedNodeIds = useAppStore((s) => s.selectedNodeIds);
  const setSelection = useAppStore((s) => s.setSelection);
  const setActiveEntity = useAppStore((s) => s.setActiveEntity);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const schema = activeSchemaFile?.schema;

  // Determine view membership filter
  const viewMemberNames = useMemo((): Set<string> | null => {
    if (!activeViewId) return null;
    const view = views.find((v) => v.id === activeViewId);
    if (!view) return null;
    return new Set(view.members.map((m) => m.name));
  }, [activeViewId, views]);

  const rows = useMemo(() => {
    if (!schema) return [];
    return deriveOutlineRows(schema, viewMemberNames, expanded);
  }, [schema, viewMemberNames, expanded]);

  // Flat list of selectable (non-section) row IDs for keyboard navigation
  const navigableIds = useMemo(
    () =>
      rows
        .filter((r): r is ClassRow | SlotRow | EnumRow | EnumValueRow => r.kind !== 'section')
        .map((r) => {
          if (r.kind === 'class') return r.name;
          if (r.kind === 'enum') return `enum:${r.name}`;
          if (r.kind === 'slot') return `slot:${r.parentClass}:${r.name}`;
          return `ev:${r.parentEnum}:${r.name}`;
        }),
    [rows]
  );

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectClass = useCallback(
    (name: string) => {
      setSelection([name], []);
      setActiveEntity({ type: 'class', className: name });
      setFocusedId(name);
    },
    [setSelection, setActiveEntity]
  );

  const selectEnum = useCallback(
    (name: string) => {
      setSelection([name], []);
      setActiveEntity({ type: 'enum', enumName: name });
      setFocusedId(`enum:${name}`);
    },
    [setSelection, setActiveEntity]
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const idx = focusedId ? navigableIds.indexOf(focusedId) : -1;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = navigableIds[idx + 1];
        if (next) {
          setFocusedId(next);
          rowRefs.current.get(next)?.focus();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = navigableIds[idx - 1];
        if (prev) {
          setFocusedId(prev);
          rowRefs.current.get(prev)?.focus();
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        // Expand focused item
        const row = rows.find(
          (r): r is ClassRow | EnumRow =>
            (r.kind === 'class' && r.name === focusedId) ||
            (r.kind === 'enum' && `enum:${r.name}` === focusedId)
        );
        if (row && row.isExpandable) {
          const key = row.kind === 'class' ? row.name : `enum:${row.name}`;
          if (!expanded.has(key)) toggleExpanded(key);
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        // Collapse focused item
        const row = rows.find(
          (r): r is ClassRow | EnumRow =>
            (r.kind === 'class' && r.name === focusedId) ||
            (r.kind === 'enum' && `enum:${r.name}` === focusedId)
        );
        if (row) {
          const key = row.kind === 'class' ? row.name : `enum:${row.name}`;
          if (expanded.has(key)) toggleExpanded(key);
        }
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!focusedId) return;
        if (focusedId.startsWith('enum:')) {
          const name = focusedId.slice(5);
          selectEnum(name);
        } else if (!focusedId.includes(':')) {
          selectClass(focusedId);
        }
      }
    },
    [focusedId, navigableIds, rows, expanded, toggleExpanded, selectClass, selectEnum]
  );

  // Auto-focus on mount (intentional one-shot effect — set initial focus only)
  /* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
  useEffect(() => {
    if (navigableIds.length > 0 && !focusedId) {
      setFocusedId(navigableIds[0]); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

  if (!schema) {
    return (
      <div style={styles.empty}>
        <span>No schema loaded</span>
      </div>
    );
  }

  const selectedSet = new Set(selectedNodeIds);

  return (
    <div
      ref={containerRef}
      id="lme-outline-view"
      role="tree"
      aria-label="Schema outline"
      style={styles.container}
      onKeyDown={handleKeyDown}
    >
      {rows.map((row, i) => {
        if (row.kind === 'section') {
          const sectionId =
            row.label === 'Classes' ? 'lme-outline-classes-header' :
            row.label === 'Enums' ? 'lme-outline-enums-header' :
            undefined;
          return (
            <div key={`section-${i}`} id={sectionId} style={styles.sectionHeader}>
              {row.label}
            </div>
          );
        }

        if (row.kind === 'class') {
          const id = row.name;
          return (
            <ClassRowItem
              key={`class-${row.name}-${row.depth}`}
              row={row}
              isSelected={selectedSet.has(row.name)}
              isFocused={focusedId === id}
              isExpanded={expanded.has(row.name)}
              onSelect={selectClass}
              onToggle={toggleExpanded}
              rowRef={(el) => {
                if (el) rowRefs.current.set(id, el);
                else rowRefs.current.delete(id);
              }}
            />
          );
        }

        if (row.kind === 'slot') {
          const id = `slot:${row.parentClass}:${row.name}`;
          return (
            <SlotRowItem
              key={id}
              row={row}
              isFocused={focusedId === id}
              onFocus={setFocusedId}
              rowRef={(el) => {
                if (el) rowRefs.current.set(id, el);
                else rowRefs.current.delete(id);
              }}
            />
          );
        }

        if (row.kind === 'enum') {
          const id = `enum:${row.name}`;
          const isExpanded = expanded.has(id);
          const isSelected = selectedSet.has(row.name);
          return (
            <div
              key={id}
              id={`lme-outline-enum-${row.name}`}
              role="treeitem"
              aria-selected={isSelected}
              aria-expanded={row.isExpandable ? isExpanded : undefined}
              tabIndex={focusedId === id ? 0 : -1}
              style={{
                ...rowStyles.row,
                paddingLeft: 8 + row.depth * INDENT_PX,
                background: isSelected
                  ? 'var(--color-accent-subtle)'
                  : focusedId === id
                  ? 'var(--color-bg-elevated)'
                  : undefined,
                color: isSelected ? 'var(--color-accent-fg)' : 'var(--color-edge-union)',
                outline: 'none',
              }}
              onClick={() => selectEnum(row.name)}
              ref={(el) => {
                if (el) rowRefs.current.set(id, el);
                else rowRefs.current.delete(id);
              }}
            >
              <span
                style={rowStyles.triangle}
                onClick={(e) => {
                  e.stopPropagation();
                  if (row.isExpandable) toggleExpanded(id);
                }}
              >
                {row.isExpandable ? (
                  isExpanded ? <TriangleDown color="var(--color-fg-muted)" /> : <TriangleRight color="var(--color-fg-muted)" />
                ) : (
                  <span style={{ display: 'inline-block', width: 10 }} />
                )}
              </span>
              <span style={{ ...rowStyles.label, fontSize: 12 }}>{row.name}</span>
              <span style={{ ...rowStyles.badge, color: 'var(--color-edge-union)' }}>enum</span>
            </div>
          );
        }

        if (row.kind === 'enumValue') {
          return (
            <div
              key={`ev-${row.parentEnum}-${row.name}`}
              style={{
                ...rowStyles.row,
                paddingLeft: 8 + row.depth * INDENT_PX,
                color: 'var(--color-fg-muted)',
              }}
            >
              <span style={rowStyles.slotDot}>·</span>
              <span style={{ ...rowStyles.label, fontSize: 11 }}>{row.name}</span>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    background: 'var(--color-bg-canvas)',
    fontFamily: 'var(--font-family-mono)',
    fontSize: 12,
    color: 'var(--color-fg-primary)',
    userSelect: 'none',
  },
  sectionHeader: {
    padding: '10px 12px 4px',
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--color-border-strong)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontFamily: 'var(--font-family-mono)',
    borderTop: '1px solid var(--color-border-subtle)',
    marginTop: 4,
  },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-fg-muted)',
    fontSize: 13,
  },
};

const rowStyles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    alignItems: 'center',
    height: ROW_HEIGHT,
    gap: 4,
    paddingRight: 8,
    cursor: 'pointer',
    borderRadius: 3,
    margin: '1px 4px',
    flexShrink: 0,
    transition: 'background 0.1s',
  },
  triangle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 14,
    height: 14,
    flexShrink: 0,
    cursor: 'pointer',
    borderRadius: 2,
  },
  label: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 12,
  },
  badge: {
    fontSize: 9,
    padding: '1px 4px',
    borderRadius: 3,
    background: 'var(--color-bg-deep)',
    color: 'var(--color-fg-muted)',
    fontFamily: 'var(--font-family-mono)',
    flexShrink: 0,
    letterSpacing: 0.2,
  },
  slotDot: {
    width: 14,
    textAlign: 'center',
    color: 'var(--color-fg-muted)',
    flexShrink: 0,
    fontSize: 14,
    lineHeight: 1,
  },
};

/**
 * TableView — spreadsheet-style bulk-edit rendering mode for LinkML schemas (C2).
 *
 * Rows are entities (classes, attributes, or enums — user-switchable). Columns
 * are common fields. In-cell editing dispatches the same projectSlice mutations
 * used by PropertiesPanel, so undo/redo via zundo works automatically.
 *
 * Rows are virtualized via @tanstack/react-virtual for performance on large schemas.
 * When a view is active, only view members are shown.
 *
 * Feature flag: only reachable when `tableModeEnabled` is true in UISlice.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type ColumnDef,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAppStore } from '../store/index.js';
import type { ClassDefinition, SlotDefinition, EnumDefinition } from '../model/index.js';
import type { ViewMember } from '../io/editorManifest.js';

// ── Row types ─────────────────────────────────────────────────────────────────

type RowType = 'classes' | 'slots' | 'enums';

interface ClassRow {
  kind: 'class';
  schemaId: string;
  name: string;
  description: string;
  isA: string;
  abstract: boolean;
  mixin: boolean;
}

interface SlotRow {
  kind: 'slot';
  schemaId: string;
  ownerClass: string;
  name: string;
  description: string;
  range: string;
  required: boolean;
  multivalued: boolean;
  identifier: boolean;
}

interface EnumRow {
  kind: 'enum';
  schemaId: string;
  name: string;
  description: string;
  valueCount: number;
}

type TableRow = ClassRow | SlotRow | EnumRow;

// ── Row derivation ────────────────────────────────────────────────────────────

function deriveRows(
  rowType: RowType,
  schemaId: string,
  classes: Record<string, ClassDefinition>,
  enums: Record<string, EnumDefinition>,
  visibleNames: Set<string> | null
): TableRow[] {
  if (rowType === 'classes') {
    return Object.values(classes)
      .filter((c) => !visibleNames || visibleNames.has(c.name))
      .map((c): ClassRow => ({
        kind: 'class',
        schemaId,
        name: c.name,
        description: c.description ?? '',
        isA: c.isA ?? '',
        abstract: c.abstract ?? false,
        mixin: c.mixin ?? false,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  if (rowType === 'slots') {
    const rows: SlotRow[] = [];
    for (const cls of Object.values(classes)) {
      if (visibleNames && !visibleNames.has(cls.name)) continue;
      for (const slot of Object.values(cls.attributes)) {
        rows.push({
          kind: 'slot',
          schemaId,
          ownerClass: cls.name,
          name: slot.name,
          description: slot.description ?? '',
          range: slot.range ?? '',
          required: slot.required ?? false,
          multivalued: slot.multivalued ?? false,
          identifier: slot.identifier ?? false,
        });
      }
    }
    return rows.sort((a, b) =>
      a.ownerClass.localeCompare(b.ownerClass) || a.name.localeCompare(b.name)
    );
  }

  // enums
  return Object.values(enums)
    .filter((e) => !visibleNames || visibleNames.has(e.name))
    .map((e): EnumRow => ({
      kind: 'enum',
      schemaId,
      name: e.name,
      description: e.description ?? '',
      valueCount: Object.keys(e.permissibleValues).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── Inline cell editors ────────────────────────────────────────────────────────

function TextCell({
  value,
  onCommit,
  placeholder,
  monospace,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  monospace?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  if (editing) {
    return (
      <input
        autoFocus
        style={{ ...cellInputStyle, ...(monospace ? monoStyle : {}) }}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { onCommit(draft); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { onCommit(draft); setEditing(false); (e.target as HTMLInputElement).blur(); }
          if (e.key === 'Escape') { setEditing(false); }
        }}
      />
    );
  }
  return (
    <div
      style={{ ...cellDisplayStyle, ...(monospace ? monoStyle : {}), cursor: 'text' }}
      title={value || placeholder}
      onDoubleClick={() => { setDraft(value); setEditing(true); }}
    >
      {value || <span style={placeholderStyle}>{placeholder ?? '—'}</span>}
    </div>
  );
}

function BoolCell({ value, onToggle }: { value: boolean; onToggle: () => void }) {
  return (
    <div style={boolCellStyle}>
      <input
        type="checkbox"
        checked={value}
        onChange={onToggle}
        style={{ accentColor: 'var(--color-accent-default)', cursor: 'pointer' }}
      />
    </div>
  );
}

// ── Column helpers ─────────────────────────────────────────────────────────────

const classColHelper = createColumnHelper<ClassRow>();
const slotColHelper = createColumnHelper<SlotRow>();
const enumColHelper = createColumnHelper<EnumRow>();

function buildClassColumns(
  updateClass: (schemaId: string, name: string, partial: Partial<ClassDefinition>) => void,
  renameClass: (schemaId: string, oldName: string, newName: string) => void
): ColumnDef<ClassRow, string>[] {
  return [
    classColHelper.accessor('name', {
      header: 'Name',
      size: 180,
      cell: (info) => (
        <TextCell
          value={info.getValue()}
          monospace
          onCommit={(v) => {
            if (v && v !== info.getValue()) renameClass(info.row.original.schemaId, info.getValue(), v);
          }}
        />
      ),
    }) as ColumnDef<ClassRow, string>,
    classColHelper.accessor('isA', {
      header: 'is_a',
      size: 140,
      cell: (info) => (
        <TextCell
          value={info.getValue()}
          monospace
          placeholder="—"
          onCommit={(v) => updateClass(info.row.original.schemaId, info.row.original.name, { isA: v || undefined })}
        />
      ),
    }) as ColumnDef<ClassRow, string>,
    classColHelper.accessor('abstract', {
      header: 'abstract',
      size: 80,
      cell: (info) => (
        <BoolCell
          value={info.getValue() as unknown as boolean}
          onToggle={() => updateClass(info.row.original.schemaId, info.row.original.name, { abstract: !info.getValue() })}
        />
      ),
    }) as ColumnDef<ClassRow, string>,
    classColHelper.accessor('mixin', {
      header: 'mixin',
      size: 70,
      cell: (info) => (
        <BoolCell
          value={info.getValue() as unknown as boolean}
          onToggle={() => updateClass(info.row.original.schemaId, info.row.original.name, { mixin: !info.getValue() })}
        />
      ),
    }) as ColumnDef<ClassRow, string>,
    classColHelper.accessor('description', {
      header: 'Description',
      size: 300,
      cell: (info) => (
        <TextCell
          value={info.getValue()}
          placeholder="—"
          onCommit={(v) => updateClass(info.row.original.schemaId, info.row.original.name, { description: v || undefined })}
        />
      ),
    }) as ColumnDef<ClassRow, string>,
  ];
}

function buildSlotColumns(
  updateAttribute: (schemaId: string, ownerClass: string, name: string, partial: Partial<SlotDefinition>) => void,
  renameAttribute: (schemaId: string, ownerClass: string, oldName: string, newName: string) => void
): ColumnDef<SlotRow, string>[] {
  return [
    slotColHelper.accessor('ownerClass', {
      header: 'Class',
      size: 150,
      cell: (info) => <div style={{ ...cellDisplayStyle, ...monoStyle }}>{info.getValue()}</div>,
    }) as ColumnDef<SlotRow, string>,
    slotColHelper.accessor('name', {
      header: 'Slot',
      size: 160,
      cell: (info) => (
        <TextCell
          value={info.getValue()}
          monospace
          onCommit={(v) => {
            if (v && v !== info.getValue())
              renameAttribute(info.row.original.schemaId, info.row.original.ownerClass, info.getValue(), v);
          }}
        />
      ),
    }) as ColumnDef<SlotRow, string>,
    slotColHelper.accessor('range', {
      header: 'range',
      size: 140,
      cell: (info) => (
        <TextCell
          value={info.getValue()}
          monospace
          placeholder="—"
          onCommit={(v) =>
            updateAttribute(info.row.original.schemaId, info.row.original.ownerClass, info.row.original.name, { range: v || undefined })
          }
        />
      ),
    }) as ColumnDef<SlotRow, string>,
    slotColHelper.accessor('required', {
      header: 'req',
      size: 50,
      cell: (info) => (
        <BoolCell
          value={info.getValue() as unknown as boolean}
          onToggle={() =>
            updateAttribute(info.row.original.schemaId, info.row.original.ownerClass, info.row.original.name, {
              required: !info.getValue(),
            })
          }
        />
      ),
    }) as ColumnDef<SlotRow, string>,
    slotColHelper.accessor('multivalued', {
      header: 'multi',
      size: 50,
      cell: (info) => (
        <BoolCell
          value={info.getValue() as unknown as boolean}
          onToggle={() =>
            updateAttribute(info.row.original.schemaId, info.row.original.ownerClass, info.row.original.name, {
              multivalued: !info.getValue(),
            })
          }
        />
      ),
    }) as ColumnDef<SlotRow, string>,
    slotColHelper.accessor('identifier', {
      header: 'id',
      size: 40,
      cell: (info) => (
        <BoolCell
          value={info.getValue() as unknown as boolean}
          onToggle={() =>
            updateAttribute(info.row.original.schemaId, info.row.original.ownerClass, info.row.original.name, {
              identifier: !info.getValue(),
            })
          }
        />
      ),
    }) as ColumnDef<SlotRow, string>,
    slotColHelper.accessor('description', {
      header: 'Description',
      size: 300,
      cell: (info) => (
        <TextCell
          value={info.getValue()}
          placeholder="—"
          onCommit={(v) =>
            updateAttribute(info.row.original.schemaId, info.row.original.ownerClass, info.row.original.name, {
              description: v || undefined,
            })
          }
        />
      ),
    }) as ColumnDef<SlotRow, string>,
  ];
}

function buildEnumColumns(
  updateEnum: (schemaId: string, name: string, partial: Partial<EnumDefinition>) => void
): ColumnDef<EnumRow, string>[] {
  return [
    enumColHelper.accessor('name', {
      header: 'Name',
      size: 200,
      cell: (info) => <div style={{ ...cellDisplayStyle, ...monoStyle }}>{info.getValue()}</div>,
    }) as ColumnDef<EnumRow, string>,
    enumColHelper.accessor('valueCount', {
      header: 'Values',
      size: 70,
      cell: (info) => <div style={{ ...cellDisplayStyle, color: 'var(--color-fg-muted)' }}>{info.getValue()}</div>,
    }) as ColumnDef<EnumRow, string>,
    enumColHelper.accessor('description', {
      header: 'Description',
      size: 400,
      cell: (info) => (
        <TextCell
          value={info.getValue()}
          placeholder="—"
          onCommit={(v) =>
            updateEnum(info.row.original.schemaId, info.row.original.name, { description: v || undefined })
          }
        />
      ),
    }) as ColumnDef<EnumRow, string>,
  ];
}

// ── Main component ────────────────────────────────────────────────────────────

const ROW_HEIGHT = 34;

export function TableView() {
  const activeSchemaFile = useAppStore((s) => s.getActiveSchema());
  const views = useAppStore((s) => s.views);
  const activeViewId = useAppStore((s) => s.activeViewId);
  const updateClass = useAppStore((s) => s.updateClass);
  const renameClass = useAppStore((s) => s.renameClass);
  const updateAttribute = useAppStore((s) => s.updateAttribute);
  const renameAttribute = useAppStore((s) => s.renameAttribute);
  const updateEnum = useAppStore((s) => s.updateEnum);

  const [rowType, setRowType] = useState<RowType>('classes');

  const activeView = useMemo(
    () => views.find((v) => v.id === activeViewId) ?? null,
    [views, activeViewId]
  );

  // Build visible names set from active view members (null = show all)
  const visibleNames = useMemo((): Set<string> | null => {
    if (!activeView || activeView.members.length === 0) return null;
    return new Set(activeView.members.map((m: ViewMember) => m.name));
  }, [activeView]);

  const rows = useMemo((): TableRow[] => {
    if (!activeSchemaFile) return [];
    const { schema, id: schemaId } = activeSchemaFile;
    return deriveRows(rowType, schemaId, schema.classes ?? {}, schema.enums ?? {}, visibleNames);
  }, [activeSchemaFile, rowType, visibleNames]);

  const classColumns = useMemo(
    () => buildClassColumns(updateClass, renameClass),
    [updateClass, renameClass]
  );
  const slotColumns = useMemo(
    () => buildSlotColumns(updateAttribute, renameAttribute),
    [updateAttribute, renameAttribute]
  );
  const enumColumns = useMemo(() => buildEnumColumns(updateEnum), [updateEnum]);

  const columns = useMemo((): ColumnDef<TableRow, string>[] => {
    if (rowType === 'classes') return classColumns as ColumnDef<TableRow, string>[];
    if (rowType === 'slots') return slotColumns as ColumnDef<TableRow, string>[];
    return enumColumns as ColumnDef<TableRow, string>[];
  }, [rowType, classColumns, slotColumns, enumColumns]);

  const table = useReactTable<TableRow>({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const allRows = table.getRowModel().rows;

  const virtualizer = useVirtualizer({
    count: allRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: useCallback(() => ROW_HEIGHT, []),
    overscan: 10,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  if (!activeSchemaFile) {
    return (
      <div style={styles.empty}>
        <span>Open a project to use table view.</span>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      {/* Toolbar: row type switcher + stats */}
      <div style={styles.toolbar}>
        <span style={styles.toolbarLabel}>Show:</span>
        {(['classes', 'slots', 'enums'] as RowType[]).map((rt) => (
          <button
            key={rt}
            id={`lme-table-rowtype-${rt}`}
            style={{
              ...styles.rowTypeBtn,
              borderColor: rowType === rt ? 'var(--color-accent-hover)' : 'var(--color-border-default)',
              color: rowType === rt ? 'var(--color-accent-hover)' : 'var(--color-fg-muted)',
              background: rowType === rt ? 'var(--color-bg-surface)' : 'transparent',
            }}
            onClick={() => setRowType(rt)}
          >
            {rt}
          </button>
        ))}
        <span style={styles.rowCount}>{rows.length} rows</span>
        {activeView && (
          <span style={styles.viewBadge}>view: {activeView.name}</span>
        )}
        <span style={styles.hint}>Double-click a cell to edit · Enter/Blur to commit · Esc to cancel</span>
      </div>

      {/* Table */}
      <div ref={scrollRef} style={styles.scrollContainer}>
        <table style={{ ...styles.table, minWidth: table.getTotalSize() }}>
          <thead style={styles.thead}>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} style={styles.headerRow}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    style={{ ...styles.th, width: h.getSize() }}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody style={{ height: totalSize, position: 'relative', display: 'block' }}>
            {virtualItems.map((virtualItem) => {
              const row = allRows[virtualItem.index];
              return (
                <tr
                  key={row.id}
                  data-row-index={virtualItem.index}
                  style={{
                    ...styles.row,
                    position: 'absolute',
                    top: virtualItem.start,
                    height: ROW_HEIGHT,
                    width: '100%',
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      style={{ ...styles.td, width: cell.column.getSize() }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const cellInputStyle: React.CSSProperties = {
  background: 'var(--color-bg-canvas)',
  border: '1px solid var(--color-accent-hover)',
  borderRadius: 3,
  color: 'var(--color-fg-primary)',
  fontSize: 12,
  padding: '2px 5px',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
};

const cellDisplayStyle: React.CSSProperties = {
  fontSize: 12,
  padding: '2px 5px',
  color: 'var(--color-fg-primary)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  userSelect: 'none',
};

const placeholderStyle: React.CSSProperties = {
  color: 'var(--color-fg-muted)',
};

const monoStyle: React.CSSProperties = {
  fontFamily: 'var(--font-family-mono)',
};

const boolCellStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'var(--color-bg-canvas)',
    overflow: 'hidden',
    fontFamily: 'sans-serif',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    borderBottom: '1px solid var(--color-border-default)',
    background: 'var(--color-bg-surface)',
    flexShrink: 0,
  },
  toolbarLabel: {
    fontSize: 12,
    color: 'var(--color-fg-muted)',
  },
  rowTypeBtn: {
    fontSize: 12,
    padding: '3px 10px',
    borderRadius: 4,
    border: '1px solid',
    cursor: 'pointer',
  },
  rowCount: {
    fontSize: 11,
    color: 'var(--color-fg-muted)',
    marginLeft: 4,
  },
  viewBadge: {
    fontSize: 11,
    color: 'var(--color-accent-hover)',
    padding: '2px 6px',
    border: '1px solid var(--color-accent-hover)',
    borderRadius: 4,
  },
  hint: {
    fontSize: 11,
    color: 'var(--color-fg-muted)',
    marginLeft: 'auto',
    fontStyle: 'italic',
  },
  scrollContainer: {
    flex: 1,
    overflow: 'auto',
    position: 'relative',
  },
  table: {
    borderCollapse: 'collapse',
    tableLayout: 'fixed',
    display: 'table',
  },
  thead: {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    background: 'var(--color-bg-surface)',
    display: 'table-header-group',
  },
  headerRow: {
    display: 'table-row',
  },
  th: {
    textAlign: 'left',
    padding: '6px 8px',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-fg-secondary)',
    borderBottom: '2px solid var(--color-border-default)',
    borderRight: '1px solid var(--color-border-default)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    display: 'table-cell',
    boxSizing: 'border-box',
  },
  row: {
    display: 'table-row',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  td: {
    padding: '1px 3px',
    verticalAlign: 'middle',
    borderRight: '1px solid var(--color-border-subtle)',
    display: 'table-cell',
    boxSizing: 'border-box',
    height: ROW_HEIGHT,
    overflow: 'hidden',
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--color-fg-muted)',
    fontSize: 13,
    background: 'var(--color-bg-canvas)',
  },
};

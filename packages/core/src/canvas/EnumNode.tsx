import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import type { CanvasNodeData } from '../store/slices/canvasSlice.js';
import type { EnumDefinition } from '../model/index.js';
import { Diamond } from '../ui/icons/index.js';

export interface EnumNodeData extends CanvasNodeData {
  entityType: 'enum';
  enumDef: EnumDefinition;
  collapsed: boolean;
  ghost?: boolean; // True for read-only imported enums
}

const VALUE_LIMIT = 12;

function EnumNode({ data, selected }: NodeProps<EnumNodeData>) {
  const { enumDef, collapsed, ghost } = data;
  const values = Object.values(enumDef.permissibleValues);
  const visibleValues = collapsed ? [] : values.slice(0, VALUE_LIMIT);
  const hiddenCount = collapsed ? 0 : Math.max(0, values.length - VALUE_LIMIT);

  return (
    <div
      style={{
        ...styles.wrapper,
        ...(ghost ? styles.ghostWrapper : {}),
        outline: selected ? '2px solid var(--color-accent-hover)' : ghost ? '1px dashed #4a3a1e' : '1px solid var(--color-border-default)',
      }}
    >
      {/* Enum nodes only receive edges (range targets) */}
      <Handle type="target" position={Position.Top} style={styles.handle} />

      {/* Generic side handles — used as targets for range edges arriving from ClassNodes. */}
      <Handle
        type="source"
        id="side-east"
        position={Position.Right}
        style={styles.sideHandle}
      />
      <Handle
        type="source"
        id="side-west"
        position={Position.Left}
        style={styles.sideHandle}
      />

      {/* Header */}
      <div style={{ ...styles.header, ...(ghost ? styles.ghostHeader : {}) }}>
        <span style={styles.nodeIcon}><Diamond size={14} /></span>
        <span style={styles.headerTitle}>{enumDef.name}</span>
      </div>

      {/* Values */}
      {!collapsed && (
        <div style={styles.body}>
          {visibleValues.map((v) => (
            <div key={v.text} style={styles.valueRow}>
              <span style={styles.valueText}>{v.text}</span>
              {v.meaning && (
                <span style={styles.valueMeaning} title={v.meaning}>
                  → {v.meaning}
                </span>
              )}
            </div>
          ))}
          {hiddenCount > 0 && (
            <div style={styles.moreRow}>+{hiddenCount} more…</div>
          )}
          {visibleValues.length === 0 && values.length === 0 && (
            <div style={styles.emptyRow}>no values</div>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={styles.handle} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    background: 'var(--color-bg-surface)',
    borderRadius: 6,
    minWidth: 180,
    maxWidth: 280,
    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
    fontFamily: 'var(--font-family-mono)',
    fontSize: 12,
    color: 'var(--color-fg-primary)',
    overflow: 'hidden',
  },
  ghostWrapper: {
    background: 'var(--color-bg-deep)',
    opacity: 0.72,
  },
  ghostHeader: {
    background: 'var(--color-state-warning-bg)',
  },
  handle: {
    background: 'var(--color-accent-hover)',
    width: 8,
    height: 8,
    border: '2px solid var(--color-border-subtle)',
  },
  sideHandle: {
    background: 'var(--color-fg-muted)',
    width: 5,
    height: 5,
    border: '1px solid var(--color-border-subtle)',
    opacity: 0.5,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    background: 'var(--color-enum)',
    color: 'var(--color-fg-on-accent)',
    fontWeight: 600,
    fontSize: 13,
    letterSpacing: 0.2,
  },
  nodeIcon: {
    opacity: 0.8,
    display: 'flex',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  body: {
    padding: '4px 0',
  },
  valueRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '2px 10px',
    borderBottom: '1px solid var(--color-border-subtle)',
    minHeight: 22,
    gap: 4,
  },
  valueText: {
    color: 'var(--color-state-warning-fg)',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  valueMeaning: {
    color: 'var(--color-fg-muted)',
    fontSize: 10,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 100,
  },
  moreRow: {
    padding: '3px 10px',
    color: 'var(--color-fg-muted)',
    fontStyle: 'italic',
    fontSize: 11,
  },
  emptyRow: {
    padding: '4px 10px',
    color: 'var(--color-border-strong)',
    fontStyle: 'italic',
  },
};

export default memo(EnumNode);

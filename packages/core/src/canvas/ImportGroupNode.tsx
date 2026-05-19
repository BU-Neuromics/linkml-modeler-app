/**
 * ImportGroupNode — kept for potential reuse by D1 (Auto-Clustering by Import Source).
 * Currently unwired from the canvas (not in nodeTypes, not created by deriveGraph).
 */
import React, { memo } from 'react';
import { NodeProps } from 'reactflow';

export interface ImportGroupNodeData {
  entityId: string;
  entityType: 'importGroup';
  label: string;
  sourceFilePath: string;
  collapsed: boolean;
  childCount: number;
}

function ImportGroupNode({ data }: NodeProps<ImportGroupNodeData>) {
  const { label, collapsed, childCount } = data;

  return (
    <div style={styles.wrapper}>
      <div
        style={styles.header}
        title={collapsed ? 'Click to expand' : 'Click to collapse'}
      >
        <span style={styles.chevron}>{collapsed ? '\u25B6' : '\u25BC'}</span>
        <span style={styles.label}>{label}</span>
        <span style={styles.count}>
          {childCount} {childCount === 1 ? 'entity' : 'entities'}
        </span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    border: '1.5px dashed #2d5a3d',
    background: 'rgba(16, 35, 23, 0.45)',
    overflow: 'visible',
    pointerEvents: 'all',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    background: 'rgba(30, 58, 46, 0.85)',
    borderRadius: '6px 6px 0 0',
    borderBottom: '1px solid #2d5a3d',
    fontFamily: 'var(--font-family-mono)',
    fontSize: 12,
    color: 'var(--color-state-success-fg)',
    userSelect: 'none',
    cursor: 'pointer',
  },
  chevron: {
    fontSize: 10,
    flexShrink: 0,
  },
  label: {
    fontWeight: 600,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  count: {
    fontSize: 10,
    color: 'var(--color-state-success)',
    opacity: 0.7,
    flexShrink: 0,
  },
};

export default memo(ImportGroupNode);

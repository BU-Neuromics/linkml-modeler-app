import React, { memo, useState, useRef, useEffect, useCallback } from 'react';
import { NodeProps } from 'reactflow';
import type { CanvasNodeData } from '../store/slices/canvasSlice.js';
import type { TextLabel } from '../model/index.js';
import { useAppStore } from '../store/index.js';

export interface LabelNodeData extends CanvasNodeData {
  entityType: 'label';
  label: TextLabel;
}

function LabelNode({ data, selected }: NodeProps<LabelNodeData>) {
  const { label } = data;
  const activeSchemaId = useAppStore((s) => s.activeSchemaId);
  const updateLabelInCanvas = useAppStore((s) => s.updateLabelInCanvas);

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(label.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync edit buffer when store value changes externally (e.g., undo/redo)
  useEffect(() => {
    if (!isEditing) setEditText(label.text);
  }, [label.text, isEditing]);

  const commitEdit = useCallback(() => {
    setIsEditing(false);
    if (editText.trim() !== label.text && activeSchemaId) {
      updateLabelInCanvas(activeSchemaId, label.id, { text: editText });
    }
  }, [editText, label.id, label.text, activeSchemaId, updateLabelInCanvas]);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!label.locked) {
        e.stopPropagation();
        setIsEditing(true);
        setEditText(label.text);
      }
    },
    [label.locked, label.text]
  );

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  return (
    <div
      style={{
        ...styles.wrapper,
        fontSize: label.fontSize,
        outline: selected ? '2px solid var(--color-accent-hover)' : '2px solid transparent',
        cursor: label.locked ? 'default' : 'grab',
      }}
      onDoubleClick={handleDoubleClick}
    >
      {label.locked && (
        <span style={styles.lockBadge} title="Locked — unlock in Properties panel">
          🔒
        </span>
      )}
      {isEditing ? (
        <textarea
          ref={textareaRef}
          style={{ ...styles.textarea, fontSize: label.fontSize }}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commitEdit();
            }
            if (e.key === 'Escape') {
              setIsEditing(false);
              setEditText(label.text);
            }
            e.stopPropagation(); // Prevent canvas-level key handlers while editing
          }}
        />
      ) : (
        <div style={styles.text}>{label.text}</div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    background: 'transparent',
    borderRadius: 4,
    padding: '4px 8px',
    position: 'relative',
    fontFamily: 'var(--font-family-mono)',
    color: 'var(--color-fg-primary)',
    userSelect: 'none',
    minWidth: 40,
    minHeight: 24,
  },
  lockBadge: {
    position: 'absolute',
    top: -10,
    right: -10,
    fontSize: 11,
    opacity: 0.7,
    pointerEvents: 'none',
  },
  text: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  textarea: {
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-accent-hover)',
    borderRadius: 2,
    color: 'var(--color-fg-primary)',
    fontFamily: 'var(--font-family-mono)',
    padding: '2px 4px',
    resize: 'both',
    minWidth: 80,
    minHeight: 40,
    outline: 'none',
    display: 'block',
  },
};

export default memo(LabelNode);

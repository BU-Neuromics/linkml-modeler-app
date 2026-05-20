/**
 * ImportSourceOverlay — renders semi-transparent swimlane backgrounds grouping
 * imported nodes by their source file (D1: import-source clustering).
 *
 * Must be rendered as a child of <ReactFlow> so the useNodes/useViewport hooks
 * can access the current canvas state.
 */
import { useMemo } from 'react';
import { useNodes, useViewport } from 'reactflow';
import type { ClassNodeData } from './ClassNode.js';
import type { EnumNodeData } from './EnumNode.js';
import type { CanvasNodeData } from '../store/slices/canvasSlice.js';

const SWIMLANE_PADDING = 24; // px in flow coordinates

/** Stable hue from a string — maps a file path to a consistent HSL hue. */
function filePathToHue(filePath: string): number {
  let hash = 0;
  for (let i = 0; i < filePath.length; i++) {
    hash = (hash * 31 + filePath.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function ImportSourceOverlay() {
  const nodes = useNodes<CanvasNodeData>();
  const { x: vpX, y: vpY, zoom } = useViewport();

  // Group imported nodes by importSourceFile
  const groupBBoxes = useMemo(() => {
    const groups = new Map<string, BBox>();

    for (const node of nodes) {
      const data = node.data as ClassNodeData | EnumNodeData;
      if (!data.importSourceFile) continue;

      const nw = node.width ?? 240;
      const nh = node.height ?? 120;
      const x0 = node.position.x;
      const y0 = node.position.y;

      const existing = groups.get(data.importSourceFile);
      if (existing) {
        existing.minX = Math.min(existing.minX, x0);
        existing.minY = Math.min(existing.minY, y0);
        existing.maxX = Math.max(existing.maxX, x0 + nw);
        existing.maxY = Math.max(existing.maxY, y0 + nh);
      } else {
        groups.set(data.importSourceFile, { minX: x0, minY: y0, maxX: x0 + nw, maxY: y0 + nh });
      }
    }

    return groups;
  }, [nodes]);

  if (groupBBoxes.size === 0) return null;

  // Use CSS transform to work in flow coordinates without computing screen coords manually
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          transformOrigin: '0 0',
          transform: `translate(${vpX}px, ${vpY}px) scale(${zoom})`,
        }}
      >
        {Array.from(groupBBoxes.entries()).map(([filePath, bbox]) => {
          const hue = filePathToHue(filePath);
          // Derive a human-readable label from the last path segment
          const label = filePath.split('/').pop()?.replace(/\.ya?ml$/, '') ?? filePath;

          const left = bbox.minX - SWIMLANE_PADDING;
          const top = bbox.minY - SWIMLANE_PADDING;
          const width = bbox.maxX - bbox.minX + SWIMLANE_PADDING * 2;
          const height = bbox.maxY - bbox.minY + SWIMLANE_PADDING * 2;

          return (
            <div
              key={filePath}
              title={filePath}
              style={{
                position: 'absolute',
                left,
                top,
                width,
                height,
                background: `hsla(${hue}, 55%, 60%, 0.10)`,
                border: `1.5px solid hsla(${hue}, 55%, 55%, 0.35)`,
                borderRadius: 8,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 4,
                  left: 8,
                  fontSize: 11,
                  fontWeight: 600,
                  color: `hsla(${hue}, 45%, 45%, 0.75)`,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  userSelect: 'none',
                  letterSpacing: '0.02em',
                }}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

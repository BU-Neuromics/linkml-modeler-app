/**
 * Custom edge components for the four LinkML relationship types.
 *
 * | Type      | Visual                        |
 * |-----------|-------------------------------|
 * | range     | Solid line, filled arrowhead  |
 * | is_a      | Solid line, hollow triangle   |
 * | mixin     | Dashed line, hollow triangle  |
 * | union_of  | Dotted line, no arrowhead     |
 */
import { memo, useState } from 'react';
import {
  EdgeProps,
  getSmoothStepPath,
  EdgeLabelRenderer,
  BaseEdge,
} from 'reactflow';

// ── Shared helpers ────────────────────────────────────────────────────────────

function edgePath(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = props;
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });
  return { path, labelX, labelY };
}

function EdgeLabel({
  x,
  y,
  label,
}: {
  x: number;
  y: number;
  label?: string;
}) {
  if (!label) return null;
  return (
    <EdgeLabelRenderer>
      <div
        style={{
          position: 'absolute',
          transform: `translate(-50%, -50%) translate(${x}px,${y}px)`,
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border-default)',
          borderRadius: 3,
          padding: '1px 5px',
          fontSize: 10,
          fontFamily: 'var(--font-family-mono)',
          color: 'var(--color-fg-secondary)',
          pointerEvents: 'all',
          cursor: 'default',
        }}
        className="nodrag nopan"
      >
        {label}
      </div>
    </EdgeLabelRenderer>
  );
}

// ── Range edge data interface ──────────────────────────────────────────────────
export interface RangeEdgeData {
  slotName: string;
  range: string;
  required: boolean;
  multivalued: boolean;
  identifier: boolean;
}

// ── range edge ─────────────────────────────────────────────────────────────────
// Solid arrow, labeled with slot name + property badges.
export const RangeEdge = memo(function RangeEdge(props: EdgeProps) {
  const { path, labelX, labelY } = edgePath(props);
  const [hovered, setHovered] = useState(false);
  const data = props.data as RangeEdgeData | undefined;

  const badges: string[] = [];
  if (data?.required) badges.push('R');
  if (data?.multivalued) badges.push('M');
  if (data?.identifier) badges.push('id');

  return (
    <>
      {/* Invisible wider hit area for hover detection */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ pointerEvents: 'stroke' }}
      />
      <BaseEdge
        path={path}
        markerEnd={props.markerEnd ?? 'url(#arrow-filled)'}
        style={{
          stroke: 'var(--color-state-success)',
          strokeWidth: hovered ? 2.5 : 1.5,
          filter: hovered ? 'drop-shadow(0 0 4px rgba(74, 222, 128, 0.5))' : undefined,
          transition: 'stroke-width 0.15s, filter 0.15s',
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            pointerEvents: 'all',
            cursor: 'default',
          }}
          className="nodrag nopan"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {/* Slot name label */}
          {props.label && (
            <span
              style={{
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-default)',
                borderRadius: 3,
                padding: '1px 5px',
                fontSize: 10,
                fontFamily: 'var(--font-family-mono)',
                color: 'var(--color-fg-secondary)',
              }}
            >
              {props.label as string}
            </span>
          )}
          {/* Property badges */}
          {badges.length > 0 && (
            <span style={{ display: 'flex', gap: 2 }}>
              {badges.map((b) => (
                <span
                  key={b}
                  style={{
                    fontSize: 9,
                    background: b === 'R' ? 'var(--color-state-error-border)' : 'var(--color-border-default)',
                    border: b === 'R' ? '1px solid #991b1b' : '1px solid var(--color-border-strong)',
                    borderRadius: 3,
                    padding: '0 3px',
                    color: b === 'R' ? 'var(--color-state-error-fg)' : 'var(--color-fg-secondary)',
                    fontFamily: 'var(--font-family-mono)',
                    fontWeight: 600,
                  }}
                >
                  {b}
                </span>
              ))}
            </span>
          )}
          {/* Tooltip on hover */}
          {hovered && data && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginTop: 6,
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-strong)',
                borderRadius: 4,
                padding: '6px 10px',
                fontSize: 11,
                fontFamily: 'var(--font-family-mono)',
                color: 'var(--color-fg-primary)',
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                zIndex: 'var(--z-dropdown)' as unknown as number,
              }}
            >
              <div style={{ marginBottom: 2 }}>
                <span style={{ color: 'var(--color-fg-secondary)' }}>slot: </span>
                <span>{data.slotName}</span>
              </div>
              <div style={{ marginBottom: 2 }}>
                <span style={{ color: 'var(--color-fg-secondary)' }}>range: </span>
                <span style={{ color: 'var(--color-state-success-fg)' }}>{data.range}</span>
              </div>
              {badges.length > 0 && (
                <div>
                  <span style={{ color: 'var(--color-fg-secondary)' }}>flags: </span>
                  <span style={{ color: 'var(--color-state-warning)' }}>{badges.join(', ')}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

// ── is_a edge ─────────────────────────────────────────────────────────────────
// Solid line, UML hollow triangle. Edge source=parent so markerStart places
// the triangle at the parent (UML convention: triangle points at parent).
export const IsAEdge = memo(function IsAEdge(props: EdgeProps) {
  const { path, labelX, labelY } = edgePath(props);
  return (
    <>
      <BaseEdge
        path={path}
        markerStart={props.markerStart ?? 'url(#arrow-hollow-start)'}
        style={{ stroke: 'var(--color-accent-hover)', strokeWidth: 2 }}
      />
      <EdgeLabel x={labelX} y={labelY} label={props.label as string | undefined} />
    </>
  );
});

// ── mixin edge ────────────────────────────────────────────────────────────────
// Dashed line, hollow triangle at the mixin parent (same convention as is_a).
export const MixinEdge = memo(function MixinEdge(props: EdgeProps) {
  const { path, labelX, labelY } = edgePath(props);
  return (
    <>
      <BaseEdge
        path={path}
        markerStart={props.markerStart ?? 'url(#arrow-hollow-start)'}
        style={{ stroke: 'var(--color-edge-mixin)', strokeWidth: 1.5, strokeDasharray: '6 3' }}
      />
      <EdgeLabel x={labelX} y={labelY} label={props.label as string | undefined} />
    </>
  );
});

// ── union_of edge ─────────────────────────────────────────────────────────────
// Dotted line, no arrowhead.
export const UnionOfEdge = memo(function UnionOfEdge(props: EdgeProps) {
  const { path, labelX, labelY } = edgePath(props);
  return (
    <>
      <BaseEdge
        path={path}
        style={{ stroke: 'var(--color-edge-union)', strokeWidth: 1.5, strokeDasharray: '2 4' }}
      />
      <EdgeLabel x={labelX} y={labelY} label={props.label as string | undefined} />
    </>
  );
});

// ── SVG marker defs ───────────────────────────────────────────────────────────
// Drop this component once inside <ReactFlow> (or its parent) via a children
// prop wrapping an <svg> element that ReactFlow renders.

export function EdgeMarkerDefs() {
  return (
    <svg style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0 }}>
      <defs>
        {/* Filled arrowhead for range edges */}
        <marker
          id="arrow-filled"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" style={{ fill: 'var(--color-state-success)' }} />
        </marker>

        {/* Hollow triangle arrowhead for is_a / mixin edges (markerEnd usage) */}
        <marker
          id="arrow-hollow"
          markerWidth="12"
          markerHeight="10"
          refX="10"
          refY="5"
          orient="auto"
        >
          <polygon
            points="0 0, 10 5, 0 10"
            style={{ fill: 'none', stroke: 'var(--color-accent-hover)', strokeWidth: 1.5 }}
          />
        </marker>

        {/* Hollow triangle for markerStart on is_a / mixin edges (source=parent).
            auto-start-reverse makes the triangle body extend away from the node,
            so it is visible in the space between parent and child. */}
        <marker
          id="arrow-hollow-start"
          markerWidth="12"
          markerHeight="10"
          refX="10"
          refY="5"
          orient="auto-start-reverse"
        >
          <polygon
            points="0 0, 10 5, 0 10"
            style={{ fill: 'none', stroke: 'var(--color-accent-hover)', strokeWidth: 1.5 }}
          />
        </marker>
      </defs>
    </svg>
  );
}

// ── Edge type map ─────────────────────────────────────────────────────────────
export const edgeTypes = {
  range: RangeEdge,
  is_a: IsAEdge,
  mixin: MixinEdge,
  union_of: UnionOfEdge,
} as const;

export type LinkMLEdgeType = keyof typeof edgeTypes;

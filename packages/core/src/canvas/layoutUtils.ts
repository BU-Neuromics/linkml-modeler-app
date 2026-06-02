import type { CanvasLayout } from '../model/index.js';
import type { ViewDefinition, ViewLayout } from '../io/editorManifest.js';
import type { FocusMode } from '../store/slices/canvasSlice.js';

/**
 * Compute the effective node-position layout for the canvas given what is
 * currently active (a named view, a subset focus, or neither).
 *
 * Precedence mirrors displayNodes: activeViewId > subset focusMode > schema.
 * Falls back to `schemaLayout` when the active view/subset has no stored layout
 * yet — this seeds it correctly and prevents grid-scatter on first activation.
 *
 * Pass `dragOverlay` (empty object when idle) to merge live drag positions on
 * top of the base without touching the stored layout.
 *
 * Pure function — no Zustand, no React.
 */
export function selectEffectiveLayout(
  schemaLayout: CanvasLayout,
  activeViewId: string | null,
  views: ViewDefinition[],
  focusMode: FocusMode | null,
  subsetLayouts: Record<string, ViewLayout>,
  dragOverlay: Record<string, { x: number; y: number }>
): CanvasLayout {
  let base: CanvasLayout;

  if (activeViewId) {
    const view = views.find((v) => v.id === activeViewId);
    const vLayout = view?.layout;
    base = vLayout
      ? {
          nodes: vLayout.nodes,
          viewport: vLayout.viewport ?? schemaLayout.viewport,
          labels: schemaLayout.labels,
        }
      : schemaLayout;
  } else if (focusMode?.type === 'subset') {
    const sLayout = subsetLayouts[focusMode.subsetName];
    base = sLayout
      ? {
          nodes: sLayout.nodes,
          viewport: sLayout.viewport ?? schemaLayout.viewport,
          labels: schemaLayout.labels,
        }
      : schemaLayout;
  } else {
    base = schemaLayout;
  }

  if (Object.keys(dragOverlay).length === 0) return base;
  return {
    ...base,
    nodes: { ...base.nodes, ...dragOverlay },
  };
}

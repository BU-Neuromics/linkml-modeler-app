/**
 * SchemaCanvas — main ReactFlow canvas component for LinkML schema visualization.
 *
 * M4 additions:
 * - Node click → setActiveEntity (opens PropertiesPanel)
 * - onConnect → create is_a edge (drag handle-to-handle)
 * - Canvas context menu → Add Class / Add Enum
 * - Node double-click → collapse/expand
 * - Delete key → delete selected nodes with confirmation
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  EdgeTypes,
  MiniMap,
  NodeTypes,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  OnSelectionChangeParams,
  applyNodeChanges,
  applyEdgeChanges,
  Node,
  useReactFlow,
  ReactFlowProvider,
  XYPosition,
} from 'reactflow';
import 'reactflow/dist/style.css';

import ClassNode from './ClassNode.js';
import EnumNode from './EnumNode.js';
import LabelNode from './LabelNode.js';
import { ImportSourceOverlay } from './ImportSourceOverlay.js';
import { Diamond, Hexagon, Plus } from '../ui/icons/index.js';
import { edgeTypes, EdgeMarkerDefs } from './edges.js';
import { deriveGraph } from './deriveGraph.js';
import { runAutoLayout } from './autoLayout.js';
import { useAppStore } from '../store/index.js';
import { usePlatform } from '../platform/PlatformContext.js';
import { collectReferencedImportedEntities } from '../io/importResolver.js';
import { buildManifestData, writeEditorManifest } from '../io/editorManifest.js';
import { selectEffectiveLayout } from './layoutUtils.js';
import type { CanvasLayout, TextLabel } from '../model/index.js';
import { emptyClassDefinition, emptyEnumDefinition } from '../model/index.js';
import {
  buildAdjacency,
  getAncestors,
  getDescendants,
  getDirectNeighbors,
  getNHopNeighbors,
  nodeIdToEntityName,
  applyOp,
} from './selectionOps.js';

// ── CSS token reader (for SVG/canvas contexts that require concrete color values) ──
function cssToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ── Node type registry ────────────────────────────────────────────────────────
// Cast required: ReactFlow 11 types predate React 19's expanded ReactNode (bigint)
const nodeTypes = {
  classNode: ClassNode,
  enumNode: EnumNode,
  labelNode: LabelNode,
} as unknown as NodeTypes;

// ── Context menu ──────────────────────────────────────────────────────────────
interface ContextMenu {
  x: number;
  y: number;
  canvasPos: XYPosition;
  nodeId?: string;
  nodeType?: string;
}

function CanvasContextMenu({
  menu,
  onClose,
  onAddClass,
  onAddEnum,
  onAddLabel,
  onDeleteNode,
  subsets,
  onAddToSubset,
  onRemoveFromSubset,
  entitySubsets,
}: {
  menu: ContextMenu;
  onClose: () => void;
  onAddClass: (pos: XYPosition) => void;
  onAddEnum: (pos: XYPosition) => void;
  onAddLabel: (pos: XYPosition) => void;
  onDeleteNode: (nodeId: string) => void;
  subsets: string[];
  onAddToSubset: (nodeId: string, subsetName: string) => void;
  onRemoveFromSubset: (nodeId: string, subsetName: string) => void;
  entitySubsets: string[];
}) {
  const [subsetMenuOpen, setSubsetMenuOpen] = React.useState<'add' | 'remove' | null>(null);
  const isClass = menu.nodeType === 'classNode';
  const isEnum = menu.nodeType === 'enumNode';
  const canEditSubsets = (isClass || isEnum) && subsets.length > 0;
  const addable = subsets.filter((s) => !entitySubsets.includes(s));
  const removable = entitySubsets;
  return (
    <div
      style={{
        ...ctxStyles.menu,
        left: menu.x,
        top: menu.y,
      }}
      onMouseLeave={() => { setSubsetMenuOpen(null); onClose(); }}
    >
      {menu.nodeId ? (
        <>
          <div style={ctxStyles.item} onClick={() => { onDeleteNode(menu.nodeId!); onClose(); }}>
            🗑 Delete {menu.nodeType === 'enumNode' ? 'enum' : menu.nodeType === 'labelNode' ? 'label' : 'class'}
          </div>
          {canEditSubsets && addable.length > 0 && (
            <div style={ctxStyles.submenuHost}>
              <div
                style={ctxStyles.item}
                onMouseEnter={() => setSubsetMenuOpen('add')}
              >
                <span style={{ marginRight: 6 }}>⊂</span> Add to subset ▸
              </div>
              {subsetMenuOpen === 'add' && (
                <div style={ctxStyles.submenu}>
                  {addable.map((sn) => (
                    <div
                      key={sn}
                      style={ctxStyles.item}
                      onClick={() => { onAddToSubset(menu.nodeId!, sn); onClose(); }}
                    >
                      {sn}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {canEditSubsets && removable.length > 0 && (
            <div style={ctxStyles.submenuHost}>
              <div
                style={ctxStyles.item}
                onMouseEnter={() => setSubsetMenuOpen('remove')}
              >
                <span style={{ marginRight: 6 }}>⊄</span> Remove from subset ▸
              </div>
              {subsetMenuOpen === 'remove' && (
                <div style={ctxStyles.submenu}>
                  {removable.map((sn) => (
                    <div
                      key={sn}
                      style={ctxStyles.item}
                      onClick={() => { onRemoveFromSubset(menu.nodeId!, sn); onClose(); }}
                    >
                      {sn}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={ctxStyles.item} onClick={() => { onAddClass(menu.canvasPos); onClose(); }}>
            <Hexagon size={13} style={{ marginRight: 6 }} /> Add Class
          </div>
          <div style={ctxStyles.item} onClick={() => { onAddEnum(menu.canvasPos); onClose(); }}>
            <Diamond size={13} style={{ marginRight: 6 }} /> Add Enum
          </div>
          <div style={ctxStyles.item} onClick={() => { onAddLabel(menu.canvasPos); onClose(); }}>
            <span style={{ marginRight: 6, fontSize: 13 }}>T</span> Add Label
          </div>
        </>
      )}
    </div>
  );
}

const ctxStyles: Record<string, React.CSSProperties> = {
  menu: {
    position: 'fixed',
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-default)',
    borderRadius: 6,
    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
    zIndex: 'var(--z-modal)' as unknown as number,
    minWidth: 160,
    overflow: 'visible',
  },
  item: {
    padding: '8px 14px',
    fontSize: 13,
    color: 'var(--color-fg-primary)',
    cursor: 'pointer',
    fontFamily: 'var(--font-family-mono)',
    userSelect: 'none',
    display: 'flex',
    alignItems: 'center',
  },
  submenuHost: {
    position: 'relative',
  },
  submenu: {
    position: 'absolute',
    left: '100%',
    top: 0,
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-default)',
    borderRadius: 6,
    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
    minWidth: 140,
    zIndex: 1,
    overflow: 'hidden',
  },
};

// ── Delete confirmation dialog ────────────────────────────────────────────────
function DeleteConfirmDialog({
  entityName,
  entityType,
  onConfirm,
  onCancel,
}: {
  entityName: string;
  entityType: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={dlgStyles.overlay}>
      <div style={dlgStyles.dialog}>
        <p style={dlgStyles.message}>
          Delete {entityType} <strong style={{ color: 'var(--color-state-error)' }}>{entityName}</strong>?
        </p>
        <p style={dlgStyles.hint}>This action cannot be undone after the history limit.</p>
        <div style={dlgStyles.actions}>
          <button style={dlgStyles.cancel} onClick={onCancel}>
            Cancel
          </button>
          <button style={dlgStyles.confirm} onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

const dlgStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  },
  dialog: {
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-default)',
    borderRadius: 8,
    padding: '20px 24px',
    width: 340,
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  },
  message: {
    margin: '0 0 8px',
    fontSize: 14,
    color: 'var(--color-fg-primary)',
    fontFamily: 'var(--font-family-mono)',
  },
  hint: {
    margin: '0 0 16px',
    fontSize: 11,
    color: 'var(--color-fg-muted)',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
  },
  cancel: {
    background: 'transparent',
    border: '1px solid var(--color-border-default)',
    color: 'var(--color-fg-secondary)',
    borderRadius: 4,
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: 'var(--font-family-mono)',
  },
  confirm: {
    background: 'var(--color-state-error-border)',
    border: '1px solid var(--color-state-error-bg)',
    color: 'var(--color-state-error-fg)',
    borderRadius: 4,
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: 'var(--font-family-mono)',
    fontWeight: 600,
  },
};

// ── Inner canvas component ────────────────────────────────────────────────────
function SchemaCanvasInner() {
  const { fitView, screenToFlowPosition } = useReactFlow();
  const platform = usePlatform();

  // Zustand store
  const activeProject = useAppStore((s) => s.activeProject);
  const activeSchemaId = useAppStore((s) => s.activeSchemaId);
  const setNodes = useAppStore((s) => s.setNodes);
  const setEdges = useAppStore((s) => s.setEdges);
  const updateNodePosition = useAppStore((s) => s.updateNodePosition);
  const setViewport = useAppStore((s) => s.setViewport);
  const toggleNodeCollapsed = useAppStore((s) => s.toggleNodeCollapsed);
  const storeNodes = useAppStore((s) => s.nodes);
  const storeEdges = useAppStore((s) => s.edges);
  const viewport = useAppStore((s) => s.viewport);
  const focusMode = useAppStore((s) => s.focusMode);
  const views = useAppStore((s) => s.views);
  const activeViewId = useAppStore((s) => s.activeViewId);
  const focusNodeRequest = useAppStore((s) => s.focusNodeRequest);
  const requestFocusNode = useAppStore((s) => s.requestFocusNode);
  const hiddenSchemaIds = useAppStore((s) => s.hiddenSchemaIds);
  const updateCanvasLayout = useAppStore((s) => s.updateCanvasLayout);
  const setSelection = useAppStore((s) => s.setSelection);
  const selectedNodeIds = useAppStore((s) => s.selectedNodeIds);
  const setActiveEntity = useAppStore((s) => s.setActiveEntity);
  const clearActiveEntity = useAppStore((s) => s.clearActiveEntity);
  const activeEntity = useAppStore((s) => s.activeEntity);
  const hiddenEdgeTypes = useAppStore((s) => s.hiddenEdgeTypes);
  const globalRangeEdgesMode = useAppStore((s) => s.globalRangeEdgesMode);
  const updateViewLayout = useAppStore((s) => s.updateViewLayout);
  const subsetLayouts = useAppStore((s) => s.subsetLayouts);
  const updateSubsetLayout = useAppStore((s) => s.updateSubsetLayout);
  const highlightOnHover = useAppStore((s) => s.highlightOnHover);
  const highlightOnSelection = useAppStore((s) => s.highlightOnSelection);
  const groupByImportSource = useAppStore((s) => s.groupByImportSource);
  const hopDimmingEnabled = useAppStore((s) => s.hopDimmingEnabled);
  const hopDimmingN = useAppStore((s) => s.hopDimmingN);

  // Schema mutations
  const addClass = useAppStore((s) => s.addClass);
  const deleteClass = useAppStore((s) => s.deleteClass);
  const addEnum = useAppStore((s) => s.addEnum);
  const deleteEnum = useAppStore((s) => s.deleteEnum);
  const updateClass = useAppStore((s) => s.updateClass);
  const autoAddImportForRange = useAppStore((s) => s.autoAddImportForRange);

  // Subset mutations (A4)
  const addEntityToSubset = useAppStore((s) => s.addEntityToSubset);
  const removeEntityFromSubset = useAppStore((s) => s.removeEntityFromSubset);

  // Label mutations
  const addLabelToCanvas = useAppStore((s) => s.addLabelToCanvas);
  const updateLabelInCanvas = useAppStore((s) => s.updateLabelInCanvas);
  const deleteLabelFromCanvas = useAppStore((s) => s.deleteLabelFromCanvas);

  // Local state
  const [localLayout, setLocalLayout] = useState<CanvasLayout>({
    nodes: {},
    viewport: { x: 0, y: 0, zoom: 1 },
  });
  const nodeDragOverlayRef = useRef<Record<string, { x: number; y: number }>>({});
  const [nodeDragOverlay, setNodeDragOverlay] = useState<Record<string, { x: number; y: number }>>({});
  const layoutRanRef = useRef(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [highlightPinnedNodeId, setHighlightPinnedNodeId] = useState<string | null>(null);

  // Refs for manifest writing — always up to date, no closure staleness
  const localLayoutRef = useRef(localLayout);
  const manifestWriteStateRef = useRef({ activeProject, activeSchemaId, hiddenSchemaIds, platform, views, activeViewId, subsetLayouts });
  const manifestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useLayoutEffect(() => {
    manifestWriteStateRef.current = { activeProject, activeSchemaId, hiddenSchemaIds, platform, views, activeViewId, subsetLayouts };
  }, [activeProject, activeSchemaId, hiddenSchemaIds, platform, views, activeViewId, subsetLayouts]);

  // Save layout to store when active schema changes (before the new schema loads)
  const prevActiveSchemaIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prevId = prevActiveSchemaIdRef.current;
    if (prevId && prevId !== activeSchemaId) {
      updateCanvasLayout(prevId, localLayoutRef.current);
    }
    prevActiveSchemaIdRef.current = activeSchemaId ?? null;
  }, [activeSchemaId, updateCanvasLayout]);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ name: string; type: 'class' | 'enum' } | null>(null);

  // Defense-in-depth: the drag overlay is global and selectEffectiveLayout merges
  // it onto whatever base is active, including the schema. A drag never spans a
  // context switch, so any overlay surviving an activeView/focus change is stale —
  // drop it so it can never paint onto the next context's layout (#105).
  useEffect(() => {
    if (Object.keys(nodeDragOverlayRef.current).length > 0) {
      nodeDragOverlayRef.current = {};
      setNodeDragOverlay({});
    }
  }, [activeViewId, focusMode]);

  const activeSchemaFile = useMemo(
    () => activeProject?.schemas.find((s) => s.id === activeSchemaId),
    [activeProject, activeSchemaId]
  );

  const isReadOnly = activeSchemaFile?.isReadOnly ?? false;

  // Subset names for context menu (A4)
  const activeSubsets = useMemo(
    () => (activeSchemaFile && !isReadOnly ? Object.keys(activeSchemaFile.schema.subsets) : []),
    [activeSchemaFile, isReadOnly]
  );

  // Derive labels: store provides text/metadata; labelDragPositions overrides positions during active drags.
  // No effect needed — useMemo reacts to store and drag state changes automatically.
  const storeLabels = activeSchemaFile?.canvasLayout.labels;
  const [labelDragPositions, setLabelDragPositions] = useState<Record<string, { x: number; y: number }>>({});
  const effectiveLabels = useMemo(() => {
    const labels = storeLabels ?? [];
    if (Object.keys(labelDragPositions).length === 0) return labels;
    return labels.map((l) => (labelDragPositions[l.id] ? { ...l, ...labelDragPositions[l.id] } : l));
  }, [storeLabels, labelDragPositions]);

  // Keep localLayoutRef current including effective labels for manifest writes and schema-switch commits.
  useLayoutEffect(() => {
    localLayoutRef.current = { ...localLayout, labels: effectiveLabels };
  }, [localLayout, effectiveLabels]);

  // Collect only referenced imported entities (not all entities from imported schemas)
  const ghostEntities = useMemo(
    () =>
      activeSchemaFile && activeProject
        ? collectReferencedImportedEntities(activeSchemaFile, activeProject.schemas)
        : [],
    [activeSchemaFile, activeProject]
  );

  // Merge schema-level slots from all loaded schemas for cross-schema slot resolution
  const allSchemaSlots = useMemo(() => {
    const merged: Record<string, import('../model/index.js').SlotDefinition> = {};
    for (const sf of activeProject?.schemas ?? []) {
      Object.assign(merged, sf.schema.slots ?? {});
    }
    return merged;
  }, [activeProject?.schemas]);

  // Per-view range-edges override; falls back to global setting (B1)
  const effectiveRangeEdgesMode = useMemo(() => {
    const activeView = views.find((v) => v.id === activeViewId);
    return activeView?.edgeFilters?.rangeEdges ?? globalRangeEdgesMode;
  }, [views, activeViewId, globalRangeEdgesMode]);

  // Effective node layout: view or subset layout when one is active, schema layout otherwise
  const effectiveLayout = useMemo(
    () =>
      selectEffectiveLayout(localLayout, activeViewId, views, focusMode, subsetLayouts, nodeDragOverlay),
    [localLayout, activeViewId, views, focusMode, subsetLayouts, nodeDragOverlay]
  );

  // Derive graph (imported entities rendered as ordinary flat nodes)
  const { nodes: derivedNodes, edges: derivedEdges } = useMemo(() => {
    if (!activeSchemaFile) return { nodes: [], edges: [] };
    return deriveGraph(activeSchemaFile.schema, { ...effectiveLayout, labels: effectiveLabels }, {}, ghostEntities, allSchemaSlots, hiddenEdgeTypes, effectiveRangeEdgesMode);
  }, [activeSchemaFile, ghostEntities, effectiveLayout, effectiveLabels, allSchemaSlots, hiddenEdgeTypes, effectiveRangeEdgesMode]);

  useEffect(() => {
    setNodes(derivedNodes);
    setEdges(derivedEdges);
  }, [derivedNodes, derivedEdges, setNodes, setEdges]);

  // Auto-layout on first load
  useEffect(() => {
    if (!activeSchemaFile || layoutRanRef.current) return;
    const hasLayoutData = Object.keys(activeSchemaFile.canvasLayout.nodes).length > 0;
    layoutRanRef.current = true;
    if (hasLayoutData) {
      void Promise.resolve(activeSchemaFile.canvasLayout).then(setLocalLayout);
    } else {
      void runAutoLayout(activeSchemaFile.schema, {}, ghostEntities, hiddenEdgeTypes, effectiveRangeEdgesMode).then((layout) => {
        setLocalLayout(layout);
        setTimeout(() => fitView({ padding: 0.1, duration: 400 }), 100);
      });
    }
  }, [activeSchemaFile, ghostEntities, hiddenEdgeTypes, effectiveRangeEdgesMode, fitView]);

  useEffect(() => {
    layoutRanRef.current = false;
  }, [activeSchemaId]);

  // Re-layout when new imported entities appear that have no saved position
  const prevImportedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!activeSchemaFile || ghostEntities.length === 0) {
      prevImportedIdsRef.current = new Set();
      return;
    }
    const currentIds = new Set(ghostEntities.map((e) => e.name));
    const prevIds = prevImportedIdsRef.current;
    const hasNew = [...currentIds].some((id) => !prevIds.has(id));
    prevImportedIdsRef.current = currentIds;
    if (!hasNew) return;

    // Check if any new imported nodes lack saved layout positions
    const hasUnsaved = [...currentIds].some(
      (id) => !prevIds.has(id) && !localLayoutRef.current.nodes[id]
    );
    if (!hasUnsaved) return;

    // Re-run auto-layout to incorporate the new imported nodes
    runAutoLayout(activeSchemaFile.schema, {}, ghostEntities, hiddenEdgeTypes, effectiveRangeEdgesMode).then((layout) => {
      // Merge: keep existing user-adjusted positions, add new imported positions
      setLocalLayout((prev) => ({
        nodes: { ...layout.nodes, ...prev.nodes },
        viewport: prev.viewport,
      }));
      setTimeout(() => fitView({ padding: 0.1, duration: 400 }), 150);
    });
  }, [activeSchemaFile, ghostEntities, hiddenEdgeTypes, effectiveRangeEdgesMode, fitView]);

  // Zoom to node when a focus request is pending
  useEffect(() => {
    if (!focusNodeRequest) return;
    // Try plain id first, then ghost__ prefix (for chips that reference imported entities)
    const node = storeNodes.find((n) => n.id === focusNodeRequest)
      ?? storeNodes.find((n) => n.id === `ghost__${focusNodeRequest}`);
    if (node) {
      fitView({ nodes: [{ id: node.id }], padding: 0.4, duration: 400, maxZoom: 1.5 });
      requestFocusNode(null);
    }
    // If node not found yet (e.g., schema is still switching), keep request pending
  }, [focusNodeRequest, storeNodes, fitView, requestFocusNode]);

  // Debounced manifest write — stable callback, reads latest values via ref
  const scheduleManifestWrite = useCallback(() => {
    if (manifestTimerRef.current) clearTimeout(manifestTimerRef.current);
    manifestTimerRef.current = setTimeout(() => {
      const { activeProject, activeSchemaId, hiddenSchemaIds, platform, views, activeViewId, subsetLayouts } = manifestWriteStateRef.current;
      if (!activeProject?.rootPath) return;
      const manifest = buildManifestData(activeProject, activeSchemaId, localLayoutRef.current, hiddenSchemaIds, views, activeViewId, subsetLayouts);
      writeEditorManifest(platform, activeProject.rootPath, manifest);
    }, 1000);
  }, []);

  const handleAutoLayout = useCallback(async () => {
    if (!activeSchemaFile) return;
    const layout = await runAutoLayout(activeSchemaFile.schema, {}, ghostEntities, hiddenEdgeTypes, effectiveRangeEdgesMode);
    if (activeViewId) {
      updateViewLayout(activeViewId, { nodes: layout.nodes, viewport: layout.viewport });
    } else if (focusMode?.type === 'subset') {
      updateSubsetLayout(focusMode.subsetName, { nodes: layout.nodes, viewport: layout.viewport });
    } else {
      setLocalLayout(layout);
    }
    setTimeout(() => fitView({ padding: 0.1, duration: 400 }), 100);
    scheduleManifestWrite();
  }, [activeSchemaFile, ghostEntities, hiddenEdgeTypes, effectiveRangeEdgesMode, fitView, scheduleManifestWrite, activeViewId, views, focusMode, subsetLayouts, updateViewLayout, updateSubsetLayout]);

  // ── ReactFlow event handlers ──────────────────────────────────────────────

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      setNodes(applyNodeChanges(changes, storeNodes) as typeof storeNodes);
      let positionChanged = false;
      for (const change of changes) {
        if (change.type !== 'position') continue;

        // Label drags persist directly to the schema's label store.
        if (change.id.startsWith('label__')) {
          if (!change.position) continue;
          const labelId = change.id.slice('label__'.length);
          setLabelDragPositions((prev) => ({
            ...prev,
            [labelId]: { x: change.position!.x, y: change.position!.y },
          }));
          // Commit final position to store on drag end, then clear local drag state
          if (!change.dragging && activeSchemaId) {
            updateLabelInCanvas(activeSchemaId, labelId, { x: change.position!.x, y: change.position!.y });
            setLabelDragPositions((prev) => {
              const next = { ...prev };
              delete next[labelId];
              return next;
            });
          }
          positionChanged = true;
          continue;
        }

        const isViewActive = !!activeViewId;
        const isSubsetActive = !isViewActive && focusMode?.type === 'subset';

        // Accumulate the live position while a position payload is present.
        if (change.position) {
          if (isViewActive || isSubsetActive) {
            // View/subset drags go to a transient overlay; committed on drag end.
            nodeDragOverlayRef.current = {
              ...nodeDragOverlayRef.current,
              [change.id]: { x: change.position.x, y: change.position.y },
            };
            setNodeDragOverlay({ ...nodeDragOverlayRef.current });
          } else {
            // Plain schema drag — update the base layout directly.
            setLocalLayout((prev) => ({
              ...prev,
              nodes: {
                ...prev.nodes,
                [change.id]: { x: change.position!.x, y: change.position!.y },
              },
            }));
            updateNodePosition(change.id, change.position.x, change.position.y);
          }
          positionChanged = true;
        }

        // Commit the overlay to the active view/subset on drag end.
        // ReactFlow's terminal drag-stop change carries `dragging: false` with
        // NO position, so this must NOT be gated on `change.position` — otherwise
        // the overlay is never committed and leaks onto the schema layout (#105).
        if (
          change.dragging === false &&
          (isViewActive || isSubsetActive) &&
          Object.keys(nodeDragOverlayRef.current).length > 0
        ) {
          const baseNodes = selectEffectiveLayout(
            localLayoutRef.current, activeViewId, views, focusMode, subsetLayouts, {}
          ).nodes;
          const fullLayout: import('../io/editorManifest.js').ViewLayout = {
            nodes: { ...baseNodes, ...nodeDragOverlayRef.current },
            viewport: localLayoutRef.current.viewport,
          };
          if (activeViewId) {
            updateViewLayout(activeViewId, fullLayout);
          } else if (focusMode?.type === 'subset') {
            updateSubsetLayout(focusMode.subsetName, fullLayout);
          }
          nodeDragOverlayRef.current = {};
          setNodeDragOverlay({});
          positionChanged = true;
        }
      }
      if (positionChanged) scheduleManifestWrite();
    },
    [storeNodes, setNodes, updateNodePosition, scheduleManifestWrite, activeSchemaId, updateLabelInCanvas, activeViewId, focusMode, views, subsetLayouts, updateViewLayout, updateSubsetLayout]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges(applyEdgeChanges(changes, storeEdges)),
    [storeEdges, setEdges]
  );

  const onMoveEnd = useCallback(
    (_event: unknown, vp: { x: number; y: number; zoom: number }) => {
      setViewport(vp);
      if (activeViewId) {
        const view = views.find((v) => v.id === activeViewId);
        const baseNodes = (view?.layout ?? localLayoutRef.current).nodes;
        updateViewLayout(activeViewId, { nodes: baseNodes, viewport: vp });
      } else if (focusMode?.type === 'subset') {
        const sLayout = subsetLayouts[focusMode.subsetName];
        const baseNodes = sLayout?.nodes ?? localLayoutRef.current.nodes;
        updateSubsetLayout(focusMode.subsetName, { nodes: baseNodes, viewport: vp });
      } else {
        setLocalLayout((prev) => ({ ...prev, viewport: vp }));
      }
      scheduleManifestWrite();
    },
    [setViewport, scheduleManifestWrite, activeViewId, views, focusMode, subsetLayouts, updateViewLayout, updateSubsetLayout]
  );

  // Node hover → hover highlight
  const onNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
    setHoveredNodeId(node.id);
  }, []);

  const onNodeMouseLeave = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  // Double-click → collapse/expand entity nodes (import groups and labels handle their own click)
  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type !== 'importGroupNode' && node.type !== 'labelNode') {
        toggleNodeCollapsed(node.id);
      }
    },
    [toggleNodeCollapsed]
  );

  // Single click on node → select entity + pin highlight
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const { entityType, entityId } = node.data as { entityType: string; entityId: string };
      if (entityType === 'class') {
        setActiveEntity({ type: 'class', className: entityId });
        setHighlightPinnedNodeId(node.id);
      } else if (entityType === 'enum') {
        setActiveEntity({ type: 'enum', enumName: entityId });
        setHighlightPinnedNodeId(node.id);
      } else if (entityType === 'label') {
        setActiveEntity({ type: 'label', labelId: entityId });
        setHighlightPinnedNodeId(null);
      }
      // importGroupNode clicks don't change the active entity
    },
    [setActiveEntity]
  );

  // Click on edge → select edge
  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: { id: string }) => {
      setActiveEntity({ type: 'edge', edgeId: edge.id });
    },
    [setActiveEntity]
  );

  // Rubber-band / multi-selection → update store selectedNodeIds
  const onSelectionChange = useCallback(
    ({ nodes, edges: selEdges }: OnSelectionChangeParams) => {
      setSelection(
        nodes.map((n) => n.id),
        selEdges.map((e) => e.id)
      );
    },
    [setSelection]
  );

  // Click on pane → deselect + clear sticky highlight
  const onPaneClick = useCallback(() => {
    clearActiveEntity();
    setContextMenu(null);
    setHighlightPinnedNodeId(null);
  }, [clearActiveEntity]);

  // Connect (drag handle-to-handle) → create is_a relationship
  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (isReadOnly || !activeSchemaId || !connection.source || !connection.target) return;
      autoAddImportForRange(activeSchemaId, connection.target);
      updateClass(activeSchemaId, connection.source, { isA: connection.target });
    },
    [isReadOnly, activeSchemaId, updateClass, autoAddImportForRange]
  );

  // Context menu on canvas (right-click)
  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      if (isReadOnly) return;
      const canvasPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setContextMenu({ x: event.clientX, y: event.clientY, canvasPos });
    },
    [isReadOnly, screenToFlowPosition]
  );

  // Context menu on node
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      if (isReadOnly) return;
      const canvasPos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        canvasPos,
        nodeId: node.id,
        nodeType: node.type,
      });
    },
    [isReadOnly, screenToFlowPosition]
  );

  // Add class at position
  const handleAddClass = useCallback(
    (pos: XYPosition) => {
      if (!activeSchemaId) return;
      const schema = activeProject?.schemas.find((s) => s.id === activeSchemaId)?.schema;
      if (!schema) return;

      let name = 'NewClass';
      let counter = 1;
      while (schema.classes[name]) name = `NewClass${counter++}`;

      addClass(activeSchemaId, emptyClassDefinition(name));
      setLocalLayout((prev) => ({
        ...prev,
        nodes: { ...prev.nodes, [name]: { x: pos.x, y: pos.y } },
      }));
      setActiveEntity({ type: 'class', className: name });
    },
    [activeSchemaId, activeProject, addClass, setActiveEntity]
  );

  // Add enum at position
  const handleAddEnum = useCallback(
    (pos: XYPosition) => {
      if (!activeSchemaId) return;
      const schema = activeProject?.schemas.find((s) => s.id === activeSchemaId)?.schema;
      if (!schema) return;

      let name = 'NewEnum';
      let counter = 1;
      while (schema.enums[name]) name = `NewEnum${counter++}`;

      addEnum(activeSchemaId, emptyEnumDefinition(name));
      setLocalLayout((prev) => ({
        ...prev,
        nodes: { ...prev.nodes, [name]: { x: pos.x, y: pos.y } },
      }));
      setActiveEntity({ type: 'enum', enumName: name });
    },
    [activeSchemaId, activeProject, addEnum, setActiveEntity]
  );

  // Add label at position
  const handleAddLabel = useCallback(
    (pos: XYPosition) => {
      if (!activeSchemaId) return;
      const id = crypto.randomUUID();
      const label: TextLabel = {
        id,
        text: 'Label',
        x: pos.x,
        y: pos.y,
        fontSize: 14,
        locked: false,
      };
      addLabelToCanvas(activeSchemaId, label);
      setActiveEntity({ type: 'label', labelId: id });
    },
    [activeSchemaId, addLabelToCanvas, setActiveEntity]
  );

  // Delete node from context menu
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      if (!activeSchemaId) return;
      // Label nodes have a 'label__' prefix
      if (nodeId.startsWith('label__')) {
        const labelId = nodeId.slice('label__'.length);
        deleteLabelFromCanvas(activeSchemaId, labelId);
        clearActiveEntity();
        return;
      }
      const schema = activeProject?.schemas.find((s) => s.id === activeSchemaId)?.schema;
      if (!schema) return;
      const type = nodeId in schema.classes ? 'class' : 'enum';
      setDeleteTarget({ name: nodeId, type });
    },
    [activeSchemaId, activeProject, deleteLabelFromCanvas, clearActiveEntity]
  );

  const confirmDelete = useCallback(() => {
    if (!deleteTarget || !activeSchemaId) return;
    if (deleteTarget.type === 'class') {
      deleteClass(activeSchemaId, deleteTarget.name);
    } else {
      deleteEnum(activeSchemaId, deleteTarget.name);
    }
    clearActiveEntity();
    setDeleteTarget(null);
  }, [deleteTarget, activeSchemaId, deleteClass, deleteEnum, clearActiveEntity]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isEditing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';

      // Undo/Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        (useAppStore as unknown as { temporal: { getState: () => { undo: () => void } } }).temporal.getState().undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        (useAppStore as unknown as { temporal: { getState: () => { redo: () => void } } }).temporal.getState().redo();
        return;
      }

      if (isEditing) return;

      // Delete selected entity
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!isReadOnly) {
          if (activeEntity?.type === 'class') {
            setDeleteTarget({ name: activeEntity.className, type: 'class' });
          } else if (activeEntity?.type === 'enum') {
            setDeleteTarget({ name: activeEntity.enumName, type: 'enum' });
          } else if (activeEntity?.type === 'label' && activeSchemaId) {
            deleteLabelFromCanvas(activeSchemaId, activeEntity.labelId);
            clearActiveEntity();
          }
        }
        return;
      }

      // Escape → deselect / exit focus mode / clear sticky highlight
      if (e.key === 'Escape') {
        clearActiveEntity();
        useAppStore.getState().setFocusMode(null);
        setHighlightPinnedNodeId(null);
        return;
      }

      // F → fit view
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        fitView({ padding: 0.1, duration: 400 });
        return;
      }

      // Ctrl+A → select all nodes
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setSelection(storeNodes.map((n) => n.id), []);
        return;
      }

      // A3 selection neighborhood shortcuts (only when selection is non-empty)
      if (selectedNodeIds.length > 0 && !e.ctrlKey && !e.metaKey) {
        if (e.key === 'n' || e.key === 'N' || e.key === 'a' || e.key === 'A' || e.key === 'd' || e.key === 'D') {
          const sf = activeProject?.schemas.find((s) => s.id === activeSchemaId);
          if (sf) {
            const ghosts = collectReferencedImportedEntities(sf, activeProject!.schemas);
            const kbGhostNames = new Set(ghosts.map((g) => g.name));
            const adj = buildAdjacency(sf.schema, kbGhostNames);
            const additive = e.shiftKey;
            e.preventDefault();
            let newIds: string[];
            if (e.key === 'n' || e.key === 'N') {
              newIds = applyOp(selectedNodeIds, kbGhostNames, (s) => getDirectNeighbors(adj, s, 'both'), additive);
            } else if (e.key === 'a' || e.key === 'A') {
              newIds = applyOp(selectedNodeIds, kbGhostNames, (s) => getAncestors(adj, s), additive);
            } else {
              newIds = applyOp(selectedNodeIds, kbGhostNames, (s) => getDescendants(adj, s), additive);
            }
            setSelection(newIds, []);
            return;
          }
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeEntity, clearActiveEntity, fitView, isReadOnly, storeNodes, setSelection, selectedNodeIds, activeSchemaId, activeProject, deleteLabelFromCanvas]);

  // Memoized adjacency map: nodeId → Set of connected edge IDs (for O(1) highlight lookup)
  const edgeNeighborMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const edge of storeEdges) {
      if (!map.has(edge.source)) map.set(edge.source, new Set());
      if (!map.has(edge.target)) map.set(edge.target, new Set());
      map.get(edge.source)!.add(edge.id);
      map.get(edge.target)!.add(edge.id);
    }
    return map;
  }, [storeEdges]);

  // B3: schema adjacency and hop-distance dimming
  const ghostEntityNames = useMemo(
    () => new Set(ghostEntities.map((e) => e.name)),
    [ghostEntities]
  );
  const schemaAdj = useMemo(() => {
    if (!hopDimmingEnabled || !activeSchemaFile) return null;
    return buildAdjacency(activeSchemaFile.schema, ghostEntityNames);
  }, [hopDimmingEnabled, activeSchemaFile, ghostEntityNames]);

  const hopCloseNodeIds = useMemo<Set<string> | null>(() => {
    if (!hopDimmingEnabled || !schemaAdj || selectedNodeIds.length === 0) return null;
    const entityNames = selectedNodeIds.map(nodeIdToEntityName);
    const seedSet = new Set(entityNames);
    const nearby = getNHopNeighbors(schemaAdj, seedSet, hopDimmingN, 'both');
    return new Set([...seedSet, ...nearby]);
  }, [hopDimmingEnabled, schemaAdj, selectedNodeIds, hopDimmingN]);

  // Active view member set — node IDs from the view that belong to the current active schema
  const activeViewMemberIds = useMemo<Set<string> | null>(() => {
    if (!activeViewId) return null;
    const view = views.find((v) => v.id === activeViewId);
    if (!view || !activeSchemaFile) return null;
    const schemaFilePath = activeSchemaFile.filePath;
    const ids = new Set<string>();
    for (const m of view.members) {
      if (m.schemaFilePath === schemaFilePath) ids.add(m.name);
    }
    return ids;
  }, [activeViewId, views, activeSchemaFile]);

  // Focus mode dimming (ephemeral — separate from persistent views)
  const visibleNodeIds = useMemo<Set<string> | null>(() => {
    if (!focusMode) return null;
    if (focusMode.type === 'selection') return new Set(focusMode.nodeIds);
    if (focusMode.type === 'subset' && activeSchemaFile) {
      const ids = new Set<string>();
      for (const [name, cls] of Object.entries(activeSchemaFile.schema.classes)) {
        if (cls.subsetOf?.includes(focusMode.subsetName)) ids.add(name);
      }
      return ids;
    }
    return null;
  }, [focusMode, activeSchemaFile]);

  const displayNodes: Node[] = useMemo(() => {
    // Use derivedNodes (not storeNodes) as the source so that this memo's reference
    // is stable between the cascade re-renders that fire after useStoreUpdater calls
    // setStoreState.  storeNodes is updated by a useEffect that writes derivedNodes
    // into Zustand; if displayNodes depended on storeNodes, that write would change
    // displayNodes, fire useStoreUpdater again, trigger ReactFlow's useReactFlow()
    // subscribers to re-render, which would update storeNodes again — an infinite loop
    // that React 19 detects as "Maximum update depth exceeded" and aborts with an error.
    // derivedNodes is only recomputed when effectiveLayout or schema data changes, so
    // it stays stable across the cascade, breaking the feedback.
    const selectedSet = new Set(selectedNodeIds);
    let needsUpdate = false;
    const mapped = derivedNodes.map((n) => {
      const want = selectedSet.has(n.id);
      if (!!n.selected === want) return n;
      needsUpdate = true;
      return { ...n, selected: want };
    });
    const withSelection = needsUpdate ? mapped : derivedNodes;
    // Active view: hard-filter to only members (completely remove non-members)
    if (activeViewMemberIds) {
      return withSelection.filter((n) => activeViewMemberIds.has(n.id));
    }
    // Focus mode: dim non-members (soft filter)
    if (visibleNodeIds) {
      return withSelection.map((n) => ({
        ...n,
        style: visibleNodeIds.has(n.id)
          ? n.style
          : { ...n.style, opacity: 0.3, pointerEvents: 'none' as const },
      }));
    }
    // B3: hop-distance dimming — dim nodes beyond N hops from selection
    if (hopCloseNodeIds) {
      return withSelection.map((n) => ({
        ...n,
        style: hopCloseNodeIds.has(n.id)
          ? n.style
          : { ...n.style, opacity: 0.2, filter: 'grayscale(1)', transition: 'opacity 0.15s, filter 0.15s' },
      }));
    }
    return withSelection;
  }, [derivedNodes, selectedNodeIds, activeViewMemberIds, visibleNodeIds, hopCloseNodeIds]);

  const displayEdges = useMemo(() => {
    // Active view: only show edges where both endpoints are members.
    // Hidden edge types are already excluded from storeEdges by deriveGraph.
    if (activeViewMemberIds) {
      return storeEdges.filter(
        (e) => activeViewMemberIds.has(e.source) && activeViewMemberIds.has(e.target)
      );
    }
    const filtered = storeEdges;

    // B3: hop-distance dimming — dim edges where neither endpoint is within N hops
    if (hopCloseNodeIds) {
      return filtered.map((edge) => {
        const isDimmed = !hopCloseNodeIds.has(edge.source) && !hopCloseNodeIds.has(edge.target);
        return {
          ...edge,
          style: { ...edge.style, opacity: isDimmed ? 0.1 : 1, filter: isDimmed ? 'grayscale(1)' : undefined, transition: 'opacity 0.15s, filter 0.15s' },
          data: { ...edge.data, dimmed: isDimmed },
        };
      });
    }

    // Selection (sticky) takes priority over hover
    let focusNodeId: string | null = null;
    if (highlightOnSelection && highlightPinnedNodeId) {
      focusNodeId = highlightPinnedNodeId;
    } else if (highlightOnHover && hoveredNodeId) {
      focusNodeId = hoveredNodeId;
    }

    if (!focusNodeId) return filtered;

    const neighborEdges = edgeNeighborMap.get(focusNodeId) ?? new Set<string>();
    return filtered.map((edge) => {
      const isDimmed = !neighborEdges.has(edge.id);
      return {
        ...edge,
        style: { ...edge.style, opacity: isDimmed ? 0.15 : 1, transition: 'opacity 0.15s' },
        data: { ...edge.data, dimmed: isDimmed },
      };
    });
  }, [storeEdges, hiddenEdgeTypes, activeViewMemberIds, highlightOnHover, highlightOnSelection, hoveredNodeId, highlightPinnedNodeId, edgeNeighborMap, hopCloseNodeIds]);

  // Empty state
  if (!activeSchemaFile) {
    return (
      <div style={styles.emptyState}>
        <div style={styles.emptyInner}>
          <p style={styles.emptyTitle}>No schema open</p>
          <p style={styles.emptyHint}>Open a project to see the canvas</p>
        </div>
      </div>
    );
  }

  return (
    <div id="lme-canvas-wrapper" style={styles.canvasWrapper} onClick={() => contextMenu && setContextMenu(null)}>
      <EdgeMarkerDefs />
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes as unknown as EdgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onMoveEnd={onMoveEnd}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        multiSelectionKeyCode="Shift"
        selectionOnDrag={true}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        defaultViewport={viewport}
        minZoom={0.05}
        maxZoom={2}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        proOptions={{ hideAttribution: false }}
        connectOnClick={false}
      >
        <Background color="#334155" gap={20} size={1} />
        {groupByImportSource && <ImportSourceOverlay />}
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            if ((n.data as { entityType: string }).entityType === 'enum') return cssToken('--color-enum');
            const d = n.data as { classDef?: { abstract?: boolean; mixin?: boolean } };
            if (d.classDef?.mixin) return cssToken('--color-class-mixin');
            if (d.classDef?.abstract) return cssToken('--color-class-abstract');
            return cssToken('--color-class-concrete');
          }}
          maskColor="rgba(0,0,0,0.6)"
          style={{ background: 'var(--color-bg-canvas)' }}
        />
      </ReactFlow>

      {/* Toolbar */}
      <div id="lme-canvas-toolbar" style={styles.toolbar}>
        {!isReadOnly && (
          <>
            <button
              id="lme-canvas-add-class"
              style={styles.toolbarBtn}
              onClick={() => handleAddClass({ x: 100, y: 100 })}
              title="Add Class"
            >
              <Hexagon size={13} style={{ marginRight: 4 }} /><Plus size={11} style={{ marginRight: 4 }} />Class
            </button>
            <button
              id="lme-canvas-add-enum"
              style={styles.toolbarBtn}
              onClick={() => handleAddEnum({ x: 400, y: 100 })}
              title="Add Enum"
            >
              <Diamond size={13} style={{ marginRight: 4 }} /><Plus size={11} style={{ marginRight: 4 }} />Enum
            </button>
          </>
        )}
        <button id="lme-canvas-layout" style={styles.toolbarBtn} onClick={handleAutoLayout} title="Auto Layout (Ctrl+Shift+L)">
          <Hexagon size={13} style={{ marginRight: 4 }} />Layout
        </button>
      </div>

      {/* Read-only banner */}
      {isReadOnly && (
        <div style={styles.readOnlyBanner}>
          Read Only — imported schema
        </div>
      )}

      {/* Focus mode banner */}
      {focusMode && (
        <div style={styles.focusBanner}>
          <span>
            Focus:{' '}
            {focusMode.type === 'subset'
              ? `subset "${focusMode.subsetName}"`
              : `${(focusMode as { nodeIds: string[] }).nodeIds.length} node(s)`}
          </span>
          <button
            style={styles.focusExitBtn}
            onClick={() => useAppStore.getState().setFocusMode(null)}
          >
            Exit focus
          </button>
        </div>
      )}

      {/* Active view banner */}
      {activeViewId && (() => {
        const view = views.find((v) => v.id === activeViewId);
        if (!view) return null;
        const memberCount = activeViewMemberIds?.size ?? 0;
        return (
          <div style={styles.viewBanner}>
            <span>View: <strong>{view.name}</strong> · {memberCount} member{memberCount !== 1 ? 's' : ''}</span>
            <button
              style={styles.focusExitBtn}
              onClick={() => { useAppStore.getState().setActiveViewId(null); scheduleManifestWrite(); }}
            >
              Exit view
            </button>
          </div>
        );
      })()}

      {/* Context menu */}
      {contextMenu && (
        <CanvasContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onAddClass={handleAddClass}
          onAddEnum={handleAddEnum}
          onAddLabel={handleAddLabel}
          onDeleteNode={handleDeleteNode}
          subsets={activeSubsets}
          entitySubsets={(() => {
            if (!contextMenu.nodeId || !activeSchemaFile) return [];
            const schema = activeSchemaFile.schema;
            if (contextMenu.nodeType === 'classNode') return schema.classes[contextMenu.nodeId]?.subsetOf ?? [];
            if (contextMenu.nodeType === 'enumNode') return schema.enums[contextMenu.nodeId]?.subsetOf ?? [];
            return [];
          })()}
          onAddToSubset={(nodeId, subsetName) => {
            if (!activeSchemaId) return;
            const kind = contextMenu?.nodeType === 'enumNode' ? 'enum' : 'class';
            addEntityToSubset(activeSchemaId, nodeId, subsetName, kind);
          }}
          onRemoveFromSubset={(nodeId, subsetName) => {
            if (!activeSchemaId) return;
            const kind = contextMenu?.nodeType === 'enumNode' ? 'enum' : 'class';
            removeEntityFromSubset(activeSchemaId, nodeId, subsetName, kind);
          }}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <DeleteConfirmDialog
          entityName={deleteTarget.name}
          entityType={deleteTarget.type}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────
export function SchemaCanvas() {
  return (
    <ReactFlowProvider>
      <SchemaCanvasInner />
    </ReactFlowProvider>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  canvasWrapper: {
    position: 'relative',
    width: '100%',
    height: '100%',
    background: 'var(--color-bg-canvas)',
  },
  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    background: 'var(--color-bg-canvas)',
  },
  emptyInner: {
    textAlign: 'center',
    color: 'var(--color-border-strong)',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 600,
    margin: '0 0 8px',
    color: 'var(--color-fg-muted)',
  },
  emptyHint: {
    fontSize: 14,
    margin: 0,
  },
  toolbar: {
    position: 'absolute',
    top: 12,
    right: 12,
    display: 'flex',
    gap: 6,
    zIndex: 10,
  },
  toolbarBtn: {
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-default)',
    color: 'var(--color-fg-secondary)',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 12,
    fontFamily: 'var(--font-family-mono)',
    cursor: 'pointer',
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
    display: 'flex',
    alignItems: 'center',
  },
  toolbarSep: {
    width: 1,
    height: 24,
    background: 'var(--color-border-default)',
    alignSelf: 'center',
    flexShrink: 0,
  },
  readOnlyBanner: {
    position: 'absolute',
    top: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'var(--color-bg-surface-sunken)',
    border: '1px solid var(--color-border-strong)',
    borderRadius: 6,
    padding: '5px 14px',
    fontSize: 12,
    fontFamily: 'var(--font-family-mono)',
    color: 'var(--color-fg-muted)',
    zIndex: 10,
    pointerEvents: 'none' as const,
    letterSpacing: 0.5,
  },
  focusBanner: {
    position: 'absolute',
    top: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'var(--color-state-info-bg)',
    border: '1px solid var(--color-accent-active)',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 12,
    fontFamily: 'var(--font-family-mono)',
    color: 'var(--color-state-info-fg)',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    zIndex: 10,
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
  },
  viewBanner: {
    position: 'absolute',
    top: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-strong)',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 12,
    fontFamily: 'var(--font-family-mono)',
    color: 'var(--color-fg-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    zIndex: 10,
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
  },
  focusExitBtn: {
    background: 'transparent',
    border: '1px solid var(--color-border-focus)',
    color: 'var(--color-accent-hover)',
    borderRadius: 4,
    padding: '2px 8px',
    fontSize: 11,
    cursor: 'pointer',
  },
};

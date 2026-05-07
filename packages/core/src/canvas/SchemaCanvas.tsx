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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
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
import ImportGroupNode from './ImportGroupNode.js';
import { Diamond, Hexagon, Plus } from '../ui/icons/index.js';
import { edgeTypes, EdgeMarkerDefs } from './edges.js';
import { deriveGraph } from './deriveGraph.js';
import { runAutoLayout } from './autoLayout.js';
import { useAppStore } from '../store/index.js';
import { usePlatform } from '../platform/PlatformContext.js';
import { collectReferencedImportedEntities } from '../io/importResolver.js';
import { buildManifestData, writeEditorManifest } from '../io/editorManifest.js';
import type { CanvasLayout } from '../model/index.js';
import { emptyClassDefinition, emptyEnumDefinition } from '../model/index.js';

// ── CSS token reader (for SVG/canvas contexts that require concrete color values) ──
function cssToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ── Node type registry ────────────────────────────────────────────────────────
const nodeTypes: NodeTypes = {
  classNode: ClassNode,
  enumNode: EnumNode,
  importGroupNode: ImportGroupNode,
};

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
  onDeleteNode,
}: {
  menu: ContextMenu;
  onClose: () => void;
  onAddClass: (pos: XYPosition) => void;
  onAddEnum: (pos: XYPosition) => void;
  onDeleteNode: (nodeId: string) => void;
}) {
  return (
    <div
      style={{
        ...ctxStyles.menu,
        left: menu.x,
        top: menu.y,
      }}
      onMouseLeave={onClose}
    >
      {menu.nodeId ? (
        <>
          <div style={ctxStyles.item} onClick={() => { onDeleteNode(menu.nodeId!); onClose(); }}>
            🗑 Delete {menu.nodeType === 'enumNode' ? 'enum' : 'class'}
          </div>
        </>
      ) : (
        <>
          <div style={ctxStyles.item} onClick={() => { onAddClass(menu.canvasPos); onClose(); }}>
            <Hexagon size={13} style={{ marginRight: 6 }} /> Add Class
          </div>
          <div style={ctxStyles.item} onClick={() => { onAddEnum(menu.canvasPos); onClose(); }}>
            <Diamond size={13} style={{ marginRight: 6 }} /> Add Enum
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
    overflow: 'hidden',
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

// ── Edge-type toggle definitions ──────────────────────────────────────────────
const EDGE_TOGGLE_DEFS = [
  { type: 'range',    label: 'range',    color: 'var(--color-state-success)' },
  { type: 'is_a',     label: 'is_a',     color: 'var(--color-accent-hover)' },
  { type: 'mixin',    label: 'mixin',    color: 'var(--color-edge-mixin)' },
  { type: 'union_of', label: 'union_of', color: 'var(--color-edge-union)' },
] as const;

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
  const collapsedGroups = useAppStore((s) => s.collapsedGroups);
  const storeNodes = useAppStore((s) => s.nodes);
  const storeEdges = useAppStore((s) => s.edges);
  const viewport = useAppStore((s) => s.viewport);
  const focusMode = useAppStore((s) => s.focusMode);
  const focusNodeRequest = useAppStore((s) => s.focusNodeRequest);
  const requestFocusNode = useAppStore((s) => s.requestFocusNode);
  const hiddenSchemaIds = useAppStore((s) => s.hiddenSchemaIds);
  const updateCanvasLayout = useAppStore((s) => s.updateCanvasLayout);
  const setSelection = useAppStore((s) => s.setSelection);
  const setActiveEntity = useAppStore((s) => s.setActiveEntity);
  const clearActiveEntity = useAppStore((s) => s.clearActiveEntity);
  const activeEntity = useAppStore((s) => s.activeEntity);
  const hiddenEdgeTypes = useAppStore((s) => s.hiddenEdgeTypes);
  const toggleEdgeTypeVisibility = useAppStore((s) => s.toggleEdgeTypeVisibility);
  const highlightOnHover = useAppStore((s) => s.highlightOnHover);
  const highlightOnSelection = useAppStore((s) => s.highlightOnSelection);
  const setHighlightOnHover = useAppStore((s) => s.setHighlightOnHover);
  const setHighlightOnSelection = useAppStore((s) => s.setHighlightOnSelection);

  // Schema mutations
  const addClass = useAppStore((s) => s.addClass);
  const deleteClass = useAppStore((s) => s.deleteClass);
  const addEnum = useAppStore((s) => s.addEnum);
  const deleteEnum = useAppStore((s) => s.deleteEnum);
  const updateClass = useAppStore((s) => s.updateClass);
  const autoAddImportForRange = useAppStore((s) => s.autoAddImportForRange);

  // Local state
  const [localLayout, setLocalLayout] = useState<CanvasLayout>({
    nodes: {},
    viewport: { x: 0, y: 0, zoom: 1 },
  });
  const layoutRanRef = useRef(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [highlightPinnedNodeId, setHighlightPinnedNodeId] = useState<string | null>(null);

  // Refs for manifest writing — always up to date, no closure staleness
  const localLayoutRef = useRef(localLayout);
  localLayoutRef.current = localLayout;
  const manifestWriteStateRef = useRef({ activeProject, activeSchemaId, hiddenSchemaIds, platform });
  manifestWriteStateRef.current = { activeProject, activeSchemaId, hiddenSchemaIds, platform };
  const manifestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const activeSchemaFile = useMemo(
    () => activeProject?.schemas.find((s) => s.id === activeSchemaId),
    [activeProject, activeSchemaId]
  );

  const isReadOnly = activeSchemaFile?.isReadOnly ?? false;

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

  // Derive graph (with ghost nodes grouped by source schema)
  const { nodes: derivedNodes, edges: derivedEdges } = useMemo(() => {
    if (!activeSchemaFile) return { nodes: [], edges: [] };
    return deriveGraph(activeSchemaFile.schema, localLayout, {}, ghostEntities, collapsedGroups, allSchemaSlots);
  }, [activeSchemaFile, ghostEntities, localLayout, collapsedGroups, allSchemaSlots]);

  useEffect(() => {
    setNodes(derivedNodes);
    setEdges(derivedEdges);
  }, [derivedNodes, derivedEdges, setNodes, setEdges]);

  // Auto-layout on first load
  useEffect(() => {
    if (!activeSchemaFile || layoutRanRef.current) return;
    const hasLayoutData = Object.keys(activeSchemaFile.canvasLayout.nodes).length > 0;
    if (hasLayoutData) {
      setLocalLayout(activeSchemaFile.canvasLayout);
      layoutRanRef.current = true;
      return;
    }
    layoutRanRef.current = true;
    runAutoLayout(activeSchemaFile.schema, {}, ghostEntities).then((layout) => {
      setLocalLayout(layout);
      setTimeout(() => fitView({ padding: 0.1, duration: 400 }), 100);
    });
  }, [activeSchemaFile, ghostEntities, fitView]);

  useEffect(() => {
    layoutRanRef.current = false;
  }, [activeSchemaId]);

  // Re-layout when new ghost entities appear that have no saved position
  const prevGhostIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!activeSchemaFile || ghostEntities.length === 0) {
      prevGhostIdsRef.current = new Set();
      return;
    }
    const currentIds = new Set(ghostEntities.map((e) => `ghost__${e.name}`));
    const prevIds = prevGhostIdsRef.current;
    const hasNew = [...currentIds].some((id) => !prevIds.has(id));
    prevGhostIdsRef.current = currentIds;
    if (!hasNew) return;

    // Check if any new ghost nodes lack saved layout positions
    const hasUnsaved = [...currentIds].some(
      (id) => !prevIds.has(id) && !localLayoutRef.current.nodes[id]
    );
    if (!hasUnsaved) return;

    // Re-run auto-layout to incorporate the new ghost nodes
    runAutoLayout(activeSchemaFile.schema, {}, ghostEntities).then((layout) => {
      // Merge: keep existing user-adjusted positions, add new ghost positions
      setLocalLayout((prev) => ({
        nodes: { ...layout.nodes, ...prev.nodes },
        viewport: prev.viewport,
      }));
      setTimeout(() => fitView({ padding: 0.1, duration: 400 }), 150);
    });
  }, [activeSchemaFile, ghostEntities, fitView]);

  // Zoom to node when a focus request is pending
  useEffect(() => {
    if (!focusNodeRequest) return;
    const node = storeNodes.find((n) => n.id === focusNodeRequest);
    if (node) {
      fitView({ nodes: [{ id: focusNodeRequest }], padding: 0.4, duration: 400, maxZoom: 1.5 });
      requestFocusNode(null);
    }
    // If node not found yet (e.g., schema is still switching), keep request pending
  }, [focusNodeRequest, storeNodes, fitView, requestFocusNode]);

  // Debounced manifest write — stable callback, reads latest values via ref
  const scheduleManifestWrite = useCallback(() => {
    if (manifestTimerRef.current) clearTimeout(manifestTimerRef.current);
    manifestTimerRef.current = setTimeout(() => {
      const { activeProject, activeSchemaId, hiddenSchemaIds, platform } = manifestWriteStateRef.current;
      if (!activeProject?.rootPath) return;
      const manifest = buildManifestData(activeProject, activeSchemaId, localLayoutRef.current, hiddenSchemaIds);
      writeEditorManifest(platform, activeProject.rootPath, manifest);
    }, 1000);
  }, []);

  const handleAutoLayout = useCallback(async () => {
    if (!activeSchemaFile) return;
    const layout = await runAutoLayout(activeSchemaFile.schema, {}, ghostEntities);
    setLocalLayout(layout);
    setTimeout(() => fitView({ padding: 0.1, duration: 400 }), 100);
    scheduleManifestWrite();
  }, [activeSchemaFile, ghostEntities, fitView, scheduleManifestWrite]);

  // ── ReactFlow event handlers ──────────────────────────────────────────────

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      setNodes(applyNodeChanges(changes, storeNodes) as typeof storeNodes);
      let positionChanged = false;
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          setLocalLayout((prev) => ({
            ...prev,
            nodes: {
              ...prev.nodes,
              [change.id]: { x: change.position!.x, y: change.position!.y },
            },
            // Any node drag invalidates all ELK bend points (routing is now stale)
            edges: undefined,
          }));
          updateNodePosition(change.id, change.position.x, change.position.y);
          positionChanged = true;
        }
      }
      if (positionChanged) scheduleManifestWrite();
    },
    [storeNodes, setNodes, updateNodePosition, scheduleManifestWrite]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges(applyEdgeChanges(changes, storeEdges)),
    [storeEdges, setEdges]
  );

  const onMoveEnd = useCallback(
    (_event: unknown, vp: { x: number; y: number; zoom: number }) => {
      setViewport(vp);
      setLocalLayout((prev) => ({ ...prev, viewport: vp }));
      scheduleManifestWrite();
    },
    [setViewport, scheduleManifestWrite]
  );

  // Node hover → hover highlight
  const onNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
    setHoveredNodeId(node.id);
  }, []);

  const onNodeMouseLeave = useCallback(() => {
    setHoveredNodeId(null);
  }, []);

  // Double-click → collapse/expand entity nodes (import groups handle their own click)
  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type !== 'importGroupNode') {
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
      }
      // importGroupNode clicks don't change the pinned node
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
      // Ghost node IDs are prefixed with 'ghost__'; strip it to get the real class name
      const targetName = connection.target.startsWith('ghost__')
        ? connection.target.slice('ghost__'.length)
        : connection.target;
      autoAddImportForRange(activeSchemaId, targetName);
      updateClass(activeSchemaId, connection.source, { isA: targetName });
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

  // Delete node from context menu
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      if (!activeSchemaId) return;
      const schema = activeProject?.schemas.find((s) => s.id === activeSchemaId)?.schema;
      if (!schema) return;
      const type = nodeId in schema.classes ? 'class' : 'enum';
      setDeleteTarget({ name: nodeId, type });
    },
    [activeSchemaId, activeProject]
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
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeEntity, clearActiveEntity, fitView, storeNodes, setSelection]);

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

  // Focus mode dimming
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
    if (!visibleNodeIds) return storeNodes;
    return storeNodes.map((n) => ({
      ...n,
      style: visibleNodeIds.has(n.id)
        ? n.style
        : { ...n.style, opacity: 0.3, pointerEvents: 'none' as const },
    }));
  }, [storeNodes, visibleNodeIds]);

  const displayEdges = useMemo(() => {
    const filtered = storeEdges.filter((e) => !e.type || !hiddenEdgeTypes.has(e.type));

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
  }, [storeEdges, hiddenEdgeTypes, highlightOnHover, highlightOnSelection, hoveredNodeId, highlightPinnedNodeId, edgeNeighborMap]);

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
        edgeTypes={edgeTypes}
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
        {EDGE_TOGGLE_DEFS.map(({ type, label, color }) => {
          const hidden = hiddenEdgeTypes.has(type);
          return (
            <button
              key={type}
              id={`lme-canvas-toggle-${type}`}
              style={{
                ...styles.toolbarBtn,
                borderColor: hidden ? 'var(--color-border-default)' : color,
                color: hidden ? 'var(--color-fg-muted)' : color,
                opacity: hidden ? 0.5 : 1,
                textDecoration: hidden ? 'line-through' : 'none',
              }}
              onClick={() => toggleEdgeTypeVisibility(type)}
              title={`${hidden ? 'Show' : 'Hide'} ${label} edges`}
            >
              {label}
            </button>
          );
        })}
        <div style={styles.toolbarSep} />
        <button
          id="lme-canvas-highlight-hover"
          style={{
            ...styles.toolbarBtn,
            borderColor: highlightOnHover ? 'var(--color-accent-hover)' : 'var(--color-border-default)',
            color: highlightOnHover ? 'var(--color-accent-hover)' : 'var(--color-fg-muted)',
          }}
          onClick={() => setHighlightOnHover(!highlightOnHover)}
          title={`${highlightOnHover ? 'Disable' : 'Enable'} edge highlight on hover`}
        >
          Hover hl
        </button>
        <button
          id="lme-canvas-highlight-selection"
          style={{
            ...styles.toolbarBtn,
            borderColor: highlightOnSelection ? 'var(--color-accent-hover)' : 'var(--color-border-default)',
            color: highlightOnSelection ? 'var(--color-accent-hover)' : 'var(--color-fg-muted)',
          }}
          onClick={() => setHighlightOnSelection(!highlightOnSelection)}
          title={`${highlightOnSelection ? 'Disable' : 'Enable'} edge highlight on selection`}
        >
          Select hl
        </button>
        <div style={styles.toolbarSep} />
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

      {/* Context menu */}
      {contextMenu && (
        <CanvasContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onAddClass={handleAddClass}
          onAddEnum={handleAddEnum}
          onDeleteNode={handleDeleteNode}
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

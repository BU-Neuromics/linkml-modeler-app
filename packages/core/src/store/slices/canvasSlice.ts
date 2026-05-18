import type { StateCreator } from 'zustand';
import type { Node, Edge, Viewport } from 'reactflow';

export type CanvasNodeData = {
  entityId: string;
  entityType: 'class' | 'enum' | 'importGroup' | 'label';
  collapsed?: boolean;
};

export interface CanvasSlice {
  // State
  nodes: Node<CanvasNodeData>[];
  edges: Edge[];
  viewport: Viewport;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  focusMode: FocusMode | null;
  focusNodeRequest: string | null;
  collapsedGroups: Record<string, boolean>;

  // Actions
  setNodes(nodes: Node<CanvasNodeData>[]): void;
  setEdges(edges: Edge[]): void;
  updateNodePosition(nodeId: string, x: number, y: number): void;
  setViewport(viewport: Viewport): void;
  setSelection(nodeIds: string[], edgeIds: string[]): void;
  clearSelection(): void;
  setFocusMode(mode: FocusMode | null): void;
  toggleNodeCollapsed(nodeId: string): void;
  toggleCollapsedGroup(groupId: string): void;
  requestFocusNode(name: string | null): void;
}

export type FocusMode =
  | { type: 'subset'; subsetName: string }
  | { type: 'selection'; nodeIds: string[] };

export const createCanvasSlice: StateCreator<CanvasSlice, [], [], CanvasSlice> = (set) => ({
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  selectedNodeIds: [],
  selectedEdgeIds: [],
  focusMode: null,
  focusNodeRequest: null,
  collapsedGroups: {},

  setNodes(nodes) {
    set({ nodes });
  },

  setEdges(edges) {
    set({ edges });
  },

  updateNodePosition(nodeId, x, y) {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, position: { x, y } } : n
      ),
    }));
  },

  setViewport(viewport) {
    set({ viewport });
  },

  setSelection(nodeIds, edgeIds) {
    set({ selectedNodeIds: nodeIds, selectedEdgeIds: edgeIds });
  },

  clearSelection() {
    set({ selectedNodeIds: [], selectedEdgeIds: [] });
  },

  setFocusMode(mode) {
    set({ focusMode: mode });
  },

  toggleNodeCollapsed(nodeId) {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, collapsed: !n.data.collapsed } }
          : n
      ),
    }));
  },

  toggleCollapsedGroup(groupId) {
    set((state) => ({
      collapsedGroups: {
        ...state.collapsedGroups,
        [groupId]: !state.collapsedGroups[groupId],
      },
    }));
  },

  requestFocusNode(name) {
    set({ focusNodeRequest: name });
  },
});

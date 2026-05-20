import type { StateCreator } from 'zustand';
import type { Theme } from '../../ui/useTheme.js';

export type { Theme };
export type SyncStatus = 'saved' | 'syncing' | 'unsaved' | 'error' | null;

export interface Toast {
  id: string;
  message: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  durationMs?: number;
}

const HIDDEN_EDGE_TYPES_KEY = 'linkml-editor-hidden-edge-types';
const HIGHLIGHT_SETTINGS_KEY = 'linkml-editor-highlight-settings';
const GROUP_BY_IMPORT_SOURCE_KEY = 'linkml-editor-group-by-import-source';

function loadGroupByImportSource(): boolean {
  try {
    const raw = localStorage.getItem(GROUP_BY_IMPORT_SOURCE_KEY);
    if (raw !== null) return raw === 'true';
  } catch { /* ignore */ }
  return false;
}

function loadHiddenEdgeTypes(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_EDGE_TYPES_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr as string[]);
    }
  } catch { /* ignore */ }
  return new Set();
}

function loadHighlightSettings(): { onHover: boolean; onSelection: boolean } {
  try {
    const raw = localStorage.getItem(HIGHLIGHT_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        onHover: parsed.onHover ?? false,
        onSelection: parsed.onSelection ?? true,
      };
    }
  } catch { /* ignore */ }
  return { onHover: false, onSelection: true };
}

function saveHighlightSettings(onHover: boolean, onSelection: boolean): void {
  try { localStorage.setItem(HIGHLIGHT_SETTINGS_KEY, JSON.stringify({ onHover, onSelection })); } catch { /* ignore */ }
}

export interface UISlice {
  // State
  theme: Theme;
  projectPanelWidth: number; // px
  propertiesPanelWidth: number; // px
  toastQueue: Toast[];
  zoom: number; // canvas zoom level mirror for status bar
  syncStatus: SyncStatus; // null = not in cloud mode
  /** Schema IDs that are hidden in the project panel / canvas */
  hiddenSchemaIds: Set<string>;
  /** Edge types that are hidden on the canvas (filtered at render time, not from state) */
  hiddenEdgeTypes: Set<string>;
  /** Whether hovering a node highlights its edges and dims all others */
  highlightOnHover: boolean;
  /** Whether selecting a node highlights its edges and dims all others (sticky) */
  highlightOnSelection: boolean;
  /** Global rendering mode used when no view is active or the active view has no override */
  globalRenderMode: 'canvas' | 'outline';
  /** When true, draws swimlane background regions grouping nodes by their import source file */
  groupByImportSource: boolean;

  // Actions
  setTheme(theme: Theme): void;
  setProjectPanelWidth(width: number): void;
  setPropertiesPanelWidth(width: number): void;
  pushToast(toast: Omit<Toast, 'id'>): void;
  dismissToast(id: string): void;
  setZoom(zoom: number): void;
  setSyncStatus(status: SyncStatus): void;
  setSchemaVisible(schemaId: string, visible: boolean): void;
  /** Bulk-set hidden IDs, typically called when loading a project manifest. */
  setHiddenSchemaIds(ids: Set<string>): void;
  /** Toggle visibility for a single edge type. Persisted to localStorage. */
  toggleEdgeTypeVisibility(type: string): void;
  setHighlightOnHover(value: boolean): void;
  setHighlightOnSelection(value: boolean): void;
  setGlobalRenderMode(mode: 'canvas' | 'outline'): void;
  setGroupByImportSource(value: boolean): void;
}

let toastCounter = 0;

export const createUISlice: StateCreator<UISlice, [], [], UISlice> = (set) => ({
  theme: 'system',
  projectPanelWidth: 240,
  propertiesPanelWidth: 320,
  toastQueue: [],
  zoom: 1,
  syncStatus: null,
  hiddenSchemaIds: new Set(),
  hiddenEdgeTypes: loadHiddenEdgeTypes(),
  highlightOnHover: loadHighlightSettings().onHover,
  highlightOnSelection: loadHighlightSettings().onSelection,
  globalRenderMode: 'canvas',
  groupByImportSource: loadGroupByImportSource(),

  setTheme(theme) {
    set({ theme });
  },

  setProjectPanelWidth(width) {
    set({ projectPanelWidth: width });
  },

  setPropertiesPanelWidth(width) {
    set({ propertiesPanelWidth: width });
  },

  pushToast(toast) {
    const id = `toast-${++toastCounter}`;
    set((state) => ({ toastQueue: [...state.toastQueue, { ...toast, id }] }));
  },

  dismissToast(id) {
    set((state) => ({ toastQueue: state.toastQueue.filter((t) => t.id !== id) }));
  },

  setZoom(zoom) {
    set({ zoom });
  },

  setSyncStatus(status) {
    set({ syncStatus: status });
  },

  setSchemaVisible(schemaId, visible) {
    set((state) => {
      const next = new Set(state.hiddenSchemaIds);
      if (visible) next.delete(schemaId);
      else next.add(schemaId);
      return { hiddenSchemaIds: next };
    });
  },

  setHiddenSchemaIds(ids) {
    set({ hiddenSchemaIds: ids });
  },

  toggleEdgeTypeVisibility(type) {
    set((state) => {
      const next = new Set(state.hiddenEdgeTypes);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      try { localStorage.setItem(HIDDEN_EDGE_TYPES_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return { hiddenEdgeTypes: next };
    });
  },

  setHighlightOnHover(value) {
    set((state) => {
      saveHighlightSettings(value, state.highlightOnSelection);
      return { highlightOnHover: value };
    });
  },

  setHighlightOnSelection(value) {
    set((state) => {
      saveHighlightSettings(state.highlightOnHover, value);
      return { highlightOnSelection: value };
    });
  },

  setGlobalRenderMode(mode) {
    set({ globalRenderMode: mode });
  },

  setGroupByImportSource(value) {
    try { localStorage.setItem(GROUP_BY_IMPORT_SOURCE_KEY, String(value)); } catch { /* ignore */ }
    set({ groupByImportSource: value });
  },
});

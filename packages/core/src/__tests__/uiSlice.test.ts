import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { create } from 'zustand';
import { createUISlice, type UISlice } from '../store/slices/uiSlice.js';

const HOP_DIMMING_KEY = 'linkml-editor-hop-dimming';
const HIDDEN_EDGE_TYPES_KEY = 'linkml-editor-hidden-edge-types';
const HIGHLIGHT_SETTINGS_KEY = 'linkml-editor-highlight-settings';

function createStore() {
  return create<UISlice>()((...args) => createUISlice(...args));
}

describe('UISlice', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Existing baseline tests ───────────────────────────────────────────────

  it('starts with system theme and default panel widths', () => {
    const store = createStore();
    expect(store.getState().theme).toBe('system');
    expect(store.getState().projectPanelWidth).toBe(240);
    expect(store.getState().propertiesPanelWidth).toBe(320);
  });

  it('setTheme — changes theme', () => {
    const store = createStore();
    store.getState().setTheme('dark');
    expect(store.getState().theme).toBe('dark');
  });

  it('pushToast / dismissToast', () => {
    const store = createStore();
    store.getState().pushToast({ message: 'Saved!', severity: 'success' });
    expect(store.getState().toastQueue).toHaveLength(1);
    expect(store.getState().toastQueue[0].message).toBe('Saved!');

    const id = store.getState().toastQueue[0].id;
    store.getState().dismissToast(id);
    expect(store.getState().toastQueue).toHaveLength(0);
  });

  it('multiple toasts accumulate', () => {
    const store = createStore();
    store.getState().pushToast({ message: 'A', severity: 'info' });
    store.getState().pushToast({ message: 'B', severity: 'warning' });
    expect(store.getState().toastQueue).toHaveLength(2);
  });

  it('setZoom — updates zoom level', () => {
    const store = createStore();
    store.getState().setZoom(1.5);
    expect(store.getState().zoom).toBe(1.5);
  });

  it('setProjectPanelWidth — updates width', () => {
    const store = createStore();
    store.getState().setProjectPanelWidth(300);
    expect(store.getState().projectPanelWidth).toBe(300);
  });

  // ─── Additional action tests ───────────────────────────────────────────────

  it('setPropertiesPanelWidth — updates width', () => {
    const store = createStore();
    store.getState().setPropertiesPanelWidth(400);
    expect(store.getState().propertiesPanelWidth).toBe(400);
  });

  it('setSyncStatus — sets sync status', () => {
    const store = createStore();
    store.getState().setSyncStatus('syncing');
    expect(store.getState().syncStatus).toBe('syncing');
    store.getState().setSyncStatus(null);
    expect(store.getState().syncStatus).toBeNull();
  });

  // ─── setSchemaVisible (both branches) ─────────────────────────────────────

  it('setSchemaVisible — hides a schema (visible=false)', () => {
    const store = createStore();
    store.getState().setSchemaVisible('schema-1', false);
    expect(store.getState().hiddenSchemaIds.has('schema-1')).toBe(true);
  });

  it('setSchemaVisible — shows a hidden schema (visible=true)', () => {
    const store = createStore();
    store.getState().setSchemaVisible('schema-1', false);
    store.getState().setSchemaVisible('schema-1', true);
    expect(store.getState().hiddenSchemaIds.has('schema-1')).toBe(false);
  });

  it('setHiddenSchemaIds — bulk-sets hidden IDs', () => {
    const store = createStore();
    store.getState().setHiddenSchemaIds(new Set(['a', 'b']));
    expect(store.getState().hiddenSchemaIds).toEqual(new Set(['a', 'b']));
  });

  // ─── toggleEdgeTypeVisibility ──────────────────────────────────────────────

  it('toggleEdgeTypeVisibility — adds a type when absent', () => {
    const store = createStore();
    store.getState().toggleEdgeTypeVisibility('range');
    expect(store.getState().hiddenEdgeTypes.has('range')).toBe(true);
    expect(JSON.parse(localStorage.getItem(HIDDEN_EDGE_TYPES_KEY)!)).toContain('range');
  });

  it('toggleEdgeTypeVisibility — removes a type when present', () => {
    const store = createStore();
    store.getState().toggleEdgeTypeVisibility('range');
    store.getState().toggleEdgeTypeVisibility('range');
    expect(store.getState().hiddenEdgeTypes.has('range')).toBe(false);
  });

  it('toggleEdgeTypeVisibility — localStorage setItem failure is swallowed', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });
    const store = createStore();
    expect(() => store.getState().toggleEdgeTypeVisibility('domain')).not.toThrow();
  });

  // ─── setHighlightOnHover / setHighlightOnSelection ────────────────────────

  it('setHighlightOnHover — updates state and persists', () => {
    const store = createStore();
    store.getState().setHighlightOnHover(true);
    expect(store.getState().highlightOnHover).toBe(true);
    const saved = JSON.parse(localStorage.getItem(HIGHLIGHT_SETTINGS_KEY)!);
    expect(saved.onHover).toBe(true);
  });

  it('setHighlightOnSelection — updates state and persists', () => {
    const store = createStore();
    store.getState().setHighlightOnSelection(false);
    expect(store.getState().highlightOnSelection).toBe(false);
    const saved = JSON.parse(localStorage.getItem(HIGHLIGHT_SETTINGS_KEY)!);
    expect(saved.onSelection).toBe(false);
  });

  it('setHighlightOnHover — localStorage failure is swallowed', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });
    const store = createStore();
    expect(() => store.getState().setHighlightOnHover(true)).not.toThrow();
    expect(store.getState().highlightOnHover).toBe(true);
  });

  // ─── setGlobalRenderMode ──────────────────────────────────────────────────

  it('setGlobalRenderMode — switches to outline', () => {
    const store = createStore();
    store.getState().setGlobalRenderMode('outline');
    expect(store.getState().globalRenderMode).toBe('outline');
  });

  it('setGlobalRenderMode — switches back to canvas', () => {
    const store = createStore();
    store.getState().setGlobalRenderMode('outline');
    store.getState().setGlobalRenderMode('canvas');
    expect(store.getState().globalRenderMode).toBe('canvas');
  });

  // ─── setHopDimmingEnabled ─────────────────────────────────────────────────

  it('setHopDimmingEnabled — enables dimming and persists', () => {
    const store = createStore();
    store.getState().setHopDimmingEnabled(true);
    expect(store.getState().hopDimmingEnabled).toBe(true);
    const saved = JSON.parse(localStorage.getItem(HOP_DIMMING_KEY)!);
    expect(saved.enabled).toBe(true);
  });

  it('setHopDimmingEnabled — disables dimming', () => {
    const store = createStore();
    store.getState().setHopDimmingEnabled(true);
    store.getState().setHopDimmingEnabled(false);
    expect(store.getState().hopDimmingEnabled).toBe(false);
  });

  it('setHopDimmingEnabled — localStorage failure is swallowed', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });
    const store = createStore();
    expect(() => store.getState().setHopDimmingEnabled(true)).not.toThrow();
    expect(store.getState().hopDimmingEnabled).toBe(true);
  });

  // ─── setHopDimmingN ───────────────────────────────────────────────────────

  it('setHopDimmingN — sets a valid hop count', () => {
    const store = createStore();
    store.getState().setHopDimmingN(3);
    expect(store.getState().hopDimmingN).toBe(3);
    const saved = JSON.parse(localStorage.getItem(HOP_DIMMING_KEY)!);
    expect(saved.n).toBe(3);
  });

  it('setHopDimmingN — clamps n below 1 to 1', () => {
    const store = createStore();
    store.getState().setHopDimmingN(0);
    expect(store.getState().hopDimmingN).toBe(1);
  });

  it('setHopDimmingN — clamps n above 9 to 9', () => {
    const store = createStore();
    store.getState().setHopDimmingN(15);
    expect(store.getState().hopDimmingN).toBe(9);
  });

  it('setHopDimmingN — localStorage failure is swallowed', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });
    const store = createStore();
    expect(() => store.getState().setHopDimmingN(4)).not.toThrow();
    expect(store.getState().hopDimmingN).toBe(4);
  });

  // ─── loadHopDimming — localStorage-seeded initialisation ─────────────────

  it('loadHopDimming — loads enabled state from localStorage', () => {
    localStorage.setItem(HOP_DIMMING_KEY, JSON.stringify({ enabled: true, n: 4 }));
    const store = createStore();
    expect(store.getState().hopDimmingEnabled).toBe(true);
    expect(store.getState().hopDimmingN).toBe(4);
  });

  it('loadHopDimming — defaults enabled=false when key missing from stored object', () => {
    localStorage.setItem(HOP_DIMMING_KEY, JSON.stringify({ n: 3 }));
    const store = createStore();
    expect(store.getState().hopDimmingEnabled).toBe(false);
    expect(store.getState().hopDimmingN).toBe(3);
  });

  it('loadHopDimming — defaults n=2 when stored n is not a number', () => {
    localStorage.setItem(HOP_DIMMING_KEY, JSON.stringify({ enabled: true, n: 'bad' }));
    const store = createStore();
    expect(store.getState().hopDimmingN).toBe(2);
  });

  it('loadHopDimming — clamps stored n below 1 to 1', () => {
    localStorage.setItem(HOP_DIMMING_KEY, JSON.stringify({ enabled: false, n: 0 }));
    const store = createStore();
    expect(store.getState().hopDimmingN).toBe(1);
  });

  it('loadHopDimming — clamps stored n above 9 to 9', () => {
    localStorage.setItem(HOP_DIMMING_KEY, JSON.stringify({ enabled: false, n: 99 }));
    const store = createStore();
    expect(store.getState().hopDimmingN).toBe(9);
  });

  it('loadHopDimming — defaults when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => {
      throw new Error('SecurityError');
    });
    const store = createStore();
    expect(store.getState().hopDimmingEnabled).toBe(false);
    expect(store.getState().hopDimmingN).toBe(2);
  });

  it('loadHopDimming — defaults when localStorage is empty (no key)', () => {
    const store = createStore();
    expect(store.getState().hopDimmingEnabled).toBe(false);
    expect(store.getState().hopDimmingN).toBe(2);
  });

  // ─── loadHiddenEdgeTypes — localStorage-seeded initialisation ────────────

  it('loadHiddenEdgeTypes — loads edge types from localStorage', () => {
    localStorage.setItem(HIDDEN_EDGE_TYPES_KEY, JSON.stringify(['range', 'domain']));
    const store = createStore();
    expect(store.getState().hiddenEdgeTypes.has('range')).toBe(true);
    expect(store.getState().hiddenEdgeTypes.has('domain')).toBe(true);
  });

  it('loadHiddenEdgeTypes — defaults to empty set when stored value is not an array', () => {
    localStorage.setItem(HIDDEN_EDGE_TYPES_KEY, JSON.stringify({ notAnArray: true }));
    const store = createStore();
    expect(store.getState().hiddenEdgeTypes.size).toBe(0);
  });

  it('loadHiddenEdgeTypes — defaults when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => {
      if (key === HIDDEN_EDGE_TYPES_KEY) throw new Error('SecurityError');
      return null;
    });
    const store = createStore();
    expect(store.getState().hiddenEdgeTypes.size).toBe(0);
  });

  // ─── loadHighlightSettings — localStorage-seeded initialisation ──────────

  it('loadHighlightSettings — loads settings from localStorage', () => {
    localStorage.setItem(HIGHLIGHT_SETTINGS_KEY, JSON.stringify({ onHover: true, onSelection: false }));
    const store = createStore();
    expect(store.getState().highlightOnHover).toBe(true);
    expect(store.getState().highlightOnSelection).toBe(false);
  });

  it('loadHighlightSettings — defaults onHover=false and onSelection=true when keys missing', () => {
    localStorage.setItem(HIGHLIGHT_SETTINGS_KEY, JSON.stringify({}));
    const store = createStore();
    expect(store.getState().highlightOnHover).toBe(false);
    expect(store.getState().highlightOnSelection).toBe(true);
  });

  it('loadHighlightSettings — defaults when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => {
      if (key === HIGHLIGHT_SETTINGS_KEY) throw new Error('SecurityError');
      return null;
    });
    const store = createStore();
    expect(store.getState().highlightOnHover).toBe(false);
    expect(store.getState().highlightOnSelection).toBe(true);
  });
});

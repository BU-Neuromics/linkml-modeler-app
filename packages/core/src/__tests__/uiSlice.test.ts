import { describe, it, expect } from 'vitest';
import { create } from 'zustand';
import { createUISlice, type UISlice } from '../store/slices/uiSlice.js';

function createStore() {
  return create<UISlice>()((...args) => createUISlice(...args));
}

describe('UISlice', () => {
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

  it('setGlobalRangeEdgesMode — cycles through all modes', () => {
    const store = createStore();
    store.getState().setGlobalRangeEdgesMode('inline');
    expect(store.getState().globalRangeEdgesMode).toBe('inline');
    store.getState().setGlobalRangeEdgesMode('auto');
    expect(store.getState().globalRangeEdgesMode).toBe('auto');
    store.getState().setGlobalRangeEdgesMode('show');
    expect(store.getState().globalRangeEdgesMode).toBe('show');
  });

  it('setTableModeEnabled — enables and disables table mode', () => {
    const store = createStore();
    expect(store.getState().tableModeEnabled).toBe(false);
    store.getState().setTableModeEnabled(true);
    expect(store.getState().tableModeEnabled).toBe(true);
    store.getState().setTableModeEnabled(false);
    expect(store.getState().tableModeEnabled).toBe(false);
  });

  it('setGroupByImportSource — toggles import-source grouping', () => {
    const store = createStore();
    expect(store.getState().groupByImportSource).toBe(false);
    store.getState().setGroupByImportSource(true);
    expect(store.getState().groupByImportSource).toBe(true);
  });

  it('setHopDimmingEnabled — toggles hop dimming', () => {
    const store = createStore();
    expect(store.getState().hopDimmingEnabled).toBe(false);
    store.getState().setHopDimmingEnabled(true);
    expect(store.getState().hopDimmingEnabled).toBe(true);
    store.getState().setHopDimmingEnabled(false);
    expect(store.getState().hopDimmingEnabled).toBe(false);
  });

  it('setHopDimmingN — clamps to [1, 9]', () => {
    const store = createStore();
    store.getState().setHopDimmingN(3);
    expect(store.getState().hopDimmingN).toBe(3);
    store.getState().setHopDimmingN(0);
    expect(store.getState().hopDimmingN).toBe(1);
    store.getState().setHopDimmingN(99);
    expect(store.getState().hopDimmingN).toBe(9);
  });

  it('setHighlightOnHover / setHighlightOnSelection', () => {
    const store = createStore();
    store.getState().setHighlightOnHover(true);
    expect(store.getState().highlightOnHover).toBe(true);
    store.getState().setHighlightOnSelection(false);
    expect(store.getState().highlightOnSelection).toBe(false);
  });

  it('setSchemaVisible — hides and shows a schema', () => {
    const store = createStore();
    store.getState().setSchemaVisible('schema-1', false);
    expect(store.getState().hiddenSchemaIds.has('schema-1')).toBe(true);
    store.getState().setSchemaVisible('schema-1', true);
    expect(store.getState().hiddenSchemaIds.has('schema-1')).toBe(false);
  });

  it('toggleEdgeTypeVisibility — hides then shows an edge type', () => {
    const store = createStore();
    store.getState().toggleEdgeTypeVisibility('is_a');
    expect(store.getState().hiddenEdgeTypes.has('is_a')).toBe(true);
    store.getState().toggleEdgeTypeVisibility('is_a');
    expect(store.getState().hiddenEdgeTypes.has('is_a')).toBe(false);
  });

  it('setGlobalRenderMode — switches render modes', () => {
    const store = createStore();
    store.getState().setGlobalRenderMode('outline');
    expect(store.getState().globalRenderMode).toBe('outline');
    store.getState().setGlobalRenderMode('table');
    expect(store.getState().globalRenderMode).toBe('table');
    store.getState().setGlobalRenderMode('canvas');
    expect(store.getState().globalRenderMode).toBe('canvas');
  });
});

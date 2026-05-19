import { describe, it, expect, beforeEach } from 'vitest';
import { create } from 'zustand';
import { createViewsSlice, type ViewsSlice } from '../store/slices/viewsSlice.js';

function makeStore() {
  return create<ViewsSlice>()((...args) => createViewsSlice(...args));
}

describe('viewsSlice', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore();
  });

  it('starts empty', () => {
    const s = store.getState();
    expect(s.views).toEqual([]);
    expect(s.activeViewId).toBeNull();
  });

  it('createView — adds a view with generated id', () => {
    const view = store.getState().createView({
      name: 'My View',
      members: [{ schemaFilePath: 'schema.yaml', name: 'MyClass', kind: 'class' }],
    });
    expect(view.id).toBeTruthy();
    expect(view.name).toBe('My View');
    expect(view.renderMode).toBe('canvas');
    expect(store.getState().views).toHaveLength(1);
    expect(store.getState().views[0].id).toBe(view.id);
  });

  it('setActiveViewId — activates a view', () => {
    const view = store.getState().createView({ name: 'Test', members: [] });
    store.getState().setActiveViewId(view.id);
    expect(store.getState().activeViewId).toBe(view.id);
  });

  it('setActiveViewId(null) — deactivates', () => {
    const view = store.getState().createView({ name: 'Test', members: [] });
    store.getState().setActiveViewId(view.id);
    store.getState().setActiveViewId(null);
    expect(store.getState().activeViewId).toBeNull();
  });

  it('updateView — modifies view name', () => {
    const view = store.getState().createView({ name: 'Old', members: [] });
    store.getState().updateView(view.id, { name: 'New' });
    expect(store.getState().views[0].name).toBe('New');
  });

  it('deleteView — removes the view', () => {
    const view = store.getState().createView({ name: 'Delete me', members: [] });
    store.getState().setActiveViewId(view.id);
    store.getState().deleteView(view.id);
    expect(store.getState().views).toHaveLength(0);
    expect(store.getState().activeViewId).toBeNull();
  });

  it('deleteView — does not clear activeViewId for different view', () => {
    const v1 = store.getState().createView({ name: 'V1', members: [] });
    const v2 = store.getState().createView({ name: 'V2', members: [] });
    store.getState().setActiveViewId(v1.id);
    store.getState().deleteView(v2.id);
    expect(store.getState().activeViewId).toBe(v1.id);
  });

  it('duplicateView — creates a copy with new id', () => {
    const orig = store.getState().createView({
      name: 'Orig',
      members: [{ schemaFilePath: 'a.yaml', name: 'Foo', kind: 'class' }],
    });
    const copy = store.getState().duplicateView(orig.id);
    expect(copy).not.toBeNull();
    expect(copy!.id).not.toBe(orig.id);
    expect(copy!.name).toBe('Orig (copy)');
    expect(copy!.members).toEqual(orig.members);
    expect(copy!.layout).toBeUndefined();
    expect(store.getState().views).toHaveLength(2);
  });

  it('duplicateView — returns null for unknown id', () => {
    const copy = store.getState().duplicateView('nonexistent');
    expect(copy).toBeNull();
  });

  it('updateViewLayout — stores layout on view', () => {
    const view = store.getState().createView({ name: 'V', members: [] });
    store.getState().updateViewLayout(view.id, {
      nodes: { MyClass: { x: 10, y: 20 } },
      viewport: { x: 0, y: 0, zoom: 1.5 },
    });
    expect(store.getState().views[0].layout?.nodes['MyClass']).toEqual({ x: 10, y: 20 });
    expect(store.getState().views[0].layout?.viewport?.zoom).toBe(1.5);
  });

  it('setViews — bulk-replaces views', () => {
    store.getState().createView({ name: 'A', members: [] });
    store.getState().setViews([
      { id: 'x', name: 'X', members: [], renderMode: 'canvas' },
    ]);
    expect(store.getState().views).toHaveLength(1);
    expect(store.getState().views[0].id).toBe('x');
  });
});

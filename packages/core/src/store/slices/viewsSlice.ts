import type { StateCreator } from 'zustand';
import type { ViewDefinition, ViewMember, ViewLayout } from '../../io/editorManifest.js';

export type { ViewDefinition, ViewMember, ViewLayout };

export interface ViewsSlice {
  views: ViewDefinition[];
  activeViewId: string | null;

  setViews(views: ViewDefinition[]): void;
  setActiveViewId(id: string | null): void;

  createView(partial: { name: string; description?: string; members: ViewMember[]; renderMode?: 'canvas' | 'outline' | 'table' }): ViewDefinition;
  updateView(id: string, partial: Partial<Omit<ViewDefinition, 'id'>>): void;
  deleteView(id: string): void;
  duplicateView(id: string): ViewDefinition | null;
  updateViewLayout(id: string, layout: ViewLayout): void;
  subsetLayouts: Record<string, ViewLayout>;
  updateSubsetLayout(name: string, layout: ViewLayout): void;
  setSubsetLayouts(layouts: Record<string, ViewLayout>): void;
}

export const createViewsSlice: StateCreator<ViewsSlice, [], [], ViewsSlice> = (set, get) => ({
  views: [],
  activeViewId: null,

  setViews(views) {
    set({ views });
  },

  setActiveViewId(id) {
    set({ activeViewId: id });
  },

  createView({ name, description, members, renderMode = 'canvas' }: { name: string; description?: string; members: ViewMember[]; renderMode?: 'canvas' | 'outline' | 'table' }) {
    const view: ViewDefinition = {
      id: crypto.randomUUID(),
      name,
      ...(description ? { description } : {}),
      members,
      renderMode,
    };
    set((state) => ({ views: [...state.views, view] }));
    return view;
  },

  updateView(id, partial) {
    set((state) => ({
      views: state.views.map((v) => (v.id === id ? { ...v, ...partial } : v)),
    }));
  },

  deleteView(id) {
    set((state) => ({
      views: state.views.filter((v) => v.id !== id),
      activeViewId: state.activeViewId === id ? null : state.activeViewId,
    }));
  },

  duplicateView(id) {
    const source = get().views.find((v) => v.id === id);
    if (!source) return null;
    const copy: ViewDefinition = {
      ...source,
      id: crypto.randomUUID(),
      name: `${source.name} (copy)`,
      layout: undefined,
    };
    set((state) => ({ views: [...state.views, copy] }));
    return copy;
  },

  updateViewLayout(id, layout) {
    set((state) => ({
      views: state.views.map((v) => (v.id === id ? { ...v, layout } : v)),
    }));
  },

  subsetLayouts: {},

  setSubsetLayouts(layouts) {
    set({ subsetLayouts: layouts });
  },

  updateSubsetLayout(name, layout) {
    set((state) => ({
      subsetLayouts: { ...state.subsetLayouts, [name]: layout },
    }));
  },
});

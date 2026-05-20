import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { temporal } from 'zundo';
import { createProjectSlice, type ProjectSlice } from './slices/projectSlice.js';
import { createCanvasSlice, type CanvasSlice } from './slices/canvasSlice.js';
import { createEditorSlice, type EditorSlice } from './slices/editorSlice.js';
import { createGitSlice, type GitSlice } from './slices/gitSlice.js';
import { createUISlice, type UISlice } from './slices/uiSlice.js';
import { createValidationSlice, type ValidationSlice } from './slices/validationSlice.js';
import { createViewsSlice, type ViewsSlice } from './slices/viewsSlice.js';

export type AppStore = ProjectSlice & CanvasSlice & EditorSlice & GitSlice & UISlice & ValidationSlice & ViewsSlice;

export const useAppStore = create<AppStore>()(
  devtools(
    temporal(
      (...args) => ({
        ...createProjectSlice(...args),
        ...createCanvasSlice(...args),
        ...createEditorSlice(...args),
        ...createGitSlice(...args),
        ...createUISlice(...args),
        ...createValidationSlice(...args),
        ...createViewsSlice(...args),
      }),
      {
        // Only track schema-mutating state; skip canvas/UI ephemeral state
        partialize: (state) => ({
          activeProject: state.activeProject,
          activeSchemaId: state.activeSchemaId,
        }),
        limit: 50,
      }
    ),
    { name: 'LinkMLEditorStore' }
  )
);

// ── Typed selectors ────────────────────────────────────────────────────────────
export const useProject = () => useAppStore((s) => s.activeProject);
export const useActiveSchema = () => useAppStore((s) => s.getActiveSchema());
export const useIsDirty = () => useAppStore((s) => s.getIsDirty());
export const useGitAvailable = () => useAppStore((s) => s.gitAvailable);
export const useFocusMode = () => useAppStore((s) => s.focusMode);

// ── Temporal (undo/redo) accessor ─────────────────────────────────────────────
export const useTemporalStore = () => (useAppStore as unknown as { temporal: { getState: () => { undo: () => void; redo: () => void; pastStates: unknown[]; futureStates: unknown[] } } }).temporal.getState();

export * from './slices/projectSlice.js';
export * from './slices/canvasSlice.js';
export * from './slices/editorSlice.js';
export * from './slices/gitSlice.js';
export * from './slices/uiSlice.js';
export * from './slices/validationSlice.js';
export * from './slices/viewsSlice.js';

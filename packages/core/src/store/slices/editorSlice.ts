import type { StateCreator } from 'zustand';

export type ActiveEntity =
  | { type: 'class'; className: string }
  | { type: 'slot'; className: string; slotName: string }
  | { type: 'enum'; enumName: string }
  | { type: 'edge'; edgeId: string }
  | { type: 'label'; labelId: string }
  | null;

export interface EditorSlice {
  // State
  activeEntity: ActiveEntity;
  propertiesPanelOpen: boolean;
  projectPanelOpen: boolean;
  gitPanelOpen: boolean;
  schemaSettingsOpen: boolean;
  validationPanelOpen: boolean;
  yamlPreviewOpen: boolean;
  cloneDialogOpen: boolean;
  importDialogOpen: boolean;
  newSchemaDialogOpen: boolean;
  switchProjectDialogOpen: boolean;

  // Actions
  setActiveEntity(entity: ActiveEntity): void;
  clearActiveEntity(): void;
  setPropertiesPanelOpen(open: boolean): void;
  setProjectPanelOpen(open: boolean): void;
  setGitPanelOpen(open: boolean): void;
  setSchemaSettingsOpen(open: boolean): void;
  setValidationPanelOpen(open: boolean): void;
  setYamlPreviewOpen(open: boolean): void;
  setCloneDialogOpen(open: boolean): void;
  setImportDialogOpen(open: boolean): void;
  setNewSchemaDialogOpen(open: boolean): void;
  setSwitchProjectDialogOpen(open: boolean): void;
}

export const createEditorSlice: StateCreator<EditorSlice, [], [], EditorSlice> = (set) => ({
  activeEntity: null,
  propertiesPanelOpen: true,
  projectPanelOpen: true,
  gitPanelOpen: false,
  schemaSettingsOpen: false,
  validationPanelOpen: false,
  yamlPreviewOpen: true,
  cloneDialogOpen: false,
  importDialogOpen: false,
  newSchemaDialogOpen: false,
  switchProjectDialogOpen: false,

  setActiveEntity(entity) {
    set({ activeEntity: entity });
  },

  clearActiveEntity() {
    set({ activeEntity: null });
  },

  setPropertiesPanelOpen(open) {
    set({ propertiesPanelOpen: open });
  },

  setProjectPanelOpen(open) {
    set({ projectPanelOpen: open });
  },

  setGitPanelOpen(open) {
    set({ gitPanelOpen: open });
  },

  setSchemaSettingsOpen(open) {
    set({ schemaSettingsOpen: open });
  },

  setValidationPanelOpen(open) {
    set({ validationPanelOpen: open });
  },

  setYamlPreviewOpen(open) {
    set({ yamlPreviewOpen: open });
  },

  setCloneDialogOpen(open) {
    set({ cloneDialogOpen: open });
  },

  setImportDialogOpen(open) {
    set({ importDialogOpen: open });
  },

  setNewSchemaDialogOpen(open) {
    set({ newSchemaDialogOpen: open });
  },

  setSwitchProjectDialogOpen(open) {
    set({ switchProjectDialogOpen: open });
  },
});

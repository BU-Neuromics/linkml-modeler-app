import { useCallback } from 'react';
import { useAppStore } from '../../store/index.js';
import { X } from '../../ui/icons/index.js';
import { EmptyPanel } from './EmptyPanel.js';
import { ClassPanel } from './ClassPanel.js';
import { EnumPanel } from './EnumPanel.js';
import { EdgePanel } from './EdgePanel.js';
import { SchemaMetaPanel } from './SchemaMetaPanel.js';
import { LabelPanel } from './LabelPanel.js';
import { styles } from './styles.js';

export { parseRangeEdgeId } from './parseRangeEdgeId.js';

export function PropertiesPanel() {
  const activeEntity = useAppStore((s) => s.activeEntity);
  const propertiesPanelOpen = useAppStore((s) => s.propertiesPanelOpen);
  const setPropertiesPanelOpen = useAppStore((s) => s.setPropertiesPanelOpen);
  const propertiesPanelWidth = useAppStore((s) => s.propertiesPanelWidth);
  const activeSchemaFile = useAppStore((s) => s.getActiveSchema());

  const schemaId = activeSchemaFile?.id ?? '';

  const undo = useCallback(() => {
    (useAppStore as unknown as { temporal: { getState: () => { undo: () => void } } }).temporal.getState().undo();
  }, []);
  const redo = useCallback(() => {
    (useAppStore as unknown as { temporal: { getState: () => { redo: () => void } } }).temporal.getState().redo();
  }, []);

  if (!propertiesPanelOpen) {
    return (
      <button style={styles.collapsedTab} onClick={() => setPropertiesPanelOpen(true)} title="Open Properties Panel">
        ‹ P
      </button>
    );
  }

  function renderContent() {
    if (!activeEntity) {
      if (activeSchemaFile) {
        return <SchemaMetaPanel schemaId={schemaId} />;
      }
      return <EmptyPanel />;
    }
    switch (activeEntity.type) {
      case 'class':
        return <ClassPanel schemaId={schemaId} className={activeEntity.className} />;
      case 'slot':
        return (
          <ClassPanel schemaId={schemaId} className={activeEntity.className} />
        );
      case 'enum':
        return <EnumPanel schemaId={schemaId} enumName={activeEntity.enumName} />;
      case 'edge':
        return <EdgePanel edgeId={activeEntity.edgeId} />;
      case 'label':
        return <LabelPanel labelId={activeEntity.labelId} />;
      default:
        return <EmptyPanel />;
    }
  }

  return (
    <div id="lme-properties-panel" style={{ ...styles.panel, width: propertiesPanelWidth }}>
      <div style={styles.panelHeader}>
        <span style={styles.panelTitle}>Properties</span>
        <div style={styles.panelHeaderActions}>
          <button style={styles.headerBtn} onClick={undo} title="Undo (Ctrl+Z)">
            ↩
          </button>
          <button style={styles.headerBtn} onClick={redo} title="Redo (Ctrl+Shift+Z)">
            ↪
          </button>
          <button style={styles.headerBtn} onClick={() => setPropertiesPanelOpen(false)} title="Close panel">
            <X size={12} />
          </button>
        </div>
      </div>

      {activeEntity && (
        <div style={styles.breadcrumb}>
          {activeEntity.type === 'class' && `class: ${activeEntity.className}`}
          {activeEntity.type === 'slot' && `${activeEntity.className} › ${activeEntity.slotName}`}
          {activeEntity.type === 'enum' && `enum: ${activeEntity.enumName}`}
          {activeEntity.type === 'edge' && `edge: ${activeEntity.edgeId.split('__')[0]}`}
          {activeEntity.type === 'label' && `label`}
        </div>
      )}

      {activeSchemaFile?.isReadOnly && (
        <div style={styles.readOnlyNotice}>
          Read Only — imported schema
        </div>
      )}

      <div style={styles.panelBody}>{renderContent()}</div>
    </div>
  );
}

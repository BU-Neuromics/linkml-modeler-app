import { useAppStore } from '../../store/index.js';
import { FieldRow, TextArea, Checkbox } from '../../ui/fields/index.js';
import { SectionHeader, DeleteButton } from './internal.js';
import { EmptyPanel } from './EmptyPanel.js';
import { inputStyle } from '../../ui/fields/TextInput.js';

export function LabelPanel({ labelId }: { labelId: string }) {
  const activeSchemaId = useAppStore((s) => s.activeSchemaId);
  const activeSchemaFile = useAppStore((s) => s.getActiveSchema());
  const updateLabelInCanvas = useAppStore((s) => s.updateLabelInCanvas);
  const deleteLabelFromCanvas = useAppStore((s) => s.deleteLabelFromCanvas);
  const clearActiveEntity = useAppStore((s) => s.clearActiveEntity);

  const label = activeSchemaFile?.canvasLayout.labels?.find((l) => l.id === labelId);

  if (!label || !activeSchemaId) {
    return <EmptyPanel message="Label not found." />;
  }

  return (
    <div>
      <SectionHeader title="Label" />

      <FieldRow label="Text">
        <TextArea
          value={label.text}
          onChange={(v) => updateLabelInCanvas(activeSchemaId, labelId, { text: v })}
          placeholder="Label text…"
        />
      </FieldRow>

      <FieldRow label="Font Size (10–48)">
        <input
          type="number"
          style={{ ...inputStyle, width: 80 }}
          min={10}
          max={48}
          value={label.fontSize}
          onChange={(e) => {
            const v = Math.min(48, Math.max(10, Number(e.target.value)));
            updateLabelInCanvas(activeSchemaId, labelId, { fontSize: v });
          }}
        />
      </FieldRow>

      <FieldRow label="Options">
        <Checkbox
          label="Locked (prevents drag and inline editing)"
          checked={label.locked}
          onChange={(v) => updateLabelInCanvas(activeSchemaId, labelId, { locked: v })}
        />
      </FieldRow>

      <div style={{ padding: '8px 12px' }}>
        <DeleteButton
          label="Label"
          onConfirm={() => {
            deleteLabelFromCanvas(activeSchemaId, labelId);
            clearActiveEntity();
          }}
        />
      </div>
    </div>
  );
}

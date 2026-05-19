import { useState } from 'react';
import type { EnumDefinition } from '../../model/index.js';
import { useAppStore } from '../../store/index.js';
import { FieldRow, TextInput, TextArea } from '../../ui/fields/index.js';
import { inputStyle } from '../../ui/fields/TextInput.js';
import { DeleteButton, SectionHeader } from './internal.js';
import { EmptyPanel } from './EmptyPanel.js';
import { PermissibleValueEditor } from './PermissibleValueEditor.js';
import { styles } from './styles.js';
import { SubsetMembershipEditor } from './SubsetMembershipEditor.js';

export function EnumPanel({ schemaId, enumName }: { schemaId: string; enumName: string }) {
  const schema = useAppStore((s) => s.getActiveSchema())?.schema;
  const updateEnum = useAppStore((s) => s.updateEnum);
  const renameEnum = useAppStore((s) => s.renameEnum);
  const addPermissibleValue = useAppStore((s) => s.addPermissibleValue);
  const updatePermissibleValue = useAppStore((s) => s.updatePermissibleValue);
  const deletePermissibleValue = useAppStore((s) => s.deletePermissibleValue);
  const deleteEnum = useAppStore((s) => s.deleteEnum);
  const setActiveEntity = useAppStore((s) => s.setActiveEntity);

  const [newValue, setNewValue] = useState('');

  const enumDef = schema?.enums[enumName] as EnumDefinition | undefined;
  if (!enumDef) return <EmptyPanel message="Enum not found" />;
  const enm = enumDef;

  const update = (partial: Partial<EnumDefinition>) => updateEnum(schemaId, enumName, partial);

  function handleAddValue() {
    const text = newValue.trim();
    if (!text || enm.permissibleValues[text]) return;
    addPermissibleValue(schemaId, enumName, { text });
    setNewValue('');
  }

  return (
    <div>
      <SectionHeader title="Enum Properties" />

      <FieldRow label="Name">
        <TextInput
          value={enumDef.name}
          onChange={() => {}}
          onCommit={(v) => {
            const newName = v.trim();
            if (newName && newName !== enumName && !schema?.enums[newName]) {
              renameEnum(schemaId, enumName, newName);
              setActiveEntity({ type: 'enum', enumName: newName });
            }
          }}
          monospace
        />
      </FieldRow>

      <FieldRow label="Description">
        <TextArea
          value={enumDef.description ?? ''}
          onChange={(v) => update({ description: v || undefined })}
          placeholder="Optional description…"
        />
      </FieldRow>

      <FieldRow label="code_set">
        <TextInput
          value={enumDef.codeSet ?? ''}
          onChange={(v) => update({ codeSet: v || undefined })}
          placeholder="URI of external value set"
          monospace
        />
      </FieldRow>

      <SectionHeader title="Permissible Values" />

      {Object.values(enumDef.permissibleValues).map((pv) => (
        <PermissibleValueEditor
          key={pv.text}
          value={pv}
          onUpdate={(partial) => updatePermissibleValue(schemaId, enumName, pv.text, partial)}
          onDelete={() => deletePermissibleValue(schemaId, enumName, pv.text)}
        />
      ))}

      <div style={styles.addRow}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          placeholder="new value text…"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddValue()}
        />
        <button style={styles.btnPrimary} onClick={handleAddValue}>
          + Add
        </button>
      </div>

      <SubsetMembershipEditor schemaId={schemaId} entityName={enumName} kind="enum" />

      <SectionHeader title="Actions" />
      <div style={styles.actionsRow}>
        <DeleteButton
          label="enum"
          onConfirm={() => {
            deleteEnum(schemaId, enumName);
            setActiveEntity(null);
          }}
        />
      </div>
    </div>
  );
}

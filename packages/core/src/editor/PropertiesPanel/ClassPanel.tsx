import { useMemo, useState } from 'react';
import type { ClassDefinition, SlotDefinition, LinkMLSchema } from '../../model/index.js';
import { useAppStore } from '../../store/index.js';
import { SubsetMembershipEditor } from './SubsetMembershipEditor.js';
import { FieldRow, TextInput, TextArea, Checkbox, FilteredGroupedSelect } from '../../ui/fields/index.js';
import { inputStyle } from '../../ui/fields/TextInput.js';
import { AlertTriangle, X } from '../../ui/icons/index.js';
import { EmptyPanel } from './EmptyPanel.js';
import { DeleteButton, SectionHeader } from './internal.js';
import { RuleEditor } from './RuleEditor.js';
import { SlotInlineEditor } from './SlotInlineEditor.js';
import { styles } from './styles.js';
import { useRangeOptionGroups } from './hooks/useRangeOptionGroups.js';
import { useIsAOptionGroups } from './hooks/useIsAOptionGroups.js';
import { useSchemaSlotOptionGroups } from './hooks/useSchemaSlotOptionGroups.js';

function collectInheritedSlotNames(
  className: string,
  schema: LinkMLSchema,
  visited: Set<string> = new Set()
): string[] {
  if (visited.has(className)) return [];
  visited.add(className);
  const cls = schema.classes[className];
  if (!cls) return [];

  const names: string[] = [...cls.slots];
  if (cls.isA) names.push(...collectInheritedSlotNames(cls.isA, schema, visited));
  for (const mixin of cls.mixins) names.push(...collectInheritedSlotNames(mixin, schema, visited));
  return [...new Set(names)];
}

export function ClassPanel({ schemaId, className }: { schemaId: string; className: string }) {
  const schema = useAppStore((s) => s.getActiveSchema())?.schema;
  const updateClass = useAppStore((s) => s.updateClass);
  const renameClass = useAppStore((s) => s.renameClass);
  const addAttribute = useAppStore((s) => s.addAttribute);
  const updateAttribute = useAppStore((s) => s.updateAttribute);
  const deleteAttribute = useAppStore((s) => s.deleteAttribute);
  const renameAttribute = useAppStore((s) => s.renameAttribute);
  const deleteClass = useAppStore((s) => s.deleteClass);
  const setActiveEntity = useAppStore((s) => s.setActiveEntity);
  const autoAddImportForRange = useAppStore((s) => s.autoAddImportForRange);
  const addMixinToClass = useAppStore((s) => s.addMixinToClass);
  const removeMixinFromClass = useAppStore((s) => s.removeMixinFromClass);
  const addSlotReferenceToClass = useAppStore((s) => s.addSlotReferenceToClass);
  const removeSlotReferenceFromClass = useAppStore((s) => s.removeSlotReferenceFromClass);
  const updateSlotUsage = useAppStore((s) => s.updateSlotUsage);
  const deleteSlotUsage = useAppStore((s) => s.deleteSlotUsage);
  const allSchemas = useAppStore((s) => s.activeProject?.schemas ?? []);

  const rangeOptionGroups = useRangeOptionGroups(schemaId, className);
  const isAOptionGroups = useIsAOptionGroups(className);
  const schemaSlotOptionGroups = useSchemaSlotOptionGroups();
  const [newMixinName, setNewMixinName] = useState('');
  const [newSlotName, setNewSlotName] = useState('');
  const [newSlotRefName, setNewSlotRefName] = useState('');
  const [newUsageSlotName, setNewUsageSlotName] = useState('');

  const classDef = schema?.classes[className] as ClassDefinition | undefined;

  // Merge all schema-level slots across all loaded schemas
  const allSchemaSlots = useMemo(() => {
    const merged: Record<string, SlotDefinition> = {};
    for (const sf of allSchemas) Object.assign(merged, sf.schema.slots ?? {});
    return merged;
  }, [allSchemas]);

  // All slot names accessible via inheritance (for slot_usage candidates)
  const inheritedSlotNames = useMemo(
    () => schema ? collectInheritedSlotNames(className, schema, new Set()) : [],
    [schema, className]
  );
  // Slot names that are eligible to add as slot_usage (inherited but not yet overridden)
  const availableForUsage = useMemo(
    () => inheritedSlotNames.filter((n) => !(n in (classDef?.slotUsage ?? {}))),
    [inheritedSlotNames, classDef?.slotUsage]
  );

  if (!classDef) return <EmptyPanel message="Class not found" />;
  const cls = classDef;

  const update = (partial: Partial<ClassDefinition>) => updateClass(schemaId, className, partial);

  function handleAddSlot() {
    const name = newSlotName.trim();
    if (!name || cls.attributes[name]) return;
    addAttribute(schemaId, className, { name });
    setNewSlotName('');
  }

  function handleAddMixin() {
    const name = newMixinName.trim();
    if (!name || cls.mixins.includes(name)) return;
    addMixinToClass(schemaId, className, name);
    setNewMixinName('');
  }

  function handleAddSlotRef() {
    const name = newSlotRefName.trim();
    if (!name || cls.slots.includes(name)) return;
    addSlotReferenceToClass(schemaId, className, name);
    setNewSlotRefName('');
  }

  function handleAddSlotUsage() {
    const name = newUsageSlotName.trim();
    if (!name || name in cls.slotUsage) return;
    updateSlotUsage(schemaId, className, name, { name });
    setNewUsageSlotName('');
  }

  return (
    <div>
      <SectionHeader title="Class Properties" />

      <FieldRow label="Name">
        <TextInput
          value={classDef.name}
          onChange={() => {}}
          onCommit={(v) => {
            const newName = v.trim();
            if (newName && newName !== className && !schema?.classes[newName]) {
              renameClass(schemaId, className, newName);
              setActiveEntity({ type: 'class', className: newName });
            }
          }}
          placeholder="class name"
          monospace
        />
      </FieldRow>

      <FieldRow label="Description">
        <TextArea
          value={classDef.description ?? ''}
          onChange={(v) => update({ description: v || undefined })}
          placeholder="Optional description…"
        />
      </FieldRow>

      <FieldRow label="is_a">
        <FilteredGroupedSelect
          value={classDef.isA ?? ''}
          onChange={(v) => {
            if (v) autoAddImportForRange(schemaId, v);
            update({ isA: v || undefined });
          }}
          groups={isAOptionGroups}
          placeholder="(none)"
          clearable
        />
      </FieldRow>

      <FieldRow label="mixins">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {cls.mixins.map((mixinName) => (
            <div key={mixinName} style={styles.slotRefRow}>
              <span style={styles.slotRefName}>{mixinName}</span>
              <button
                style={styles.slotRefRemoveBtn}
                onClick={() => removeMixinFromClass(schemaId, className, mixinName)}
                title="Remove mixin"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <div style={styles.addRow}>
            <div style={{ flex: 1 }}>
              <FilteredGroupedSelect
                value={newMixinName}
                onChange={(v) => setNewMixinName(v)}
                groups={isAOptionGroups}
                placeholder="add mixin…"
              />
            </div>
            <button style={styles.btnPrimary} onClick={handleAddMixin} disabled={!newMixinName.trim()}>
              + Add
            </button>
          </div>
        </div>
      </FieldRow>

      <FieldRow label="Flags">
        <div>
          <Checkbox label="abstract" checked={!!classDef.abstract} onChange={(v) => update({ abstract: v || undefined })} />
          <Checkbox label="mixin" checked={!!classDef.mixin} onChange={(v) => update({ mixin: v || undefined })} />
          <Checkbox label="tree_root" checked={!!classDef.treeRoot} onChange={(v) => update({ treeRoot: v || undefined })} />
        </div>
      </FieldRow>

      <FieldRow label="class_uri">
        <TextInput
          value={classDef.uriAnnotation ?? ''}
          onChange={(v) => update({ uriAnnotation: v || undefined })}
          placeholder="e.g. schema:Person"
          monospace
        />
      </FieldRow>

      <SectionHeader title="Attributes" />

      {Object.values(classDef.attributes).map((slot) => (
        <SlotInlineEditor
          key={slot.name}
          slot={slot}
          rangeOptionGroups={rangeOptionGroups}
          onUpdate={(partial) => {
            if (partial.range) {
              autoAddImportForRange(schemaId, partial.range);
            }
            updateAttribute(schemaId, className, slot.name, partial);
          }}
          onDelete={() => {
            deleteAttribute(schemaId, className, slot.name);
          }}
          onRename={(newName) => renameAttribute(schemaId, className, slot.name, newName)}
          deleteLabel="attribute"
        />
      ))}

      <div style={styles.addRow}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          placeholder="new attribute name…"
          value={newSlotName}
          onChange={(e) => setNewSlotName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddSlot()}
        />
        <button style={styles.btnPrimary} onClick={handleAddSlot}>
          + Add
        </button>
      </div>

      <SectionHeader title="Referenced Slots" />

      {cls.slots.map((slotName) => {
        const schemaSlot = allSchemaSlots[slotName];
        return (
          <div key={slotName} style={styles.slotRefRow}>
            <span style={styles.slotRefName}>{slotName}</span>
            {schemaSlot?.range && (
              <span style={styles.slotRefRange}>: {schemaSlot.range}</span>
            )}
            {!schemaSlot && (
              <span style={{ ...styles.slotRefMissing, display: 'flex', alignItems: 'center', gap: 3 }}><AlertTriangle size={11} /> not found</span>
            )}
            <button
              style={styles.slotRefRemoveBtn}
              onClick={() => removeSlotReferenceFromClass(schemaId, className, slotName)}
              title="Remove slot reference"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}

      <div style={styles.addRow}>
        <div style={{ flex: 1 }}>
          <FilteredGroupedSelect
            value={newSlotRefName}
            onChange={(v) => setNewSlotRefName(v)}
            groups={schemaSlotOptionGroups}
            placeholder="add schema slot reference…"
          />
        </div>
        <button style={styles.btnPrimary} onClick={handleAddSlotRef} disabled={!newSlotRefName.trim()}>
          + Add
        </button>
      </div>

      <SectionHeader title="Slot Usage" />

      {Object.entries(cls.slotUsage).map(([slotName, usage]) => (
        <SlotInlineEditor
          key={slotName}
          slot={{ ...usage, name: slotName } as SlotDefinition}
          rangeOptionGroups={rangeOptionGroups}
          onUpdate={(partial) => {
            if (partial.range) autoAddImportForRange(schemaId, partial.range);
            updateSlotUsage(schemaId, className, slotName, partial);
          }}
          onDelete={() => deleteSlotUsage(schemaId, className, slotName)}
          deleteLabel="override"
          mode="override"
        />
      ))}

      {availableForUsage.length > 0 && (
        <div style={styles.addRow}>
          <div style={{ flex: 1 }}>
            <FilteredGroupedSelect
              value={newUsageSlotName}
              onChange={(v) => setNewUsageSlotName(v)}
              groups={[{ label: 'Inherited slots', options: availableForUsage }]}
              placeholder="add slot_usage override…"
            />
          </div>
          <button style={styles.btnPrimary} onClick={handleAddSlotUsage} disabled={!newUsageSlotName.trim()}>
            + Add
          </button>
        </div>
      )}

      <SectionHeader title="Rules" />

      {(cls.rules ?? []).map((rule, idx) => (
        <RuleEditor
          key={idx}
          rule={rule}
          ruleIndex={idx}
          onChange={updated => {
            const newRules = [...(cls.rules ?? [])];
            newRules[idx] = updated;
            update({ rules: newRules });
          }}
          onDelete={() => {
            const newRules = (cls.rules ?? []).filter((_, i) => i !== idx);
            update({ rules: newRules.length > 0 ? newRules : undefined });
          }}
        />
      ))}

      <div style={styles.addRow}>
        <button
          style={styles.btnPrimary}
          onClick={() => update({ rules: [...(cls.rules ?? []), {}] })}
        >
          + Add Rule
        </button>
      </div>

      <SubsetMembershipEditor schemaId={schemaId} entityName={className} kind="class" />

      <SectionHeader title="Actions" />
      <div style={styles.actionsRow}>
        <DeleteButton
          label="class"
          onConfirm={() => {
            deleteClass(schemaId, className);
            setActiveEntity(null);
          }}
        />
      </div>
    </div>
  );
}

import React from 'react';
import type { SchemaFile } from '../../model/index.js';
import { emptyCanvasLayout } from '../../model/index.js';
import { useAppStore } from '../../store/index.js';
import { usePlatform } from '../../platform/PlatformContext.js';
import { parseYaml } from '../../io/yaml.js';
import { isUrlImport, isLocalImport, resolveImportPath } from '../../io/importResolver.js';
import { FieldRow, TextInput, TextArea } from '../../ui/fields/index.js';
import { inputStyle, inputMonoStyle } from '../../ui/fields/TextInput.js';
import { X } from '../../ui/icons/index.js';
import { EmptyPanel } from './EmptyPanel.js';
import { SectionHeader } from './internal.js';
import { SchemaSlotInlineEditor } from './SchemaSlotInlineEditor.js';
import { styles } from './styles.js';
import { useRangeOptionGroups } from './hooks/useRangeOptionGroups.js';

export function SchemaMetaPanel({ schemaId }: { schemaId: string }) {
  const activeSchemaFile = useAppStore((s) => s.getActiveSchema());
  const schema = activeSchemaFile?.schema;
  const updateSchema = useAppStore((s) => s.updateSchema);
  const addImport = useAppStore((s) => s.addImport);
  const addSchemaFile = useAppStore((s) => s.addSchemaFile);
  const removeSchemaFile = useAppStore((s) => s.removeSchemaFile);
  const activeProject = useAppStore((s) => s.activeProject);
  const platform = usePlatform();
  const addSchemaSlot = useAppStore((s) => s.addSchemaSlot);
  const updateSchemaSlot = useAppStore((s) => s.updateSchemaSlot);
  const deleteSchemaSlot = useAppStore((s) => s.deleteSchemaSlot);
  const renameSchemaSlot = useAppStore((s) => s.renameSchemaSlot);

  const [newImport, setNewImport] = React.useState('');
  const [resolving, setResolving] = React.useState(false);
  const [newSchemaSlotName, setNewSchemaSlotName] = React.useState('');
  const [newPrefixKey, setNewPrefixKey] = React.useState('');
  const [newPrefixUri, setNewPrefixUri] = React.useState('');
  const rangeOptionGroups = useRangeOptionGroups(schemaId);

  if (!schema) return <EmptyPanel message="No schema loaded" />;

  const update = (partial: Parameters<typeof updateSchema>[1]) => updateSchema(schemaId, partial);

  const handleAddImport = async () => {
    const imp = newImport.trim();
    if (!imp || schema.imports.includes(imp)) return;

    addImport(schemaId, imp);
    setNewImport('');

    setResolving(true);
    try {
      let file: SchemaFile | null = null;

      if (isUrlImport(imp)) {
        try {
          const resp = await fetch(imp);
          if (resp.ok) {
            const content = await resp.text();
            const parsedSchema = parseYaml(content);
            file = {
              id: crypto.randomUUID(),
              filePath: imp,
              schema: parsedSchema,
              isDirty: false,
              canvasLayout: emptyCanvasLayout(),
              isReadOnly: true,
              sourceUrl: imp,
            };
          }
        } catch { /* URL not reachable — validation panel will flag it */ }
      } else if (isLocalImport(imp) && activeSchemaFile && activeProject) {
        const resolved = resolveImportPath(imp, activeSchemaFile.filePath, activeProject.rootPath);
        if (!activeProject.schemas.some((s) => s.filePath === resolved)) {
          try {
            const absPath = activeProject.rootPath ? `${activeProject.rootPath}/${resolved}` : resolved;
            const content = await platform.readFile(absPath);
            const parsedSchema = parseYaml(content);
            file = {
              id: crypto.randomUUID(),
              filePath: resolved,
              schema: parsedSchema,
              isDirty: false,
              canvasLayout: emptyCanvasLayout(),
              isReadOnly: true,
            };
          } catch { /* File not found — validation panel will flag it */ }
        }
      }

      if (file) addSchemaFile(file);
    } finally {
      setResolving(false);
    }
  };

  const handleRemoveImport = (imp: string) => {
    update({ imports: schema.imports.filter((i) => i !== imp) });

    if (!activeProject || !activeSchemaFile) return;

    let resolvedKey: string;
    if (isUrlImport(imp)) {
      resolvedKey = imp;
    } else if (isLocalImport(imp)) {
      resolvedKey = resolveImportPath(imp, activeSchemaFile.filePath, activeProject.rootPath);
    } else {
      return;
    }

    const importedFile = activeProject.schemas.find((s) => s.filePath === resolvedKey && s.isReadOnly);
    if (importedFile) {
      const stillNeeded = activeProject.schemas.some((s) => {
        if (s.id === schemaId) return false;
        return s.schema.imports.some((i) => {
          if (isUrlImport(i)) return i === resolvedKey;
          if (isLocalImport(i)) return resolveImportPath(i, s.filePath, activeProject.rootPath) === resolvedKey;
          return false;
        });
      });
      if (!stillNeeded) removeSchemaFile(importedFile.id);
    }
  };

  return (
    <div>
      <SectionHeader title="Schema Identity" />

      <FieldRow label="id (URI)">
        <TextInput
          value={schema.id}
          onChange={(v) => update({ id: v })}
          placeholder="https://example.org/my-schema"
          monospace
        />
      </FieldRow>

      <FieldRow label="name">
        <TextInput
          value={schema.name}
          onChange={(v) => update({ name: v })}
          placeholder="schema-name"
          monospace
        />
      </FieldRow>

      <FieldRow label="title">
        <TextInput
          value={schema.title ?? ''}
          onChange={(v) => update({ title: v || undefined })}
          placeholder="Human-readable title"
        />
      </FieldRow>

      <FieldRow label="description">
        <TextArea
          value={schema.description ?? ''}
          onChange={(v) => update({ description: v || undefined })}
          placeholder="Optional description…"
        />
      </FieldRow>

      <FieldRow label="version">
        <TextInput
          value={schema.version ?? ''}
          onChange={(v) => update({ version: v || undefined })}
          placeholder="e.g. 1.0.0"
          monospace
        />
      </FieldRow>

      <FieldRow label="license">
        <TextInput
          value={schema.license ?? ''}
          onChange={(v) => update({ license: v || undefined })}
          placeholder="e.g. CC-BY-4.0"
          monospace
        />
      </FieldRow>

      <FieldRow label="default_prefix">
        <TextInput
          value={schema.defaultPrefix}
          onChange={(v) => update({ defaultPrefix: v })}
          monospace
        />
      </FieldRow>

      <FieldRow label="default_range">
        <TextInput
          value={schema.defaultRange ?? ''}
          onChange={(v) => update({ defaultRange: v || undefined })}
          placeholder="e.g. string"
          monospace
        />
      </FieldRow>

      <SectionHeader title="Prefixes" />

      {Object.entries(schema.prefixes ?? {}).map(([key, uri]) => (
        <div key={key} style={styles.importRow}>
          <span style={{ ...styles.importPath, flexShrink: 0, width: 80 }}>{key}</span>
          <input
            style={{ ...inputStyle, ...inputMonoStyle, flex: 1, fontSize: 11 }}
            value={uri}
            onChange={(e) => update({ prefixes: { ...schema.prefixes, [key]: e.target.value } })}
          />
          <button
            style={styles.importRemoveBtn}
            title="Remove prefix"
            onClick={() => {
              const next = { ...schema.prefixes };
              delete next[key];
              update({ prefixes: next });
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}

      <div style={styles.addRow}>
        <input
          style={{ ...inputStyle, ...inputMonoStyle, width: 80, flexShrink: 0 }}
          placeholder="prefix"
          value={newPrefixKey}
          onChange={(e) => setNewPrefixKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const k = newPrefixKey.trim();
              if (k) {
                update({ prefixes: { ...schema.prefixes, [k]: newPrefixUri.trim() } });
                setNewPrefixKey('');
                setNewPrefixUri('');
              }
            }
          }}
        />
        <input
          style={{ ...inputStyle, ...inputMonoStyle, flex: 1 }}
          placeholder="https://…"
          value={newPrefixUri}
          onChange={(e) => setNewPrefixUri(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const k = newPrefixKey.trim();
              if (k) {
                update({ prefixes: { ...schema.prefixes, [k]: newPrefixUri.trim() } });
                setNewPrefixKey('');
                setNewPrefixUri('');
              }
            }
          }}
        />
        <button
          style={{
            ...styles.btnPrimary,
            ...(!newPrefixKey.trim() ? { opacity: 0.4, cursor: 'default' } : {}),
          }}
          disabled={!newPrefixKey.trim()}
          onClick={() => {
            const k = newPrefixKey.trim();
            if (k) {
              update({ prefixes: { ...schema.prefixes, [k]: newPrefixUri.trim() } });
              setNewPrefixKey('');
              setNewPrefixUri('');
            }
          }}
        >
          +
        </button>
      </div>

      <SectionHeader title="Schema Slots" />

      {Object.values(schema.slots ?? {}).map((slot) => (
        <SchemaSlotInlineEditor
          key={slot.name}
          slot={slot}
          schemaSlots={schema.slots ?? {}}
          schemaId={schemaId}
          rangeOptionGroups={rangeOptionGroups}
          onUpdate={(partial) => updateSchemaSlot(schemaId, slot.name, partial)}
          onDelete={() => deleteSchemaSlot(schemaId, slot.name)}
          onRename={(newName) => renameSchemaSlot(schemaId, slot.name, newName)}
        />
      ))}

      <div style={styles.addRow}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          placeholder="new slot name…"
          value={newSchemaSlotName}
          onChange={(e) => setNewSchemaSlotName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const name = newSchemaSlotName.trim();
              if (name && !(schema.slots ?? {})[name]) {
                addSchemaSlot(schemaId, { name });
                setNewSchemaSlotName('');
              }
            }
          }}
        />
        <button
          style={styles.btnPrimary}
          onClick={() => {
            const name = newSchemaSlotName.trim();
            if (name && !(schema.slots ?? {})[name]) {
              addSchemaSlot(schemaId, { name });
              setNewSchemaSlotName('');
            }
          }}
        >
          + Add
        </button>
      </div>

      <SectionHeader title="Imports" />

      {schema.imports.map((imp) => (
        <div key={imp} style={styles.importRow}>
          <span style={styles.importPath}>{imp}</span>
          <button
            style={styles.importRemoveBtn}
            onClick={() => handleRemoveImport(imp)}
            title="Remove import"
          >
            <X size={12} />
          </button>
        </div>
      ))}

      <div style={styles.addRow}>
        <input
          style={{ ...inputStyle, ...inputMonoStyle, flex: 1 }}
          value={newImport}
          onChange={(e) => setNewImport(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAddImport(); }}
          placeholder="linkml:types, ./common, https://…"
          disabled={resolving}
        />
        <button
          style={{
            ...styles.btnPrimary,
            ...(!newImport.trim() || resolving ? { opacity: 0.4, cursor: 'default' } : {}),
          }}
          onClick={handleAddImport}
          disabled={!newImport.trim() || resolving}
        >
          {resolving ? '…' : '+'}
        </button>
      </div>
    </div>
  );
}

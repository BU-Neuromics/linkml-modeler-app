/**
 * Additional ProjectSlice tests covering actions not exercised in project.test.ts:
 * schema-level slots, slot references, slot usage, attribute rename,
 * enum CRUD, git config, canvas layout, and import management.
 */
import { describe, it, expect } from 'vitest';
import { create } from 'zustand';
import { temporal } from 'zundo';
import { createProjectSlice, type ProjectSlice } from '../slices/projectSlice.js';
import { createUISlice, type UISlice } from '../slices/uiSlice.js';
import type { Project, SchemaFile } from '../../model/index.js';
import {
  emptyCanvasLayout,
  emptySchema,
  emptyClassDefinition,
  emptySlotDefinition,
  emptyEnumDefinition,
} from '../../model/index.js';

function makeSchemaFile(name: string): SchemaFile {
  return {
    id: crypto.randomUUID(),
    filePath: `${name}.yaml`,
    schema: emptySchema(name, `https://example.org/${name}`, name),
    isDirty: false,
    canvasLayout: emptyCanvasLayout(),
  };
}

function makeProject(name: string, schemas: SchemaFile[] = []): Project {
  return {
    id: crypto.randomUUID(),
    name,
    rootPath: `/tmp/${name}`,
    schemas,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function createStore() {
  return create<ProjectSlice & UISlice>()(
    temporal(
      (...args) => ({
        ...createProjectSlice(...args),
        ...createUISlice(...args),
      }),
      { partialize: (s) => ({ activeProject: s.activeProject }) }
    )
  );
}

function getSchema(store: ReturnType<typeof createStore>, idx = 0) {
  return store.getState().activeProject!.schemas[idx].schema;
}

// ── Schema-level slot mutations ───────────────────────────────────────────────

describe('ProjectSlice — schema-level slot mutations', () => {
  it('updateSchemaSlot — updates slot field', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().addSchemaSlot(sf.id, emptySlotDefinition('age'));
    store.getState().updateSchemaSlot(sf.id, 'age', { required: true });

    expect(getSchema(store).slots?.['age']?.required).toBe(true);
  });

  it('updateSchemaSlot — no-ops if slot does not exist', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().updateSchemaSlot(sf.id, 'nonexistent', { required: true });

    expect(getSchema(store).slots).toEqual({});
  });

  it('renameSchemaSlot — renames slot and cascades to class references', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().addSchemaSlot(sf.id, emptySlotDefinition('age'));
    store.getState().addClass(sf.id, emptyClassDefinition('Person'));
    store.getState().addSlotReferenceToClass(sf.id, 'Person', 'age');
    store.getState().updateSlotUsage(sf.id, 'Person', 'age', { required: true });

    store.getState().renameSchemaSlot(sf.id, 'age', 'years');

    const schema = getSchema(store);
    expect(schema.slots).toHaveProperty('years');
    expect(schema.slots).not.toHaveProperty('age');
    expect(schema.classes['Person'].slots).toContain('years');
    expect(schema.classes['Person'].slots).not.toContain('age');
    expect(schema.classes['Person'].slotUsage).toHaveProperty('years');
    expect(schema.classes['Person'].slotUsage).not.toHaveProperty('age');
  });

  it('renameSchemaSlot — no-ops if target name already exists', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().addSchemaSlot(sf.id, emptySlotDefinition('age'));
    store.getState().addSchemaSlot(sf.id, emptySlotDefinition('years'));

    store.getState().renameSchemaSlot(sf.id, 'age', 'years');

    const schema = getSchema(store);
    expect(schema.slots).toHaveProperty('age');
    expect(schema.slots).toHaveProperty('years');
  });

  it('renameSchemaSlot — no-ops if old slot does not exist', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));

    store.getState().renameSchemaSlot(sf.id, 'ghost', 'real');

    expect(getSchema(store).slots).toEqual({});
  });
});

// ── Slot reference mutations ──────────────────────────────────────────────────

describe('ProjectSlice — slot reference mutations', () => {
  it('removeSlotReferenceFromClass — removes slot from class.slots', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().addSchemaSlot(sf.id, emptySlotDefinition('age'));
    store.getState().addClass(sf.id, emptyClassDefinition('Person'));
    store.getState().addSlotReferenceToClass(sf.id, 'Person', 'age');
    expect(getSchema(store).classes['Person'].slots).toContain('age');

    store.getState().removeSlotReferenceFromClass(sf.id, 'Person', 'age');
    expect(getSchema(store).classes['Person'].slots).not.toContain('age');
  });

  it('addSlotReferenceToClass — no-ops if already present', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().addSchemaSlot(sf.id, emptySlotDefinition('age'));
    store.getState().addClass(sf.id, emptyClassDefinition('Person'));
    store.getState().addSlotReferenceToClass(sf.id, 'Person', 'age');
    store.getState().addSlotReferenceToClass(sf.id, 'Person', 'age');

    expect(getSchema(store).classes['Person'].slots).toHaveLength(1);
  });
});

// ── Slot usage mutations ──────────────────────────────────────────────────────

describe('ProjectSlice — slot usage mutations', () => {
  it('deleteSlotUsage — removes slotUsage entry for slot', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().addSchemaSlot(sf.id, emptySlotDefinition('age'));
    store.getState().addClass(sf.id, emptyClassDefinition('Person'));
    store.getState().updateSlotUsage(sf.id, 'Person', 'age', { required: true });
    expect(getSchema(store).classes['Person'].slotUsage).toHaveProperty('age');

    store.getState().deleteSlotUsage(sf.id, 'Person', 'age');
    expect(getSchema(store).classes['Person'].slotUsage).not.toHaveProperty('age');
  });
});

// ── Attribute rename ──────────────────────────────────────────────────────────

describe('ProjectSlice — renameAttribute', () => {
  it('renames an attribute and preserves its data', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().addClass(sf.id, emptyClassDefinition('Person'));
    store.getState().addAttribute(sf.id, 'Person', { ...emptySlotDefinition('age'), required: true });

    store.getState().renameAttribute(sf.id, 'Person', 'age', 'years');
    const attrs = getSchema(store).classes['Person'].attributes;
    expect(attrs).toHaveProperty('years');
    expect(attrs).not.toHaveProperty('age');
    expect(attrs['years'].name).toBe('years');
    expect(attrs['years'].required).toBe(true);
  });

  it('no-ops if old attribute does not exist', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().addClass(sf.id, emptyClassDefinition('Person'));

    store.getState().renameAttribute(sf.id, 'Person', 'ghost', 'real');
    expect(getSchema(store).classes['Person'].attributes).toEqual({});
  });

  it('no-ops if new attribute name already exists', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().addClass(sf.id, emptyClassDefinition('Person'));
    store.getState().addAttribute(sf.id, 'Person', emptySlotDefinition('age'));
    store.getState().addAttribute(sf.id, 'Person', emptySlotDefinition('years'));

    store.getState().renameAttribute(sf.id, 'Person', 'age', 'years');
    expect(getSchema(store).classes['Person'].attributes).toHaveProperty('age');
    expect(getSchema(store).classes['Person'].attributes).toHaveProperty('years');
  });
});

// ── Enum mutations ────────────────────────────────────────────────────────────

describe('ProjectSlice — enum mutations (extra)', () => {
  it('updateEnum — updates enum field', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().addEnum(sf.id, emptyEnumDefinition('Status'));
    store.getState().updateEnum(sf.id, 'Status', { description: 'Job status' });

    expect(getSchema(store).enums['Status'].description).toBe('Job status');
  });

  it('updateEnum — no-ops for nonexistent enum', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().updateEnum(sf.id, 'Ghost', { description: 'nope' });
    expect(getSchema(store).enums).toEqual({});
  });

  it('deleteEnum — removes enum', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().addEnum(sf.id, emptyEnumDefinition('Status'));
    store.getState().deleteEnum(sf.id, 'Status');
    expect(getSchema(store).enums).not.toHaveProperty('Status');
  });

  it('renameEnum — renames enum', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().addEnum(sf.id, emptyEnumDefinition('Status'));
    store.getState().renameEnum(sf.id, 'Status', 'JobStatus');
    expect(getSchema(store).enums).toHaveProperty('JobStatus');
    expect(getSchema(store).enums).not.toHaveProperty('Status');
    expect(getSchema(store).enums['JobStatus'].name).toBe('JobStatus');
  });

  it('renameEnum — no-ops if target name already exists', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().addEnum(sf.id, emptyEnumDefinition('A'));
    store.getState().addEnum(sf.id, emptyEnumDefinition('B'));
    store.getState().renameEnum(sf.id, 'A', 'B');
    expect(getSchema(store).enums).toHaveProperty('A');
    expect(getSchema(store).enums).toHaveProperty('B');
  });

  it('renameEnum — migrates canvas layout entry to new name', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().addEnum(sf.id, emptyEnumDefinition('Status'));
    store.getState().updateCanvasLayout(sf.id, { nodes: { Status: { x: 50, y: 75 } }, viewport: { x: 0, y: 0, zoom: 1 } });

    store.getState().renameEnum(sf.id, 'Status', 'JobStatus');

    const layout = store.getState().activeProject!.schemas[0].canvasLayout;
    expect(layout.nodes).not.toHaveProperty('Status');
    expect(layout.nodes['JobStatus']).toEqual({ x: 50, y: 75 });
  });

  it('renameEnum — no-ops canvas layout when entity has no layout entry', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().addEnum(sf.id, emptyEnumDefinition('Ghost'));

    store.getState().renameEnum(sf.id, 'Ghost', 'Specter');

    const layout = store.getState().activeProject!.schemas[0].canvasLayout;
    expect(layout.nodes).not.toHaveProperty('Ghost');
    expect(layout.nodes).not.toHaveProperty('Specter');
  });

  it('updatePermissibleValue — updates value field', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().addEnum(sf.id, emptyEnumDefinition('Status'));
    store.getState().addPermissibleValue(sf.id, 'Status', { text: 'active' });
    store.getState().updatePermissibleValue(sf.id, 'Status', 'active', { description: 'Is active' });

    expect(getSchema(store).enums['Status'].permissibleValues['active'].description).toBe('Is active');
  });

  it('updatePermissibleValue — no-ops for nonexistent value', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().addEnum(sf.id, emptyEnumDefinition('Status'));
    store.getState().updatePermissibleValue(sf.id, 'Status', 'ghost', { description: 'nope' });
    expect(getSchema(store).enums['Status'].permissibleValues).toEqual({});
  });
});

// ── Git config ────────────────────────────────────────────────────────────────

describe('ProjectSlice — updateGitConfig', () => {
  it('sets enabled flag', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().updateGitConfig({ enabled: true, defaultBranch: 'main' });

    expect(store.getState().activeProject?.gitConfig?.enabled).toBe(true);
    expect(store.getState().activeProject?.gitConfig?.defaultBranch).toBe('main');
  });

  it('merges partial update with existing config', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().updateGitConfig({ enabled: true, defaultBranch: 'main' });
    store.getState().updateGitConfig({ defaultBranch: 'develop' });

    expect(store.getState().activeProject?.gitConfig?.enabled).toBe(true);
    expect(store.getState().activeProject?.gitConfig?.defaultBranch).toBe('develop');
  });
});

// ── Canvas layout ─────────────────────────────────────────────────────────────

describe('ProjectSlice — updateCanvasLayout', () => {
  it('updates the layout for the given schema', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));

    const newLayout = { ...emptyCanvasLayout(), nodes: { A: { position: { x: 10, y: 20 } } } };
    store.getState().updateCanvasLayout(sf.id, newLayout);

    expect(store.getState().activeProject!.schemas[0].canvasLayout).toEqual(newLayout);
  });
});

// ── Import management ─────────────────────────────────────────────────────────

describe('ProjectSlice — import management', () => {
  it('addImport — appends import path to schema', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().addImport(sf.id, '../shared');

    expect(getSchema(store).imports).toContain('../shared');
  });

  it('addImport — no-ops if already present', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().addImport(sf.id, '../shared');
    store.getState().addImport(sf.id, '../shared');

    expect(getSchema(store).imports.filter((i) => i === '../shared')).toHaveLength(1);
  });

  it('removeImportIfUnused — removes import when target schema not loaded', () => {
    const store = createStore();
    const sf = makeSchemaFile('schemas/core');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().addImport(sf.id, './shared');

    const removed = store.getState().removeImportIfUnused(sf.id, './shared');
    expect(removed).toBe(true);
    expect(getSchema(store).imports).not.toContain('./shared');
  });

  it('removeImportIfUnused — removes import when loaded schema entities are unused', () => {
    const store2 = createStore();
    const shared = makeSchemaFile('schemas/shared');
    const core = makeSchemaFile('schemas/core');
    const coreSchemaWithImport = {
      ...core,
      schema: { ...core.schema, imports: ['./shared'] },
    };
    store2.getState().setProject(makeProject('test', [coreSchemaWithImport, shared]));

    const removed = store2.getState().removeImportIfUnused(coreSchemaWithImport.id, './shared');
    expect(removed).toBe(true);
    expect(
      store2.getState().activeProject!.schemas[0].schema.imports
    ).not.toContain('./shared');
  });

  it('removeImportIfUnused — returns false when imported entity is in use', () => {
    const store2 = createStore();
    const shared = makeSchemaFile('schemas/shared');
    const sharedWithClass = {
      ...shared,
      schema: {
        ...shared.schema,
        classes: { Person: emptyClassDefinition('Person') },
      },
    };
    const core = makeSchemaFile('schemas/core');
    const coreSchema = {
      ...core,
      schema: {
        ...core.schema,
        imports: ['./shared'],
        classes: {
          Employee: {
            ...emptyClassDefinition('Employee'),
            attributes: {
              manager: { ...emptySlotDefinition('manager'), range: 'Person' },
            },
          },
        },
      },
    };
    store2.getState().setProject(makeProject('test', [coreSchema, sharedWithClass]));

    const removed = store2.getState().removeImportIfUnused(coreSchema.id, './shared');
    expect(removed).toBe(false);
    expect(store2.getState().activeProject!.schemas[0].schema.imports).toContain('./shared');
  });

  it('autoAddImportForRange — adds import for unimported cross-schema range', () => {
    const store2 = createStore();
    const shared = makeSchemaFile('schemas/shared');
    const sharedWithPerson = {
      ...shared,
      schema: { ...shared.schema, classes: { Person: emptyClassDefinition('Person') } },
    };
    const core = makeSchemaFile('schemas/core');
    store2.getState().setProject(makeProject('test', [core, sharedWithPerson]));

    const result = store2.getState().autoAddImportForRange(core.id, 'Person');
    expect(result).not.toBeNull();
    expect(store2.getState().activeProject!.schemas[0].schema.imports.length).toBeGreaterThan(0);
  });

  it('autoAddImportForRange — returns null when range is local', () => {
    const store2 = createStore();
    const core = makeSchemaFile('core');
    const coreWithPerson = {
      ...core,
      schema: { ...core.schema, classes: { Person: emptyClassDefinition('Person') } },
    };
    store2.getState().setProject(makeProject('test', [coreWithPerson]));

    expect(store2.getState().autoAddImportForRange(coreWithPerson.id, 'Person')).toBeNull();
  });

  it('autoAddImportForRange — returns null when no project is loaded', () => {
    const store2 = createStore();
    expect(store2.getState().autoAddImportForRange('fake-id', 'Person')).toBeNull();
  });
});

// ── getActiveSchema helper ────────────────────────────────────────────────────

describe('ProjectSlice — getActiveSchema', () => {
  it('returns undefined when no project loaded', () => {
    const store = createStore();
    expect(store.getState().getActiveSchema()).toBeUndefined();
  });

  it('returns the active schema file', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));
    const active = store.getState().getActiveSchema();
    expect(active?.filePath).toBe('core.yaml');
  });
});

// ── No-active-project guard branches ─────────────────────────────────────────

describe('ProjectSlice — no-op when no project loaded', () => {
  it('updateSchema — no-ops', () => {
    const store = createStore();
    store.getState().updateSchema('fake', { name: 'x' });
    expect(store.getState().activeProject).toBeNull();
  });

  it('markSchemaDirty — no-ops', () => {
    const store = createStore();
    store.getState().markSchemaDirty('fake', true);
    expect(store.getState().activeProject).toBeNull();
  });

  it('addSchemaFile — no-ops', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().addSchemaFile(sf);
    expect(store.getState().activeProject).toBeNull();
  });

  it('removeSchemaFile — no-ops', () => {
    const store = createStore();
    store.getState().removeSchemaFile('fake');
    expect(store.getState().activeProject).toBeNull();
  });

  it('addClass — no-ops', () => {
    const store = createStore();
    store.getState().addClass('fake', emptyClassDefinition('Foo'));
    expect(store.getState().activeProject).toBeNull();
  });

  it('deleteClass — no-ops', () => {
    const store = createStore();
    store.getState().deleteClass('fake', 'Foo');
    expect(store.getState().activeProject).toBeNull();
  });

  it('addImport — no-ops', () => {
    const store = createStore();
    store.getState().addImport('fake', './x');
    expect(store.getState().activeProject).toBeNull();
  });

  it('updateGitConfig — no-ops', () => {
    const store = createStore();
    store.getState().updateGitConfig({ enabled: true });
    expect(store.getState().activeProject).toBeNull();
  });
});

// ── removeImportIfUnused — schema-level slot range branch ─────────────────────

describe('ProjectSlice — removeImportIfUnused schema-level slot range', () => {
  it('returns false when a schema-level slot references an imported class range', () => {
    const store = createStore();
    const shared = makeSchemaFile('schemas/shared');
    const sharedWithClass = {
      ...shared,
      schema: {
        ...shared.schema,
        classes: { Animal: emptyClassDefinition('Animal') },
      },
    };
    const core = makeSchemaFile('schemas/core');
    const coreSchema = {
      ...core,
      schema: {
        ...core.schema,
        imports: ['./shared'],
        slots: {
          subject: { ...emptySlotDefinition('subject'), range: 'Animal' },
        },
      },
    };
    store.getState().setProject(makeProject('test', [coreSchema, sharedWithClass]));

    const removed = store.getState().removeImportIfUnused(coreSchema.id, './shared');
    expect(removed).toBe(false);
    expect(store.getState().activeProject!.schemas[0].schema.imports).toContain('./shared');
  });
});

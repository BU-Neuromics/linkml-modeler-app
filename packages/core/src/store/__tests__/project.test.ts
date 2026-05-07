import { describe, it, expect, beforeEach } from 'vitest';
import { create } from 'zustand';
import type { StoreApi } from 'zustand';
import { temporal } from 'zundo';
import type { TemporalState } from 'zundo';
import { createProjectSlice, type ProjectSlice } from '../slices/projectSlice.js';
import { createUISlice, type UISlice } from '../slices/uiSlice.js';

type PartialProjectState = Pick<ProjectSlice, 'activeProject' | 'activeSchemaId'>;
type TemporalStore = { temporal: StoreApi<TemporalState<PartialProjectState>> };
function getTemporalState(store: ReturnType<typeof createTemporalStore>) {
  return (store as unknown as TemporalStore).temporal.getState();
}
import type { Project, SchemaFile } from '../../model/index.js';
import {
  emptyCanvasLayout,
  emptySchema,
  emptyClassDefinition,
  emptySlotDefinition,
  emptyEnumDefinition,
} from '../../model/index.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// Isolated ProjectSlice store — for all tests that don't need pushToast
function createStore() {
  return create<ProjectSlice>()((...args) => createProjectSlice(...args));
}

// Combined ProjectSlice + UISlice — for circular-inheritance tests that need pushToast
function createStoreWithUI() {
  return create<ProjectSlice & UISlice>()((...args) => ({
    ...createProjectSlice(...args),
    ...createUISlice(...args),
  }));
}

// Temporal-wrapped store — for undo/redo tests
function createTemporalStore() {
  return create<ProjectSlice>()(
    temporal((...args) => createProjectSlice(...args), {
      partialize: (s) => ({ activeProject: s.activeProject, activeSchemaId: s.activeSchemaId }),
      limit: 50,
    })
  );
}

// ── Existing project-level tests (migrated from src/__tests__/projectSlice.test.ts) ──

describe('ProjectSlice — project lifecycle', () => {
  it('starts with no active project', () => {
    const store = createStore();
    expect(store.getState().activeProject).toBeNull();
    expect(store.getState().activeSchemaId).toBeNull();
  });

  it('setProject — sets active project and selects first schema', () => {
    const store = createStore();
    const schema = makeSchemaFile('core');
    const project = makeProject('test', [schema]);

    store.getState().setProject(project);

    expect(store.getState().activeProject).toEqual(project);
    expect(store.getState().activeSchemaId).toBe(schema.id);
  });

  it('closeProject — clears project and schema', () => {
    const store = createStore();
    const project = makeProject('test', [makeSchemaFile('core')]);
    store.getState().setProject(project);
    store.getState().closeProject();

    expect(store.getState().activeProject).toBeNull();
    expect(store.getState().activeSchemaId).toBeNull();
  });

  it('setActiveSchema — switches active schema', () => {
    const store = createStore();
    const s1 = makeSchemaFile('s1');
    const s2 = makeSchemaFile('s2');
    const project = makeProject('test', [s1, s2]);
    store.getState().setProject(project);

    store.getState().setActiveSchema(s2.id);
    expect(store.getState().activeSchemaId).toBe(s2.id);
  });

  it('updateSchema — marks schema dirty and updates fields', () => {
    const store = createStore();
    const s = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [s]));

    store.getState().updateSchema(s.id, { title: 'Updated Title' });

    const updated = store.getState().activeProject!.schemas[0];
    expect(updated.schema.title).toBe('Updated Title');
    expect(updated.isDirty).toBe(true);
  });

  it('updateSchema — produces new activeProject reference', () => {
    const store = createStore();
    const s = makeSchemaFile('my_schema');
    store.getState().setProject(makeProject('test', [s]));

    const projectBefore = store.getState().activeProject;
    store.getState().updateSchema(s.id, { name: 'new_schema_name' });
    const projectAfter = store.getState().activeProject;

    expect(projectAfter!.schemas[0].schema.name).toBe('new_schema_name');
    expect(projectAfter).not.toBe(projectBefore);
  });

  it('markSchemaDirty — sets dirty flag', () => {
    const store = createStore();
    const s = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [s]));

    store.getState().markSchemaDirty(s.id, true);
    expect(store.getState().activeProject!.schemas[0].isDirty).toBe(true);

    store.getState().markSchemaDirty(s.id, false);
    expect(store.getState().activeProject!.schemas[0].isDirty).toBe(false);
  });

  it('addSchemaFile — appends a schema file', () => {
    const store = createStore();
    const s1 = makeSchemaFile('s1');
    store.getState().setProject(makeProject('test', [s1]));

    const s2 = makeSchemaFile('s2');
    store.getState().addSchemaFile(s2);

    expect(store.getState().activeProject!.schemas).toHaveLength(2);
    expect(store.getState().activeProject!.schemas[1].id).toBe(s2.id);
  });

  it('removeSchemaFile — removes schema and falls back to next', () => {
    const store = createStore();
    const s1 = makeSchemaFile('s1');
    const s2 = makeSchemaFile('s2');
    store.getState().setProject(makeProject('test', [s1, s2]));
    store.getState().setActiveSchema(s1.id);

    store.getState().removeSchemaFile(s1.id);

    expect(store.getState().activeProject!.schemas).toHaveLength(1);
    expect(store.getState().activeSchemaId).toBe(s2.id);
  });

  it('getIsDirty — reflects any dirty schema', () => {
    const store = createStore();
    const s = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [s]));

    expect(store.getState().getIsDirty()).toBe(false);
    store.getState().markSchemaDirty(s.id, true);
    expect(store.getState().getIsDirty()).toBe(true);
  });

  describe('project switching', () => {
    it('closeProject returns false when no schema is dirty', () => {
      const store = createStore();
      const project = makeProject('proj-a', [makeSchemaFile('schema-a')]);
      store.getState().setProject(project);

      const wasDirty = store.getState().closeProject();

      expect(wasDirty).toBe(false);
      expect(store.getState().activeProject).toBeNull();
    });

    it('closeProject returns true when a schema is dirty', () => {
      const store = createStore();
      const s = makeSchemaFile('schema-a');
      store.getState().setProject(makeProject('proj-a', [s]));
      store.getState().markSchemaDirty(s.id, true);

      const wasDirty = store.getState().closeProject();

      expect(wasDirty).toBe(true);
      expect(store.getState().activeProject).toBeNull();
    });

    it('setProject after closeProject loads new project correctly', () => {
      const store = createStore();

      const schemaA = makeSchemaFile('schema-a');
      const projectA = makeProject('proj-a', [schemaA]);
      store.getState().setProject(projectA);

      store.getState().closeProject();

      const schemaB = makeSchemaFile('schema-b');
      const projectB = makeProject('proj-b', [schemaB]);
      store.getState().setProject(projectB);

      expect(store.getState().activeProject?.name).toBe('proj-b');
      expect(store.getState().activeSchemaId).toBe(schemaB.id);
    });
  });
});

// ── Class mutation tests ───────────────────────────────────────────────────────

describe('ProjectSlice — class mutations', () => {
  let store: ReturnType<typeof createStore>;
  let sf: SchemaFile;

  beforeEach(() => {
    store = createStore();
    sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));
  });

  it('addClass — adds class to schema and marks dirty', () => {
    store.getState().addClass(sf.id, emptyClassDefinition('Animal'));

    const classes = store.getState().activeProject!.schemas[0].schema.classes;
    expect(classes).toHaveProperty('Animal');
    expect(store.getState().activeProject!.schemas[0].isDirty).toBe(true);
  });

  it('deleteClass — removes class and cascades isA references in other classes', () => {
    store.getState().addClass(sf.id, emptyClassDefinition('Animal'));
    store.getState().addClass(sf.id, { ...emptyClassDefinition('Person'), isA: 'Animal' });

    store.getState().deleteClass(sf.id, 'Animal');

    const classes = store.getState().activeProject!.schemas[0].schema.classes;
    expect(classes).not.toHaveProperty('Animal');
    // Person.isA still references Animal (deleteClass doesn't cascade isA, renameClass does)
    expect(classes['Person']).toBeTruthy();
  });

  it('deleteClass — removes class and cascades mixin references', () => {
    store.getState().addClass(sf.id, emptyClassDefinition('Timestamped'));
    store.getState().addClass(sf.id, {
      ...emptyClassDefinition('Event'),
      mixins: ['Timestamped'],
    });

    store.getState().deleteClass(sf.id, 'Timestamped');

    const classes = store.getState().activeProject!.schemas[0].schema.classes;
    expect(classes).not.toHaveProperty('Timestamped');
    // Event still exists
    expect(classes['Event']).toBeTruthy();
  });

  it('renameClass — renames class and cascades isA refs in other classes', () => {
    store.getState().addClass(sf.id, emptyClassDefinition('Animal'));
    store.getState().addClass(sf.id, { ...emptyClassDefinition('Person'), isA: 'Animal' });

    store.getState().renameClass(sf.id, 'Animal', 'Organism');

    const classes = store.getState().activeProject!.schemas[0].schema.classes;
    expect(classes).not.toHaveProperty('Animal');
    expect(classes).toHaveProperty('Organism');
    expect(classes['Person'].isA).toBe('Organism');
  });

  it('renameClass — cascades mixin references', () => {
    store.getState().addClass(sf.id, emptyClassDefinition('Mixin1'));
    store.getState().addClass(sf.id, { ...emptyClassDefinition('User'), mixins: ['Mixin1'] });

    store.getState().renameClass(sf.id, 'Mixin1', 'HasTimestamp');

    const classes = store.getState().activeProject!.schemas[0].schema.classes;
    expect(classes['User'].mixins).toContain('HasTimestamp');
    expect(classes['User'].mixins).not.toContain('Mixin1');
  });

  it('renameClass — no-ops if newName already exists', () => {
    store.getState().addClass(sf.id, emptyClassDefinition('A'));
    store.getState().addClass(sf.id, emptyClassDefinition('B'));

    store.getState().renameClass(sf.id, 'A', 'B'); // B already exists

    const classes = store.getState().activeProject!.schemas[0].schema.classes;
    expect(classes).toHaveProperty('A');
    expect(classes).toHaveProperty('B');
  });

  it('renameClass — migrates canvas layout entry to new name', () => {
    store.getState().addClass(sf.id, emptyClassDefinition('Animal'));
    store.getState().updateCanvasLayout(sf.id, { nodes: { Animal: { x: 100, y: 200 } }, viewport: { x: 0, y: 0, zoom: 1 } });

    store.getState().renameClass(sf.id, 'Animal', 'Organism');

    const layout = store.getState().activeProject!.schemas[0].canvasLayout;
    expect(layout.nodes).not.toHaveProperty('Animal');
    expect(layout.nodes['Organism']).toEqual({ x: 100, y: 200 });
  });

  it('renameClass — no-ops canvas layout when entity has no layout entry', () => {
    store.getState().addClass(sf.id, emptyClassDefinition('Ghost'));

    store.getState().renameClass(sf.id, 'Ghost', 'Specter');

    const layout = store.getState().activeProject!.schemas[0].canvasLayout;
    expect(layout.nodes).not.toHaveProperty('Ghost');
    expect(layout.nodes).not.toHaveProperty('Specter');
  });

  it('addAttribute — adds inline attribute to class', () => {
    store.getState().addClass(sf.id, emptyClassDefinition('Person'));
    store.getState().addAttribute(sf.id, 'Person', emptySlotDefinition('name'));

    const cls = store.getState().activeProject!.schemas[0].schema.classes['Person'];
    expect(cls.attributes).toHaveProperty('name');
  });

  it('deleteAttribute — removes attribute from class', () => {
    store.getState().addClass(sf.id, emptyClassDefinition('Person'));
    store.getState().addAttribute(sf.id, 'Person', emptySlotDefinition('name'));
    store.getState().deleteAttribute(sf.id, 'Person', 'name');

    const cls = store.getState().activeProject!.schemas[0].schema.classes['Person'];
    expect(cls.attributes).not.toHaveProperty('name');
  });

  it('updateAttribute — sets range field', () => {
    store.getState().addClass(sf.id, emptyClassDefinition('Person'));
    store.getState().addAttribute(sf.id, 'Person', emptySlotDefinition('age'));
    store.getState().updateAttribute(sf.id, 'Person', 'age', { range: 'integer' });

    const cls = store.getState().activeProject!.schemas[0].schema.classes['Person'];
    expect(cls.attributes['age'].range).toBe('integer');
  });

  it('updateAttribute — sets required flag', () => {
    store.getState().addClass(sf.id, emptyClassDefinition('Person'));
    store.getState().addAttribute(sf.id, 'Person', emptySlotDefinition('id'));
    store.getState().updateAttribute(sf.id, 'Person', 'id', { required: true, identifier: true });

    const cls = store.getState().activeProject!.schemas[0].schema.classes['Person'];
    expect(cls.attributes['id'].required).toBe(true);
    expect(cls.attributes['id'].identifier).toBe(true);
  });

  it('addMixin — adds mixin to class', () => {
    store.getState().addClass(sf.id, emptyClassDefinition('Timestamped'));
    store.getState().addClass(sf.id, emptyClassDefinition('Event'));
    store.getState().addMixinToClass(sf.id, 'Event', 'Timestamped');

    const cls = store.getState().activeProject!.schemas[0].schema.classes['Event'];
    expect(cls.mixins).toContain('Timestamped');
  });

  it('removeMixin — removes mixin from class', () => {
    store.getState().addClass(sf.id, emptyClassDefinition('Timestamped'));
    store.getState().addClass(sf.id, { ...emptyClassDefinition('Event'), mixins: ['Timestamped'] });
    store.getState().removeMixinFromClass(sf.id, 'Event', 'Timestamped');

    const cls = store.getState().activeProject!.schemas[0].schema.classes['Event'];
    expect(cls.mixins).not.toContain('Timestamped');
  });

  it('dirty-flag transitions — adding a class marks schema dirty', () => {
    expect(store.getState().activeProject!.schemas[0].isDirty).toBe(false);

    store.getState().addClass(sf.id, emptyClassDefinition('NewClass'));
    expect(store.getState().activeProject!.schemas[0].isDirty).toBe(true);
  });

  it('dirty-flag transitions — marking clean then re-dirtying', () => {
    store.getState().addClass(sf.id, emptyClassDefinition('Foo'));
    store.getState().markSchemaDirty(sf.id, false);
    expect(store.getState().activeProject!.schemas[0].isDirty).toBe(false);

    store.getState().updateClass(sf.id, 'Foo', { description: 'updated' });
    expect(store.getState().activeProject!.schemas[0].isDirty).toBe(true);
  });
});

// ── setIsA circular inheritance guard ─────────────────────────────────────────

describe('ProjectSlice — setIsA circular inheritance guard', () => {
  it('allows valid (non-circular) isA assignment', () => {
    const store = createStoreWithUI();
    const sf = makeSchemaFile('test');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().addClass(sf.id, emptyClassDefinition('Animal'));
    store.getState().addClass(sf.id, emptyClassDefinition('Person'));

    store.getState().updateClass(sf.id, 'Person', { isA: 'Animal' });

    const cls = store.getState().activeProject!.schemas[0].schema.classes['Person'];
    expect(cls.isA).toBe('Animal');
    expect(store.getState().toastQueue).toHaveLength(0);
  });

  it('rejects direct self-reference and fires error toast', () => {
    const store = createStoreWithUI();
    const sf = makeSchemaFile('test');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().addClass(sf.id, emptyClassDefinition('Person'));

    store.getState().updateClass(sf.id, 'Person', { isA: 'Person' });

    const cls = store.getState().activeProject!.schemas[0].schema.classes['Person'];
    expect(cls.isA).toBeUndefined();
    expect(store.getState().toastQueue).toHaveLength(1);
    expect(store.getState().toastQueue[0].severity).toBe('error');
  });

  it('rejects indirect cycle (A → B → A) and fires error toast', () => {
    const store = createStoreWithUI();
    const sf = makeSchemaFile('test');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().addClass(sf.id, emptyClassDefinition('Animal'));
    store.getState().addClass(sf.id, emptyClassDefinition('Person'));

    // Set Person.isA = Animal (valid)
    store.getState().updateClass(sf.id, 'Person', { isA: 'Animal' });
    // Now try Animal.isA = Person (would create cycle: Animal → Person → Animal)
    store.getState().updateClass(sf.id, 'Animal', { isA: 'Person' });

    const animal = store.getState().activeProject!.schemas[0].schema.classes['Animal'];
    expect(animal.isA).toBeUndefined();
    expect(store.getState().toastQueue).toHaveLength(1);
    expect(store.getState().toastQueue[0].severity).toBe('error');
  });

  it('rejects deeper cycle (A → B → C → A) and fires error toast', () => {
    const store = createStoreWithUI();
    const sf = makeSchemaFile('test');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().addClass(sf.id, emptyClassDefinition('A'));
    store.getState().addClass(sf.id, emptyClassDefinition('B'));
    store.getState().addClass(sf.id, emptyClassDefinition('C'));

    store.getState().updateClass(sf.id, 'B', { isA: 'A' }); // B → A
    store.getState().updateClass(sf.id, 'C', { isA: 'B' }); // C → B → A
    store.getState().updateClass(sf.id, 'A', { isA: 'C' }); // would be A → C → B → A

    const a = store.getState().activeProject!.schemas[0].schema.classes['A'];
    expect(a.isA).toBeUndefined();
    expect(store.getState().toastQueue).toHaveLength(1);
    expect(store.getState().toastQueue[0].severity).toBe('error');
  });
});

// ── Undo/redo tests ───────────────────────────────────────────────────────────

describe('ProjectSlice — undo/redo (zundo)', () => {
  it('undo reverts addClass', () => {
    const store = createTemporalStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));

    store.getState().addClass(sf.id, emptyClassDefinition('Animal'));
    expect(store.getState().activeProject!.schemas[0].schema.classes).toHaveProperty('Animal');

    getTemporalState(store).undo();

    // After undo, Animal should be gone
    const classes = store.getState().activeProject!.schemas[0].schema.classes;
    expect(classes).not.toHaveProperty('Animal');
  });

  it('redo re-applies after undo', () => {
    const store = createTemporalStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));

    store.getState().addClass(sf.id, emptyClassDefinition('Animal'));
    getTemporalState(store).undo();
    getTemporalState(store).redo();

    const classes = store.getState().activeProject!.schemas[0].schema.classes;
    expect(classes).toHaveProperty('Animal');
  });

  it('multiple undos traverse history correctly', () => {
    const store = createTemporalStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));

    store.getState().addClass(sf.id, emptyClassDefinition('A'));
    store.getState().addClass(sf.id, emptyClassDefinition('B'));

    const temporal = getTemporalState(store);
    temporal.undo(); // undo B
    expect(store.getState().activeProject!.schemas[0].schema.classes).not.toHaveProperty('B');
    expect(store.getState().activeProject!.schemas[0].schema.classes).toHaveProperty('A');

    temporal.undo(); // undo A
    expect(store.getState().activeProject!.schemas[0].schema.classes).not.toHaveProperty('A');
  });

  it('redo stack clears when a new mutation is made after undo', () => {
    const store = createTemporalStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));

    store.getState().addClass(sf.id, emptyClassDefinition('A'));
    getTemporalState(store).undo();
    store.getState().addClass(sf.id, emptyClassDefinition('B')); // new mutation clears redo stack
    getTemporalState(store).redo(); // should be a no-op now

    const classes = store.getState().activeProject!.schemas[0].schema.classes;
    expect(classes).toHaveProperty('B');
    expect(classes).not.toHaveProperty('A');
  });
});

// ── deleteSchemaSlot cascade ───────────────────────────────────────────────────

describe('ProjectSlice — deleteSchemaSlot cascade', () => {
  it('removes slot references and slotUsage entries from all classes', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));

    store.getState().addSchemaSlot(sf.id, emptySlotDefinition('age'));
    store.getState().addClass(sf.id, emptyClassDefinition('Person'));
    store.getState().addSlotReferenceToClass(sf.id, 'Person', 'age');
    store.getState().updateSlotUsage(sf.id, 'Person', 'age', { required: true });

    store.getState().deleteSchemaSlot(sf.id, 'age');

    const schema = store.getState().activeProject!.schemas[0].schema;
    expect(schema.slots).not.toHaveProperty('age');
    expect(schema.classes['Person'].slots).not.toContain('age');
    expect(schema.classes['Person'].slotUsage).not.toHaveProperty('age');
  });
});

// ── Enum mutations ─────────────────────────────────────────────────────────────

describe('ProjectSlice — enum mutations', () => {
  it('addPermissibleValue / deletePermissibleValue round-trip', () => {
    const store = createStore();
    const sf = makeSchemaFile('core');
    store.getState().setProject(makeProject('test', [sf]));
    store.getState().addEnum(sf.id, emptyEnumDefinition('Status'));

    store.getState().addPermissibleValue(sf.id, 'Status', { text: 'active' });
    store.getState().addPermissibleValue(sf.id, 'Status', { text: 'inactive' });

    let enm = store.getState().activeProject!.schemas[0].schema.enums['Status'];
    expect(Object.keys(enm.permissibleValues)).toHaveLength(2);

    store.getState().deletePermissibleValue(sf.id, 'Status', 'active');
    enm = store.getState().activeProject!.schemas[0].schema.enums['Status'];
    expect(Object.keys(enm.permissibleValues)).toHaveLength(1);
    expect(enm.permissibleValues).not.toHaveProperty('active');
  });
});

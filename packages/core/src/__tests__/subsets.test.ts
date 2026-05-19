/**
 * Tests for A4 subset mutations in projectSlice.
 * Verifies cascade behaviour for rename/delete, add/remove entity membership.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { create } from 'zustand';
import { createProjectSlice } from '../store/slices/projectSlice.js';
import { createCanvasSlice } from '../store/slices/canvasSlice.js';
import { createEditorSlice } from '../store/slices/editorSlice.js';
import { createGitSlice } from '../store/slices/gitSlice.js';
import { createUISlice } from '../store/slices/uiSlice.js';
import { createValidationSlice } from '../store/slices/validationSlice.js';
import { createViewsSlice } from '../store/slices/viewsSlice.js';
import type { AppStore } from '../store/index.js';
import { parseYaml, emptyCanvasLayout } from '../index.js';

function makeStore() {
  return create<AppStore>()((...args) => ({
    ...createProjectSlice(...args),
    ...createCanvasSlice(...args),
    ...createEditorSlice(...args),
    ...createGitSlice(...args),
    ...createUISlice(...args),
    ...createValidationSlice(...args),
    ...createViewsSlice(...args),
  }));
}

const SCHEMA_YAML = `
id: https://example.org/test
name: test
prefixes:
  linkml: https://w3id.org/linkml/
default_prefix: test
imports:
  - linkml:types
subsets:
  Alpha:
    description: Alpha subset
  Beta: {}
enums:
  Color:
    permissible_values:
      red: {}
      blue: {}
slots:
  label:
    range: string
    subset_of:
      - Alpha
classes:
  Person:
    description: A person
    subset_of:
      - Alpha
    attributes:
      name:
        range: string
  Address:
    description: An address
    subset_of:
      - Beta
`;

function makeProject(yaml: string) {
  const schema = parseYaml(yaml);
  return {
    id: 'proj-1',
    name: 'test',
    rootPath: '/tmp/test',
    schemas: [{
      id: 'schema-1',
      filePath: 'test.yaml',
      schema,
      isDirty: false,
      canvasLayout: emptyCanvasLayout(),
    }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('projectSlice — subset mutations (A4)', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    store = makeStore();
    store.getState().setProject(makeProject(SCHEMA_YAML));
  });

  const schemaId = 'schema-1';

  function getSchema() {
    return store.getState().activeProject!.schemas.find((s) => s.id === schemaId)!.schema;
  }

  // ── createSubset ────────────────────────────────────────────────────────────

  it('createSubset — adds entry to schema.subsets', () => {
    store.getState().createSubset(schemaId, 'Gamma', 'A new subset');
    const schema = getSchema();
    expect(schema.subsets['Gamma']).toBeDefined();
    expect(schema.subsets['Gamma'].description).toBe('A new subset');
  });

  it('createSubset — no-op when name already exists', () => {
    store.getState().createSubset(schemaId, 'Alpha', 'duplicate');
    const schema = getSchema();
    expect(schema.subsets['Alpha'].description).toBe('Alpha subset'); // unchanged
  });

  // ── renameSubset ────────────────────────────────────────────────────────────

  it('renameSubset — updates key in schema.subsets', () => {
    store.getState().renameSubset(schemaId, 'Alpha', 'AlphaRenamed');
    const schema = getSchema();
    expect(schema.subsets['AlphaRenamed']).toBeDefined();
    expect(schema.subsets['Alpha']).toBeUndefined();
  });

  it('renameSubset — cascades into class.subsetOf', () => {
    store.getState().renameSubset(schemaId, 'Alpha', 'AlphaNew');
    const schema = getSchema();
    expect(schema.classes['Person'].subsetOf).toContain('AlphaNew');
    expect(schema.classes['Person'].subsetOf).not.toContain('Alpha');
  });

  it('renameSubset — cascades into slot.subsetOf', () => {
    store.getState().renameSubset(schemaId, 'Alpha', 'AlphaNew');
    const schema = getSchema();
    expect(schema.slots['label'].subsetOf).toContain('AlphaNew');
    expect(schema.slots['label'].subsetOf).not.toContain('Alpha');
  });

  it('renameSubset — no-op when old name not found', () => {
    const before = getSchema().subsets;
    store.getState().renameSubset(schemaId, 'NonExistent', 'X');
    expect(getSchema().subsets).toEqual(before);
  });

  it('renameSubset — no-op when new name already exists', () => {
    const before = getSchema().subsets;
    store.getState().renameSubset(schemaId, 'Alpha', 'Beta');
    expect(getSchema().subsets).toEqual(before);
  });

  // ── deleteSubset ────────────────────────────────────────────────────────────

  it('deleteSubset — removes entry from schema.subsets', () => {
    store.getState().deleteSubset(schemaId, 'Alpha');
    expect(getSchema().subsets['Alpha']).toBeUndefined();
  });

  it('deleteSubset — cascades removal from class.subsetOf', () => {
    store.getState().deleteSubset(schemaId, 'Alpha');
    const schema = getSchema();
    expect(schema.classes['Person'].subsetOf).toBeUndefined();
  });

  it('deleteSubset — cascades removal from slot.subsetOf', () => {
    store.getState().deleteSubset(schemaId, 'Alpha');
    const schema = getSchema();
    expect(schema.slots['label'].subsetOf).toBeUndefined();
  });

  it('deleteSubset — leaves other subsets on entity intact', () => {
    // Add Person to Beta too, then delete Alpha; Beta should remain
    store.getState().addEntityToSubset(schemaId, 'Person', 'Beta', 'class');
    store.getState().deleteSubset(schemaId, 'Alpha');
    const schema = getSchema();
    expect(schema.classes['Person'].subsetOf).toEqual(['Beta']);
  });

  // ── addEntityToSubset ───────────────────────────────────────────────────────

  it('addEntityToSubset — adds class to subset', () => {
    store.getState().addEntityToSubset(schemaId, 'Address', 'Alpha', 'class');
    const schema = getSchema();
    expect(schema.classes['Address'].subsetOf).toContain('Alpha');
  });

  it('addEntityToSubset — no duplicate on re-add', () => {
    store.getState().addEntityToSubset(schemaId, 'Person', 'Alpha', 'class');
    const schema = getSchema();
    expect(schema.classes['Person'].subsetOf!.filter((n) => n === 'Alpha')).toHaveLength(1);
  });

  it('addEntityToSubset — adds enum to subset', () => {
    store.getState().addEntityToSubset(schemaId, 'Color', 'Alpha', 'enum');
    expect(getSchema().enums['Color'].subsetOf).toContain('Alpha');
  });

  it('addEntityToSubset — adds slot to subset', () => {
    store.getState().addEntityToSubset(schemaId, 'label', 'Beta', 'slot');
    expect(getSchema().slots['label'].subsetOf).toContain('Beta');
  });

  // ── removeEntityFromSubset ──────────────────────────────────────────────────

  it('removeEntityFromSubset — removes class from subset', () => {
    store.getState().removeEntityFromSubset(schemaId, 'Person', 'Alpha', 'class');
    expect(getSchema().classes['Person'].subsetOf).toBeUndefined();
  });

  it('removeEntityFromSubset — removes only the target subset when multiple exist', () => {
    store.getState().addEntityToSubset(schemaId, 'Person', 'Beta', 'class');
    store.getState().removeEntityFromSubset(schemaId, 'Person', 'Alpha', 'class');
    const subsetOf = getSchema().classes['Person'].subsetOf;
    expect(subsetOf).toEqual(['Beta']);
  });

  it('removeEntityFromSubset — no-op when entity not in subset', () => {
    const before = getSchema().classes['Address'].subsetOf;
    store.getState().removeEntityFromSubset(schemaId, 'Address', 'Alpha', 'class');
    expect(getSchema().classes['Address'].subsetOf).toEqual(before);
  });

  // ── updateSubset ────────────────────────────────────────────────────────────

  it('updateSubset — updates description', () => {
    store.getState().updateSubset(schemaId, 'Alpha', { description: 'Updated desc' });
    expect(getSchema().subsets['Alpha'].description).toBe('Updated desc');
  });
});

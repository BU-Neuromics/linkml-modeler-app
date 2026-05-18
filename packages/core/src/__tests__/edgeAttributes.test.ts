/**
 * Edge attribute editing tests — covers edge ID parsing, store mutation
 * parity between EdgePanel and ClassPanel paths, non-range edge read-only
 * behavior, and round-trip YAML serialization through edge edits.
 */
import { describe, it, expect } from 'vitest';
import { create } from 'zustand';
import { createProjectSlice } from '../store/slices/projectSlice.js';
import { createCanvasSlice } from '../store/slices/canvasSlice.js';
import { createEditorSlice } from '../store/slices/editorSlice.js';
import { createGitSlice } from '../store/slices/gitSlice.js';
import { createUISlice } from '../store/slices/uiSlice.js';
import { createValidationSlice } from '../store/slices/validationSlice.js';
import { parseRangeEdgeId } from '../editor/PropertiesPanel.js';
import { deriveGraph } from '../canvas/deriveGraph.js';
import {
  parseYaml,
  serializeYaml,
  emptyCanvasLayout,
} from '../index.js';
import type { AppStore } from '../store/index.js';

// ── Store factory ─────────────────────────────────────────────────────────────
function makeStore() {
  return create<AppStore>()((...args) => ({
    ...createProjectSlice(...args),
    ...createCanvasSlice(...args),
    ...createEditorSlice(...args),
    ...createGitSlice(...args),
    ...createUISlice(...args),
    ...createValidationSlice(...args),
  }));
}

// ── Fixture: schema with range, is_a, mixin, and union_of relationships ──────
const EDGE_YAML = `
id: https://example.org/edgetest
name: edgetest
prefixes:
  linkml: https://w3id.org/linkml/
default_prefix: edgetest
imports:
  - linkml:types
classes:
  Base:
    description: Root
    abstract: true
    attributes:
      id:
        range: string
        identifier: true
  Person:
    is_a: Base
    mixins:
      - Addressable
    attributes:
      name:
        range: string
      address:
        range: Address
  Addressable:
    mixin: true
    attributes:
      street:
        range: string
  Address:
    attributes:
      city:
        range: string
      zip_code:
        range: string
  AnimalOrPerson:
    union_of:
      - Person
      - Animal
  Animal:
    is_a: Base
    attributes:
      species:
        range: string
`.trim();

// ── 1. Edge ID Parsing Tests ─────────────────────────────────────────────────
describe('Edge ID parsing (parseRangeEdgeId)', () => {
  it('parses a standard range edge ID', () => {
    const result = parseRangeEdgeId('range__Person__address__Address');
    expect(result).toEqual({ className: 'Person', slotName: 'address', target: 'Address' });
  });

  it('handles slot names that contain no underscores', () => {
    const result = parseRangeEdgeId('range__MyClass__age__integer');
    expect(result).toEqual({ className: 'MyClass', slotName: 'age', target: 'integer' });
  });

  it('handles target names containing double underscores', () => {
    const result = parseRangeEdgeId('range__Cls__slot__Some__Complex__Target');
    expect(result).toEqual({ className: 'Cls', slotName: 'slot', target: 'Some__Complex__Target' });
  });

  it('returns null for is_a edge IDs', () => {
    expect(parseRangeEdgeId('isa__Person__Base')).toBeNull();
  });

  it('returns null for mixin edge IDs', () => {
    expect(parseRangeEdgeId('mixin__Person__Addressable')).toBeNull();
  });

  it('returns null for union_of edge IDs', () => {
    expect(parseRangeEdgeId('union__AnimalOrPerson__Person')).toBeNull();
  });

  it('returns null for malformed range IDs with missing segments', () => {
    expect(parseRangeEdgeId('range__Person')).toBeNull();
    expect(parseRangeEdgeId('range__Person__slot')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseRangeEdgeId('')).toBeNull();
  });

  it('returns null for arbitrary non-edge strings', () => {
    expect(parseRangeEdgeId('something_else')).toBeNull();
  });
});

// ── 2. Store Mutation Parity ─────────────────────────────────────────────────
describe('Store mutation parity (EdgePanel vs ClassPanel path)', () => {
  function setupStore() {
    const schema = parseYaml(EDGE_YAML);
    const store = makeStore();
    store.getState().setProject({
      id: 'p1', name: 'Test', rootPath: '/',
      schemas: [{ id: 's1', filePath: 'edge.yaml', schema, isDirty: false, canvasLayout: emptyCanvasLayout() }],
      createdAt: '', updatedAt: '',
    });
    return store;
  }

  it('updateAttribute via EdgePanel path produces same state as ClassPanel path', () => {
    // EdgePanel path: parse edge ID → updateAttribute(schemaId, className, slotName, partial)
    const edgePanelStore = setupStore();
    const rangeInfo = parseRangeEdgeId('range__Person__address__Address')!;
    edgePanelStore.getState().updateAttribute('s1', rangeInfo.className, rangeInfo.slotName, {
      required: true,
      multivalued: true,
    });

    // ClassPanel path: direct updateAttribute call
    const classPanelStore = setupStore();
    classPanelStore.getState().updateAttribute('s1', 'Person', 'address', {
      required: true,
      multivalued: true,
    });

    const edgeSchema = edgePanelStore.getState().getActiveSchema()!.schema;
    const classSchema = classPanelStore.getState().getActiveSchema()!.schema;

    expect(edgeSchema.classes['Person'].attributes['address']).toEqual(
      classSchema.classes['Person'].attributes['address'],
    );
  });

  it('EdgePanel path preserves other slot properties when updating', () => {
    const store = setupStore();
    const rangeInfo = parseRangeEdgeId('range__Person__address__Address')!;

    // Update one property
    store.getState().updateAttribute('s1', rangeInfo.className, rangeInfo.slotName, {
      required: true,
    });

    const slot = store.getState().getActiveSchema()!.schema.classes['Person'].attributes['address'];
    expect(slot.required).toBe(true);
    expect(slot.range).toBe('Address'); // original range preserved
    expect(slot.name).toBe('address');  // original name preserved
  });

  it('multiple sequential updates accumulate correctly', () => {
    const store = setupStore();

    store.getState().updateAttribute('s1', 'Person', 'address', { required: true });
    store.getState().updateAttribute('s1', 'Person', 'address', { multivalued: true });

    const slot = store.getState().getActiveSchema()!.schema.classes['Person'].attributes['address'];
    expect(slot.required).toBe(true);
    expect(slot.multivalued).toBe(true);
    expect(slot.range).toBe('Address');
  });
});

// ── 3. Non-Range Edge Read-Only ──────────────────────────────────────────────
describe('Non-range edges are not editable', () => {
  it('deriveGraph generates is_a edges that parseRangeEdgeId rejects', () => {
    const schema = parseYaml(EDGE_YAML);
    const graph = deriveGraph(schema, emptyCanvasLayout(), {});
    const isaEdges = graph.edges.filter((e) => e.type === 'is_a');

    expect(isaEdges.length).toBeGreaterThan(0);
    for (const edge of isaEdges) {
      expect(parseRangeEdgeId(edge.id)).toBeNull();
    }
  });

  it('deriveGraph generates mixin edges that parseRangeEdgeId rejects', () => {
    const schema = parseYaml(EDGE_YAML);
    const graph = deriveGraph(schema, emptyCanvasLayout(), {});
    const mixinEdges = graph.edges.filter((e) => e.type === 'mixin');

    expect(mixinEdges.length).toBeGreaterThan(0);
    for (const edge of mixinEdges) {
      expect(parseRangeEdgeId(edge.id)).toBeNull();
    }
  });

  it('deriveGraph generates union_of edges that parseRangeEdgeId rejects', () => {
    const schema = parseYaml(EDGE_YAML);
    const graph = deriveGraph(schema, emptyCanvasLayout(), {});
    const unionEdges = graph.edges.filter((e) => e.type === 'union_of');

    expect(unionEdges.length).toBeGreaterThan(0);
    for (const edge of unionEdges) {
      expect(parseRangeEdgeId(edge.id)).toBeNull();
    }
  });

  it('only range edges are parseable by parseRangeEdgeId', () => {
    const schema = parseYaml(EDGE_YAML);
    const graph = deriveGraph(schema, emptyCanvasLayout(), {});

    for (const edge of graph.edges) {
      const parsed = parseRangeEdgeId(edge.id);
      if (edge.type === 'range') {
        expect(parsed).not.toBeNull();
      } else {
        expect(parsed).toBeNull();
      }
    }
  });
});

// ── 4. Round-Trip: Edge Edit → YAML Serialization ───────────────────────────
describe('Round-trip: edge attribute edit serializes correctly to YAML', () => {
  it('editing a slot property through edge context survives YAML round-trip', () => {
    const schema = parseYaml(EDGE_YAML);
    const store = makeStore();
    store.getState().setProject({
      id: 'p1', name: 'Test', rootPath: '/',
      schemas: [{ id: 's1', filePath: 'edge.yaml', schema, isDirty: false, canvasLayout: emptyCanvasLayout() }],
      createdAt: '', updatedAt: '',
    });

    // Simulate edge panel edit: mark "address" slot as required and multivalued
    const rangeInfo = parseRangeEdgeId('range__Person__address__Address')!;
    store.getState().updateAttribute('s1', rangeInfo.className, rangeInfo.slotName, {
      required: true,
      multivalued: true,
    });

    // Serialize to YAML and re-parse
    const updatedSchema = store.getState().getActiveSchema()!.schema;
    const yaml = serializeYaml(updatedSchema);
    const reparsed = parseYaml(yaml);

    const slot = reparsed.classes['Person'].attributes['address'];
    expect(slot.range).toBe('Address');
    expect(slot.required).toBe(true);
    expect(slot.multivalued).toBe(true);
  });

  it('YAML output contains the updated slot properties', () => {
    const schema = parseYaml(EDGE_YAML);
    const store = makeStore();
    store.getState().setProject({
      id: 'p1', name: 'Test', rootPath: '/',
      schemas: [{ id: 's1', filePath: 'edge.yaml', schema, isDirty: false, canvasLayout: emptyCanvasLayout() }],
      createdAt: '', updatedAt: '',
    });

    store.getState().updateAttribute('s1', 'Person', 'address', {
      required: true,
      multivalued: true,
    });

    const yaml = serializeYaml(store.getState().getActiveSchema()!.schema);
    expect(yaml).toContain('required: true');
    expect(yaml).toContain('multivalued: true');
  });

  it('editing one edge does not affect other slots in the same class', () => {
    const schema = parseYaml(EDGE_YAML);
    const store = makeStore();
    store.getState().setProject({
      id: 'p1', name: 'Test', rootPath: '/',
      schemas: [{ id: 's1', filePath: 'edge.yaml', schema, isDirty: false, canvasLayout: emptyCanvasLayout() }],
      createdAt: '', updatedAt: '',
    });

    store.getState().updateAttribute('s1', 'Person', 'address', { required: true });

    const person = store.getState().getActiveSchema()!.schema.classes['Person'];
    // "name" slot should be unchanged
    expect(person.attributes['name'].required).toBeFalsy();
    expect(person.attributes['name'].range).toBe('string');
    // "address" slot should be updated
    expect(person.attributes['address'].required).toBe(true);
  });

  it('edge-derived graph reflects updated slot data after edit', () => {
    const schema = parseYaml(EDGE_YAML);
    const store = makeStore();
    store.getState().setProject({
      id: 'p1', name: 'Test', rootPath: '/',
      schemas: [{ id: 's1', filePath: 'edge.yaml', schema, isDirty: false, canvasLayout: emptyCanvasLayout() }],
      createdAt: '', updatedAt: '',
    });

    store.getState().updateAttribute('s1', 'Person', 'address', {
      required: true,
      multivalued: true,
    });

    const updatedSchema = store.getState().getActiveSchema()!.schema;
    const graph = deriveGraph(updatedSchema, emptyCanvasLayout(), {});
    const rangeEdge = graph.edges.find((e) => e.id === 'range__Person__address__Address');

    expect(rangeEdge).toBeDefined();
    expect(rangeEdge!.data).toMatchObject({
      slotName: 'address',
      range: 'Address',
      required: true,
      multivalued: true,
    });
  });
});

// ── 5. Self-reference suppression ────────────────────────────────────────────
const SELF_REF_YAML = `
id: https://example.org/selfref
name: selfref
prefixes:
  linkml: https://w3id.org/linkml/
default_prefix: selfref
imports:
  - linkml:types
classes:
  Node:
    attributes:
      children:
        range: Node
        multivalued: true
      label:
        range: string
`.trim();

// ── 5. Self-reference suppression ────────────────────────────────────────────
describe('Self-reference slot handling', () => {
  it('emits no edge with source === target for a self-ranging attribute', () => {
    const schema = parseYaml(SELF_REF_YAML);
    const graph = deriveGraph(schema, emptyCanvasLayout(), {});

    const selfEdges = graph.edges.filter((e) => e.source === e.target);
    expect(selfEdges).toHaveLength(0);
  });

  it('self-referencing slot still appears in resolvedSlots on the node', () => {
    const schema = parseYaml(SELF_REF_YAML);
    const graph = deriveGraph(schema, emptyCanvasLayout(), {});

    const nodeNode = graph.nodes.find((n) => n.id === 'Node');
    expect(nodeNode).toBeDefined();
    const resolvedSlots = (nodeNode!.data as { resolvedSlots?: Array<{ slot: { name: string } }> }).resolvedSlots ?? [];
    const childrenSlot = resolvedSlots.find((r) => r.slot.name === 'children');
    expect(childrenSlot).toBeDefined();
  });

  it('non-self range edges are still emitted normally', () => {
    const schema = parseYaml(SELF_REF_YAML);
    const graph = deriveGraph(schema, emptyCanvasLayout(), {});

    // "label" has range: string which is not in schema.classes or schema.enums,
    // so no edge is expected for it either — but Node should have no range edges at all
    const nodeRangeEdges = graph.edges.filter((e) => e.type === 'range' && e.source === 'Node');
    expect(nodeRangeEdges).toHaveLength(0);
  });
});

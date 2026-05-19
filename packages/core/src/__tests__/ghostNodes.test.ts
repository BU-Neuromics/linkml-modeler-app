/**
 * Ghost node pipeline tests — verifies that entities from imported schemas
 * appear as ghost nodes on the canvas when referenced by the active schema.
 */
import { describe, it, expect } from 'vitest';
import {
  collectImportedEntities,
  collectReferencedImportedEntities,
} from '../io/importResolver.js';
import { deriveGraph } from '../canvas/deriveGraph.js';
import { emptyCanvasLayout, emptySchema, emptyClassDefinition } from '../model/index.js';
import type { SchemaFile } from '../model/index.js';

function makeSchemaFile(id: string, filePath: string, schema: ReturnType<typeof emptySchema>): SchemaFile {
  return { id, filePath, schema, isDirty: false, canvasLayout: emptyCanvasLayout() };
}

describe('Ghost node pipeline', () => {
  it('collectImportedEntities finds classes from imported schema by filePath', () => {
    const baseSchema = {
      ...emptySchema('base', 'https://example.org/base', 'base'),
      classes: { Person: emptyClassDefinition('Person') },
    };
    const baseFile = makeSchemaFile('b1', 'base.yaml', baseSchema);

    const mainSchema = {
      ...emptySchema('main', 'https://example.org/main', 'main'),
      imports: ['./base'],
    };
    const mainFile = makeSchemaFile('m1', 'main.yaml', mainSchema);

    const entities = collectImportedEntities(mainFile, [mainFile, baseFile]);
    expect(entities.some((e) => e.name === 'Person')).toBe(true);
  });

  it('collectImportedEntities works with bare import string (no ./ prefix)', () => {
    const baseSchema = {
      ...emptySchema('base', 'https://example.org/base', 'base'),
      classes: { Animal: emptyClassDefinition('Animal') },
    };
    const baseFile = makeSchemaFile('b1', 'base.yaml', baseSchema);

    const mainSchema = {
      ...emptySchema('main', 'https://example.org/main', 'main'),
      imports: ['base'],
    };
    const mainFile = makeSchemaFile('m1', 'main.yaml', mainSchema);

    const entities = collectImportedEntities(mainFile, [mainFile, baseFile]);
    expect(entities.some((e) => e.name === 'Animal')).toBe(true);
  });

  it('collectReferencedImportedEntities filters to only referenced entities', () => {
    const baseSchema = {
      ...emptySchema('base', 'https://example.org/base', 'base'),
      classes: {
        Person: emptyClassDefinition('Person'),
        Animal: emptyClassDefinition('Animal'),
      },
    };
    const baseFile = makeSchemaFile('b1', 'base.yaml', baseSchema);

    const mainClass = emptyClassDefinition('Event');
    mainClass.attributes = { participant: { name: 'participant', range: 'Person' } };

    const mainSchema = {
      ...emptySchema('main', 'https://example.org/main', 'main'),
      imports: ['./base'],
      classes: { Event: mainClass },
    };
    const mainFile = makeSchemaFile('m1', 'main.yaml', mainSchema);

    const referenced = collectReferencedImportedEntities(mainFile, [mainFile, baseFile]);
    // Only Person is referenced, not Animal
    expect(referenced.some((e) => e.name === 'Person')).toBe(true);
    expect(referenced.some((e) => e.name === 'Animal')).toBe(false);
  });

  it('deriveGraph creates ghost nodes for referenced imported entities (grouped mode)', () => {
    const baseSchema = {
      ...emptySchema('base', 'https://example.org/base', 'base'),
      classes: { Person: emptyClassDefinition('Person') },
    };
    const baseFile = makeSchemaFile('b1', 'base.yaml', baseSchema);

    const mainClass = emptyClassDefinition('Event');
    mainClass.attributes = { participant: { name: 'participant', range: 'Person' } };
    const mainSchema = {
      ...emptySchema('main', 'https://example.org/main', 'main'),
      imports: ['./base'],
      classes: { Event: mainClass },
    };
    const mainFile = makeSchemaFile('m1', 'main.yaml', mainSchema);

    const ghostEntities = collectReferencedImportedEntities(mainFile, [mainFile, baseFile]);
    // groupByImportSource=true: ghost nodes are wrapped in an importGroup container
    const { nodes, edges } = deriveGraph(mainSchema, emptyCanvasLayout(), {}, ghostEntities, {}, {}, new Set(), true);

    // Should have: Event node, importGroup node, ghost__Person node
    const nodeIds = nodes.map((n) => n.id);
    expect(nodeIds).toContain('Event');
    expect(nodeIds).toContain('importGroup__base.yaml');
    expect(nodeIds).toContain('ghost__Person');

    // Should have a range edge from Event to ghost__Person
    const rangeEdge = edges.find((e) => e.source === 'Event' && e.target === 'ghost__Person');
    expect(rangeEdge).toBeDefined();
  });

  it('deriveGraph creates ghost nodes in flat mode (groupByImportSource off by default)', () => {
    const baseSchema = {
      ...emptySchema('base', 'https://example.org/base', 'base'),
      classes: { Person: emptyClassDefinition('Person') },
    };
    const baseFile = makeSchemaFile('b1', 'base.yaml', baseSchema);

    const mainClass = emptyClassDefinition('Event');
    mainClass.attributes = { participant: { name: 'participant', range: 'Person' } };
    const mainSchema = {
      ...emptySchema('main', 'https://example.org/main', 'main'),
      imports: ['./base'],
      classes: { Event: mainClass },
    };
    const mainFile = makeSchemaFile('m1', 'main.yaml', mainSchema);

    const ghostEntities = collectReferencedImportedEntities(mainFile, [mainFile, baseFile]);
    // groupByImportSource defaults to false: ghost nodes are flat, no importGroup container
    const { nodes, edges } = deriveGraph(mainSchema, emptyCanvasLayout(), {}, ghostEntities, {});

    const nodeIds = nodes.map((n) => n.id);
    expect(nodeIds).toContain('Event');
    expect(nodeIds).toContain('ghost__Person');
    expect(nodeIds).not.toContain('importGroup__base.yaml');

    // Range edge should still connect Event → ghost__Person
    const rangeEdge = edges.find((e) => e.source === 'Event' && e.target === 'ghost__Person');
    expect(rangeEdge).toBeDefined();
  });

  it('deriveGraph ghost nodes have correct ghost: true data', () => {
    const baseSchema = {
      ...emptySchema('base', 'https://example.org/base', 'base'),
      classes: { Person: emptyClassDefinition('Person') },
    };
    const baseFile = makeSchemaFile('b1', 'base.yaml', baseSchema);

    const mainClass = emptyClassDefinition('Event');
    mainClass.attributes = { participant: { name: 'participant', range: 'Person' } };
    const mainSchema = {
      ...emptySchema('main', 'https://example.org/main', 'main'),
      imports: ['./base'],
      classes: { Event: mainClass },
    };
    const mainFile = makeSchemaFile('m1', 'main.yaml', mainSchema);

    const ghostEntities = collectReferencedImportedEntities(mainFile, [mainFile, baseFile]);
    const { nodes } = deriveGraph(mainSchema, emptyCanvasLayout(), {}, ghostEntities, {});

    const ghostNode = nodes.find((n) => n.id === 'ghost__Person');
    expect(ghostNode).toBeDefined();
    expect((ghostNode?.data as { ghost?: boolean }).ghost).toBe(true);
  });
});

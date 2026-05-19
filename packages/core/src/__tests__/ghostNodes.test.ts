/**
 * Imported-entity pipeline tests — verifies that entities from imported schemas
 * appear as ordinary flat nodes on the canvas (B4: ghost node dissolution).
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

describe('Imported entity pipeline', () => {
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

  it('deriveGraph creates flat nodes for referenced imported entities (no ghost__ prefix, no importGroup)', () => {
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

    const importedEntities = collectReferencedImportedEntities(mainFile, [mainFile, baseFile]);
    const { nodes, edges } = deriveGraph(mainSchema, emptyCanvasLayout(), {}, importedEntities);

    const nodeIds = nodes.map((n) => n.id);

    // Flat node: bare name, no ghost__ prefix
    expect(nodeIds).toContain('Event');
    expect(nodeIds).toContain('Person');

    // No ghost__ or importGroup__ nodes
    expect(nodeIds.some((id) => id.startsWith('ghost__'))).toBe(false);
    expect(nodeIds.some((id) => id.startsWith('importGroup__'))).toBe(false);

    // Range edge from Event to Person (bare name)
    const rangeEdge = edges.find((e) => e.source === 'Event' && e.target === 'Person');
    expect(rangeEdge).toBeDefined();
  });

  it('deriveGraph imported nodes have imported: true data', () => {
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

    const importedEntities = collectReferencedImportedEntities(mainFile, [mainFile, baseFile]);
    const { nodes } = deriveGraph(mainSchema, emptyCanvasLayout(), {}, importedEntities);

    const personNode = nodes.find((n) => n.id === 'Person');
    expect(personNode).toBeDefined();
    expect((personNode?.data as { imported?: boolean }).imported).toBe(true);

    // Local Event node must NOT be marked imported
    const eventNode = nodes.find((n) => n.id === 'Event');
    expect(eventNode).toBeDefined();
    expect((eventNode?.data as { imported?: boolean }).imported).toBeUndefined();
  });
});

import { describe, it, expect } from 'vitest';
import { buildManifestData, applyManifestToSchemas } from '../io/editorManifest.js';
import type { ViewDefinition } from '../io/editorManifest.js';
import type { Project, SchemaFile } from '../model/index.js';
import { emptyCanvasLayout } from '../model/index.js';
import * as jsyaml from 'js-yaml';

function makeProject(filePaths: string[]): Project {
  const schemas: SchemaFile[] = filePaths.map((fp, i) => ({
    id: `schema-${i}`,
    filePath: fp,
    schema: { id: '', name: '', description: '', prefixes: {}, imports: [], classes: {}, slots: {}, enums: {}, subsets: {}, types: {} },
    isDirty: false,
    canvasLayout: emptyCanvasLayout(),
  }));
  return { id: 'proj', name: 'Test', rootPath: '/test', schemas, createdAt: '', updatedAt: '' };
}

describe('editorManifest — views round-trip', () => {
  it('buildManifestData includes views and activeViewId', () => {
    const project = makeProject(['schema.yaml']);
    const views: ViewDefinition[] = [
      {
        id: 'v1',
        name: 'My View',
        members: [{ schemaFilePath: 'schema.yaml', name: 'Foo', kind: 'class' }],
        renderMode: 'canvas',
      },
    ];
    const manifest = buildManifestData(project, null, null, new Set(), views, 'v1');
    expect(manifest.views).toHaveLength(1);
    expect(manifest.views![0].name).toBe('My View');
    expect(manifest.activeViewId).toBe('v1');
  });

  it('buildManifestData omits views/activeViewId when empty', () => {
    const project = makeProject(['schema.yaml']);
    const manifest = buildManifestData(project, null, null, new Set(), [], null);
    expect(manifest.views).toBeUndefined();
    expect(manifest.activeViewId).toBeUndefined();
  });

  it('applyManifestToSchemas returns views and activeViewId', () => {
    const schemas = makeProject(['schema.yaml']).schemas;
    const { views, activeViewId } = applyManifestToSchemas(schemas, {
      version: 1,
      views: [
        {
          id: 'abc',
          name: 'View A',
          members: [{ schemaFilePath: 'schema.yaml', name: 'Bar', kind: 'enum' }],
          renderMode: 'canvas',
        },
      ],
      activeViewId: 'abc',
    });
    expect(views).toHaveLength(1);
    expect(views[0].id).toBe('abc');
    expect(activeViewId).toBe('abc');
  });

  it('applyManifestToSchemas returns empty defaults when no views in manifest', () => {
    const schemas = makeProject(['schema.yaml']).schemas;
    const { views, activeViewId } = applyManifestToSchemas(schemas, { version: 1 });
    expect(views).toEqual([]);
    expect(activeViewId).toBeNull();
  });

  it('round-trip via YAML serialisation preserves view data', () => {
    const project = makeProject(['my-schema.yaml']);
    const views: ViewDefinition[] = [
      {
        id: 'round-trip-id',
        name: 'Round Trip',
        description: 'Test description',
        members: [
          { schemaFilePath: 'my-schema.yaml', name: 'ClassA', kind: 'class' },
          { schemaFilePath: 'my-schema.yaml', name: 'StatusEnum', kind: 'enum' },
        ],
        renderMode: 'canvas',
        edgeFilters: { hiddenTypes: ['range'] },
      },
    ];
    const manifest = buildManifestData(project, null, null, new Set(), views, 'round-trip-id');
    const yaml = jsyaml.dump(manifest, { indent: 2 });
    const parsed = jsyaml.load(yaml) as typeof manifest;
    expect(parsed.views![0].id).toBe('round-trip-id');
    expect(parsed.views![0].members).toHaveLength(2);
    expect(parsed.views![0].edgeFilters?.hiddenTypes).toEqual(['range']);
    expect(parsed.activeViewId).toBe('round-trip-id');
  });
});

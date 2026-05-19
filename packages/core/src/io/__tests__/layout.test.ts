/**
 * Layout sidecar tests (PTS-80 §6.3-6.4 / §10).
 *
 * The layout sidecar is stored as YAML inside `.linkml-editor.yaml`
 * (not as a separate `.layout.json` file — see editorManifest.ts).
 * These tests cover the pure-function I/O layer (buildManifestData,
 * applyManifestToSchemas, readEditorManifest, writeEditorManifest)
 * without requiring a React component environment.
 *
 * Auto-layout guard note: the decision to call runAutoLayout (vs. use
 * a saved layout) lives in SchemaCanvas.tsx at:
 *   const hasLayoutData = Object.keys(activeSchemaFile.canvasLayout.nodes).length > 0;
 * The tests below verify that applyManifestToSchemas leaves schemas
 * without manifest entries with an empty-nodes CanvasLayout, matching
 * the condition that triggers auto-layout in the component.
 */
import { describe, it, expect, vi } from 'vitest';
import * as jsyaml from 'js-yaml';
import {
  buildManifestData,
  applyManifestToSchemas,
  readEditorManifest,
  writeEditorManifest,
  MANIFEST_FILENAME,
  type EditorManifestData,
} from '../editorManifest.js';
import {
  emptyCanvasLayout,
  emptySchema,
  type Project,
  type SchemaFile,
  type CanvasLayout,
} from '../../model/index.js';
import type { PlatformAPI } from '../../platform/PlatformContext.js';

// ── Factories ─────────────────────────────────────────────────────────────────

function makeSchemaFile(id: string, filePath: string, layout?: CanvasLayout): SchemaFile {
  return {
    id,
    filePath,
    schema: emptySchema('TestSchema', 'https://example.org/test', 'test'),
    isDirty: false,
    canvasLayout: layout ?? emptyCanvasLayout(),
  };
}

function makeProject(schemas: SchemaFile[]): Project {
  return {
    id: 'proj-1',
    name: 'Test Project',
    rootPath: '/test/root',
    schemas,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function layoutWith(
  nodes: Record<string, { x: number; y: number; collapsed?: boolean }>,
  viewport = { x: 0, y: 0, zoom: 1 }
): CanvasLayout {
  return { nodes, viewport };
}

// ── buildManifestData ─────────────────────────────────────────────────────────

describe('buildManifestData', () => {
  it('produces a version:1 manifest', () => {
    const sf = makeSchemaFile('s1', 'main.yaml');
    const project = makeProject([sf]);
    const data = buildManifestData(project, null, null, new Set());
    expect(data.version).toBe(1);
  });

  it('omits schemas section when all schemas have empty layout and are visible', () => {
    const project = makeProject([
      makeSchemaFile('s1', 'main.yaml'),
      makeSchemaFile('s2', 'types.yaml'),
    ]);
    const data = buildManifestData(project, null, null, new Set());
    expect(data.schemas).toBeUndefined();
  });

  it('includes layout nodes when a schema has non-empty layout', () => {
    const layout = layoutWith({ MyClass: { x: 100, y: 200 } });
    const sf = makeSchemaFile('s1', 'main.yaml', layout);
    const project = makeProject([sf]);
    const data = buildManifestData(project, null, null, new Set());
    expect(data.schemas?.['main.yaml']?.layout?.nodes?.['MyClass']).toEqual({ x: 100, y: 200 });
  });

  it('omits viewport when it is the default (x=0, y=0, zoom=1)', () => {
    const layout = layoutWith({ MyClass: { x: 10, y: 20 } }, { x: 0, y: 0, zoom: 1 });
    const sf = makeSchemaFile('s1', 'main.yaml', layout);
    const project = makeProject([sf]);
    const data = buildManifestData(project, null, null, new Set());
    expect(data.schemas?.['main.yaml']?.layout?.viewport).toBeUndefined();
  });

  it('includes viewport when it differs from default', () => {
    const layout = layoutWith({ MyClass: { x: 10, y: 20 } }, { x: 50, y: 100, zoom: 1.5 });
    const sf = makeSchemaFile('s1', 'main.yaml', layout);
    const project = makeProject([sf]);
    const data = buildManifestData(project, null, null, new Set());
    expect(data.schemas?.['main.yaml']?.layout?.viewport).toEqual({ x: 50, y: 100, zoom: 1.5 });
  });

  it('marks hidden schemas with visible: false', () => {
    const sf = makeSchemaFile('s1', 'main.yaml');
    const project = makeProject([sf]);
    const data = buildManifestData(project, null, null, new Set(['s1']));
    expect(data.schemas?.['main.yaml']?.visible).toBe(false);
  });

  it('does not emit visible key for non-hidden schemas', () => {
    const layout = layoutWith({ A: { x: 0, y: 0 } });
    const sf = makeSchemaFile('s1', 'main.yaml', layout);
    const project = makeProject([sf]);
    const data = buildManifestData(project, null, null, new Set());
    expect(data.schemas?.['main.yaml']?.visible).toBeUndefined();
  });

  it('uses activeLayout override for the activeSchemaId', () => {
    const storedLayout = layoutWith({ Old: { x: 0, y: 0 } });
    const liveLayout = layoutWith({ New: { x: 99, y: 88 } });
    const sf = makeSchemaFile('s1', 'main.yaml', storedLayout);
    const project = makeProject([sf]);
    const data = buildManifestData(project, 's1', liveLayout, new Set());
    expect(data.schemas?.['main.yaml']?.layout?.nodes?.['New']).toEqual({ x: 99, y: 88 });
    expect(data.schemas?.['main.yaml']?.layout?.nodes?.['Old']).toBeUndefined();
  });

  it('preserves collapsed flag on nodes', () => {
    const layout = layoutWith({ MyClass: { x: 0, y: 0, collapsed: true } });
    const sf = makeSchemaFile('s1', 'main.yaml', layout);
    const project = makeProject([sf]);
    const data = buildManifestData(project, null, null, new Set());
    expect(data.schemas?.['main.yaml']?.layout?.nodes?.['MyClass']?.collapsed).toBe(true);
  });
});

// ── applyManifestToSchemas ────────────────────────────────────────────────────

describe('applyManifestToSchemas', () => {
  it('restores node positions from manifest', () => {
    const sf = makeSchemaFile('s1', 'main.yaml');
    const manifest: EditorManifestData = {
      version: 1,
      schemas: {
        'main.yaml': {
          layout: { nodes: { MyClass: { x: 120, y: 80 } } },
        },
      },
    };
    const { schemas } = applyManifestToSchemas([sf], manifest);
    expect(schemas[0].canvasLayout.nodes['MyClass']).toEqual({ x: 120, y: 80 });
  });

  it('restores viewport from manifest', () => {
    const sf = makeSchemaFile('s1', 'main.yaml');
    const manifest: EditorManifestData = {
      version: 1,
      schemas: {
        'main.yaml': {
          layout: {
            nodes: { A: { x: 0, y: 0 } },
            viewport: { x: 30, y: 40, zoom: 2 },
          },
        },
      },
    };
    const { schemas } = applyManifestToSchemas([sf], manifest);
    expect(schemas[0].canvasLayout.viewport).toEqual({ x: 30, y: 40, zoom: 2 });
  });

  it('defaults viewport to origin when manifest omits it', () => {
    const sf = makeSchemaFile('s1', 'main.yaml');
    const manifest: EditorManifestData = {
      version: 1,
      schemas: {
        'main.yaml': {
          layout: { nodes: { A: { x: 0, y: 0 } } },
        },
      },
    };
    const { schemas } = applyManifestToSchemas([sf], manifest);
    expect(schemas[0].canvasLayout.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('leaves schema with no manifest entry with empty nodes (triggers auto-layout)', () => {
    const sf = makeSchemaFile('s1', 'main.yaml');
    const manifest: EditorManifestData = { version: 1 }; // no schemas key
    const { schemas } = applyManifestToSchemas([sf], manifest);
    // Empty nodes → SchemaCanvas will call runAutoLayout
    expect(Object.keys(schemas[0].canvasLayout.nodes)).toHaveLength(0);
  });

  it('applies layout to matched schemas but not unmatched ones', () => {
    const s1 = makeSchemaFile('s1', 'with-layout.yaml');
    const s2 = makeSchemaFile('s2', 'no-layout.yaml');
    const manifest: EditorManifestData = {
      version: 1,
      schemas: {
        'with-layout.yaml': {
          layout: { nodes: { Foo: { x: 5, y: 6 } } },
        },
      },
    };
    const { schemas } = applyManifestToSchemas([s1, s2], manifest);
    expect(Object.keys(schemas[0].canvasLayout.nodes)).toHaveLength(1);
    expect(Object.keys(schemas[1].canvasLayout.nodes)).toHaveLength(0); // no layout → auto-layout
  });

  it('tracks hidden schema ids', () => {
    const s1 = makeSchemaFile('s1', 'hidden.yaml');
    const s2 = makeSchemaFile('s2', 'visible.yaml');
    const manifest: EditorManifestData = {
      version: 1,
      schemas: {
        'hidden.yaml': { visible: false },
      },
    };
    const { hiddenSchemaIds } = applyManifestToSchemas([s1, s2], manifest);
    expect(hiddenSchemaIds.has('s1')).toBe(true);
    expect(hiddenSchemaIds.has('s2')).toBe(false);
  });

  it('does not mutate input schema objects', () => {
    const sf = makeSchemaFile('s1', 'main.yaml');
    const originalLayout = sf.canvasLayout;
    const manifest: EditorManifestData = {
      version: 1,
      schemas: { 'main.yaml': { layout: { nodes: { X: { x: 1, y: 2 } } } } },
    };
    const { schemas } = applyManifestToSchemas([sf], manifest);
    expect(schemas[0]).not.toBe(sf); // new object returned
    expect(sf.canvasLayout).toBe(originalLayout); // original untouched
  });
});

// ── Round-trip: buildManifestData → YAML → parse → applyManifestToSchemas ────

describe('layout round-trip (buildManifestData → YAML → applyManifestToSchemas)', () => {
  it('preserves node positions exactly through a full emit/re-parse cycle', () => {
    const layout = layoutWith({
      PersonClass: { x: 120, y: 80 },
      AddressClass: { x: 300, y: 80, collapsed: true },
    });
    const sf = makeSchemaFile('s1', 'schema.yaml', layout);
    const project = makeProject([sf]);

    // Emit to YAML
    const data = buildManifestData(project, null, null, new Set());
    const yaml = jsyaml.dump(data, { indent: 2, lineWidth: 120 });

    // Re-parse from YAML
    const reparsed = jsyaml.load(yaml) as EditorManifestData;
    const { schemas } = applyManifestToSchemas([makeSchemaFile('s1', 'schema.yaml')], reparsed);

    expect(schemas[0].canvasLayout.nodes['PersonClass']).toEqual({ x: 120, y: 80 });
    expect(schemas[0].canvasLayout.nodes['AddressClass']).toEqual({ x: 300, y: 80, collapsed: true });
  });

  it('emitting the same layout data twice produces identical YAML', () => {
    const layout = layoutWith({ Foo: { x: 10, y: 20 }, Bar: { x: 30, y: 40 } });
    const sf = makeSchemaFile('s1', 'schema.yaml', layout);
    const project = makeProject([sf]);

    const data1 = buildManifestData(project, null, null, new Set());
    const data2 = buildManifestData(project, null, null, new Set());
    const yaml1 = jsyaml.dump(data1, { indent: 2, lineWidth: 120 });
    const yaml2 = jsyaml.dump(data2, { indent: 2, lineWidth: 120 });
    expect(yaml1).toBe(yaml2);
  });

  it('modified layout re-opened preserves changed positions exactly', () => {
    const initial = layoutWith({ MyClass: { x: 0, y: 0 } });
    const sf = makeSchemaFile('s1', 'schema.yaml', initial);
    const project = makeProject([sf]);

    // First save
    const data1 = buildManifestData(project, null, null, new Set());
    const yaml1 = jsyaml.dump(data1, { indent: 2 });
    const reparsed1 = jsyaml.load(yaml1) as EditorManifestData;
    const { schemas: schemas1 } = applyManifestToSchemas([makeSchemaFile('s1', 'schema.yaml')], reparsed1);
    expect(schemas1[0].canvasLayout.nodes['MyClass']).toEqual({ x: 0, y: 0 });

    // Simulate user moving the node
    const modified = layoutWith({ MyClass: { x: 250, y: 175 } });
    const sfMoved = { ...sf, canvasLayout: modified };
    const projectMoved = makeProject([sfMoved]);

    // Second save
    const data2 = buildManifestData(projectMoved, null, null, new Set());
    const yaml2 = jsyaml.dump(data2, { indent: 2 });
    const reparsed2 = jsyaml.load(yaml2) as EditorManifestData;
    const { schemas: schemas2 } = applyManifestToSchemas([makeSchemaFile('s1', 'schema.yaml')], reparsed2);
    expect(schemas2[0].canvasLayout.nodes['MyClass']).toEqual({ x: 250, y: 175 });
  });
});

// ── readEditorManifest ────────────────────────────────────────────────────────

describe('readEditorManifest', () => {
  it('returns parsed manifest when the file exists and version is 1', async () => {
    const manifestData: EditorManifestData = {
      version: 1,
      schemas: { 'main.yaml': { layout: { nodes: { A: { x: 1, y: 2 } } } } },
    };
    const platform = {
      readFile: vi.fn().mockResolvedValue(jsyaml.dump(manifestData)),
      writeFile: vi.fn(),
    };
    const result = await readEditorManifest(platform as unknown as PlatformAPI, '/root');
    expect(result).not.toBeNull();
    expect(result!.version).toBe(1);
    expect(result!.schemas?.['main.yaml']?.layout?.nodes?.['A']).toEqual({ x: 1, y: 2 });
  });

  it('returns null when the file does not exist', async () => {
    const platform = {
      readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
      writeFile: vi.fn(),
    };
    const result = await readEditorManifest(platform as unknown as PlatformAPI, '/root');
    expect(result).toBeNull();
  });

  it('returns null when YAML is malformed', async () => {
    const platform = {
      readFile: vi.fn().mockResolvedValue('{ not valid yaml: ['),
      writeFile: vi.fn(),
    };
    const result = await readEditorManifest(platform as unknown as PlatformAPI, '/root');
    expect(result).toBeNull();
  });

  it('returns null when version field is not 1', async () => {
    const platform = {
      readFile: vi.fn().mockResolvedValue('version: 2\n'),
      writeFile: vi.fn(),
    };
    const result = await readEditorManifest(platform as unknown as PlatformAPI, '/root');
    expect(result).toBeNull();
  });

  it('uses the correct file path (rootPath + MANIFEST_FILENAME)', async () => {
    const platform = {
      readFile: vi.fn().mockRejectedValue(new Error('nope')),
      writeFile: vi.fn(),
    };
    await readEditorManifest(platform as unknown as PlatformAPI, '/my/project');
    expect(platform.readFile).toHaveBeenCalledWith(`/my/project/${MANIFEST_FILENAME}`);
  });
});

// ── writeEditorManifest ───────────────────────────────────────────────────────

describe('writeEditorManifest', () => {
  it('writes YAML to the correct path', async () => {
    const platform = {
      readFile: vi.fn(),
      writeFile: vi.fn().mockResolvedValue(undefined),
    };
    const data: EditorManifestData = { version: 1 };
    await writeEditorManifest(platform as unknown as PlatformAPI, '/root', data);
    expect(platform.writeFile).toHaveBeenCalledWith(
      `/root/${MANIFEST_FILENAME}`,
      expect.stringContaining('version: 1')
    );
  });

  it('silently ignores write errors (non-critical)', async () => {
    const platform = {
      readFile: vi.fn(),
      writeFile: vi.fn().mockRejectedValue(new Error('Read-only filesystem')),
    };
    await expect(
      writeEditorManifest(platform as unknown as PlatformAPI, '/root', { version: 1 })
    ).resolves.not.toThrow();
  });

  it('round-trips: write then read returns the same data', async () => {
    let stored = '';
    const platform = {
      readFile: vi.fn().mockImplementation(() => Promise.resolve(stored)),
      writeFile: vi.fn().mockImplementation((_path: string, content: string) => {
        stored = content;
        return Promise.resolve();
      }),
    };
    const data: EditorManifestData = {
      version: 1,
      schemas: {
        'a.yaml': {
          layout: { nodes: { ClassA: { x: 10, y: 20 } }, viewport: { x: 5, y: 5, zoom: 1.2 } },
        },
      },
    };
    await writeEditorManifest(platform as unknown as PlatformAPI, '/root', data);
    const reparsed = await readEditorManifest(platform as unknown as PlatformAPI, '/root');
    expect(reparsed).toEqual(data);
  });
});

// ── Auto-layout guard condition ───────────────────────────────────────────────

describe('auto-layout guard condition', () => {
  // SchemaCanvas.tsx fires runAutoLayout when:
  //   Object.keys(activeSchemaFile.canvasLayout.nodes).length === 0
  // These tests verify the data-layer invariants that drive that decision.

  it('schema with no manifest entry has empty canvasLayout.nodes (auto-layout fires)', () => {
    const sf = makeSchemaFile('s1', 'schema.yaml');
    const { schemas } = applyManifestToSchemas([sf], { version: 1 });
    expect(Object.keys(schemas[0].canvasLayout.nodes)).toHaveLength(0);
  });

  it('schema with manifest layout has non-empty canvasLayout.nodes (auto-layout skipped)', () => {
    const sf = makeSchemaFile('s1', 'schema.yaml');
    const manifest: EditorManifestData = {
      version: 1,
      schemas: { 'schema.yaml': { layout: { nodes: { Foo: { x: 0, y: 0 } } } } },
    };
    const { schemas } = applyManifestToSchemas([sf], manifest);
    expect(Object.keys(schemas[0].canvasLayout.nodes).length).toBeGreaterThan(0);
  });

  it('project with mixed schemas: only the no-layout schema triggers auto-layout', () => {
    const sWithLayout = makeSchemaFile('s1', 'has-layout.yaml');
    const sNoLayout = makeSchemaFile('s2', 'needs-layout.yaml');
    const manifest: EditorManifestData = {
      version: 1,
      schemas: {
        'has-layout.yaml': { layout: { nodes: { A: { x: 1, y: 1 } } } },
      },
    };
    const { schemas } = applyManifestToSchemas([sWithLayout, sNoLayout], manifest);

    const needsAutoLayout = schemas.filter(
      (s) => Object.keys(s.canvasLayout.nodes).length === 0
    );
    const hasLayout = schemas.filter(
      (s) => Object.keys(s.canvasLayout.nodes).length > 0
    );

    expect(needsAutoLayout).toHaveLength(1);
    expect(needsAutoLayout[0].id).toBe('s2');
    expect(hasLayout).toHaveLength(1);
    expect(hasLayout[0].id).toBe('s1');
  });
});

// ── B4 migration: ghost__/importGroup__ key migration ─────────────────────────

describe('applyManifestToSchemas — B4 ghost__ key migration', () => {
  it('rewrites ghost__<name> keys to bare <name> on read', () => {
    const sf = makeSchemaFile('s1', 'schema.yaml');
    const manifest: EditorManifestData = {
      version: 1,
      schemas: {
        'schema.yaml': {
          layout: {
            nodes: {
              'ghost__Person': { x: 100, y: 200 },
              'ghost__Animal': { x: 300, y: 400 },
            },
          },
        },
      },
    };
    const { schemas } = applyManifestToSchemas([sf], manifest);
    const nodes = schemas[0].canvasLayout.nodes;
    expect(nodes['Person']).toEqual({ x: 100, y: 200 });
    expect(nodes['Animal']).toEqual({ x: 300, y: 400 });
    expect(Object.keys(nodes).some((k) => k.startsWith('ghost__'))).toBe(false);
  });

  it('drops importGroup__ keys', () => {
    const sf = makeSchemaFile('s1', 'schema.yaml');
    const manifest: EditorManifestData = {
      version: 1,
      schemas: {
        'schema.yaml': {
          layout: {
            nodes: {
              'importGroup__base.yaml': { x: 0, y: 0 },
              'ghost__Person': { x: 10, y: 20 },
              'LocalClass': { x: 50, y: 60 },
            },
          },
        },
      },
    };
    const { schemas } = applyManifestToSchemas([sf], manifest);
    const nodes = schemas[0].canvasLayout.nodes;
    expect(Object.keys(nodes)).not.toContain('importGroup__base.yaml');
    expect(nodes['Person']).toEqual({ x: 10, y: 20 });
    expect(nodes['LocalClass']).toEqual({ x: 50, y: 60 });
  });

  it('existing plain-name entry wins over ghost__ entry on collision', () => {
    const sf = makeSchemaFile('s1', 'schema.yaml');
    const manifest: EditorManifestData = {
      version: 1,
      schemas: {
        'schema.yaml': {
          layout: {
            nodes: {
              'ghost__Person': { x: 100, y: 200 },
              'Person': { x: 999, y: 999 },
            },
          },
        },
      },
    };
    const { schemas } = applyManifestToSchemas([sf], manifest);
    const nodes = schemas[0].canvasLayout.nodes;
    expect(nodes['Person']).toEqual({ x: 999, y: 999 });
    expect(Object.keys(nodes).some((k) => k.startsWith('ghost__'))).toBe(false);
  });

  it('is idempotent — migrating an already-migrated manifest is a no-op', () => {
    const sf = makeSchemaFile('s1', 'schema.yaml');
    const manifest: EditorManifestData = {
      version: 1,
      schemas: {
        'schema.yaml': {
          layout: {
            nodes: { Person: { x: 10, y: 20 }, LocalClass: { x: 50, y: 60 } },
          },
        },
      },
    };
    const { schemas } = applyManifestToSchemas([sf], manifest);
    const nodes = schemas[0].canvasLayout.nodes;
    expect(nodes).toEqual({ Person: { x: 10, y: 20 }, LocalClass: { x: 50, y: 60 } });
  });
});

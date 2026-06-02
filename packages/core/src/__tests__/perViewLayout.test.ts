import { describe, it, expect } from 'vitest';
import { selectEffectiveLayout } from '../canvas/layoutUtils.js';
import { buildManifestData, applyManifestToSchemas } from '../io/editorManifest.js';
import type { ViewDefinition, ViewLayout } from '../io/editorManifest.js';
import type { Project, SchemaFile } from '../model/index.js';
import { emptyCanvasLayout } from '../model/index.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

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

const SCHEMA_LAYOUT = {
  nodes: { ClassA: { x: 10, y: 20 }, ClassB: { x: 200, y: 20 } },
  viewport: { x: 0, y: 0, zoom: 1 },
};

// ── selectEffectiveLayout ──────────────────────────────────────────────────────

describe('selectEffectiveLayout', () => {
  it('returns schemaLayout when no view or subset is active', () => {
    const result = selectEffectiveLayout(SCHEMA_LAYOUT, null, [], null, {}, {});
    expect(result).toBe(SCHEMA_LAYOUT);
  });

  it('returns schemaLayout when view has no stored layout (seeding)', () => {
    const views: ViewDefinition[] = [
      { id: 'v1', name: 'V', members: [], renderMode: 'canvas' },
    ];
    const result = selectEffectiveLayout(SCHEMA_LAYOUT, 'v1', views, null, {}, {});
    expect(result).toBe(SCHEMA_LAYOUT);
  });

  it('returns view layout when view has a stored layout', () => {
    const viewLayout: ViewLayout = { nodes: { ClassA: { x: 999, y: 0 } }, viewport: { x: 0, y: 0, zoom: 1 } };
    const views: ViewDefinition[] = [
      { id: 'v1', name: 'V', members: [], renderMode: 'canvas', layout: viewLayout },
    ];
    const result = selectEffectiveLayout(SCHEMA_LAYOUT, 'v1', views, null, {}, {});
    expect(result.nodes['ClassA']?.x).toBe(999);
  });

  it('merges drag overlay on top of view layout', () => {
    const viewLayout: ViewLayout = { nodes: { ClassA: { x: 100, y: 0 }, ClassB: { x: 200, y: 0 } } };
    const views: ViewDefinition[] = [
      { id: 'v1', name: 'V', members: [], renderMode: 'canvas', layout: viewLayout },
    ];
    const overlay = { ClassA: { x: 150, y: 50 } };
    const result = selectEffectiveLayout(SCHEMA_LAYOUT, 'v1', views, null, {}, overlay);
    expect(result.nodes['ClassA']).toEqual({ x: 150, y: 50 });
    expect(result.nodes['ClassB']).toEqual({ x: 200, y: 0 });
  });

  it('returns schemaLayout when subset has no stored layout (seeding)', () => {
    const result = selectEffectiveLayout(
      SCHEMA_LAYOUT, null, [],
      { type: 'subset', subsetName: 'MySubset' },
      {},
      {}
    );
    expect(result).toBe(SCHEMA_LAYOUT);
  });

  it('returns subset layout when subset has a stored layout', () => {
    const sLayout: ViewLayout = { nodes: { ClassA: { x: 777, y: 0 } } };
    const result = selectEffectiveLayout(
      SCHEMA_LAYOUT, null, [],
      { type: 'subset', subsetName: 'MySubset' },
      { MySubset: sLayout },
      {}
    );
    expect(result.nodes['ClassA']?.x).toBe(777);
  });

  it('view takes precedence over subset focus mode', () => {
    const viewLayout: ViewLayout = { nodes: { ClassA: { x: 111, y: 0 } } };
    const sLayout: ViewLayout = { nodes: { ClassA: { x: 222, y: 0 } } };
    const views: ViewDefinition[] = [
      { id: 'v1', name: 'V', members: [], renderMode: 'canvas', layout: viewLayout },
    ];
    const result = selectEffectiveLayout(
      SCHEMA_LAYOUT, 'v1', views,
      { type: 'subset', subsetName: 'MySubset' },
      { MySubset: sLayout },
      {}
    );
    expect(result.nodes['ClassA']?.x).toBe(111);
  });

  it('schema layout nodes are NOT modified when view is active (bleed prevention)', () => {
    const viewLayout: ViewLayout = { nodes: { ClassA: { x: 999, y: 0 } } };
    const views: ViewDefinition[] = [
      { id: 'v1', name: 'V', members: [], renderMode: 'canvas', layout: viewLayout },
    ];
    const beforeA = SCHEMA_LAYOUT.nodes['ClassA']?.x;
    selectEffectiveLayout(SCHEMA_LAYOUT, 'v1', views, null, {}, { ClassA: { x: 500, y: 0 } });
    expect(SCHEMA_LAYOUT.nodes['ClassA']?.x).toBe(beforeA); // schema untouched
  });
});

// ── subsetLayouts manifest round-trip ─────────────────────────────────────────

describe('subsetLayouts manifest round-trip', () => {
  it('buildManifestData includes subsetLayouts', () => {
    const project = makeProject(['schema.yaml']);
    const subsetLayouts: Record<string, ViewLayout> = {
      MySubset: { nodes: { ClassA: { x: 50, y: 60 } }, viewport: { x: 0, y: 0, zoom: 1 } },
    };
    const manifest = buildManifestData(project, null, null, new Set(), [], null, subsetLayouts);
    expect(manifest.subsetLayouts).toBeDefined();
    expect(manifest.subsetLayouts!['MySubset'].nodes['ClassA']).toEqual({ x: 50, y: 60 });
  });

  it('buildManifestData omits subsetLayouts when empty', () => {
    const project = makeProject(['schema.yaml']);
    const manifest = buildManifestData(project, null, null, new Set(), [], null, {});
    expect(manifest.subsetLayouts).toBeUndefined();
  });

  it('applyManifestToSchemas returns subsetLayouts', () => {
    const schemas = makeProject(['schema.yaml']).schemas;
    const { subsetLayouts } = applyManifestToSchemas(schemas, {
      version: 1,
      subsetLayouts: {
        CoreSubset: { nodes: { ClassX: { x: 10, y: 20 } } },
      },
    });
    expect(subsetLayouts['CoreSubset'].nodes['ClassX']).toEqual({ x: 10, y: 20 });
  });

  it('applyManifestToSchemas returns empty subsetLayouts when absent', () => {
    const schemas = makeProject(['schema.yaml']).schemas;
    const { subsetLayouts } = applyManifestToSchemas(schemas, { version: 1 });
    expect(subsetLayouts).toEqual({});
  });
});

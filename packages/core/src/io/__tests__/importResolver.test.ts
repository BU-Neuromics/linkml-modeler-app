import { describe, it, expect, vi } from 'vitest';
import {
  isLocalImport,
  isUrlImport,
  resolveImportPath,
  buildDependencyGraph,
  collectImportedEntities,
  findMissingImport,
  collectReferencedImportedEntities,
  resolveImports,
} from '../importResolver.js';
import type { SchemaFile } from '../../model/index.js';
import {
  emptyCanvasLayout,
  emptySchema,
  emptyClassDefinition,
  emptyEnumDefinition,
} from '../../model/index.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSchemaFile(filePath: string, overrides: Partial<SchemaFile> = {}): SchemaFile {
  const name = filePath.replace(/^.*\//, '').replace(/\.ya?ml$/, '').replace(/https?:\/\/.*\//, '');
  return {
    id: crypto.randomUUID(),
    filePath,
    schema: emptySchema(name, `https://example.org/${name}`, name),
    isDirty: false,
    canvasLayout: emptyCanvasLayout(),
    ...overrides,
  };
}

// ── isLocalImport ─────────────────────────────────────────────────────────────

describe('isLocalImport', () => {
  it('returns true for relative path starting with ./', () => {
    expect(isLocalImport('./common')).toBe(true);
  });

  it('returns true for relative path starting with ../', () => {
    expect(isLocalImport('../shared/types')).toBe(true);
  });

  it('returns true for absolute path starting with /', () => {
    expect(isLocalImport('/absolute/path')).toBe(true);
  });

  it('returns true for bare relative name (no colon, no http)', () => {
    expect(isLocalImport('common')).toBe(true);
  });

  it('returns false for namespace imports like linkml:types', () => {
    expect(isLocalImport('linkml:types')).toBe(false);
  });

  it('returns false for other colon-containing strings', () => {
    expect(isLocalImport('foo:bar')).toBe(false);
  });

  it('returns false for http URLs', () => {
    expect(isLocalImport('http://example.org/schema')).toBe(false);
  });

  it('returns false for https URLs', () => {
    expect(isLocalImport('https://example.org/schema')).toBe(false);
  });
});

// ── isUrlImport ───────────────────────────────────────────────────────────────

describe('isUrlImport', () => {
  it('returns true for http URL', () => {
    expect(isUrlImport('http://example.org/schema')).toBe(true);
  });

  it('returns true for https URL', () => {
    expect(isUrlImport('https://example.org/schema.yaml')).toBe(true);
  });

  it('returns false for relative path', () => {
    expect(isUrlImport('./common')).toBe(false);
  });

  it('returns false for namespace import', () => {
    expect(isUrlImport('linkml:types')).toBe(false);
  });

  it('returns false for bare name', () => {
    expect(isUrlImport('common')).toBe(false);
  });
});

// ── resolveImportPath ─────────────────────────────────────────────────────────

describe('resolveImportPath', () => {
  it('resolves sibling import', () => {
    expect(resolveImportPath('./common', 'schemas/main.yaml', '')).toBe('schemas/common.yaml');
  });

  it('adds .yaml extension when missing', () => {
    expect(resolveImportPath('./common', 'schemas/main.yaml', '')).toMatch(/\.yaml$/);
  });

  it('preserves existing .yaml extension', () => {
    expect(resolveImportPath('./common.yaml', 'schemas/main.yaml', '')).toBe('schemas/common.yaml');
  });

  it('preserves existing .yml extension', () => {
    const result = resolveImportPath('./common.yml', 'schemas/main.yaml', '');
    expect(result).toBe('schemas/common.yml');
  });

  it('resolves parent directory import', () => {
    expect(resolveImportPath('../shared', 'schemas/sub/main.yaml', '')).toBe('schemas/shared.yaml');
  });

  it('resolves deeply nested parent imports', () => {
    expect(resolveImportPath('../../base', 'a/b/c/main.yaml', '')).toBe('a/base.yaml');
  });

  it('works for file at root (no directory)', () => {
    expect(resolveImportPath('./common', 'main.yaml', '')).toBe('common.yaml');
  });

  it('handles bare name import (no leading dot)', () => {
    const result = resolveImportPath('common', 'schemas/main.yaml', '');
    expect(result).toBe('schemas/common.yaml');
  });
});

// ── buildDependencyGraph ──────────────────────────────────────────────────────

describe('buildDependencyGraph', () => {
  it('returns empty map for empty array', () => {
    expect(buildDependencyGraph([])).toEqual(new Map());
  });

  it('records each schema file in the graph', () => {
    const sf = makeSchemaFile('a.yaml');
    const graph = buildDependencyGraph([sf]);
    expect(graph.has('a.yaml')).toBe(true);
  });

  it('records import relationships', () => {
    const shared = makeSchemaFile('shared.yaml');
    const main = makeSchemaFile('schemas/main.yaml', {
      schema: {
        ...emptySchema('main', 'https://example.org/main', 'main'),
        imports: ['../shared'],
      },
    });

    const graph = buildDependencyGraph([shared, main]);
    expect(graph.get('shared.yaml')?.importedBy).toContain('schemas/main.yaml');
  });

  it('skips namespace imports (linkml:types)', () => {
    const main = makeSchemaFile('main.yaml', {
      schema: {
        ...emptySchema('main', 'https://example.org/main', 'main'),
        imports: ['linkml:types'],
      },
    });
    const graph = buildDependencyGraph([main]);
    expect(graph.has('linkml:types')).toBe(false);
  });

  it('auto-creates node for imported file not in schemas list', () => {
    const main = makeSchemaFile('schemas/main.yaml', {
      schema: {
        ...emptySchema('main', 'https://example.org/main', 'main'),
        imports: ['./common'],
      },
    });
    const graph = buildDependencyGraph([main]);
    expect(graph.has('schemas/common.yaml')).toBe(true);
  });
});

// ── collectImportedEntities ───────────────────────────────────────────────────

describe('collectImportedEntities', () => {
  it('returns empty list when no imports', () => {
    const active = makeSchemaFile('main.yaml');
    const result = collectImportedEntities(active, [active]);
    expect(result).toEqual([]);
  });

  it('collects classes from imported schemas', () => {
    const shared = makeSchemaFile('shared.yaml', {
      schema: {
        ...emptySchema('shared', 'https://example.org/shared', 'shared'),
        classes: { Person: emptyClassDefinition('Person') },
      },
    });
    const main = makeSchemaFile('schemas/main.yaml', {
      schema: {
        ...emptySchema('main', 'https://example.org/main', 'main'),
        imports: ['../shared'],
      },
    });

    const result = collectImportedEntities(main, [main, shared]);
    expect(result.find((e) => e.name === 'Person' && e.type === 'class')).toBeTruthy();
  });

  it('collects enums from imported schemas', () => {
    const shared = makeSchemaFile('shared.yaml', {
      schema: {
        ...emptySchema('shared', 'https://example.org/shared', 'shared'),
        enums: { Status: emptyEnumDefinition('Status') },
      },
    });
    const main = makeSchemaFile('schemas/main.yaml', {
      schema: {
        ...emptySchema('main', 'https://example.org/main', 'main'),
        imports: ['../shared'],
      },
    });

    const result = collectImportedEntities(main, [main, shared]);
    expect(result.find((e) => e.name === 'Status' && e.type === 'enum')).toBeTruthy();
  });

  it('excludes the active schema itself', () => {
    const active = makeSchemaFile('main.yaml', {
      schema: {
        ...emptySchema('main', 'https://example.org/main', 'main'),
        classes: { Local: emptyClassDefinition('Local') },
      },
    });
    const result = collectImportedEntities(active, [active]);
    expect(result.find((e) => e.name === 'Local')).toBeFalsy();
  });

  it('handles URL imports', () => {
    const remote = makeSchemaFile('https://example.org/types.yaml', {
      schema: {
        ...emptySchema('types', 'https://example.org/types', 'types'),
        classes: { Thing: emptyClassDefinition('Thing') },
      },
    });
    const main = makeSchemaFile('main.yaml', {
      schema: {
        ...emptySchema('main', 'https://example.org/main', 'main'),
        imports: ['https://example.org/types.yaml'],
      },
    });

    const result = collectImportedEntities(main, [main, remote]);
    expect(result.find((e) => e.name === 'Thing')).toBeTruthy();
  });

  it('skips schemas not in the imports list', () => {
    const unrelated = makeSchemaFile('unrelated.yaml', {
      schema: {
        ...emptySchema('unrelated', 'https://example.org/unrelated', 'unrelated'),
        classes: { Ghost: emptyClassDefinition('Ghost') },
      },
    });
    const main = makeSchemaFile('main.yaml');
    const result = collectImportedEntities(main, [main, unrelated]);
    expect(result.find((e) => e.name === 'Ghost')).toBeFalsy();
  });
});

// ── findMissingImport ─────────────────────────────────────────────────────────

describe('findMissingImport', () => {
  it('returns null when range is defined locally as class', () => {
    const active = makeSchemaFile('main.yaml', {
      schema: {
        ...emptySchema('main', 'https://example.org/main', 'main'),
        classes: { Person: emptyClassDefinition('Person') },
      },
    });
    expect(findMissingImport('Person', active, [active])).toBeNull();
  });

  it('returns null when already imported', () => {
    const shared = makeSchemaFile('shared.yaml', {
      schema: {
        ...emptySchema('shared', 'https://example.org/shared', 'shared'),
        classes: { Person: emptyClassDefinition('Person') },
      },
    });
    const main = makeSchemaFile('schemas/main.yaml', {
      schema: {
        ...emptySchema('main', 'https://example.org/main', 'main'),
        imports: ['../shared'],
      },
    });
    expect(findMissingImport('Person', main, [main, shared])).toBeNull();
  });

  it('returns relative import path when found in another schema', () => {
    const shared = makeSchemaFile('shared.yaml', {
      schema: {
        ...emptySchema('shared', 'https://example.org/shared', 'shared'),
        classes: { Person: emptyClassDefinition('Person') },
      },
    });
    const main = makeSchemaFile('schemas/main.yaml');
    const result = findMissingImport('Person', main, [main, shared]);
    expect(result).not.toBeNull();
    expect(result).toContain('shared');
  });

  it('returns null when not found anywhere', () => {
    const main = makeSchemaFile('main.yaml');
    expect(findMissingImport('NonExistent', main, [main])).toBeNull();
  });

  it('returns URL path for URL-schema defining the range', () => {
    const remote = makeSchemaFile('https://example.org/types.yaml', {
      schema: {
        ...emptySchema('types', 'https://example.org/types', 'types'),
        classes: { Thing: emptyClassDefinition('Thing') },
      },
    });
    const main = makeSchemaFile('main.yaml');
    const result = findMissingImport('Thing', main, [main, remote]);
    expect(result).toBe('https://example.org/types.yaml');
  });

  it('returns null for locally defined enum', () => {
    const active = makeSchemaFile('main.yaml', {
      schema: {
        ...emptySchema('main', 'https://example.org/main', 'main'),
        enums: { Status: emptyEnumDefinition('Status') },
      },
    });
    expect(findMissingImport('Status', active, [active])).toBeNull();
  });
});

// ── collectReferencedImportedEntities ─────────────────────────────────────────

describe('collectReferencedImportedEntities', () => {
  it('returns empty list when no imports', () => {
    const active = makeSchemaFile('main.yaml');
    expect(collectReferencedImportedEntities(active, [active])).toEqual([]);
  });

  it('filters to only entities actually referenced via is_a', () => {
    const shared = makeSchemaFile('shared.yaml', {
      schema: {
        ...emptySchema('shared', 'https://example.org/shared', 'shared'),
        classes: {
          Person: emptyClassDefinition('Person'),
          Unused: emptyClassDefinition('Unused'),
        },
      },
    });
    const main = makeSchemaFile('schemas/main.yaml', {
      schema: {
        ...emptySchema('main', 'https://example.org/main', 'main'),
        imports: ['../shared'],
        classes: {
          Employee: {
            ...emptyClassDefinition('Employee'),
            isA: 'Person',
          },
        },
      },
    });

    const result = collectReferencedImportedEntities(main, [main, shared]);
    expect(result.find((e) => e.name === 'Person')).toBeTruthy();
    expect(result.find((e) => e.name === 'Unused')).toBeFalsy();
  });

  it('filters to entities referenced via mixin', () => {
    const shared = makeSchemaFile('shared.yaml', {
      schema: {
        ...emptySchema('shared', 'https://example.org/shared', 'shared'),
        classes: {
          Timestamped: { ...emptyClassDefinition('Timestamped'), mixin: true },
          Other: emptyClassDefinition('Other'),
        },
      },
    });
    const main = makeSchemaFile('schemas/main.yaml', {
      schema: {
        ...emptySchema('main', 'https://example.org/main', 'main'),
        imports: ['../shared'],
        classes: {
          Record: {
            ...emptyClassDefinition('Record'),
            mixins: ['Timestamped'],
          },
        },
      },
    });

    const result = collectReferencedImportedEntities(main, [main, shared]);
    expect(result.find((e) => e.name === 'Timestamped')).toBeTruthy();
    expect(result.find((e) => e.name === 'Other')).toBeFalsy();
  });

  it('excludes locally-defined names even if they appear in references', () => {
    const shared = makeSchemaFile('shared.yaml', {
      schema: {
        ...emptySchema('shared', 'https://example.org/shared', 'shared'),
        classes: { Base: emptyClassDefinition('Base') },
      },
    });
    const main = makeSchemaFile('schemas/main.yaml', {
      schema: {
        ...emptySchema('main', 'https://example.org/main', 'main'),
        imports: ['../shared'],
        classes: {
          Base: emptyClassDefinition('Base'), // defined locally
          Child: { ...emptyClassDefinition('Child'), isA: 'Base' },
        },
      },
    });

    // 'Base' is locally defined, so it should NOT appear in referenced imported entities
    const result = collectReferencedImportedEntities(main, [main, shared]);
    expect(result.find((e) => e.name === 'Base')).toBeFalsy();
  });
});

// ── resolveImports (async, with mock platform) ────────────────────────────────

describe('resolveImports', () => {
  function makePlatform(files: Record<string, string>) {
    return {
      readFile: vi.fn(async (path: string) => {
        const content = files[path];
        if (!content) throw new Error(`File not found: ${path}`);
        return content;
      }),
    };
  }

  it('returns empty array when no imports to resolve', async () => {
    const sf = makeSchemaFile('main.yaml');
    const platform = makePlatform({});
    const result = await resolveImports([sf], platform as never, '');
    expect(result).toEqual([]);
  });

  it('resolves a local import file', async () => {
    const commonYaml = 'id: https://example.org/common\nname: common\n';
    const main = makeSchemaFile('schemas/main.yaml', {
      schema: {
        ...emptySchema('main', 'https://example.org/main', 'main'),
        imports: ['./common'],
      },
    });
    const platform = makePlatform({ 'schemas/common.yaml': commonYaml });
    const result = await resolveImports([main], platform as never, '');
    expect(result.length).toBe(1);
    expect(result[0].filePath).toBe('schemas/common.yaml');
    expect(result[0].isReadOnly).toBe(true);
  });

  it('skips already-loaded schemas', async () => {
    const common = makeSchemaFile('common.yaml');
    const main = makeSchemaFile('main.yaml', {
      schema: {
        ...emptySchema('main', 'https://example.org/main', 'main'),
        imports: ['./common'],
      },
    });
    const platform = makePlatform({});
    const result = await resolveImports([main, common], platform as never, '');
    expect(result).toEqual([]);
  });

  it('returns empty when a local file fails to load', async () => {
    const main = makeSchemaFile('main.yaml', {
      schema: {
        ...emptySchema('main', 'https://example.org/main', 'main'),
        imports: ['./missing'],
      },
    });
    const platform = makePlatform({});
    const result = await resolveImports([main], platform as never, '');
    expect(result).toEqual([]);
  });

  it('skips namespace imports (linkml:types)', async () => {
    const main = makeSchemaFile('main.yaml', {
      schema: {
        ...emptySchema('main', 'https://example.org/main', 'main'),
        imports: ['linkml:types'],
      },
    });
    const platform = makePlatform({});
    const result = await resolveImports([main], platform as never, '');
    expect(result).toEqual([]);
  });

  it('resolves transitive imports', async () => {
    const baseYaml = 'id: https://example.org/base\nname: base\n';
    const commonYaml = 'id: https://example.org/common\nname: common\nimports:\n  - ./base\n';
    const main = makeSchemaFile('schemas/main.yaml', {
      schema: {
        ...emptySchema('main', 'https://example.org/main', 'main'),
        imports: ['./common'],
      },
    });
    const platform = makePlatform({
      'schemas/common.yaml': commonYaml,
      'schemas/base.yaml': baseYaml,
    });
    const result = await resolveImports([main], platform as never, '');
    expect(result.length).toBe(2);
    const filePaths = result.map((f) => f.filePath);
    expect(filePaths).toContain('schemas/common.yaml');
    expect(filePaths).toContain('schemas/base.yaml');
  });

  it('respects maxDepth limit', async () => {
    const depth2Yaml = 'id: https://example.org/depth2\nname: depth2\n';
    const depth1Yaml = 'id: https://example.org/depth1\nname: depth1\nimports:\n  - ./depth2\n';
    const main = makeSchemaFile('main.yaml', {
      schema: {
        ...emptySchema('main', 'https://example.org/main', 'main'),
        imports: ['./depth1'],
      },
    });
    const platform = makePlatform({
      'depth1.yaml': depth1Yaml,
      'depth2.yaml': depth2Yaml,
    });
    // maxDepth=1 should only load depth1, not depth2
    const result = await resolveImports([main], platform as never, '', 1);
    const filePaths = result.map((f) => f.filePath);
    expect(filePaths).toContain('depth1.yaml');
    expect(filePaths).not.toContain('depth2.yaml');
  });

  it('resolves relative imports from a URL-sourced schema via sourceUrl', async () => {
    // Schema was fetched from a URL but stored with a clean local filename.
    // sourceUrl must guide import resolution so ./common becomes the correct URL.
    const commonYaml = 'id: https://example.org/schemas/common\nname: common\n';
    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://example.org/schemas/common.yaml') {
        return { ok: true, text: async () => commonYaml };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as never;

    try {
      const main = makeSchemaFile('main.yaml', {
        sourceUrl: 'https://example.org/schemas/main.yaml',
        schema: {
          ...emptySchema('main', 'https://example.org/main', 'main'),
          imports: ['./common'],
        },
      });
      const platform = makePlatform({});
      const result = await resolveImports([main], platform as never, '');
      expect(result.length).toBe(1);
      expect(result[0].filePath).toBe('https://example.org/schemas/common.yaml');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

import { describe, it, expect } from 'vitest';
import { openProjectFromDirectory, looksLikeLinkMLSchema } from '../projectLoader.js';
import type { PlatformAPI, DirEntry } from '../../platform/PlatformContext.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const MINIMAL_SCHEMA = (name: string) =>
  `id: https://example.org/${name}\nname: ${name}\nprefixes:\n  linkml: https://w3id.org/linkml/\nclasses: {}\n`;

const MANIFEST_CONTENT = `version: 1\nschemas: {}\n`;

/**
 * Builds a minimal mock PlatformAPI from a virtual file-system map.
 * Keys are absolute paths (e.g. '/repo/schema/foo.yaml').
 * listDirectory returns direct children of the requested path only.
 */
function makePlatform(files: Record<string, string>): PlatformAPI {
  const allPaths = Object.keys(files);

  function listDirectory(dirPath: string): Promise<DirEntry[]> {
    const prefix = dirPath.endsWith('/') ? dirPath : dirPath + '/';
    const seen = new Set<string>();
    const entries: DirEntry[] = [];

    for (const p of allPaths) {
      if (!p.startsWith(prefix)) continue;
      const rest = p.slice(prefix.length);
      const firstSlash = rest.indexOf('/');
      if (firstSlash === -1) {
        // Direct file child
        const name = rest;
        if (!seen.has(name)) {
          seen.add(name);
          entries.push({ name, path: `${prefix}${name}`, isDirectory: false });
        }
      } else {
        // Direct directory child
        const name = rest.slice(0, firstSlash);
        if (!seen.has(name)) {
          seen.add(name);
          entries.push({ name, path: `${prefix}${name}`, isDirectory: true });
        }
      }
    }
    return Promise.resolve(entries);
  }

  function readFile(path: string): Promise<string> {
    const content = files[path];
    if (content === undefined) return Promise.reject(new Error(`File not found: ${path}`));
    return Promise.resolve(content);
  }

  return { listDirectory, readFile } as unknown as PlatformAPI;
}

// ── looksLikeLinkMLSchema ─────────────────────────────────────────────────────

describe('looksLikeLinkMLSchema', () => {
  it('accepts schema with id + prefixes', () => {
    expect(looksLikeLinkMLSchema('id: https://example.org/x\nprefixes:\n  x: y\n')).toBe(true);
  });

  it('accepts schema with id + classes', () => {
    expect(looksLikeLinkMLSchema('id: https://example.org/x\nclasses:\n  Foo: {}\n')).toBe(true);
  });

  it('rejects content with id only', () => {
    expect(looksLikeLinkMLSchema('id: https://example.org/x\nname: x\n')).toBe(false);
  });

  it('rejects non-schema YAML (e.g. editor manifest)', () => {
    expect(looksLikeLinkMLSchema(MANIFEST_CONTENT)).toBe(false);
  });
});

// ── openProjectFromDirectory — flat (backward compat) ────────────────────────

describe('openProjectFromDirectory — flat directory', () => {
  it('loads a schema at repo root', async () => {
    const platform = makePlatform({
      '/repo/main.yaml': MINIMAL_SCHEMA('main'),
    });
    const { project } = await openProjectFromDirectory('/repo', platform);
    expect(project.schemas).toHaveLength(1);
    expect(project.schemas[0].filePath).toBe('main.yaml');
    expect(project.rootPath).toBe('/repo');
  });

  it('skips non-schema YAML files (e.g. manifest)', async () => {
    const platform = makePlatform({
      '/repo/.linkml-editor.yaml': MANIFEST_CONTENT,
      '/repo/main.yaml': MINIMAL_SCHEMA('main'),
    });
    const { project } = await openProjectFromDirectory('/repo', platform);
    expect(project.schemas).toHaveLength(1);
    expect(project.schemas[0].filePath).toBe('main.yaml');
  });

  it('returns empty schemas when no LinkML files found', async () => {
    const platform = makePlatform({
      '/repo/README.md': '# hello',
    });
    const { project } = await openProjectFromDirectory('/repo', platform);
    expect(project.schemas).toHaveLength(0);
  });
});

// ── openProjectFromDirectory — recursive discovery ────────────────────────────

describe('openProjectFromDirectory — recursive discovery', () => {
  it('finds schemas in a subdirectory', async () => {
    const platform = makePlatform({
      '/repo/schema/hippo.yaml': MINIMAL_SCHEMA('hippo'),
    });
    const { project } = await openProjectFromDirectory('/repo', platform);
    expect(project.schemas).toHaveLength(1);
    expect(project.schemas[0].filePath).toBe('schema/hippo.yaml');
    expect(project.rootPath).toBe('/repo');
  });

  it('finds schemas in nested subdirectories', async () => {
    const platform = makePlatform({
      '/repo/src/schema/a.yaml': MINIMAL_SCHEMA('a'),
      '/repo/src/schema/b.yaml': MINIMAL_SCHEMA('b'),
    });
    const { project } = await openProjectFromDirectory('/repo', platform);
    expect(project.schemas).toHaveLength(2);
    const paths = project.schemas.map((s) => s.filePath).sort();
    expect(paths).toEqual(['src/schema/a.yaml', 'src/schema/b.yaml']);
  });

  it('skips .git and node_modules directories', async () => {
    const platform = makePlatform({
      '/repo/.git/config': 'git config content',
      '/repo/node_modules/pkg/schema.yaml': MINIMAL_SCHEMA('pkg'),
      '/repo/schema/main.yaml': MINIMAL_SCHEMA('main'),
    });
    const { project } = await openProjectFromDirectory('/repo', platform);
    expect(project.schemas).toHaveLength(1);
    expect(project.schemas[0].filePath).toBe('schema/main.yaml');
  });

  it('respects schemaPath to narrow scan root', async () => {
    const platform = makePlatform({
      '/repo/docs/something.yaml': MINIMAL_SCHEMA('docs'),
      '/repo/schema/main.yaml': MINIMAL_SCHEMA('main'),
    });
    const { project } = await openProjectFromDirectory('/repo', platform, 'schema');
    expect(project.schemas).toHaveLength(1);
    expect(project.schemas[0].filePath).toBe('schema/main.yaml');
    expect(project.rootPath).toBe('/repo');
  });

  it('filePath is relative to dirPath even for nested schemas', async () => {
    const platform = makePlatform({
      '/repo/a/b/c.yaml': MINIMAL_SCHEMA('c'),
    });
    const { project } = await openProjectFromDirectory('/repo', platform);
    expect(project.schemas[0].filePath).toBe('a/b/c.yaml');
  });
});

// ── openProjectFromDirectory — marker detection ───────────────────────────────

describe('openProjectFromDirectory — .linkml-editor.yaml marker', () => {
  it('restricts loading to the marker directory when marker found in subdirectory', async () => {
    const platform = makePlatform({
      '/repo/unrelated/thing.yaml': MINIMAL_SCHEMA('thing'),
      '/repo/schema/.linkml-editor.yaml': MANIFEST_CONTENT,
      '/repo/schema/hippo.yaml': MINIMAL_SCHEMA('hippo'),
      '/repo/schema/core.yaml': MINIMAL_SCHEMA('core'),
    });
    const { project } = await openProjectFromDirectory('/repo', platform);
    // Only schemas under /repo/schema/ should be loaded
    expect(project.schemas).toHaveLength(2);
    const paths = project.schemas.map((s) => s.filePath).sort();
    expect(paths).toEqual(['schema/core.yaml', 'schema/hippo.yaml']);
    expect(project.rootPath).toBe('/repo');
  });

  it('shallowest marker wins when multiple markers exist at different depths', async () => {
    const platform = makePlatform({
      '/repo/schema/.linkml-editor.yaml': MANIFEST_CONTENT,
      '/repo/schema/hippo.yaml': MINIMAL_SCHEMA('hippo'),
      '/repo/schema/sub/.linkml-editor.yaml': MANIFEST_CONTENT,
      '/repo/schema/sub/deep.yaml': MINIMAL_SCHEMA('deep'),
    });
    const { project } = await openProjectFromDirectory('/repo', platform);
    // Shallowest marker is /repo/schema/ (depth=1) — both hippo and deep should load
    expect(project.schemas).toHaveLength(2);
    const paths = project.schemas.map((s) => s.filePath).sort();
    expect(paths).toEqual(['schema/hippo.yaml', 'schema/sub/deep.yaml']);
  });

  it('loads all schemas under startDir when no marker is present', async () => {
    const platform = makePlatform({
      '/repo/a/x.yaml': MINIMAL_SCHEMA('x'),
      '/repo/b/y.yaml': MINIMAL_SCHEMA('y'),
    });
    const { project } = await openProjectFromDirectory('/repo', platform);
    expect(project.schemas).toHaveLength(2);
  });

  it('marker at startDir itself does not restrict (all files under startDir loaded)', async () => {
    const platform = makePlatform({
      '/repo/.linkml-editor.yaml': MANIFEST_CONTENT,
      '/repo/a.yaml': MINIMAL_SCHEMA('a'),
      '/repo/sub/b.yaml': MINIMAL_SCHEMA('b'),
    });
    const { project } = await openProjectFromDirectory('/repo', platform);
    // Marker at startDir=dirPath → all files under dirPath are under markerDir
    expect(project.schemas).toHaveLength(2);
    const paths = project.schemas.map((s) => s.filePath).sort();
    expect(paths).toEqual(['a.yaml', 'sub/b.yaml']);
  });
});

// ── openProjectFromDirectory — layout application ─────────────────────────────

describe('openProjectFromDirectory — manifest layout application', () => {
  it('applies layout from dirPath manifest when filePaths match keys', async () => {
    const manifest = `version: 1\nschemas:\n  schema/hippo.yaml:\n    visible: false\n`;
    const platform = makePlatform({
      '/repo/.linkml-editor.yaml': manifest,
      '/repo/schema/hippo.yaml': MINIMAL_SCHEMA('hippo'),
    });
    const { project, hiddenSchemaIds } = await openProjectFromDirectory('/repo', platform);
    expect(project.schemas).toHaveLength(1);
    // hiddenSchemaIds stores schema UUIDs (sf.id), not filePaths
    expect(hiddenSchemaIds.has(project.schemas[0].id)).toBe(true);
  });

  it('manifest at subdirectory is used only as marker, not for layout', async () => {
    const subManifest = `version: 1\nschemas:\n  hippo.yaml:\n    visible: false\n`;
    const platform = makePlatform({
      '/repo/schema/.linkml-editor.yaml': subManifest,
      '/repo/schema/hippo.yaml': MINIMAL_SCHEMA('hippo'),
    });
    const { project, hiddenSchemaIds } = await openProjectFromDirectory('/repo', platform);
    // Sub-manifest contents ignored; no layout applied (readEditorManifest reads from /repo which has no manifest)
    expect(project.schemas).toHaveLength(1);
    expect(hiddenSchemaIds.size).toBe(0);
  });
});

// Project loader — scans a directory for LinkML schemas and builds a Project object.

import type { PlatformAPI } from '../platform/PlatformContext.js';
import type { Project, SchemaFile } from '../model/index.js';
import { emptyCanvasLayout, emptySchema } from '../model/index.js';
import { parseYaml } from '../io/yaml.js';
import { resolveImports } from '../io/importResolver.js';
import { readEditorManifest, applyManifestToSchemas, MANIFEST_FILENAME, type ViewDefinition, type ViewLayout } from '../io/editorManifest.js';

const SKIP_DIR_NAMES = new Set(['.git', 'node_modules']);

function joinPath(base: string, segment: string): string {
  if (!segment || segment === '.') return base;
  const sep = base.includes('\\') ? '\\' : '/';
  const trimmed = base.endsWith('/') || base.endsWith('\\') ? base.slice(0, -1) : base;
  return `${trimmed}${sep}${segment}`;
}

function makeRelative(base: string, full: string): string {
  if (full.startsWith(base + '/')) return full.slice(base.length + 1);
  if (full.startsWith(base + '\\')) return full.slice(base.length + 1);
  return full;
}

function isUnder(dir: string, filePath: string): boolean {
  return filePath.startsWith(dir + '/') || filePath.startsWith(dir + '\\');
}

interface RecursiveScanResult {
  yamlEntries: Array<{ path: string }>;
  markerDirs: Array<{ dir: string; depth: number }>;
}

async function collectFilesRecursive(
  dir: string,
  depth: number,
  platform: PlatformAPI,
  result: RecursiveScanResult
): Promise<void> {
  let entries;
  try {
    entries = await platform.listDirectory(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      await collectFilesRecursive(entry.path, depth + 1, platform, result);
    } else {
      if (entry.name === MANIFEST_FILENAME) {
        result.markerDirs.push({ dir, depth });
      } else if (/\.(ya?ml)$/i.test(entry.name)) {
        result.yamlEntries.push({ path: entry.path });
      }
    }
  }
}

/**
 * Check if a YAML string looks like a LinkML schema by testing for
 * characteristic top-level fields (`id:` and `prefixes:` or `classes:`).
 */
export function looksLikeLinkMLSchema(content: string): boolean {
  const hasId = /^id\s*:/m.test(content);
  const hasPrefixes = /^prefixes\s*:/m.test(content);
  const hasClasses = /^classes\s*:/m.test(content);
  return hasId && (hasPrefixes || hasClasses);
}

/**
 * Recursively scan a directory for YAML/YML files that look like LinkML schemas,
 * parse them, and build a Project object.
 *
 * @param dirPath   Repo/project root — used as `project.rootPath` and manifest location.
 * @param platform  PlatformAPI instance for file I/O.
 * @param schemaPath  Optional sub-path to start scanning from (default `'.'`).
 *   When set (e.g. `'schema'`), only `dirPath/schemaPath/**` is scanned for schemas.
 *   If a `.linkml-editor.yaml` marker is found in a subdirectory during the scan,
 *   loading is further restricted to that subtree; the marker is treated as a
 *   "schemas live here" signal only — its contents are ignored for layout purposes.
 *   Layout is always read from `dirPath/.linkml-editor.yaml`.
 */
export async function openProjectFromDirectory(
  dirPath: string,
  platform: PlatformAPI,
  schemaPath: string = '.'
): Promise<{ project: Project; hiddenSchemaIds: Set<string>; views: ViewDefinition[]; activeViewId: string | null; subsetLayouts: Record<string, ViewLayout> }> {
  const startDir = joinPath(dirPath, schemaPath);

  // Collect all YAML files and manifest locations recursively, skipping .git / node_modules.
  const scanResult: RecursiveScanResult = { yamlEntries: [], markerDirs: [] };
  await collectFilesRecursive(startDir, 0, platform, scanResult);

  // Shallowest marker wins — it signals the intended schema root within the scan tree.
  const markerDir = scanResult.markerDirs.sort((a, b) => a.depth - b.depth)[0]?.dir ?? null;

  // If a marker was found, restrict loading to files under that directory.
  const filteredEntries = markerDir
    ? scanResult.yamlEntries.filter((e) => isUnder(markerDir, e.path))
    : scanResult.yamlEntries;

  const schemaFiles: SchemaFile[] = [];

  for (const entry of filteredEntries) {
    try {
      const content = await platform.readFile(entry.path);
      if (!looksLikeLinkMLSchema(content)) continue;

      const schema = parseYaml(content);
      // filePath is relative to dirPath (the repo root) so that:
      // - save paths (rootPath + '/' + filePath) resolve correctly
      // - manifest keys match on re-open
      // - sibling imports resolve via resolveImportPath (which uses the schema's own subdir)
      const filePath = makeRelative(dirPath, entry.path);

      schemaFiles.push({
        id: crypto.randomUUID(),
        filePath,
        schema,
        isDirty: false,
        canvasLayout: emptyCanvasLayout(),
      });
    } catch {
      continue;
    }
  }

  // Resolve imports; rootPath=dirPath so loadSchemaFile builds dirPath+'/'+filePath.
  const importedFiles = await resolveImports(schemaFiles, platform, dirPath);
  const allSchemas = [...schemaFiles, ...importedFiles];

  // Manifest is always at dirPath (the repo root), regardless of where schemas live.
  const manifest = await readEditorManifest(platform, dirPath);
  const { schemas: schemasWithLayout, hiddenSchemaIds, views, activeViewId, subsetLayouts } = manifest
    ? applyManifestToSchemas(allSchemas, manifest)
    : { schemas: allSchemas, hiddenSchemaIds: new Set<string>(), views: [], activeViewId: null, subsetLayouts: {} as Record<string, ViewLayout> };

  const dirName = dirPath.split(/[\\/]/).filter(Boolean).pop() ?? 'Untitled Project';

  const project: Project = {
    id: crypto.randomUUID(),
    name: dirName,
    rootPath: dirPath,
    schemas: schemasWithLayout,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return { project, hiddenSchemaIds, views, activeViewId, subsetLayouts };
}

/**
 * Fetch a LinkML schema from a URL and wrap it in an in-memory Project.
 * The project has no rootPath, so it behaves like a new unsaved project.
 */
export async function loadDemoSchemaFromUrl(url: string, name: string): Promise<Project> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch demo schema (${response.status} ${response.statusText})`);
  }
  const content = await response.text();
  const schema = parseYaml(content);

  const schemaFile: SchemaFile = {
    id: crypto.randomUUID(),
    filePath: `${name}.yaml`,
    schema,
    isDirty: false,
    canvasLayout: emptyCanvasLayout(),
  };

  return {
    id: crypto.randomUUID(),
    name,
    rootPath: '',
    schemas: [schemaFile],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Fetch a LinkML schema from a URL, validate it, resolve its imports, and
 * wrap everything in a transient Project (no rootPath — the user can Save to
 * a local folder later).
 *
 * Throws a user-friendly Error on CORS/network failures, non-schema content,
 * or YAML parse errors.
 */
export async function openSchemaFromUrl(url: string, platform: PlatformAPI): Promise<Project> {
  let content: string;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    content = await response.text();
  } catch (err) {
    if (err instanceof Error && (err.message.startsWith('HTTP ') || err.message.startsWith('Failed to fetch'))) {
      const isCors = err.message === 'Failed to fetch';
      throw new Error(
        isCors
          ? `Could not reach URL — the server may not allow cross-origin requests (CORS)`
          : err.message
      );
    }
    throw new Error(`Network error: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!looksLikeLinkMLSchema(content)) {
    throw new Error('URL does not appear to contain a LinkML schema (expected id: and classes:/prefixes: fields)');
  }

  const schema = parseYaml(content);

  // Derive a clean filename for save purposes; keep sourceUrl for import resolution.
  let filename: string;
  try {
    const pathname = new URL(url).pathname;
    filename = pathname.split('/').filter(Boolean).pop() ?? 'schema.yaml';
  } catch {
    filename = 'schema.yaml';
  }
  if (!filename.endsWith('.yaml') && !filename.endsWith('.yml')) {
    filename += '.yaml';
  }

  const projectName = schema.name || filename.replace(/\.ya?ml$/, '') || 'Untitled Schema';

  const schemaFile: SchemaFile = {
    id: crypto.randomUUID(),
    filePath: filename,
    schema,
    isDirty: true,     // marks as unsaved so Save → prompts for local folder
    canvasLayout: emptyCanvasLayout(),
    isReadOnly: false,
    sourceUrl: url,
  };

  // Resolve URL-relative imports (sourceUrl on schemaFile guides the resolver)
  const importedFiles = await resolveImports([schemaFile], platform, '');
  const allSchemas = [schemaFile, ...importedFiles];

  return {
    id: crypto.randomUUID(),
    name: projectName,
    rootPath: '',
    schemas: allSchemas,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Create a new empty project with a single blank schema.
 */
export function createNewProject(name: string, rootPath: string = ''): Project {
  const schemaName = name.toLowerCase().replace(/\s+/g, '_');
  const schemaId = `https://example.org/${schemaName}`;

  const schema = emptySchema(schemaName, schemaId, schemaName);

  const schemaFile: SchemaFile = {
    id: crypto.randomUUID(),
    filePath: `${schemaName}.yaml`,
    schema,
    isDirty: false,
    canvasLayout: emptyCanvasLayout(),
  };

  return {
    id: crypto.randomUUID(),
    name,
    rootPath,
    schemas: [schemaFile],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

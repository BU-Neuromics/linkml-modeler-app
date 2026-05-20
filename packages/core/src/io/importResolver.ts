/**
 * Import resolution for multi-schema projects.
 *
 * Resolves LinkML `imports` declarations to file paths, loads the referenced
 * schemas via the platform API, and returns them as read-only SchemaFile
 * entries. Only handles relative path imports (e.g. "../common"). Namespace
 * imports like "linkml:types" are skipped — they are not local files.
 */
import { parseYaml } from './yaml.js';
import type { PlatformAPI } from '../platform/PlatformContext.js';
import type { SchemaFile, LinkMLSchema } from '../model/index.js';
import { emptyCanvasLayout } from '../model/index.js';

/**
 * Checks whether an import string refers to a local relative file path.
 * Namespace imports (e.g. "linkml:types") are not local.
 */
export function isLocalImport(importStr: string): boolean {
  return !importStr.includes(':') && (importStr.startsWith('.') || importStr.startsWith('/') || !importStr.startsWith('http'));
}

/**
 * Checks whether an import string is an HTTP/HTTPS URL.
 */
export function isUrlImport(importStr: string): boolean {
  return importStr.startsWith('http://') || importStr.startsWith('https://');
}

/**
 * Resolves a relative import string against a base URL using the URL constructor.
 * Adds `.yaml` extension if no extension is present.
 */
function resolveImportAsUrl(importStr: string, baseUrl: string): string {
  const withExt = importStr.endsWith('.yaml') || importStr.endsWith('.yml') ? importStr : `${importStr}.yaml`;
  try {
    return new URL(withExt, baseUrl).href;
  } catch {
    return withExt;
  }
}

/**
 * Resolves an import path relative to the schema file's directory.
 * Adds `.yaml` extension if no extension is present.
 */
export function resolveImportPath(importStr: string, schemaFilePath: string, _rootPath: string = ''): string {
  // Get the directory of the importing schema
  const schemaDir = schemaFilePath.includes('/')
    ? schemaFilePath.slice(0, schemaFilePath.lastIndexOf('/'))
    : '';

  // Resolve relative to schema dir
  let resolved = schemaDir ? `${schemaDir}/${importStr}` : importStr;

  // Add .yaml extension if missing
  if (!resolved.endsWith('.yaml') && !resolved.endsWith('.yml')) {
    resolved += '.yaml';
  }

  // Normalize path segments (handle ../ etc.)
  resolved = normalizePath(resolved);

  return resolved;
}

function normalizePath(path: string): string {
  const parts = path.split('/');
  const result: string[] = [];
  for (const part of parts) {
    if (part === '..') {
      result.pop();
    } else if (part !== '.') {
      result.push(part);
    }
  }
  return result.join('/');
}

/**
 * Builds a dependency graph entry for display in the project panel.
 */
export interface SchemaDependency {
  filePath: string;       // Relative path from project root
  importedBy: string[];   // File paths that import this schema
}

export function buildDependencyGraph(schemas: SchemaFile[]): Map<string, SchemaDependency> {
  const graph = new Map<string, SchemaDependency>();

  for (const schema of schemas) {
    if (!graph.has(schema.filePath)) {
      graph.set(schema.filePath, { filePath: schema.filePath, importedBy: [] });
    }

    for (const imp of schema.schema.imports) {
      if (!isLocalImport(imp)) continue;
      const resolved = resolveImportPath(imp, schema.filePath, '');
      if (!graph.has(resolved)) {
        graph.set(resolved, { filePath: resolved, importedBy: [] });
      }
      graph.get(resolved)!.importedBy.push(schema.filePath);
    }
  }

  return graph;
}

/**
 * Fetches a schema from a remote URL and returns it as a read-only SchemaFile.
 */
async function loadSchemaFromUrl(url: string): Promise<SchemaFile | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const content = await response.text();
    const schema = parseYaml(content);
    return {
      id: crypto.randomUUID(),
      filePath: url,
      schema,
      isDirty: false,
      canvasLayout: emptyCanvasLayout(),
      isReadOnly: true,
      sourceUrl: url,
    };
  } catch {
    return null;
  }
}

/**
 * Loads a single schema file from the platform as a read-only SchemaFile.
 */
async function loadSchemaFile(
  filePath: string,
  platform: PlatformAPI,
  rootPath: string
): Promise<SchemaFile | null> {
  try {
    const absPath = rootPath ? `${rootPath}/${filePath}` : filePath;
    const content = await platform.readFile(absPath);
    const schema = parseYaml(content);
    return {
      id: crypto.randomUUID(),
      filePath,
      schema,
      isDirty: false,
      canvasLayout: emptyCanvasLayout(),
      isReadOnly: true,
    };
  } catch {
    return null;
  }
}

/**
 * Resolves all local imports from the given schemas, loading any that are not
 * already loaded. Returns a flat list of new read-only SchemaFile entries
 * (does not include the base schemas passed in).
 *
 * Only resolves one level deep — call recursively if needed, but in practice
 * the caller should pass all known schemas so duplicates are skipped.
 */
export async function resolveImports(
  schemas: SchemaFile[],
  platform: PlatformAPI,
  rootPath: string,
  maxDepth = 5
): Promise<SchemaFile[]> {
  const loaded = new Map<string, SchemaFile>();
  for (const s of schemas) {
    loaded.set(s.filePath, s);
  }

  const queue: Array<{ filePath: string; depth: number }> = [];

  // Seed queue with unresolved imports from the provided schemas
  for (const schema of schemas) {
    // When a schema was fetched from a URL but stored with a clean filePath,
    // use sourceUrl as the base for resolving relative imports.
    const urlBase = isUrlImport(schema.filePath)
      ? schema.filePath
      : (schema.sourceUrl && isUrlImport(schema.sourceUrl) ? schema.sourceUrl : null);

    for (const imp of schema.schema.imports) {
      if (isUrlImport(imp)) {
        if (!loaded.has(imp)) queue.push({ filePath: imp, depth: 1 });
      } else if (isLocalImport(imp)) {
        if (urlBase) {
          const resolved = resolveImportAsUrl(imp, urlBase);
          if (!loaded.has(resolved)) queue.push({ filePath: resolved, depth: 1 });
        } else {
          const resolved = resolveImportPath(imp, schema.filePath, rootPath);
          if (!loaded.has(resolved)) queue.push({ filePath: resolved, depth: 1 });
        }
      }
    }
  }

  const newFiles: SchemaFile[] = [];

  while (queue.length > 0) {
    const { filePath, depth } = queue.shift()!;
    if (loaded.has(filePath) || depth > maxDepth) continue;

    const file = isUrlImport(filePath)
      ? await loadSchemaFromUrl(filePath)
      : await loadSchemaFile(filePath, platform, rootPath);
    if (!file) continue;

    loaded.set(filePath, file);
    newFiles.push(file);

    // Queue transitive imports
    if (depth < maxDepth) {
      // URL-loaded schemas have filePath = url; use URL resolution for their relative imports.
      const transitiveUrlBase = isUrlImport(filePath)
        ? filePath
        : (file.sourceUrl && isUrlImport(file.sourceUrl) ? file.sourceUrl : null);

      for (const imp of file.schema.imports) {
        if (isUrlImport(imp)) {
          if (!loaded.has(imp)) queue.push({ filePath: imp, depth: depth + 1 });
        } else if (isLocalImport(imp)) {
          if (transitiveUrlBase) {
            const resolved = resolveImportAsUrl(imp, transitiveUrlBase);
            if (!loaded.has(resolved)) queue.push({ filePath: resolved, depth: depth + 1 });
          } else {
            const resolved = resolveImportPath(imp, filePath, rootPath);
            if (!loaded.has(resolved)) queue.push({ filePath: resolved, depth: depth + 1 });
          }
        }
      }
    }
  }

  return newFiles;
}

/**
 * Returns all class and enum names from a set of schemas, tagged with their
 * source schema file path. Used to populate ghost nodes and range autocomplete.
 */
export interface ImportedEntity {
  name: string;
  type: 'class' | 'enum';
  sourceFilePath: string;
  schema: LinkMLSchema;
}

export function collectImportedEntities(
  activeSchema: SchemaFile,
  allSchemas: SchemaFile[]
): ImportedEntity[] {
  const activeImports = new Set<string>();

  // Determine which schemas are directly imported
  for (const imp of activeSchema.schema.imports) {
    if (isUrlImport(imp)) {
      activeImports.add(imp); // URL schemas use URL as filePath
    } else if (isLocalImport(imp)) {
      const resolved = resolveImportPath(imp, activeSchema.filePath, '');
      activeImports.add(resolved);
    }
  }

  const entities: ImportedEntity[] = [];

  for (const schema of allSchemas) {
    if (schema.id === activeSchema.id) continue;
    if (!activeImports.has(schema.filePath)) continue;

    for (const name of Object.keys(schema.schema.classes)) {
      entities.push({ name, type: 'class', sourceFilePath: schema.filePath, schema: schema.schema });
    }
    for (const name of Object.keys(schema.schema.enums)) {
      entities.push({ name, type: 'enum', sourceFilePath: schema.filePath, schema: schema.schema });
    }
  }

  return entities;
}

/**
 * Detects whether a slot range in the active schema refers to an entity in
 * another loaded schema (cross-schema reference), and returns the import path
 * needed to satisfy it. Returns null if already imported or not a cross-schema ref.
 */
export function findMissingImport(
  rangeName: string,
  activeSchema: SchemaFile,
  allSchemas: SchemaFile[]
): string | null {
  // Already defined locally?
  if (rangeName in activeSchema.schema.classes || rangeName in activeSchema.schema.enums) {
    return null;
  }

  // Already imported?
  const currentImportPaths = new Set(
    activeSchema.schema.imports.flatMap((imp) => {
      if (isUrlImport(imp)) return [imp];
      if (isLocalImport(imp)) return [resolveImportPath(imp, activeSchema.filePath, '')];
      return [];
    })
  );

  for (const schema of allSchemas) {
    if (schema.id === activeSchema.id) continue;
    if (currentImportPaths.has(schema.filePath)) continue;

    if (rangeName in schema.schema.classes || rangeName in schema.schema.enums) {
      // URL-imported schemas: return the URL as-is (makeRelativeImport would mangle it)
      if (isUrlImport(schema.filePath)) return schema.filePath;
      // Return the relative import path (without .yaml)
      return makeRelativeImport(activeSchema.filePath, schema.filePath);
    }
  }

  return null;
}

/**
 * Returns only the imported entities that are actually referenced by the active
 * schema (via range, is_a, mixins, or union_of). This prevents showing every
 * entity from an imported schema when only a few are used.
 */
export function collectReferencedImportedEntities(
  activeSchema: SchemaFile,
  allSchemas: SchemaFile[]
): ImportedEntity[] {
  const allImported = collectImportedEntities(activeSchema, allSchemas);
  if (allImported.length === 0) return allImported;

  // Build set of names referenced by the active schema's classes
  const referencedNames = new Set<string>();
  for (const classDef of Object.values(activeSchema.schema.classes)) {
    if (classDef.isA) referencedNames.add(classDef.isA);
    for (const m of classDef.mixins) referencedNames.add(m);
    if (classDef.unionOf) {
      for (const u of classDef.unionOf) referencedNames.add(u);
    }
    for (const slot of Object.values(classDef.attributes)) {
      if (slot.range) referencedNames.add(slot.range);
    }
  }

  // Remove names that are defined locally (not imported)
  for (const name of Object.keys(activeSchema.schema.classes)) {
    referencedNames.delete(name);
  }
  for (const name of Object.keys(activeSchema.schema.enums)) {
    referencedNames.delete(name);
  }

  return allImported.filter((e) => referencedNames.has(e.name));
}

function makeRelativeImport(fromFilePath: string, toFilePath: string): string {
  const fromParts = fromFilePath.split('/').slice(0, -1);
  const toParts = toFilePath.replace(/\.ya?ml$/, '').split('/');

  let commonLength = 0;
  for (let i = 0; i < Math.min(fromParts.length, toParts.length); i++) {
    if (fromParts[i] === toParts[i]) commonLength++;
    else break;
  }

  const upCount = fromParts.length - commonLength;
  const remaining = toParts.slice(commonLength);
  const rel = [...Array(upCount).fill('..'), ...remaining].join('/');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

// Project loader — scans a directory for LinkML schemas and builds a Project object.

import type { PlatformAPI } from '../platform/PlatformContext.js';
import type { Project, SchemaFile } from '../model/index.js';
import { emptyCanvasLayout, emptySchema } from '../model/index.js';
import { parseYaml } from '../io/yaml.js';
import { resolveImports } from '../io/importResolver.js';
import { readEditorManifest, applyManifestToSchemas } from '../io/editorManifest.js';

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
 * Scan a directory for YAML/YML files that look like LinkML schemas,
 * parse them, and build a Project object.
 */
export async function openProjectFromDirectory(
  dirPath: string,
  platform: PlatformAPI
): Promise<{ project: Project; hiddenSchemaIds: Set<string> }> {
  const entries = await platform.listDirectory(dirPath);
  const yamlFiles = entries.filter(
    (e) => !e.isDirectory && /\.(ya?ml)$/i.test(e.name)
  );

  const schemaFiles: SchemaFile[] = [];

  for (const entry of yamlFiles) {
    try {
      const content = await platform.readFile(entry.path);
      if (!looksLikeLinkMLSchema(content)) continue;

      const schema = parseYaml(content);
      const relativePath = entry.name; // Top-level files — relative to rootPath

      schemaFiles.push({
        id: crypto.randomUUID(),
        filePath: relativePath,
        schema,
        isDirty: false,
        canvasLayout: emptyCanvasLayout(),
      });
    } catch {
      // Skip files that fail to parse — they may not be valid LinkML
      continue;
    }
  }

  // Resolve imports (local paths + URLs) for all loaded schemas
  const importedFiles = await resolveImports(schemaFiles, platform, dirPath);
  const allSchemas = [...schemaFiles, ...importedFiles];

  // Apply editor manifest (layout + visibility) if present
  const manifest = await readEditorManifest(platform, dirPath);
  const { schemas: schemasWithLayout, hiddenSchemaIds } = manifest
    ? applyManifestToSchemas(allSchemas, manifest)
    : { schemas: allSchemas, hiddenSchemaIds: new Set<string>() };

  const dirName = dirPath.split(/[\\/]/).filter(Boolean).pop() ?? 'Untitled Project';

  const project: Project = {
    id: crypto.randomUUID(),
    name: dirName,
    rootPath: dirPath,
    schemas: schemasWithLayout,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return { project, hiddenSchemaIds };
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

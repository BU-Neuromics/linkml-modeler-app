/**
 * Editor manifest I/O — reads and writes `.linkml-editor.yaml`.
 *
 * This file stores editor-only state (canvas layout, schema visibility) that
 * is intentionally separate from the LinkML schema files. It can be committed
 * to git if desired, or added to .gitignore if teams prefer not to track it.
 *
 * File format (version 1):
 *
 *   version: 1
 *   schemas:
 *     my-schema.yaml:
 *       visible: false        # omitted when true (default)
 *       layout:
 *         nodes:
 *           MyClass: { x: 120, y: 80 }
 *         viewport: { x: 0, y: 0, zoom: 1 }
 */

import * as jsyaml from 'js-yaml';
import type { PlatformAPI } from '../platform/PlatformContext.js';
import type { Project, CanvasLayout, SchemaFile } from '../model/index.js';

export const MANIFEST_FILENAME = '.linkml-editor.yaml';

// ── File format types ─────────────────────────────────────────────────────────

export interface EditorManifestData {
  version: 1;
  schemas?: Record<string, SchemaManifestEntry>;
}

export interface SchemaManifestEntry {
  /** false = hidden in project panel; omitted when true (default) */
  visible?: boolean;
  layout?: {
    nodes: Record<string, { x: number; y: number; collapsed?: boolean }>;
    viewport?: { x: number; y: number; zoom: number };
    labels?: Array<{ id: string; text: string; x: number; y: number; fontSize: number; locked: boolean }>;
  };
}

// ── I/O ───────────────────────────────────────────────────────────────────────

/**
 * Reads `.linkml-editor.yaml` from the project root. Returns null if the file
 * doesn't exist or can't be parsed — callers should treat null as "use defaults".
 */
export async function readEditorManifest(
  platform: PlatformAPI,
  rootPath: string
): Promise<EditorManifestData | null> {
  try {
    const filePath = rootPath ? `${rootPath}/${MANIFEST_FILENAME}` : MANIFEST_FILENAME;
    const content = await platform.readFile(filePath);
    const parsed = jsyaml.load(content);
    if (!parsed || typeof parsed !== 'object') return null;
    const data = parsed as Record<string, unknown>;
    if (data['version'] !== 1) return null;
    return parsed as EditorManifestData;
  } catch {
    return null; // file not found or parse error — use defaults
  }
}

/**
 * Writes `.linkml-editor.yaml` to the project root. Silently ignores errors
 * (e.g., read-only filesystem, OPFS issues) since layout is non-critical.
 */
export async function writeEditorManifest(
  platform: PlatformAPI,
  rootPath: string,
  data: EditorManifestData
): Promise<void> {
  try {
    const filePath = rootPath ? `${rootPath}/${MANIFEST_FILENAME}` : MANIFEST_FILENAME;
    const content = jsyaml.dump(data, { indent: 2, lineWidth: 120 });
    await platform.writeFile(filePath, content);
  } catch {
    // Non-critical — layout loss is acceptable
  }
}

// ── Build / apply ─────────────────────────────────────────────────────────────

/**
 * Builds manifest data from current project state. Only writes non-default
 * entries to keep the file concise (skips schemas that are visible=true with
 * no layout data).
 *
 * Pass `activeSchemaId` + `activeLayout` to include the live canvas layout for
 * the currently-open schema (which may not yet be flushed to the store).
 */
export function buildManifestData(
  project: Project,
  activeSchemaId: string | null,
  activeLayout: CanvasLayout | null,
  hiddenSchemaIds: Set<string>
): EditorManifestData {
  const schemas: Record<string, SchemaManifestEntry> = {};

  for (const sf of project.schemas) {
    const layout: CanvasLayout =
      sf.id === activeSchemaId && activeLayout ? activeLayout : sf.canvasLayout;
    const visible = !hiddenSchemaIds.has(sf.id);
    const hasLayout = Object.keys(layout.nodes).length > 0 || (layout.labels?.length ?? 0) > 0;

    if (hasLayout || !visible) {
      const entry: SchemaManifestEntry = {};
      if (!visible) entry.visible = false;
      if (hasLayout) {
        entry.layout = {
          nodes: layout.nodes,
          ...(layout.viewport.zoom !== 1 || layout.viewport.x !== 0 || layout.viewport.y !== 0
            ? { viewport: layout.viewport }
            : {}),
          ...(layout.labels?.length ? { labels: layout.labels } : {}),
        };
      }
      schemas[sf.filePath] = entry;
    }
  }

  return {
    version: 1,
    ...(Object.keys(schemas).length > 0 ? { schemas } : {}),
  };
}

/**
 * Migrates a node-position map from the old ghost__/importGroup__ key format
 * to the new flat format (bare entity names).
 *
 * Rules (idempotent):
 *   - `ghost__<name>` → `<name>` (existing `<name>` entry wins on collision)
 *   - `importGroup__*` → dropped (compound group nodes no longer exist)
 */
function migrateNodeKeys(
  nodes: Record<string, { x: number; y: number; collapsed?: boolean }>
): Record<string, { x: number; y: number; collapsed?: boolean }> {
  const result: Record<string, { x: number; y: number; collapsed?: boolean }> = {};

  // First pass: copy non-ghost, non-importGroup entries
  for (const [key, value] of Object.entries(nodes)) {
    if (!key.startsWith('ghost__') && !key.startsWith('importGroup__')) {
      result[key] = value;
    }
  }

  // Second pass: promote ghost__ entries (existing plain-name entries win)
  for (const [key, value] of Object.entries(nodes)) {
    if (key.startsWith('ghost__')) {
      const name = key.slice('ghost__'.length);
      if (!(name in result)) {
        result[name] = value;
      }
    }
  }

  return result;
}

/**
 * Applies manifest data to a list of schema files, updating `canvasLayout` in
 * place (returns new SchemaFile objects — does not mutate). Also returns the
 * set of schema IDs that should be hidden.
 */
export function applyManifestToSchemas(
  schemas: SchemaFile[],
  manifest: EditorManifestData
): { schemas: SchemaFile[]; hiddenSchemaIds: Set<string> } {
  const hiddenSchemaIds = new Set<string>();
  const manifestSchemas = manifest.schemas ?? {};

  const updatedSchemas = schemas.map((sf) => {
    const entry = manifestSchemas[sf.filePath];
    if (!entry) return sf;

    if (entry.visible === false) hiddenSchemaIds.add(sf.id);

    if (!entry.layout) return sf;

    const migratedNodes = migrateNodeKeys(entry.layout.nodes ?? {});

    const canvasLayout: CanvasLayout = {
      nodes: migratedNodes,
      viewport: entry.layout.viewport ?? { x: 0, y: 0, zoom: 1 },
      ...(entry.layout.labels?.length ? { labels: entry.layout.labels } : {}),
    };

    return { ...sf, canvasLayout };
  });

  return { schemas: updatedSchemas, hiddenSchemaIds };
}

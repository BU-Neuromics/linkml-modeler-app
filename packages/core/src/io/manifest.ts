/**
 * .linkml-editor.yaml manifest I/O
 *
 * The manifest is a project-level YAML file that stores schema ordering,
 * default open schema, and editor preferences. It lives at the project root
 * as `.linkml-editor.yaml`.
 */
import * as yaml from 'js-yaml';
import type { EditorManifest } from '../model/index.js';

export const MANIFEST_FILENAME = '.linkml-editor.yaml';

export function parseManifest(raw: string): EditorManifest {
  // js-yaml v5 throws "expected a document, but the input is empty" on empty or
  // whitespace-only input, whereas v4 returned undefined. Guard so an empty
  // manifest still yields defaults rather than an exception.
  if (!raw.trim()) return {};
  const obj = yaml.load(raw) as Record<string, unknown> | null;
  if (!obj || typeof obj !== 'object') return {};

  const manifest: EditorManifest = {};

  if (Array.isArray(obj.schema_order)) {
    manifest.schemaOrder = obj.schema_order.filter((x): x is string => typeof x === 'string');
  }
  if (typeof obj.default_open_schema === 'string') {
    manifest.defaultOpenSchema = obj.default_open_schema;
  }
  if (obj.preferences && typeof obj.preferences === 'object') {
    const prefs = obj.preferences as Record<string, unknown>;
    manifest.preferences = {
      autoManageImports: prefs.auto_manage_imports !== false,
      showGhostNodes: prefs.show_ghost_nodes !== false,
      defaultLayout: (['TB', 'BT', 'LR', 'RL'].includes(prefs.default_layout as string)
        ? prefs.default_layout
        : 'TB') as NonNullable<EditorManifest['preferences']>['defaultLayout'],
    };
  }

  return manifest;
}

export function serializeManifest(manifest: EditorManifest): string {
  const obj: Record<string, unknown> = {};

  if (manifest.schemaOrder?.length) {
    obj.schema_order = manifest.schemaOrder;
  }
  if (manifest.defaultOpenSchema) {
    obj.default_open_schema = manifest.defaultOpenSchema;
  }
  if (manifest.preferences) {
    const p = manifest.preferences;
    const prefs: Record<string, unknown> = {};
    if (p.autoManageImports !== undefined) prefs.auto_manage_imports = p.autoManageImports;
    if (p.showGhostNodes !== undefined) prefs.show_ghost_nodes = p.showGhostNodes;
    if (p.defaultLayout) prefs.default_layout = p.defaultLayout;
    if (Object.keys(prefs).length) obj.preferences = prefs;
  }

  return yaml.dump(obj, { lineWidth: 120, noRefs: true });
}
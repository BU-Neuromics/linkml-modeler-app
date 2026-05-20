/**
 * Auto-layout engine using elkjs (Eclipse Layout Kernel).
 *
 * Produces a CanvasLayout by running the ELK `layered` (Sugiyama-style)
 * algorithm over the schema's class/enum graph.
 *
 * Usage:
 *   const layout = await runAutoLayout(schema, {}, ghostEntities);
 *   store.setNodes(deriveGraph(schema, layout).nodes);
 */
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode, ElkExtendedEdge } from 'elkjs/lib/elk-api.js';
import type { LinkMLSchema, CanvasLayout, EdgeLayout } from '../model/index.js';
import type { ImportedEntity } from '../io/importResolver.js';

// Node dimensions used for layout calculations
const CLASS_W = 240;
const CLASS_H = 120;
const ENUM_W = 200;
const ENUM_H = 80;

const elk = new ELK();

export interface AutoLayoutOptions {
  /** ELK algorithm — defaults to layered (Sugiyama) */
  algorithm?: string;
  /** Direction: TB | BT | LR | RL */
  direction?: 'TB' | 'BT' | 'LR' | 'RL';
  /** Spacing between nodes */
  nodeNodeSpacing?: number;
  /** Spacing between hierarchy levels */
  layerSpacing?: number;
}

const DEFAULT_OPTIONS: Required<AutoLayoutOptions> = {
  algorithm: 'layered',
  direction: 'TB',
  nodeNodeSpacing: 40,
  layerSpacing: 80,
};

export async function runAutoLayout(
  schema: LinkMLSchema,
  opts: AutoLayoutOptions = {},
  ghostEntities: ImportedEntity[] = [],
  hiddenEdgeTypes: ReadonlySet<string> = new Set()
): Promise<CanvasLayout> {
  const options = { ...DEFAULT_OPTIONS, ...opts };

  const elkNodes: ElkNode[] = [];
  const elkEdges: ElkExtendedEdge[] = [];
  const edgeSeen = new Set<string>();

  // ── Add class nodes ────────────────────────────────────────────────────────
  for (const className of Object.keys(schema.classes)) {
    elkNodes.push({
      id: className,
      width: CLASS_W,
      height: CLASS_H,
    });
  }

  // ── Add enum nodes ─────────────────────────────────────────────────────────
  for (const enumName of Object.keys(schema.enums)) {
    elkNodes.push({
      id: enumName,
      width: ENUM_W,
      height: ENUM_H,
    });
  }

  const localIds = new Set([
    ...Object.keys(schema.classes),
    ...Object.keys(schema.enums),
  ]);

  // ── Add imported entities as flat leaf nodes ──────────────────────────────
  const allImportedIds = new Set<string>();
  for (const entity of ghostEntities) {
    if (localIds.has(entity.name)) continue; // skip if local definition exists
    allImportedIds.add(entity.name);
    elkNodes.push({
      id: entity.name,
      width: entity.type === 'class' ? CLASS_W : ENUM_W,
      height: entity.type === 'class' ? CLASS_H : ENUM_H,
    });
  }

  // All known IDs for edge validation
  const allIds = new Set([...localIds, ...allImportedIds]);

  // ── Add edges from class relationships ────────────────────────────────────
  for (const [className, classDef] of Object.entries(schema.classes)) {
    // is_a — feed ELK with parent as source so it lays the parent above the child
    if (!hiddenEdgeTypes.has('is_a') && classDef.isA && allIds.has(classDef.isA)) {
      addEdge(elkEdges, edgeSeen, `isa__${className}__${classDef.isA}`, classDef.isA, className);
    }

    // mixins — same reversal so mixin parents render above children
    if (!hiddenEdgeTypes.has('mixin')) {
      for (const m of classDef.mixins) {
        if (allIds.has(m)) {
          addEdge(elkEdges, edgeSeen, `mixin__${className}__${m}`, m, className);
        }
      }
    }

    // union_of
    if (!hiddenEdgeTypes.has('union_of') && classDef.unionOf) {
      for (const u of classDef.unionOf) {
        if (allIds.has(u)) {
          addEdge(elkEdges, edgeSeen, `union__${className}__${u}`, className, u);
        }
      }
    }

    // range edges
    if (!hiddenEdgeTypes.has('range')) {
      for (const [slotName, slot] of Object.entries(classDef.attributes)) {
        if (!slot.range || !allIds.has(slot.range)) continue;
        addEdge(
          elkEdges,
          edgeSeen,
          `range__${className}__${slotName}__${slot.range}`,
          className,
          slot.range
        );
      }
    }
  }

  // ── Build ELK graph ────────────────────────────────────────────────────────
  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': options.algorithm,
      'elk.direction': options.direction,
      'elk.spacing.nodeNode': String(options.nodeNodeSpacing),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(options.layerSpacing),
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children: elkNodes,
    edges: elkEdges,
  };

  try {
    const result = await elk.layout(elkGraph);
    return elkResultToLayout(result);
  } catch (err) {
    // Fallback: return empty layout so grid positions are used
    console.warn('[AutoLayout] ELK layout failed, falling back to grid:', err);
    return { nodes: {}, viewport: { x: 0, y: 0, zoom: 1 } };
  }
}

function addEdge(
  edges: ElkExtendedEdge[],
  seen: Set<string>,
  id: string,
  source: string,
  target: string
) {
  if (seen.has(id)) return;
  seen.add(id);
  edges.push({ id, sources: [source], targets: [target] });
}

/**
 * Extract absolute positions from ELK result. Also captures per-edge bend points.
 */
function elkResultToLayout(elkNode: ElkNode): CanvasLayout {
  const layout: CanvasLayout = {
    nodes: {},
    edges: {},
    viewport: { x: 0, y: 0, zoom: 1 },
  };

  function extractPositions(node: ElkNode, offsetX: number, offsetY: number) {
    for (const child of node.children ?? []) {
      const absX = (child.x ?? 0) + offsetX;
      const absY = (child.y ?? 0) + offsetY;
      layout.nodes[child.id] = { x: absX, y: absY };
      if (child.children?.length) {
        extractPositions(child, absX, absY);
      }
    }
  }

  extractPositions(elkNode, 0, 0);

  // Extract bend points from routed edges (only intermediate points; start/end
  // are discarded in favour of ReactFlow's live handle coordinates).
  for (const edge of elkNode.edges ?? []) {
    const section = (edge as ElkExtendedEdge & { sections?: Array<{ bendPoints?: Array<{ x: number; y: number }> }> }).sections?.[0];
    const bendPoints = section?.bendPoints;
    if (bendPoints && bendPoints.length > 0) {
      const edgeLayout: EdgeLayout = { bendPoints };
      layout.edges![edge.id] = edgeLayout;
    }
  }

  return layout;
}

/**
 * Merge a computed layout with user-adjusted positions stored in a sidecar.
 * User positions take precedence over auto-layout positions.
 */
export function mergeLayouts(
  autoLayout: CanvasLayout,
  sidecar: CanvasLayout
): CanvasLayout {
  return {
    nodes: { ...autoLayout.nodes, ...sidecar.nodes },
    viewport: sidecar.viewport ?? autoLayout.viewport,
  };
}

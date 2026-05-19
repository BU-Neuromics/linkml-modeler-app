/**
 * selectionOps.ts — pure selection-expansion operations (A3).
 *
 * All functions operate on entity names (plain class/enum names, no ghost__ prefix).
 * The caller is responsible for stripping/re-adding the ghost__ prefix when
 * bridging to ReactFlow node IDs stored in selectedNodeIds.
 */
import type { LinkMLSchema } from '../model/index.js';

// ── Adjacency ─────────────────────────────────────────────────────────────────

export type EdgeKind = 'is_a' | 'mixin' | 'range' | 'union_of';

interface AdjEdgeOut {
  target: string;
  kind: EdgeKind;
}

interface AdjEdgeIn {
  source: string;
  kind: EdgeKind;
}

export interface SchemaAdjacency {
  out: Map<string, AdjEdgeOut[]>;
  in: Map<string, AdjEdgeIn[]>;
}

function ensureOut(adj: SchemaAdjacency, name: string): AdjEdgeOut[] {
  let arr = adj.out.get(name);
  if (!arr) { arr = []; adj.out.set(name, arr); }
  return arr;
}

function ensureIn(adj: SchemaAdjacency, name: string): AdjEdgeIn[] {
  let arr = adj.in.get(name);
  if (!arr) { arr = []; adj.in.set(name, arr); }
  return arr;
}

function addEdge(adj: SchemaAdjacency, source: string, target: string, kind: EdgeKind): void {
  ensureOut(adj, source).push({ target, kind });
  ensureIn(adj, target).push({ source, kind });
  // Ensure the other end has entries too (so adj.out/in.has() returns consistent results)
  ensureOut(adj, target);
  ensureIn(adj, source);
}

/**
 * Build an adjacency representation from the active schema.
 *
 * Edge directions mirror deriveGraph.ts:
 *   is_a:    source=parent, target=child
 *   mixin:   source=mixin-parent, target=child
 *   range:   source=class-with-slot, target=range-class/enum
 *   union_of: source=class, target=union-member
 *
 * @param schema         Active schema (classes, enums, slots)
 * @param ghostEntityNames  Optional set of imported entity names to include as endpoints
 */
export function buildAdjacency(
  schema: LinkMLSchema,
  ghostEntityNames?: ReadonlySet<string>,
): SchemaAdjacency {
  const adj: SchemaAdjacency = { out: new Map(), in: new Map() };

  const classSet = new Set(Object.keys(schema.classes));
  const enumSet = new Set(Object.keys(schema.enums ?? {}));
  const ghostSet: ReadonlySet<string> = ghostEntityNames ?? new Set();

  // Pre-seed all known entities so they always have entries (even with no edges)
  for (const name of classSet) { ensureOut(adj, name); ensureIn(adj, name); }
  for (const name of enumSet)  { ensureOut(adj, name); ensureIn(adj, name); }
  for (const name of ghostSet) { ensureOut(adj, name); ensureIn(adj, name); }

  const isKnown = (name: string) => classSet.has(name) || enumSet.has(name) || ghostSet.has(name);

  for (const [className, classDef] of Object.entries(schema.classes)) {
    // is_a: source=parent, target=child
    if (classDef.isA && isKnown(classDef.isA)) {
      addEdge(adj, classDef.isA, className, 'is_a');
    }

    // mixin: source=mixin-parent, target=child
    for (const mixinName of classDef.mixins ?? []) {
      if (isKnown(mixinName)) addEdge(adj, mixinName, className, 'mixin');
    }

    // union_of: source=class, target=union-member
    for (const memberName of classDef.unionOf ?? []) {
      if (isKnown(memberName)) addEdge(adj, className, memberName, 'union_of');
    }

    // range edges from own inline attributes (mirrors deriveGraph.ts)
    for (const slot of Object.values(classDef.attributes ?? {})) {
      const range = slot.range;
      if (!range || range === className) continue;
      if (isKnown(range)) addEdge(adj, className, range, 'range');
    }

    // range edges from schema-level slot references
    for (const slotName of classDef.slots ?? []) {
      const schemaSlot = schema.slots?.[slotName];
      const range = schemaSlot?.range;
      if (!range || range === className) continue;
      if (isKnown(range)) addEdge(adj, className, range, 'range');
    }
  }

  return adj;
}

// ── Operations ────────────────────────────────────────────────────────────────

const INHERIT_KINDS = new Set<EdgeKind>(['is_a', 'mixin']);

/**
 * Return a set of all entity names known in the adjacency (both classes and enums,
 * including ghost entities if they were provided to buildAdjacency).
 */
export function allEntityNames(adj: SchemaAdjacency): Set<string> {
  return new Set(adj.out.keys());
}

/**
 * One-hop neighbors in the given direction.
 * Seeds are excluded from the result.
 */
export function getDirectNeighbors(
  adj: SchemaAdjacency,
  seeds: Iterable<string>,
  direction: 'in' | 'out' | 'both',
  edgeKinds?: ReadonlySet<EdgeKind>,
): Set<string> {
  const seedSet = new Set(seeds);
  const result = new Set<string>();
  for (const name of seedSet) {
    if (direction !== 'in') {
      for (const { target, kind } of adj.out.get(name) ?? []) {
        if (!edgeKinds || edgeKinds.has(kind)) result.add(target);
      }
    }
    if (direction !== 'out') {
      for (const { source, kind } of adj.in.get(name) ?? []) {
        if (!edgeKinds || edgeKinds.has(kind)) result.add(source);
      }
    }
  }
  for (const name of seedSet) result.delete(name);
  return result;
}

/**
 * N-hop expansion in the given direction.
 * Seeds are excluded from the result.
 */
export function getNHopNeighbors(
  adj: SchemaAdjacency,
  seeds: Iterable<string>,
  n: number,
  direction: 'in' | 'out' | 'both',
  edgeKinds?: ReadonlySet<EdgeKind>,
): Set<string> {
  const seedSet = new Set(seeds);
  const visited = new Set<string>(seedSet);
  let frontier = new Set<string>(seedSet);

  for (let hop = 0; hop < n; hop++) {
    const next = new Set<string>();
    for (const name of frontier) {
      if (direction !== 'in') {
        for (const { target, kind } of adj.out.get(name) ?? []) {
          if (!edgeKinds || edgeKinds.has(kind)) {
            if (!visited.has(target)) next.add(target);
          }
        }
      }
      if (direction !== 'out') {
        for (const { source, kind } of adj.in.get(name) ?? []) {
          if (!edgeKinds || edgeKinds.has(kind)) {
            if (!visited.has(source)) next.add(source);
          }
        }
      }
    }
    for (const n of next) visited.add(n);
    frontier = next;
    if (frontier.size === 0) break;
  }

  const result = new Set<string>(visited);
  for (const name of seedSet) result.delete(name);
  return result;
}

/**
 * Transitive ancestors via is_a + mixin edges.
 * Seeds are excluded from the result.
 *
 * In the adjacency: is_a/mixin source=parent, target=child.
 * So ancestors are reached by walking "in" edges from a node.
 */
export function getAncestors(
  adj: SchemaAdjacency,
  seeds: Iterable<string>,
): Set<string> {
  const seedSet = new Set(seeds);
  const result = new Set<string>();
  const queue = [...seedSet];
  const visited = new Set<string>(seedSet);

  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const { source, kind } of adj.in.get(current) ?? []) {
      if (INHERIT_KINDS.has(kind) && !visited.has(source)) {
        visited.add(source);
        result.add(source);
        queue.push(source);
      }
    }
  }
  return result;
}

/**
 * Transitive descendants via is_a + mixin edges.
 * Seeds are excluded from the result.
 *
 * In the adjacency: is_a/mixin source=parent, target=child.
 * So descendants are reached by walking "out" edges from a node.
 */
export function getDescendants(
  adj: SchemaAdjacency,
  seeds: Iterable<string>,
): Set<string> {
  const seedSet = new Set(seeds);
  const result = new Set<string>();
  const queue = [...seedSet];
  const visited = new Set<string>(seedSet);

  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const { target, kind } of adj.out.get(current) ?? []) {
      if (INHERIT_KINDS.has(kind) && !visited.has(target)) {
        visited.add(target);
        result.add(target);
        queue.push(target);
      }
    }
  }
  return result;
}

/**
 * Full connected component — BFS over all edge kinds in both directions.
 * Seeds are excluded from the result.
 */
export function getConnectedComponent(
  adj: SchemaAdjacency,
  seeds: Iterable<string>,
): Set<string> {
  const seedSet = new Set(seeds);
  const visited = new Set<string>(seedSet);
  const queue = [...seedSet];

  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const { target } of adj.out.get(current) ?? []) {
      if (!visited.has(target)) { visited.add(target); queue.push(target); }
    }
    for (const { source } of adj.in.get(current) ?? []) {
      if (!visited.has(source)) { visited.add(source); queue.push(source); }
    }
  }

  const result = new Set<string>(visited);
  for (const name of seedSet) result.delete(name);
  return result;
}

/**
 * Entities reachable via range edges (slot range targets).
 * Seeds are excluded from the result.
 */
export function getRangeTargets(
  adj: SchemaAdjacency,
  seeds: Iterable<string>,
): Set<string> {
  const seedSet = new Set(seeds);
  const result = new Set<string>();
  for (const name of seedSet) {
    for (const { target, kind } of adj.out.get(name) ?? []) {
      if (kind === 'range') result.add(target);
    }
  }
  for (const name of seedSet) result.delete(name);
  return result;
}

/**
 * Classes whose slots reference any seed entity as a range (range sources).
 * Seeds are excluded from the result.
 */
export function getRangeSources(
  adj: SchemaAdjacency,
  seeds: Iterable<string>,
): Set<string> {
  const seedSet = new Set(seeds);
  const result = new Set<string>();
  for (const name of seedSet) {
    for (const { source, kind } of adj.in.get(name) ?? []) {
      if (kind === 'range') result.add(source);
    }
  }
  for (const name of seedSet) result.delete(name);
  return result;
}

/**
 * Invert: all known entities minus the current selection.
 */
export function invertSelection(
  adj: SchemaAdjacency,
  currentSelection: Iterable<string>,
): Set<string> {
  const currentSet = new Set(currentSelection);
  const result = new Set<string>();
  for (const name of adj.out.keys()) {
    if (!currentSet.has(name)) result.add(name);
  }
  return result;
}

// ── Node-ID bridging helpers ──────────────────────────────────────────────────

const GHOST_PREFIX = 'ghost__';

/**
 * Strip the ghost__ prefix from a ReactFlow node ID to get the entity name.
 */
export function nodeIdToEntityName(nodeId: string): string {
  return nodeId.startsWith(GHOST_PREFIX) ? nodeId.slice(GHOST_PREFIX.length) : nodeId;
}

/**
 * Convert an entity name back to its ReactFlow node ID.
 * Ghost entities (imported classes) use the ghost__ prefix; others are plain.
 */
export function entityNameToNodeId(name: string, ghostEntityNames: ReadonlySet<string>): string {
  return ghostEntityNames.has(name) ? `${GHOST_PREFIX}${name}` : name;
}

/**
 * Convert a set of selectedNodeIds (ReactFlow) to entity names, then apply an
 * operation, then convert the result back to ReactFlow node IDs.
 *
 * @param selectedNodeIds  ReactFlow node IDs (may contain ghost__ prefix)
 * @param ghostEntityNames  Names of imported (ghost) entities
 * @param op               Pure function: entity names → entity names
 * @param additive         If true, union result with current selection
 * @returns                New ReactFlow node ID array for setSelection
 */
export function applyOp(
  selectedNodeIds: readonly string[],
  ghostEntityNames: ReadonlySet<string>,
  op: (seeds: Set<string>) => Set<string>,
  additive = false,
): string[] {
  const entityNames = selectedNodeIds.map(nodeIdToEntityName);
  const result = op(new Set(entityNames));

  if (additive) {
    for (const name of entityNames) result.add(name);
  }

  return [...result].map((name) => entityNameToNodeId(name, ghostEntityNames));
}

/**
 * Derives ReactFlow nodes and edges from a LinkMLSchema + CanvasLayout.
 *
 * This is a pure function — no Zustand access here. Call it from a selector
 * or useMemo hook whenever the schema or layout changes.
 */
import type { Node, Edge } from 'reactflow';
import type { LinkMLSchema, CanvasLayout, SlotDefinition } from '../model/index.js';
import type { CanvasNodeData } from '../store/slices/canvasSlice.js';
import type { ClassNodeData, ResolvedSlot } from './ClassNode.js';
import type { EnumNodeData } from './EnumNode.js';
import type { ImportGroupNodeData } from './ImportGroupNode.js';
import type { LinkMLEdgeType } from './edges.js';
import type { ImportedEntity } from '../io/importResolver.js';

// Default node dimensions used before layout runs.
const CLASS_NODE_WIDTH = 240;
const CLASS_NODE_HEIGHT = 120;
const ENUM_NODE_WIDTH = 200;
const ENUM_NODE_HEIGHT = 80;

// Grid fallback positions for nodes that have no layout entry yet.
const GRID_COLS = 5;
const GRID_H_GAP = 280;
const GRID_V_GAP = 160;

// Import group layout constants
const GROUP_PADDING = 16;
const GROUP_HEADER = 36;
const GROUP_INNER_COLS = 3;
const GROUP_INNER_H_GAP = 260;
const GROUP_INNER_V_GAP = 140;

function gridPosition(index: number): { x: number; y: number } {
  const col = index % GRID_COLS;
  const row = Math.floor(index / GRID_COLS);
  return { x: col * GRID_H_GAP, y: row * GRID_V_GAP };
}

/** Compute a grid position for a child within a group container. */
function groupChildPosition(index: number): { x: number; y: number } {
  const col = index % GROUP_INNER_COLS;
  const row = Math.floor(index / GROUP_INNER_COLS);
  return {
    x: GROUP_PADDING + col * GROUP_INNER_H_GAP,
    y: GROUP_HEADER + GROUP_PADDING + row * GROUP_INNER_V_GAP,
  };
}

/** Extract a human-friendly label from a file path. */
function labelFromPath(filePath: string): string {
  const parts = filePath.split('/');
  const file = parts[parts.length - 1];
  return file.replace(/\.ya?ml$/, '');
}

export interface DerivedGraph {
  nodes: Node<CanvasNodeData>[];
  edges: Edge[];
}

/** Returns `{ elkPoints }` if the layout has bend points for this edge, else `undefined`. */
function elkData(layout: CanvasLayout, edgeId: string): { elkPoints: Array<{x: number; y: number}> } | undefined {
  const bends = layout.edges?.[edgeId]?.bendPoints;
  return bends && bends.length > 0 ? { elkPoints: bends } : undefined;
}

/**
 * Chooses east or west based on saved layout positions.
 * Falls back to 'east' when no prior layout exists — first-run ELK typically
 * places sources to the left of targets in the layered algorithm.
 */
function rangeEdgeSide(
  layout: CanvasLayout,
  sourceId: string,
  targetId: string
): 'east' | 'west' {
  const src = layout.nodes[sourceId];
  const tgt = layout.nodes[targetId];
  if (!src || !tgt) return 'east';
  return tgt.x >= src.x ? 'east' : 'west';
}

/** Returns the handle IDs for a range edge given source/target nodes and collapse state. */
function rangeHandles(
  layout: CanvasLayout,
  sourceId: string,
  targetId: string,
  slotName: string,
  sourceCollapsed: boolean
): { sourceHandle: string; targetHandle: string } {
  const side = rangeEdgeSide(layout, sourceId, targetId);
  const sourceHandle = sourceCollapsed ? `side-${side}` : `slot-${side}-${slotName}`;
  const targetHandle = side === 'east' ? 'side-west' : 'side-east';
  return { sourceHandle, targetHandle };
}

/**
 * Recursively collects slots from all ancestors of a class (is_a + mixins),
 * returning them as a Map keyed by slot name. First-encountered ancestor wins
 * when the same slot appears in multiple ancestors. Does NOT include the class's
 * own direct slots — call the loop below for those.
 */
function gatherAncestorSlots(
  className: string,
  schema: LinkMLSchema,
  allSchemaSlots: Record<string, SlotDefinition>,
  visited: Set<string> = new Set()
): Map<string, ResolvedSlot> {
  const classDef = schema.classes[className];
  if (!classDef) return new Map();

  const result = new Map<string, ResolvedSlot>();

  const addOwnSlots = (ancName: string, ancDef: typeof classDef) => {
    for (const slot of Object.values(ancDef.attributes)) {
      if (!result.has(slot.name)) {
        result.set(slot.name, { slot, kind: 'attribute', inherited: true, inheritedFrom: ancName });
      }
    }
    for (const slotName of ancDef.slots) {
      if (result.has(slotName)) continue;
      const schemaSlot = allSchemaSlots[slotName] ?? schema.slots?.[slotName];
      if (!schemaSlot) continue;
      const usage = ancDef.slotUsage[slotName];
      const effectiveSlot = usage ? { ...schemaSlot, ...usage, name: slotName } : schemaSlot;
      result.set(slotName, { slot: effectiveSlot, kind: 'schema', inherited: true, inheritedFrom: ancName });
    }
  };

  // is_a parent
  if (classDef.isA && !visited.has(classDef.isA)) {
    const parentDef = schema.classes[classDef.isA];
    if (parentDef) {
      visited.add(classDef.isA);
      addOwnSlots(classDef.isA, parentDef);
      for (const [k, v] of gatherAncestorSlots(classDef.isA, schema, allSchemaSlots, visited)) {
        if (!result.has(k)) result.set(k, v);
      }
    }
  }

  // mixins
  for (const mixinName of classDef.mixins) {
    if (visited.has(mixinName)) continue;
    const mixinDef = schema.classes[mixinName];
    if (!mixinDef) continue;
    visited.add(mixinName);
    addOwnSlots(mixinName, mixinDef);
    for (const [k, v] of gatherAncestorSlots(mixinName, schema, allSchemaSlots, visited)) {
      if (!result.has(k)) result.set(k, v);
    }
  }

  return result;
}

export function deriveGraph(
  schema: LinkMLSchema,
  layout: CanvasLayout,
  collapsed: Record<string, boolean> = {},
  ghostEntities: ImportedEntity[] = [],
  collapsedGroups: Record<string, boolean> = {},
  allSchemaSlots: Record<string, SlotDefinition> = {}
): DerivedGraph {
  const nodes: Node<CanvasNodeData>[] = [];
  const edges: Edge[] = [];
  let gridIndex = 0;

  // ── Class nodes ─────────────────────────────────────────────────────────────
  for (const [className, classDef] of Object.entries(schema.classes)) {
    const pos = layout.nodes[className] ?? gridPosition(gridIndex++);
    const isCollapsed = collapsed[className] ?? false;

    // Build resolved slot list: own slots first, then inherited from is_a / mixins
    const resolvedSlots: ResolvedSlot[] = [];
    const ownSlotNames = new Set<string>();

    for (const slot of Object.values(classDef.attributes)) {
      resolvedSlots.push({
        slot,
        kind: 'attribute',
        hasUsageOverride: !!classDef.slotUsage[slot.name],
      });
      ownSlotNames.add(slot.name);
    }
    for (const slotName of classDef.slots) {
      const schemaSlot = allSchemaSlots[slotName] ?? schema.slots?.[slotName];
      if (!schemaSlot) continue;
      const usage = classDef.slotUsage[slotName];
      const effectiveSlot = usage ? { ...schemaSlot, ...usage, name: slotName } : schemaSlot;
      resolvedSlots.push({ slot: effectiveSlot, kind: 'schema', hasUsageOverride: !!usage });
      ownSlotNames.add(slotName);
    }

    // Add inherited slots (from is_a ancestors and mixins) that aren't overridden locally
    for (const [name, resolved] of gatherAncestorSlots(className, schema, allSchemaSlots)) {
      if (!ownSlotNames.has(name)) {
        resolvedSlots.push(resolved);
      }
    }

    resolvedSlots.sort((a, b) => a.slot.name.localeCompare(b.slot.name));

    const nodeData: ClassNodeData = {
      entityId: className,
      entityType: 'class',
      classDef,
      collapsed: isCollapsed,
      resolvedSlots,
    };

    nodes.push({
      id: className,
      type: 'classNode',
      position: { x: pos.x, y: pos.y },
      data: nodeData as unknown as CanvasNodeData,
      width: CLASS_NODE_WIDTH,
      height: CLASS_NODE_HEIGHT,
    });

    // ── is_a edge — source=parent so the bottom handle exits toward the child ──
    if (classDef.isA && schema.classes[classDef.isA]) {
      const edgeId = `isa__${className}__${classDef.isA}`;
      edges.push({
        id: edgeId,
        type: 'is_a' as LinkMLEdgeType,
        source: classDef.isA,
        target: className,
        animated: false,
        data: elkData(layout, edgeId),
      });
    }

    // ── mixin edges — source=mixin parent for same handle direction ────────
    for (const mixinName of classDef.mixins) {
      if (schema.classes[mixinName]) {
        const edgeId = `mixin__${className}__${mixinName}`;
        edges.push({
          id: edgeId,
          type: 'mixin' as LinkMLEdgeType,
          source: mixinName,
          target: className,
          animated: false,
          data: elkData(layout, edgeId),
        });
      }
    }

    // ── union_of edges ─────────────────────────────────────────────────────
    if (classDef.unionOf) {
      for (const memberName of classDef.unionOf) {
        if (schema.classes[memberName]) {
          const edgeId = `union__${className}__${memberName}`;
          edges.push({
            id: edgeId,
            type: 'union_of' as LinkMLEdgeType,
            source: className,
            target: memberName,
            animated: false,
            data: elkData(layout, edgeId),
          });
        }
      }
    }

    // ── range edges (from attributes) ─────────────────────────────────────
    for (const [slotName, slot] of Object.entries(classDef.attributes)) {
      if (!slot.range) continue;
      if (slot.range === className) continue; // self-reference: render badge on slot row instead
      const rangeIsClass = slot.range in schema.classes;
      const rangeIsEnum = slot.range in schema.enums;
      if (rangeIsClass || rangeIsEnum) {
        const edgeId = `range__${className}__${slotName}__${slot.range}`;
        const handles = rangeHandles(layout, className, slot.range, slotName, isCollapsed);
        edges.push({
          id: edgeId,
          type: 'range' as LinkMLEdgeType,
          source: className,
          target: slot.range,
          label: slotName,
          ...handles,
          data: {
            slotName,
            range: slot.range,
            required: slot.required ?? false,
            multivalued: slot.multivalued ?? false,
            identifier: slot.identifier ?? false,
            // Range edges use smooth-step routing from slot handles; ELK bend points
            // (computed for node-center routing) would produce incorrect paths here.
          },
          animated: false,
        });
      }
    }

    // ── range edges (from schema-level slot references) ────────────────────
    for (const slotName of classDef.slots) {
      const schemaSlot = allSchemaSlots[slotName] ?? schema.slots?.[slotName];
      if (!schemaSlot) continue;
      const usage = classDef.slotUsage[slotName];
      const effectiveRange = usage?.range ?? schemaSlot.range;
      if (!effectiveRange) continue;
      if (effectiveRange === className) continue; // self-reference: render badge on slot row instead
      const edgeId = `range__${className}__${slotName}__${effectiveRange}`;
      if (edges.find((e) => e.id === edgeId)) continue; // avoid duplicates with attribute edges
      const rangeIsClass = effectiveRange in schema.classes;
      const rangeIsEnum = effectiveRange in schema.enums;
      if (rangeIsClass || rangeIsEnum) {
        const effectiveSlot = usage ? { ...schemaSlot, ...usage } : schemaSlot;
        const handles = rangeHandles(layout, className, effectiveRange, slotName, isCollapsed);
        edges.push({
          id: edgeId,
          type: 'range' as LinkMLEdgeType,
          source: className,
          target: effectiveRange,
          label: slotName,
          ...handles,
          data: {
            slotName,
            range: effectiveRange,
            required: effectiveSlot.required ?? false,
            multivalued: effectiveSlot.multivalued ?? false,
            identifier: effectiveSlot.identifier ?? false,
          },
          animated: false,
        });
      }
    }
  }

  // ── Enum nodes ──────────────────────────────────────────────────────────────
  for (const [enumName, enumDef] of Object.entries(schema.enums)) {
    const pos = layout.nodes[enumName] ?? gridPosition(gridIndex++);
    const isCollapsed = collapsed[enumName] ?? false;

    const nodeData: EnumNodeData = {
      entityId: enumName,
      entityType: 'enum',
      enumDef,
      collapsed: isCollapsed,
    };

    nodes.push({
      id: enumName,
      type: 'enumNode',
      position: { x: pos.x, y: pos.y },
      data: nodeData as unknown as CanvasNodeData,
      width: ENUM_NODE_WIDTH,
      height: ENUM_NODE_HEIGHT,
    });
  }

  // ── Ghost nodes (imported entities grouped by source schema) ───────────────
  const existingIds = new Set(nodes.map((n) => n.id));

  // Group ghost entities by source file path
  const ghostGroups = new Map<string, ImportedEntity[]>();
  for (const entity of ghostEntities) {
    if (existingIds.has(entity.name)) continue; // local definition takes priority
    const ghostId = `ghost__${entity.name}`;
    if (existingIds.has(ghostId)) continue;

    const group = ghostGroups.get(entity.sourceFilePath) ?? [];
    group.push(entity);
    ghostGroups.set(entity.sourceFilePath, group);
  }

  // Track all ghost IDs for edge creation
  const allGhostIds = new Set<string>();

  for (const [sourceFile, entities] of ghostGroups) {
    const groupId = `importGroup__${sourceFile}`;
    const isGroupCollapsed = collapsedGroups[groupId] ?? false;

    // Group's absolute position (saved directly, not derived from children)
    const groupPos = layout.nodes[groupId] ?? gridPosition(gridIndex++);

    // Compute children with RELATIVE positions (relative to group top-left).
    // Saved layout stores ghost positions as relative; defaults use the inner grid.
    const childEntries: Array<{
      ghostId: string;
      entity: ImportedEntity;
      relX: number;
      relY: number;
      w: number;
      h: number;
    }> = [];

    let maxRelX = 0;
    let maxRelY = GROUP_HEADER + GROUP_PADDING;

    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      const ghostId = `ghost__${entity.name}`;
      const w = entity.type === 'class' ? CLASS_NODE_WIDTH : ENUM_NODE_WIDTH;
      const h = entity.type === 'class' ? CLASS_NODE_HEIGHT : ENUM_NODE_HEIGHT;

      // Saved position is relative to the group
      const savedPos = layout.nodes[ghostId];
      const relX = savedPos?.x ?? groupChildPosition(i).x;
      const relY = savedPos?.y ?? groupChildPosition(i).y;

      childEntries.push({ ghostId, entity, relX, relY, w, h });
      maxRelX = Math.max(maxRelX, relX + w);
      maxRelY = Math.max(maxRelY, relY + h);
    }

    const groupWidth = maxRelX + GROUP_PADDING;
    const expandedHeight = maxRelY + GROUP_PADDING;
    const collapsedHeight = GROUP_HEADER + GROUP_PADDING;

    // Create group background node (inserted at beginning for lower z-index)
    const groupData: ImportGroupNodeData = {
      entityId: groupId,
      entityType: 'importGroup',
      label: labelFromPath(sourceFile),
      sourceFilePath: sourceFile,
      collapsed: isGroupCollapsed,
      childCount: entities.length,
    };

    nodes.unshift({
      id: groupId,
      type: 'importGroupNode',
      position: { x: groupPos.x, y: groupPos.y },
      data: groupData as unknown as CanvasNodeData,
      style: {
        width: groupWidth,
        height: isGroupCollapsed ? collapsedHeight : expandedHeight,
      },
      zIndex: -1,
      draggable: true,
      selectable: true,
    });

    // Only add child nodes when the group is expanded.
    // Children use parentId so they move with the group and positions are relative.
    if (!isGroupCollapsed) {
      for (const child of childEntries) {
        existingIds.add(child.ghostId);
        allGhostIds.add(child.ghostId);

        if (child.entity.type === 'class') {
          const nodeData: ClassNodeData = {
            entityId: child.entity.name,
            entityType: 'class',
            classDef: child.entity.schema.classes[child.entity.name],
            collapsed: false,
            ghost: true,
          };
          nodes.push({
            id: child.ghostId,
            type: 'classNode',
            parentId: groupId,
            expandParent: false,
            position: { x: child.relX, y: child.relY },
            data: nodeData as unknown as CanvasNodeData,
            width: CLASS_NODE_WIDTH,
            height: CLASS_NODE_HEIGHT,
          });
        } else {
          const nodeData: EnumNodeData = {
            entityId: child.entity.name,
            entityType: 'enum',
            enumDef: child.entity.schema.enums[child.entity.name],
            collapsed: false,
            ghost: true,
          };
          nodes.push({
            id: child.ghostId,
            type: 'enumNode',
            parentId: groupId,
            expandParent: false,
            position: { x: child.relX, y: child.relY },
            data: nodeData as unknown as CanvasNodeData,
            width: ENUM_NODE_WIDTH,
            height: ENUM_NODE_HEIGHT,
          });
        }
      }
    }
  }

  // ── Range / is_a / mixin edges to ghost nodes ──────────────────────────────
  for (const [className, classDef] of Object.entries(schema.classes)) {
    const srcCollapsed = collapsed[className] ?? false;

    // Range edges (attributes)
    for (const [slotName, slot] of Object.entries(classDef.attributes)) {
      if (!slot.range) continue;
      if (slot.range === className) continue; // self-reference: no edge
      const ghostId = `ghost__${slot.range}`;
      const edgeId = `range__${className}__${slotName}__${slot.range}`;
      if (allGhostIds.has(ghostId) && !edges.find((e) => e.id === edgeId)) {
        const handles = rangeHandles(layout, className, ghostId, slotName, srcCollapsed);
        edges.push({
          id: edgeId,
          type: 'range' as LinkMLEdgeType,
          source: className,
          target: ghostId,
          label: slotName,
          ...handles,
          data: {
            slotName,
            range: slot.range,
            required: slot.required ?? false,
            multivalued: slot.multivalued ?? false,
            identifier: slot.identifier ?? false,
          },
          animated: false,
        });
      }
    }

    // Range edges (schema-level slot references to ghost nodes)
    for (const slotName of classDef.slots) {
      const schemaSlot = allSchemaSlots[slotName] ?? schema.slots?.[slotName];
      if (!schemaSlot) continue;
      const usage = classDef.slotUsage[slotName];
      const effectiveRange = usage?.range ?? schemaSlot.range;
      if (!effectiveRange) continue;
      if (effectiveRange === className) continue; // self-reference: no edge
      const ghostId = `ghost__${effectiveRange}`;
      const edgeId = `range__${className}__${slotName}__${effectiveRange}`;
      if (allGhostIds.has(ghostId) && !edges.find((e) => e.id === edgeId)) {
        const effectiveSlot = usage ? { ...schemaSlot, ...usage } : schemaSlot;
        const handles = rangeHandles(layout, className, ghostId, slotName, srcCollapsed);
        edges.push({
          id: edgeId,
          type: 'range' as LinkMLEdgeType,
          source: className,
          target: ghostId,
          label: slotName,
          ...handles,
          data: {
            slotName,
            range: effectiveRange,
            required: effectiveSlot.required ?? false,
            multivalued: effectiveSlot.multivalued ?? false,
            identifier: effectiveSlot.identifier ?? false,
          },
          animated: false,
        });
      }
    }

    // is_a edge to ghost — source=ghost parent so handle direction is consistent
    if (classDef.isA) {
      const ghostId = `ghost__${classDef.isA}`;
      if (allGhostIds.has(ghostId)) {
        const edgeId = `isa__${className}__${classDef.isA}`;
        edges.push({
          id: edgeId,
          type: 'is_a' as LinkMLEdgeType,
          source: ghostId,
          target: className,
          animated: false,
          data: elkData(layout, edgeId),
        });
      }
    }

    // mixin edges to ghost — same reversal
    for (const mixinName of classDef.mixins) {
      const ghostId = `ghost__${mixinName}`;
      if (allGhostIds.has(ghostId)) {
        const edgeId = `mixin__${className}__${mixinName}`;
        edges.push({
          id: edgeId,
          type: 'mixin' as LinkMLEdgeType,
          source: ghostId,
          target: className,
          animated: false,
          data: elkData(layout, edgeId),
        });
      }
    }

    // union_of edges to ghost
    if (classDef.unionOf) {
      for (const memberName of classDef.unionOf) {
        const ghostId = `ghost__${memberName}`;
        if (allGhostIds.has(ghostId)) {
          const edgeId = `union__${className}__${memberName}`;
          edges.push({
            id: edgeId,
            type: 'union_of' as LinkMLEdgeType,
            source: className,
            target: ghostId,
            animated: false,
            data: elkData(layout, edgeId),
          });
        }
      }
    }
  }

  // ── Parallel edge annotation ────────────────────────────────────────────────
  // Group non-range edges that share the same source+target and fan them out.
  // Range edges are excluded: each already leaves from a distinct slot handle,
  // so perpendicular offset would misalign them from their anchor points.
  const parallelGroups = new Map<string, Edge[]>();
  for (const edge of edges) {
    if (edge.type === 'range') continue;
    const key = `${edge.source}||${edge.target}`;
    const group = parallelGroups.get(key) ?? [];
    group.push(edge);
    parallelGroups.set(key, group);
  }
  for (const group of parallelGroups.values()) {
    if (group.length > 1) {
      group.forEach((edge, i) => {
        edge.data = { ...(edge.data ?? {}), parallelIndex: i, parallelCount: group.length };
      });
    }
  }

  return { nodes, edges };
}

/**
 * Returns a set of entity names (class + enum) present in the schema.
 * Used to validate layout sidecar references.
 */
export function schemaEntityNames(schema: LinkMLSchema): Set<string> {
  return new Set([...Object.keys(schema.classes), ...Object.keys(schema.enums)]);
}

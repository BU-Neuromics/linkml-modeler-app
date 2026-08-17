/**
 * Derives ReactFlow nodes and edges from a LinkMLSchema + CanvasLayout.
 *
 * This is a pure function — no Zustand access here. Call it from a selector
 * or useMemo hook whenever the schema or layout changes.
 */
import type { Node, Edge } from 'reactflow';
import type { LinkMLSchema, CanvasLayout, SlotDefinition } from '../model/index.js';
import type { CanvasNodeData } from '../store/slices/canvasSlice.js';
import type { RangeEdgesMode } from '../store/slices/uiSlice.js';
import type { ClassNodeData, ResolvedSlot } from './ClassNode.js';
import type { EnumNodeData } from './EnumNode.js';
import type { LabelNodeData } from './LabelNode.js';
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

function gridPosition(index: number): { x: number; y: number } {
  const col = index % GRID_COLS;
  const row = Math.floor(index / GRID_COLS);
  return { x: col * GRID_H_GAP, y: row * GRID_V_GAP };
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
  importedEntities: ImportedEntity[] = [],
  allSchemaSlots: Record<string, SlotDefinition> = {},
  hiddenEdgeTypes: ReadonlySet<string> = new Set(),
  rangeEdgesMode: RangeEdgesMode = 'show'
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
      const rangeIsEntity = !!slot.range && (slot.range in schema.classes || slot.range in schema.enums);
      resolvedSlots.push({
        slot,
        kind: 'attribute',
        hasUsageOverride: !!classDef.slotUsage[slot.name],
        rangeIsEntity,
      });
      ownSlotNames.add(slot.name);
    }
    for (const slotName of classDef.slots) {
      const schemaSlot = allSchemaSlots[slotName] ?? schema.slots?.[slotName];
      if (!schemaSlot) continue;
      const usage = classDef.slotUsage[slotName];
      const effectiveSlot = usage ? { ...schemaSlot, ...usage, name: slotName } : schemaSlot;
      const effectiveRange = effectiveSlot.range;
      const rangeIsEntity = !!effectiveRange && (effectiveRange in schema.classes || effectiveRange in schema.enums);
      resolvedSlots.push({ slot: effectiveSlot, kind: 'schema', hasUsageOverride: !!usage, rangeIsEntity });
      ownSlotNames.add(slotName);
    }

    // Add inherited slots (from is_a ancestors and mixins) that aren't overridden locally
    const ancestorSlots = gatherAncestorSlots(className, schema, allSchemaSlots);
    for (const [name, resolved] of ancestorSlots) {
      if (!ownSlotNames.has(name)) {
        const usage = classDef.slotUsage[name];
        if (usage) {
          const effectiveSlot = { ...resolved.slot, ...usage, name };
          const effectiveRange = effectiveSlot.range;
          const rangeIsEntity = !!effectiveRange && (effectiveRange in schema.classes || effectiveRange in schema.enums);
          resolvedSlots.push({ ...resolved, slot: effectiveSlot, hasUsageOverride: true, rangeIsEntity });
        } else {
          const rangeIsEntity = !!resolved.slot.range && (resolved.slot.range in schema.classes || resolved.slot.range in schema.enums);
          resolvedSlots.push({ ...resolved, rangeIsEntity });
        }
      }
    }

    resolvedSlots.sort((a, b) => a.slot.name.localeCompare(b.slot.name));

    const nodeData: ClassNodeData = {
      entityId: className,
      entityType: 'class',
      classDef,
      collapsed: isCollapsed,
      resolvedSlots,
      rangeEdgesMode,
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
    if (!hiddenEdgeTypes.has('is_a') && classDef.isA && schema.classes[classDef.isA]) {
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
    if (!hiddenEdgeTypes.has('mixin')) {
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
    }

    // ── union_of edges ─────────────────────────────────────────────────────
    if (!hiddenEdgeTypes.has('union_of') && classDef.unionOf) {
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

    // ── range edges (from attributes and schema-level slots) ──────────────
    if (!hiddenEdgeTypes.has('range') && rangeEdgesMode === 'show') {
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

      // ── range edges (from schema-level slot references) ──────────────────
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

      // ── range edges (inherited slots with slot_usage range overrides) ─────
      // Only emit an edge when the current class's slot_usage explicitly sets range,
      // and the overridden range resolves to a class or enum. Plain inherited slots
      // (no range override) are intentionally excluded — their range is already
      // reachable via the is_a edge to the ancestor that owns them.
      for (const [slotName, resolved] of ancestorSlots) {
        if (ownSlotNames.has(slotName)) continue;
        const usage = classDef.slotUsage[slotName];
        if (!usage?.range) continue;
        const effectiveRange = usage.range;
        if (effectiveRange === className) continue;
        const edgeId = `range__${className}__${slotName}__${effectiveRange}`;
        if (edges.find((e) => e.id === edgeId)) continue;
        const rangeIsClass = effectiveRange in schema.classes;
        const rangeIsEnum = effectiveRange in schema.enums;
        if (rangeIsClass || rangeIsEnum) {
          const effectiveSlot = { ...resolved.slot, ...usage };
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
              isUsageOverride: true,
            },
            animated: false,
          });
        }
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

  // ── Imported entities (flat nodes, no grouping) ────────────────────────────
  const existingIds = new Set(nodes.map((n) => n.id));
  const allImportedIds = new Set<string>();

  for (const entity of importedEntities) {
    if (existingIds.has(entity.name)) continue; // local definition takes priority

    existingIds.add(entity.name);
    allImportedIds.add(entity.name);

    const pos = layout.nodes[entity.name] ?? gridPosition(gridIndex++);

    if (entity.type === 'class') {
      const importedClassDef = entity.schema.classes[entity.name];
      const importedResolvedSlots: ResolvedSlot[] = Object.values(importedClassDef.attributes).map((slot) => ({
        slot,
        kind: 'attribute' as const,
        rangeIsEntity: !!slot.range && (
          slot.range in schema.classes || slot.range in schema.enums ||
          slot.range in (entity.schema.classes ?? {}) || slot.range in (entity.schema.enums ?? {})
        ),
      }));
      const nodeData: ClassNodeData = {
        entityId: entity.name,
        entityType: 'class',
        classDef: importedClassDef,
        collapsed: false,
        imported: true,
        importSourceFile: entity.sourceFilePath,
        resolvedSlots: importedResolvedSlots,
        rangeEdgesMode,
      };
      nodes.push({
        id: entity.name,
        type: 'classNode',
        position: { x: pos.x, y: pos.y },
        data: nodeData as unknown as CanvasNodeData,
        width: CLASS_NODE_WIDTH,
        height: CLASS_NODE_HEIGHT,
      });
    } else {
      const nodeData: EnumNodeData = {
        entityId: entity.name,
        entityType: 'enum',
        enumDef: entity.schema.enums[entity.name],
        collapsed: false,
        imported: true,
        importSourceFile: entity.sourceFilePath,
      };
      nodes.push({
        id: entity.name,
        type: 'enumNode',
        position: { x: pos.x, y: pos.y },
        data: nodeData as unknown as CanvasNodeData,
        width: ENUM_NODE_WIDTH,
        height: ENUM_NODE_HEIGHT,
      });
    }
  }

  // ── Range / is_a / mixin edges to imported nodes ───────────────────────────
  for (const [className, classDef] of Object.entries(schema.classes)) {
    const srcCollapsed = collapsed[className] ?? false;

    // Range edges (attributes)
    if (!hiddenEdgeTypes.has('range') && rangeEdgesMode === 'show') {
      for (const [slotName, slot] of Object.entries(classDef.attributes)) {
        if (!slot.range) continue;
        if (slot.range === className) continue; // self-reference: no edge
        const edgeId = `range__${className}__${slotName}__${slot.range}`;
        if (allImportedIds.has(slot.range) && !edges.find((e) => e.id === edgeId)) {
          const handles = rangeHandles(layout, className, slot.range, slotName, srcCollapsed);
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
            },
            animated: false,
          });
        }
      }

      // Range edges (schema-level slot references to imported nodes)
      for (const slotName of classDef.slots) {
        const schemaSlot = allSchemaSlots[slotName] ?? schema.slots?.[slotName];
        if (!schemaSlot) continue;
        const usage = classDef.slotUsage[slotName];
        const effectiveRange = usage?.range ?? schemaSlot.range;
        if (!effectiveRange) continue;
        if (effectiveRange === className) continue; // self-reference: no edge
        const edgeId = `range__${className}__${slotName}__${effectiveRange}`;
        if (allImportedIds.has(effectiveRange) && !edges.find((e) => e.id === edgeId)) {
          const effectiveSlot = usage ? { ...schemaSlot, ...usage } : schemaSlot;
          const handles = rangeHandles(layout, className, effectiveRange, slotName, srcCollapsed);
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

    // is_a edge to imported — source=imported parent so handle direction is consistent
    if (!hiddenEdgeTypes.has('is_a') && classDef.isA && allImportedIds.has(classDef.isA)) {
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

    // mixin edges to imported — same reversal
    if (!hiddenEdgeTypes.has('mixin')) {
      for (const mixinName of classDef.mixins) {
        if (allImportedIds.has(mixinName)) {
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
    }

    // union_of edges to imported
    if (!hiddenEdgeTypes.has('union_of') && classDef.unionOf) {
      for (const memberName of classDef.unionOf) {
        if (allImportedIds.has(memberName)) {
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

  // ── Label nodes (editor-only text annotations) ─────────────────────────────
  for (const label of layout.labels ?? []) {
    const labelNodeData: LabelNodeData = {
      entityId: label.id,
      entityType: 'label',
      label,
    };
    nodes.push({
      id: `label__${label.id}`,
      type: 'labelNode',
      position: { x: label.x, y: label.y },
      data: labelNodeData as unknown as CanvasNodeData,
      draggable: !label.locked,
      selectable: true,
    });
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

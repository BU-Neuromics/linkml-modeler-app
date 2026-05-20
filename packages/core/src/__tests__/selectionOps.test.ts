/**
 * selectionOps.test.ts — unit tests for A3 selection neighborhood operations.
 *
 * Covers:
 *  - Adjacency building (is_a, mixin, range, union_of)
 *  - getAncestors / getDescendants (transitivity, self-exclusion)
 *  - getDirectNeighbors + getNHopNeighbors
 *  - getRangeTargets / getRangeSources (attributes + schema slots, enum ranges)
 *  - getConnectedComponent
 *  - invertSelection
 *  - applyOp node-ID bridging (ghost__ prefix)
 *  - Cyclic graphs don't infinite-loop
 *  - Self-reference slot ranges are excluded
 *  - Ghost entities as edge endpoints
 */
import { describe, it, expect } from 'vitest';
import {
  buildAdjacency,
  getAncestors,
  getDescendants,
  getDirectNeighbors,
  getNHopNeighbors,
  getRangeTargets,
  getRangeSources,
  getConnectedComponent,
  invertSelection,
  applyOp,
  nodeIdToEntityName,
  entityNameToNodeId,
} from '../canvas/selectionOps.js';
import type { LinkMLSchema } from '../model/index.js';

// ── Schema fixtures ───────────────────────────────────────────────────────────

/**
 * Schema fixture:
 *
 *   NamedThing (abstract)
 *     └─ Person (is_a NamedThing)
 *          └─ Employee (is_a Person)
 *   Mixin1 (mixin)
 *     └─ Employee (mixin Mixin1)
 *   Address (class)
 *   EmploymentStatus (enum)
 *
 *   Employee.employer_address → range: Address
 *   Employee.status           → range: EmploymentStatus
 *   Person.name               → range: string (not in schema — excluded)
 *   NamedThing                → no slots
 */
function makeSchema(): LinkMLSchema {
  return {
    id: 'https://example.org/test',
    name: 'test',
    prefixes: {},
    defaultPrefix: 'test',
    imports: [],
    subsets: {},
    types: {},
    slots: {
      status: { name: 'status', range: 'EmploymentStatus' },
    },
    enums: {
      EmploymentStatus: { name: 'EmploymentStatus', permissible_values: {} },
    },
    classes: {
      NamedThing: {
        name: 'NamedThing',
        abstract: true,
        isA: undefined,
        mixins: [],
        slots: [],
        attributes: {},
        slotUsage: {},
        unionOf: undefined,
      },
      Person: {
        name: 'Person',
        isA: 'NamedThing',
        mixins: [],
        slots: [],
        attributes: {
          id: { name: 'id', range: 'string' }, // not in schema → no edge
        },
        slotUsage: {},
        unionOf: undefined,
      },
      Mixin1: {
        name: 'Mixin1',
        mixin: true,
        isA: undefined,
        mixins: [],
        slots: [],
        attributes: {},
        slotUsage: {},
        unionOf: undefined,
      },
      Employee: {
        name: 'Employee',
        isA: 'Person',
        mixins: ['Mixin1'],
        slots: ['status'], // → schema slot → range: EmploymentStatus
        attributes: {
          employer_address: { name: 'employer_address', range: 'Address' },
        },
        slotUsage: {},
        unionOf: undefined,
      },
      Address: {
        name: 'Address',
        isA: undefined,
        mixins: [],
        slots: [],
        attributes: {},
        slotUsage: {},
        unionOf: undefined,
      },
    },
  } as unknown as LinkMLSchema;
}

/** Schema with a cyclic is_a (invalid LinkML but must not infinite-loop). */
function makeCyclicSchema(): LinkMLSchema {
  return {
    id: 'https://example.org/cyclic',
    name: 'cyclic',
    prefixes: {},
    defaultPrefix: 'cyclic',
    imports: [],
    subsets: {},
    types: {},
    slots: {},
    enums: {},
    classes: {
      A: { name: 'A', isA: 'B', mixins: [], slots: [], attributes: {}, slotUsage: {} },
      B: { name: 'B', isA: 'C', mixins: [], slots: [], attributes: {}, slotUsage: {} },
      C: { name: 'C', isA: 'A', mixins: [], slots: [], attributes: {}, slotUsage: {} },
    },
  } as unknown as LinkMLSchema;
}

/** Schema with a self-referencing slot range (should be excluded). */
function makeSelfRangeSchema(): LinkMLSchema {
  return {
    id: 'https://example.org/self',
    name: 'self',
    prefixes: {},
    defaultPrefix: 'self',
    imports: [],
    subsets: {},
    types: {},
    slots: {},
    enums: {},
    classes: {
      Node: {
        name: 'Node',
        isA: undefined,
        mixins: [],
        slots: [],
        attributes: {
          child: { name: 'child', range: 'Node' }, // self-reference — excluded
          label: { name: 'label', range: 'string' }, // not in schema — excluded
        },
        slotUsage: {},
      },
    },
  } as unknown as LinkMLSchema;
}

// ── buildAdjacency ────────────────────────────────────────────────────────────

describe('buildAdjacency', () => {
  it('builds is_a edges: source=parent, target=child', () => {
    const adj = buildAdjacency(makeSchema());
    // Person is_a NamedThing → out(NamedThing) has edge to Person
    expect(adj.out.get('NamedThing')?.some(e => e.target === 'Person' && e.kind === 'is_a')).toBe(true);
    // in(Person) has edge from NamedThing
    expect(adj.in.get('Person')?.some(e => e.source === 'NamedThing' && e.kind === 'is_a')).toBe(true);
  });

  it('builds mixin edges: source=mixin, target=child', () => {
    const adj = buildAdjacency(makeSchema());
    expect(adj.out.get('Mixin1')?.some(e => e.target === 'Employee' && e.kind === 'mixin')).toBe(true);
    expect(adj.in.get('Employee')?.some(e => e.source === 'Mixin1' && e.kind === 'mixin')).toBe(true);
  });

  it('builds range edges from inline attributes', () => {
    const adj = buildAdjacency(makeSchema());
    expect(adj.out.get('Employee')?.some(e => e.target === 'Address' && e.kind === 'range')).toBe(true);
    expect(adj.in.get('Address')?.some(e => e.source === 'Employee' && e.kind === 'range')).toBe(true);
  });

  it('builds range edges from schema-level slot refs', () => {
    const adj = buildAdjacency(makeSchema());
    expect(adj.out.get('Employee')?.some(e => e.target === 'EmploymentStatus' && e.kind === 'range')).toBe(true);
    expect(adj.in.get('EmploymentStatus')?.some(e => e.source === 'Employee' && e.kind === 'range')).toBe(true);
  });

  it('excludes range edges to non-schema types (e.g. string)', () => {
    const adj = buildAdjacency(makeSchema());
    // Person.id.range = 'string' — not in schema classes/enums
    const outPerson = adj.out.get('Person') ?? [];
    expect(outPerson.some(e => e.target === 'string')).toBe(false);
  });

  it('excludes self-referencing slot ranges', () => {
    const adj = buildAdjacency(makeSelfRangeSchema());
    const outNode = adj.out.get('Node') ?? [];
    expect(outNode.some(e => e.target === 'Node')).toBe(false);
  });

  it('includes ghost entities as endpoints', () => {
    const schema = makeSchema();
    // Add a class that inherits from a ghost entity
    (schema.classes as Record<string, unknown>).Contractor = {
      name: 'Contractor',
      isA: 'GhostBase',
      mixins: [],
      slots: [],
      attributes: { project: { name: 'project', range: 'GhostProject' } },
      slotUsage: {},
    };
    const ghostNames = new Set(['GhostBase', 'GhostProject']);
    const adj = buildAdjacency(schema, ghostNames);
    expect(adj.out.get('GhostBase')?.some(e => e.target === 'Contractor' && e.kind === 'is_a')).toBe(true);
    expect(adj.out.get('Contractor')?.some(e => e.target === 'GhostProject' && e.kind === 'range')).toBe(true);
  });

  it('all entities have entries even with no edges', () => {
    const adj = buildAdjacency(makeSchema());
    expect(adj.out.has('Address')).toBe(true);
    expect(adj.out.has('NamedThing')).toBe(true);
    expect(adj.out.has('EmploymentStatus')).toBe(true);
  });
});

// ── getAncestors ──────────────────────────────────────────────────────────────

describe('getAncestors', () => {
  it('returns direct is_a parent', () => {
    const adj = buildAdjacency(makeSchema());
    const result = getAncestors(adj, ['Person']);
    expect(result.has('NamedThing')).toBe(true);
    expect(result.has('Person')).toBe(false); // seed excluded
  });

  it('returns transitive ancestors', () => {
    const adj = buildAdjacency(makeSchema());
    const result = getAncestors(adj, ['Employee']);
    expect(result.has('Person')).toBe(true);
    expect(result.has('NamedThing')).toBe(true);
    expect(result.has('Mixin1')).toBe(true); // mixin ancestor
  });

  it('excludes seeds from result', () => {
    const adj = buildAdjacency(makeSchema());
    const result = getAncestors(adj, ['Employee', 'Person']);
    expect(result.has('Employee')).toBe(false);
    expect(result.has('Person')).toBe(false);
    expect(result.has('NamedThing')).toBe(true);
  });

  it('returns empty set for root class', () => {
    const adj = buildAdjacency(makeSchema());
    expect(getAncestors(adj, ['NamedThing']).size).toBe(0);
  });

  it('does not infinite-loop on cyclic graphs', () => {
    const adj = buildAdjacency(makeCyclicSchema());
    const result = getAncestors(adj, ['A']);
    expect(result.size).toBeGreaterThan(0);
    expect(result.size).toBeLessThanOrEqual(3);
  });
});

// ── getDescendants ────────────────────────────────────────────────────────────

describe('getDescendants', () => {
  it('returns direct is_a child', () => {
    const adj = buildAdjacency(makeSchema());
    const result = getDescendants(adj, ['Person']);
    expect(result.has('Employee')).toBe(true);
    expect(result.has('Person')).toBe(false);
  });

  it('returns transitive descendants', () => {
    const adj = buildAdjacency(makeSchema());
    const result = getDescendants(adj, ['NamedThing']);
    expect(result.has('Person')).toBe(true);
    expect(result.has('Employee')).toBe(true);
  });

  it('includes mixin children', () => {
    const adj = buildAdjacency(makeSchema());
    const result = getDescendants(adj, ['Mixin1']);
    expect(result.has('Employee')).toBe(true);
  });

  it('returns empty set for leaf class', () => {
    const adj = buildAdjacency(makeSchema());
    expect(getDescendants(adj, ['Address']).size).toBe(0);
  });

  it('does not infinite-loop on cyclic graphs', () => {
    const adj = buildAdjacency(makeCyclicSchema());
    const result = getDescendants(adj, ['A']);
    expect(result.size).toBeGreaterThan(0);
    expect(result.size).toBeLessThanOrEqual(3);
  });
});

// ── getDirectNeighbors ────────────────────────────────────────────────────────

describe('getDirectNeighbors', () => {
  it('returns outbound neighbors', () => {
    const adj = buildAdjacency(makeSchema());
    // Employee out: Address (range), EmploymentStatus (range), Person (is_a target on out edge? NO)
    // Wait — is_a edge: source=parent, target=child
    // Employee is target of Person (is_a), so in(Employee) has Person
    // Employee's out edges: Mixin1 is source of mixin edge to Employee → in(Employee) has Mixin1
    // Employee's out edges via range: Address, EmploymentStatus
    const result = getDirectNeighbors(adj, ['Employee'], 'out');
    expect(result.has('Address')).toBe(true);
    expect(result.has('EmploymentStatus')).toBe(true);
    // Employee does not have is_a/mixin as outgoing (it is the target, not source)
    expect(result.has('Employee')).toBe(false);
  });

  it('returns inbound neighbors', () => {
    const adj = buildAdjacency(makeSchema());
    // in(Employee): Person (is_a source), Mixin1 (mixin source)
    const result = getDirectNeighbors(adj, ['Employee'], 'in');
    expect(result.has('Person')).toBe(true);
    expect(result.has('Mixin1')).toBe(true);
  });

  it('returns both directions', () => {
    const adj = buildAdjacency(makeSchema());
    const result = getDirectNeighbors(adj, ['Employee'], 'both');
    expect(result.has('Person')).toBe(true);
    expect(result.has('Mixin1')).toBe(true);
    expect(result.has('Address')).toBe(true);
    expect(result.has('EmploymentStatus')).toBe(true);
  });

  it('can filter by edge kind', () => {
    const adj = buildAdjacency(makeSchema());
    const result = getDirectNeighbors(adj, ['Employee'], 'both', new Set(['range']));
    expect(result.has('Address')).toBe(true);
    expect(result.has('EmploymentStatus')).toBe(true);
    expect(result.has('Person')).toBe(false); // is_a, not range
    expect(result.has('Mixin1')).toBe(false); // mixin, not range
  });

  it('excludes seeds', () => {
    const adj = buildAdjacency(makeSchema());
    const result = getDirectNeighbors(adj, ['Employee', 'Person'], 'in');
    expect(result.has('Employee')).toBe(false);
    expect(result.has('Person')).toBe(false);
    expect(result.has('NamedThing')).toBe(true); // Person's parent
  });
});

// ── getNHopNeighbors ──────────────────────────────────────────────────────────

describe('getNHopNeighbors', () => {
  it('1-hop matches getDirectNeighbors (both)', () => {
    const adj = buildAdjacency(makeSchema());
    const direct = getDirectNeighbors(adj, ['Employee'], 'both');
    const nhop = getNHopNeighbors(adj, ['Employee'], 1, 'both');
    expect([...nhop].sort()).toEqual([...direct].sort());
  });

  it('2-hop reaches transitive neighbors', () => {
    const adj = buildAdjacency(makeSchema());
    // From Person, 2 hops out:
    //   hop 1 out: Employee (is_a), NamedThing (in through is_a actually...wait)
    // Actually: from Person, out edges include is_a child (Employee: NamedThing→Person→Employee)
    // Wait, is_a direction: source=parent, so out(Person) has Employee (Employee.isA=Person)
    // in(Person) has NamedThing (NamedThing is source of is_a edge to Person)
    // For 'out' direction from Person:
    //   hop 1: Employee (is_a out edge)
    //   hop 2 from Employee: Address, EmploymentStatus (range edges)
    const result = getNHopNeighbors(adj, ['Person'], 2, 'out');
    expect(result.has('Employee')).toBe(true);
    expect(result.has('Address')).toBe(true);
    expect(result.has('EmploymentStatus')).toBe(true);
    expect(result.has('Person')).toBe(false); // seed excluded
  });

  it('N=0 returns empty set', () => {
    const adj = buildAdjacency(makeSchema());
    expect(getNHopNeighbors(adj, ['Employee'], 0, 'both').size).toBe(0);
  });

  it('stops early when frontier exhausted', () => {
    const adj = buildAdjacency(makeSchema());
    // Address has no out/in edges beyond being range target
    const result = getNHopNeighbors(adj, ['Address'], 5, 'out');
    expect(result.size).toBe(0); // no outgoing from Address
  });
});

// ── getRangeTargets / getRangeSources ─────────────────────────────────────────

describe('getRangeTargets', () => {
  it('returns range targets from inline attributes', () => {
    const adj = buildAdjacency(makeSchema());
    const result = getRangeTargets(adj, ['Employee']);
    expect(result.has('Address')).toBe(true);
    expect(result.has('EmploymentStatus')).toBe(true);
  });

  it('excludes non-range neighbors', () => {
    const adj = buildAdjacency(makeSchema());
    const result = getRangeTargets(adj, ['Employee']);
    // Person is an ancestor, not a range target
    expect(result.has('Person')).toBe(false);
    expect(result.has('Mixin1')).toBe(false);
  });

  it('returns empty set for a class with no range edges', () => {
    const adj = buildAdjacency(makeSchema());
    expect(getRangeTargets(adj, ['NamedThing']).size).toBe(0);
  });

  it('includes enum ranges', () => {
    const adj = buildAdjacency(makeSchema());
    const result = getRangeTargets(adj, ['Employee']);
    expect(result.has('EmploymentStatus')).toBe(true);
  });

  it('excludes seeds', () => {
    const adj = buildAdjacency(makeSchema());
    const result = getRangeTargets(adj, ['Employee', 'Address']);
    expect(result.has('Employee')).toBe(false);
  });
});

describe('getRangeSources', () => {
  it('returns classes that reference the seed as a range', () => {
    const adj = buildAdjacency(makeSchema());
    const result = getRangeSources(adj, ['Address']);
    expect(result.has('Employee')).toBe(true);
  });

  it('returns multiple range sources', () => {
    const schema = makeSchema();
    // Add Manager also pointing to Address
    (schema.classes as Record<string, unknown>).Manager = {
      name: 'Manager',
      isA: 'Person',
      mixins: [],
      slots: [],
      attributes: { office: { name: 'office', range: 'Address' } },
      slotUsage: {},
    };
    const adj = buildAdjacency(schema);
    const result = getRangeSources(adj, ['Address']);
    expect(result.has('Employee')).toBe(true);
    expect(result.has('Manager')).toBe(true);
  });

  it('returns empty set for enum with no range sources', () => {
    const adj = buildAdjacency(makeSchema());
    // NamedThing is not referenced as a range anywhere
    expect(getRangeSources(adj, ['NamedThing']).size).toBe(0);
  });
});

// ── getConnectedComponent ─────────────────────────────────────────────────────

describe('getConnectedComponent', () => {
  it('returns all connected nodes from a central node', () => {
    const adj = buildAdjacency(makeSchema());
    const result = getConnectedComponent(adj, ['Employee']);
    // Employee connects to: Person, NamedThing, Mixin1, Address, EmploymentStatus
    expect(result.has('Person')).toBe(true);
    expect(result.has('NamedThing')).toBe(true);
    expect(result.has('Mixin1')).toBe(true);
    expect(result.has('Address')).toBe(true);
    expect(result.has('EmploymentStatus')).toBe(true);
    expect(result.has('Employee')).toBe(false); // seed excluded
  });

  it('excludes seeds', () => {
    const adj = buildAdjacency(makeSchema());
    const result = getConnectedComponent(adj, ['Person', 'NamedThing']);
    expect(result.has('Person')).toBe(false);
    expect(result.has('NamedThing')).toBe(false);
  });

  it('returns empty set for isolated node', () => {
    const schema = makeSchema();
    (schema.classes as Record<string, unknown>).Isolated = {
      name: 'Isolated',
      isA: undefined,
      mixins: [],
      slots: [],
      attributes: {},
      slotUsage: {},
    };
    const adj = buildAdjacency(schema);
    expect(getConnectedComponent(adj, ['Isolated']).size).toBe(0);
  });
});

// ── invertSelection ───────────────────────────────────────────────────────────

describe('invertSelection', () => {
  it('returns all entities not in current selection', () => {
    const adj = buildAdjacency(makeSchema());
    const allNames = new Set(adj.out.keys());
    const selection = ['Employee', 'Person'];
    const result = invertSelection(adj, selection);
    for (const name of selection) expect(result.has(name)).toBe(false);
    for (const name of allNames) {
      if (!selection.includes(name)) expect(result.has(name)).toBe(true);
    }
  });

  it('empty selection inverts to all entities', () => {
    const adj = buildAdjacency(makeSchema());
    const result = invertSelection(adj, []);
    expect(result.size).toBe(adj.out.size);
  });
});

// ── Node-ID bridging helpers ──────────────────────────────────────────────────

describe('nodeIdToEntityName', () => {
  it('strips ghost__ prefix', () => {
    expect(nodeIdToEntityName('ghost__Person')).toBe('Person');
  });
  it('returns plain name unchanged', () => {
    expect(nodeIdToEntityName('Person')).toBe('Person');
  });
});

describe('entityNameToNodeId', () => {
  it('adds ghost__ prefix for ghost entities', () => {
    expect(entityNameToNodeId('Person', new Set(['Person']))).toBe('ghost__Person');
  });
  it('returns plain name for non-ghost entities', () => {
    expect(entityNameToNodeId('Employee', new Set(['Person']))).toBe('Employee');
  });
});

describe('applyOp', () => {
  it('converts IDs, applies op, converts back', () => {
    const adj = buildAdjacency(makeSchema());
    const ghostNames = new Set<string>();
    const result = applyOp(
      ['Employee'],
      ghostNames,
      (seeds) => getAncestors(adj, seeds),
    );
    expect(result).toContain('Person');
    expect(result).toContain('NamedThing');
    expect(result).toContain('Mixin1');
    expect(result).not.toContain('Employee');
  });

  it('additive mode keeps seeds in result', () => {
    const adj = buildAdjacency(makeSchema());
    const ghostNames = new Set<string>();
    const result = applyOp(
      ['Employee'],
      ghostNames,
      (seeds) => getAncestors(adj, seeds),
      true, // additive
    );
    expect(result).toContain('Employee');
    expect(result).toContain('Person');
  });

  it('handles ghost__ prefixed input IDs', () => {
    const schema = makeSchema();
    const ghostNames = new Set(['GhostBase']);
    (schema.classes as Record<string, unknown>).Contractor = {
      name: 'Contractor',
      isA: 'GhostBase',
      mixins: [],
      slots: [],
      attributes: {},
      slotUsage: {},
    };
    const adj = buildAdjacency(schema, ghostNames);
    const result = applyOp(
      ['Contractor'],
      ghostNames,
      (seeds) => getAncestors(adj, seeds),
    );
    // GhostBase should be in result with ghost__ prefix
    expect(result).toContain('ghost__GhostBase');
  });
});

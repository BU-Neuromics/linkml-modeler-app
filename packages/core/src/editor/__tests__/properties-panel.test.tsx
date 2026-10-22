import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PropertiesPanel } from '../PropertiesPanel.js';
import { SubsetMembershipEditor } from '../PropertiesPanel/SubsetMembershipEditor.js';
import { EmptyPanel } from '../PropertiesPanel/EmptyPanel.js';
import { LabelPanel } from '../PropertiesPanel/LabelPanel.js';
import { RuleEditor } from '../PropertiesPanel/RuleEditor.js';
import { SlotInlineEditor } from '../PropertiesPanel/SlotInlineEditor.js';
import { SlotConditionEditor } from '../PropertiesPanel/SlotConditionEditor.js';
import { useAppStore } from '../../store/index.js';
import { PlatformContext, type PlatformAPI } from '../../platform/PlatformContext.js';
import type { Project, SchemaFile, ClassRule, SlotDefinition, SlotCondition } from '../../model/index.js';
import {
  emptyCanvasLayout,
  emptySchema,
  emptyClassDefinition,
  emptyEnumDefinition,
  emptySlotDefinition,
} from '../../model/index.js';
import type { Edge } from 'reactflow';

// ── Mock platform ─────────────────────────────────────────────────────────────

const mockPlatform: PlatformAPI = {
  openFile: vi.fn().mockResolvedValue(null),
  saveFile: vi.fn().mockResolvedValue(null),
  openDirectory: vi.fn().mockResolvedValue(null),
  readFile: vi.fn().mockResolvedValue(''),
  writeFile: vi.fn().mockResolvedValue(undefined),
  listDirectory: vi.fn().mockResolvedValue([]),
  initGit: vi.fn().mockResolvedValue(false),
  gitCreateRepo: vi.fn().mockResolvedValue(false),
  gitSetRemote: vi.fn().mockResolvedValue(undefined),
  gitReadConfig: vi.fn().mockResolvedValue({}),
  gitStatus: vi.fn().mockResolvedValue(null),
  gitStage: vi.fn().mockResolvedValue(undefined),
  gitUnstage: vi.fn().mockResolvedValue(undefined),
  gitCommit: vi.fn().mockResolvedValue(null),
  gitPush: vi.fn().mockResolvedValue(null),
  gitPull: vi.fn().mockResolvedValue(null),
  gitLog: vi.fn().mockResolvedValue([]),
  gitClone: vi.fn().mockResolvedValue({ ok: false, destPath: '' }),
  gitCheckout: vi.fn().mockResolvedValue(undefined),
  storeCredential: vi.fn().mockResolvedValue(undefined),
  getCredential: vi.fn().mockResolvedValue(null),
  deleteCredential: vi.fn().mockResolvedValue(undefined),
  getSetting: vi.fn().mockResolvedValue(null),
  setSetting: vi.fn().mockResolvedValue(undefined),
  platform: 'web',
  gitAvailable: false,
  getProjectsPath: vi.fn().mockResolvedValue('/tmp'),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSchemaFile(name: string): SchemaFile {
  return {
    id: crypto.randomUUID(),
    filePath: `${name}.yaml`,
    schema: emptySchema(name, `https://example.org/${name}`, name),
    isDirty: false,
    canvasLayout: emptyCanvasLayout(),
  };
}

function makeProject(name: string, schemas: SchemaFile[]): Project {
  return {
    id: crypto.randomUUID(),
    name,
    rootPath: `/tmp/${name}`,
    schemas,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Capture initial store state at module load time for reset between tests
const INITIAL_STATE = useAppStore.getState();

function renderPanel() {
  return render(
    <PlatformContext.Provider value={mockPlatform}>
      <PropertiesPanel />
    </PlatformContext.Provider>
  );
}

// ── Test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  useAppStore.setState(INITIAL_STATE, true);
  vi.clearAllMocks();
});

// ── Scenarios ─────────────────────────────────────────────────────────────────

describe('PropertiesPanel', () => {
  it('empty selection: renders schema metadata form when a schema is active', () => {
    const sf = makeSchemaFile('core');
    useAppStore.getState().setProject(makeProject('test', [sf]));
    // activeEntity is null (default)

    renderPanel();

    expect(screen.getByText('Schema Identity')).toBeInTheDocument();
  });

  it('class selection: renders class form and is_a dropdown excludes the selected class', () => {
    const sf = makeSchemaFile('core');
    sf.schema.classes['Person'] = emptyClassDefinition('Person');
    sf.schema.classes['Animal'] = emptyClassDefinition('Animal');
    const project = makeProject('test', [sf]);
    useAppStore.getState().setProject(project);
    useAppStore.getState().setActiveEntity({ type: 'class', className: 'Person' });

    renderPanel();

    expect(screen.getByText('Class Properties')).toBeInTheDocument();

    // Open the is_a dropdown by focusing its input
    const isALabel = screen.getByText('is_a');
    const isAInput = isALabel.parentElement!.querySelector('input')!;
    fireEvent.focus(isAInput);

    // The dropdown container (tabindex="-1") is inside the is_a FieldRow
    const isAWrapper = isALabel.parentElement!.querySelector('[tabindex="-1"]')!;
    expect(within(isAWrapper as HTMLElement).getByText('Animal')).toBeInTheDocument();
    expect(within(isAWrapper as HTMLElement).queryByText('Person')).not.toBeInTheDocument();
  });

  it('slot selection: slot header chip visible, expansion body collapsed by default', () => {
    const sf = makeSchemaFile('core');
    sf.schema.classes['Person'] = {
      ...emptyClassDefinition('Person'),
      attributes: { name: emptySlotDefinition('name') },
    };
    const project = makeProject('test', [sf]);
    useAppStore.getState().setProject(project);
    useAppStore.getState().setActiveEntity({ type: 'slot', className: 'Person', slotName: 'name' });

    renderPanel();

    // Slot header chip (always visible): slot name appears as a span
    expect(screen.getAllByText('name').length).toBeGreaterThan(0);
    // Expansion toggle is visible (collapsed state shows ▸)
    expect(screen.getByText('▸')).toBeInTheDocument();
    // Expansion body is collapsed — Tier 1 flags label is not rendered
    expect(screen.queryByText('Tier 1 flags')).not.toBeInTheDocument();
  });

  it('enum selection: renders enum form with permissible values list', () => {
    const sf = makeSchemaFile('core');
    sf.schema.enums['Status'] = {
      ...emptyEnumDefinition('Status'),
      permissibleValues: {
        active: { text: 'active' },
        inactive: { text: 'inactive' },
      },
    };
    const project = makeProject('test', [sf]);
    useAppStore.getState().setProject(project);
    useAppStore.getState().setActiveEntity({ type: 'enum', enumName: 'Status' });

    renderPanel();

    expect(screen.getByText('Permissible Values')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('inactive')).toBeInTheDocument();
  });

  describe('a11y: collapsible expanders are keyboard-operable', () => {
    function makeClassWithSlot(slotName: string) {
      const sf = makeSchemaFile('core');
      sf.schema.classes['Person'] = {
        ...emptyClassDefinition('Person'),
        attributes: { [slotName]: emptySlotDefinition(slotName) },
      };
      const project = makeProject('test', [sf]);
      useAppStore.getState().setProject(project);
      useAppStore.getState().setActiveEntity({ type: 'class', className: 'Person' });
      return sf;
    }

    it('slot header is a native <button> element', () => {
      makeClassWithSlot('name');
      renderPanel();
      const header = screen.getByRole('button', { name: /name/i });
      expect(header.tagName).toBe('BUTTON');
    });

    it('slot header expands body on Enter key', () => {
      makeClassWithSlot('name');
      renderPanel();
      const header = screen.getByRole('button', { name: /name/i });
      expect(screen.queryByText('Tier 1 flags')).not.toBeInTheDocument();
      fireEvent.click(header);
      expect(screen.getByText('Tier 1 flags')).toBeInTheDocument();
    });

    it('permissible value header is a native <button> element', () => {
      const sf = makeSchemaFile('core');
      sf.schema.enums['Status'] = {
        ...emptyEnumDefinition('Status'),
        permissibleValues: { active: { text: 'active' } },
      };
      const project = makeProject('test', [sf]);
      useAppStore.getState().setProject(project);
      useAppStore.getState().setActiveEntity({ type: 'enum', enumName: 'Status' });
      renderPanel();
      const header = screen.getByRole('button', { name: /active/i });
      expect(header.tagName).toBe('BUTTON');
    });
  });

  it('edge selection: renders edge relationship details', () => {
    const sf = makeSchemaFile('core');
    const project = makeProject('test', [sf]);
    useAppStore.getState().setProject(project);

    // Seed an is_a edge in the canvas store
    const testEdge: Edge = {
      id: 'is_a__Person__Animal',
      source: 'Person',
      target: 'Animal',
      type: 'is_a',
    };
    useAppStore.setState({ edges: [testEdge] });
    useAppStore.getState().setActiveEntity({ type: 'edge', edgeId: 'is_a__Person__Animal' });

    renderPanel();

    expect(screen.getByText('Edge (read-only)')).toBeInTheDocument();
    expect(screen.getByText('Person')).toBeInTheDocument();
    expect(screen.getByText('Animal')).toBeInTheDocument();
  });
});

// ── SubsetMembershipEditor ─────────────────────────────────────────────────────

describe('SubsetMembershipEditor', () => {
  it('renders nothing when the schema has no subsets', () => {
    const sf = makeSchemaFile('core');
    useAppStore.getState().setProject(makeProject('test', [sf]));
    const { container } = render(
      <SubsetMembershipEditor schemaId={sf.id} entityName="Person" kind="class" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders checkboxes for each defined subset', () => {
    const sf = makeSchemaFile('core');
    sf.schema.subsets = {
      Alpha: { name: 'Alpha' },
      Beta: { name: 'Beta' },
    };
    sf.schema.classes['Person'] = { ...emptyClassDefinition('Person'), subsetOf: ['Alpha'] };
    useAppStore.getState().setProject(makeProject('test', [sf]));

    render(<SubsetMembershipEditor schemaId={sf.id} entityName="Person" kind="class" />);

    expect(screen.getByText('In Subsets')).toBeInTheDocument();
    const alphaCheckbox = screen.getByRole('checkbox', { name: /Alpha/i });
    const betaCheckbox = screen.getByRole('checkbox', { name: /Beta/i });
    expect(alphaCheckbox).toBeChecked();
    expect(betaCheckbox).not.toBeChecked();
  });

  it('calls addEntityToSubset when unchecked subset is clicked', () => {
    const sf = makeSchemaFile('core');
    sf.schema.subsets = { Alpha: { name: 'Alpha' } };
    sf.schema.classes['Person'] = { ...emptyClassDefinition('Person'), subsetOf: [] };
    useAppStore.getState().setProject(makeProject('test', [sf]));

    render(<SubsetMembershipEditor schemaId={sf.id} entityName="Person" kind="class" />);

    const checkbox = screen.getByRole('checkbox', { name: /Alpha/i });
    fireEvent.click(checkbox);

    const state = useAppStore.getState();
    const updatedSf = state.activeProject?.schemas.find((s) => s.id === sf.id);
    expect(updatedSf?.schema.classes['Person'].subsetOf).toContain('Alpha');
  });

  it('calls removeEntityFromSubset when checked subset is clicked', () => {
    const sf = makeSchemaFile('core');
    sf.schema.subsets = { Alpha: { name: 'Alpha' } };
    sf.schema.classes['Person'] = { ...emptyClassDefinition('Person'), subsetOf: ['Alpha'] };
    useAppStore.getState().setProject(makeProject('test', [sf]));

    render(<SubsetMembershipEditor schemaId={sf.id} entityName="Person" kind="class" />);

    const checkbox = screen.getByRole('checkbox', { name: /Alpha/i });
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);

    const state = useAppStore.getState();
    const updatedSf = state.activeProject?.schemas.find((s) => s.id === sf.id);
    const subsetOf = updatedSf?.schema.classes['Person'].subsetOf ?? [];
    expect(subsetOf).not.toContain('Alpha');
  });

  it('disables checkboxes when schema isReadOnly is true', () => {
    const sf = makeSchemaFile('core');
    sf.schema.subsets = { Alpha: { name: 'Alpha' } };
    sf.schema.classes['Person'] = emptyClassDefinition('Person');
    (sf as SchemaFile & { isReadOnly?: boolean }).isReadOnly = true;
    useAppStore.getState().setProject(makeProject('test', [sf]));

    render(<SubsetMembershipEditor schemaId={sf.id} entityName="Person" kind="class" />);

    const checkbox = screen.getByRole('checkbox', { name: /Alpha/i });
    expect(checkbox).toBeDisabled();
  });
});

// ── EmptyPanel ────────────────────────────────────────────────────────────────

describe('EmptyPanel', () => {
  it('renders default message when no message prop given', () => {
    render(<EmptyPanel />);
    expect(screen.getByText('Select an element on the canvas')).toBeInTheDocument();
  });

  it('renders custom message when provided', () => {
    render(<EmptyPanel message="Label not found." />);
    expect(screen.getByText('Label not found.')).toBeInTheDocument();
  });
});

// ── LabelPanel ────────────────────────────────────────────────────────────────

describe('LabelPanel', () => {
  it('renders label not found when label id is missing from canvas', () => {
    const sf = makeSchemaFile('core');
    useAppStore.getState().setProject(makeProject('test', [sf]));
    useAppStore.setState({ activeSchemaId: sf.id });

    render(<LabelPanel labelId="missing-id" />);
    expect(screen.getByText('Label not found.')).toBeInTheDocument();
  });

  it('renders label editor when label exists in canvas', () => {
    const sf = makeSchemaFile('core');
    const labelId = crypto.randomUUID();
    sf.canvasLayout.labels = [
      { id: labelId, text: 'Hello World', x: 0, y: 0, fontSize: 14, locked: false },
    ];
    useAppStore.getState().setProject(makeProject('test', [sf]));
    useAppStore.setState({ activeSchemaId: sf.id });

    render(<LabelPanel labelId={labelId} />);
    expect(screen.getByText('Label')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Hello World')).toBeInTheDocument();
  });
});

// ── RuleEditor ────────────────────────────────────────────────────────────────

describe('RuleEditor', () => {
  const noop = () => {};

  it('renders collapsed by default showing rule label', () => {
    const rule: ClassRule = { title: 'My Rule' };
    render(<RuleEditor rule={rule} ruleIndex={0} onChange={noop} onDelete={noop} />);
    expect(screen.getByText('My Rule')).toBeInTheDocument();
    expect(screen.getByText('▸')).toBeInTheDocument();
    expect(screen.queryByText('Title')).not.toBeInTheDocument();
  });

  it('expands to show fields when header clicked', () => {
    const rule: ClassRule = { title: 'Rule A' };
    render(<RuleEditor rule={rule} ruleIndex={0} onChange={noop} onDelete={noop} />);
    fireEvent.click(screen.getByText('Rule A').closest('button')!);
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
  });

  it('falls back to "Rule N" label when no title/description', () => {
    const rule: ClassRule = {};
    render(<RuleEditor rule={rule} ruleIndex={2} onChange={noop} onDelete={noop} />);
    expect(screen.getByText('Rule 3')).toBeInTheDocument();
  });

  it('shows deactivated badge when rule.deactivated is true', () => {
    const rule: ClassRule = { deactivated: true };
    render(<RuleEditor rule={rule} ruleIndex={0} onChange={noop} onDelete={noop} />);
    expect(screen.getByText('off')).toBeInTheDocument();
  });
});

// ── SlotInlineEditor ──────────────────────────────────────────────────────────

describe('SlotInlineEditor', () => {
  const noop = () => {};

  it('renders collapsed slot row with slot name', () => {
    const slot: SlotDefinition = emptySlotDefinition('age');
    render(
      <SlotInlineEditor
        slot={slot}
        rangeOptionGroups={[]}
        onUpdate={noop}
        onDelete={noop}
      />
    );
    expect(screen.getByText('age')).toBeInTheDocument();
    expect(screen.getByText('▸')).toBeInTheDocument();
  });

  it('expands when header clicked and shows Tier 1 flags', () => {
    const slot: SlotDefinition = emptySlotDefinition('weight');
    render(
      <SlotInlineEditor
        slot={slot}
        rangeOptionGroups={[]}
        onUpdate={noop}
        onDelete={noop}
      />
    );
    fireEvent.click(screen.getByText('weight').closest('button')!);
    expect(screen.getByText('Tier 1 flags')).toBeInTheDocument();
  });
});

// ── SlotConditionEditor ───────────────────────────────────────────────────────

describe('SlotConditionEditor', () => {
  it('renders the slot name and a remove button', () => {
    const cond: SlotCondition = {};
    render(
      <SlotConditionEditor
        slotName="my_slot"
        cond={cond}
        onChange={() => {}}
        onRemove={() => {}}
      />
    );
    expect(screen.getByText('my_slot')).toBeInTheDocument();
  });
});

// ── SchemaSlotInlineEditor ────────────────────────────────────────────────────

import { SchemaSlotInlineEditor } from '../PropertiesPanel/SchemaSlotInlineEditor.js';

describe('SchemaSlotInlineEditor', () => {
  const noop = () => {};

  it('renders collapsed row with slot name and badges', () => {
    const slot: SlotDefinition = {
      ...emptySlotDefinition('height'),
      required: true,
      multivalued: false,
    };
    render(
      <SchemaSlotInlineEditor
        slot={slot}
        schemaSlots={{}}
        rangeOptionGroups={[]}
        onUpdate={noop}
        onDelete={noop}
        onRename={noop}
      />
    );
    expect(screen.getByText('height')).toBeInTheDocument();
    expect(screen.getByText('R')).toBeInTheDocument();
    expect(screen.getByText('▸')).toBeInTheDocument();
  });

  it('expands to show fields when header clicked', () => {
    const slot: SlotDefinition = emptySlotDefinition('weight');
    render(
      <SchemaSlotInlineEditor
        slot={slot}
        schemaSlots={{}}
        rangeOptionGroups={[]}
        onUpdate={noop}
        onDelete={noop}
        onRename={noop}
      />
    );
    fireEvent.click(screen.getByText('weight').closest('button')!);
    expect(screen.getByText('Description')).toBeInTheDocument();
  });
});

// ── ClassExpressionEditor ─────────────────────────────────────────────────────

import { ClassExpressionEditor } from '../PropertiesPanel/ClassExpressionEditor.js';
import type { AnonymousClassExpression } from '../../model/index.js';

describe('ClassExpressionEditor', () => {
  it('renders section label with empty expression', () => {
    const expr: AnonymousClassExpression = {};
    render(
      <ClassExpressionEditor
        label="IF (preconditions)"
        expr={expr}
        onChange={() => {}}
      />
    );
    expect(screen.getByText('IF (preconditions)')).toBeInTheDocument();
  });

  it('renders existing slot conditions', () => {
    const expr: AnonymousClassExpression = {
      slotConditions: { age: { equalsString: '18' } },
    };
    render(
      <ClassExpressionEditor
        label="THEN"
        expr={expr}
        onChange={() => {}}
      />
    );
    expect(screen.getByText('age')).toBeInTheDocument();
  });
});

// ── SchemaMetaPanel extended ──────────────────────────────────────────────────

describe('SchemaMetaPanel extended', () => {
  it('renders Prefixes and Schema Slots sections when schema has them', () => {
    const sf = makeSchemaFile('core');
    sf.schema.prefixes = {
      linkml: { prefixPrefix: 'linkml', prefixReference: 'https://w3id.org/linkml/' },
    };
    sf.schema.slots = {
      name: emptySlotDefinition('name'),
    };
    useAppStore.getState().setProject(makeProject('test', [sf]));
    // activeEntity null → SchemaMetaPanel renders

    renderPanel();

    expect(screen.getByText('Prefixes')).toBeInTheDocument();
    expect(screen.getByText('Schema Slots')).toBeInTheDocument();
    expect(screen.getByText('linkml')).toBeInTheDocument();
    expect(screen.getAllByText('name').length).toBeGreaterThan(0);
  });
});

describe('SchemaMetaPanel imports section', () => {
  it('renders Imports section when schema has imports', () => {
    const sf = makeSchemaFile('core');
    sf.schema.imports = ['linkml:types'];
    useAppStore.getState().setProject(makeProject('test', [sf]));

    renderPanel();

    expect(screen.getByText('Imports')).toBeInTheDocument();
    expect(screen.getByText('linkml:types')).toBeInTheDocument();
  });
});

// ── PermissibleValueEditor ────────────────────────────────────────────────────

import { PermissibleValueEditor } from '../PropertiesPanel/PermissibleValueEditor.js';
import type { PermissibleValue } from '../../model/index.js';

describe('PermissibleValueEditor', () => {
  it('renders collapsed row with value text', () => {
    const val: PermissibleValue = { text: 'active' };
    render(<PermissibleValueEditor value={val} onUpdate={() => {}} onDelete={() => {}} />);
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('▸')).toBeInTheDocument();
  });

  it('expands when header clicked and shows description field', () => {
    const val: PermissibleValue = { text: 'inactive' };
    render(<PermissibleValueEditor value={val} onUpdate={() => {}} onDelete={() => {}} />);
    fireEvent.click(screen.getByText('inactive').closest('button')!);
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('meaning')).toBeInTheDocument();
  });
});

// ── EnumPanel interactions ────────────────────────────────────────────────────

import { EnumPanel } from '../PropertiesPanel/EnumPanel.js';

describe('EnumPanel interactions', () => {
  it('adds a new permissible value when input filled and button clicked', () => {
    const sf = makeSchemaFile('core');
    sf.schema.enums['Status'] = {
      ...emptyEnumDefinition('Status'),
      permissibleValues: { active: { text: 'active' } },
    };
    useAppStore.getState().setProject(makeProject('test', [sf]));
    useAppStore.setState({ activeSchemaId: sf.id });

    render(<EnumPanel schemaId={sf.id} enumName="Status" />);

    expect(screen.getByText('active')).toBeInTheDocument();

    const input = screen.getByPlaceholderText('new value text…');
    fireEvent.change(input, { target: { value: 'inactive' } });
    fireEvent.click(screen.getByText('+ Add'));

    const state = useAppStore.getState();
    const updatedSf = state.activeProject?.schemas.find((s) => s.id === sf.id);
    expect(updatedSf?.schema.enums['Status'].permissibleValues['inactive']).toBeDefined();
  });

  it('shows empty panel when enum not found', () => {
    const sf = makeSchemaFile('core');
    useAppStore.getState().setProject(makeProject('test', [sf]));
    useAppStore.setState({ activeSchemaId: sf.id });

    render(<EnumPanel schemaId={sf.id} enumName="NonExistent" />);
    expect(screen.getByText('Enum not found')).toBeInTheDocument();
  });
});

describe('PropertiesPanel class with is_a renders inheritance section', () => {
  it('shows class uri field when class has class_uri', () => {
    const sf = makeSchemaFile('core');
    sf.schema.classes['Person'] = {
      ...emptyClassDefinition('Person'),
      uriAnnotation: 'schema:Person',
      isA: 'NamedThing',
    };
    sf.schema.classes['NamedThing'] = emptyClassDefinition('NamedThing');
    useAppStore.getState().setProject(makeProject('test', [sf]));
    useAppStore.getState().setActiveEntity({ type: 'class', className: 'Person' });

    renderPanel();

    expect(screen.getByText('Class Properties')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. schema:Person')).toBeInTheDocument();
  });
});

// ── slot_usage candidate inheritance (GitHub #131) ───────────────────────────

import { ClassPanel } from '../PropertiesPanel/ClassPanel.js';

describe('ClassPanel slot_usage candidates include inherited inline attributes', () => {
  it('parent inline attribute appears as slot_usage candidate in child', () => {
    const sf = makeSchemaFile('core');
    sf.schema.classes['Parent'] = {
      ...emptyClassDefinition('Parent'),
      attributes: { name: emptySlotDefinition('name') },
    };
    sf.schema.classes['Child'] = {
      ...emptyClassDefinition('Child'),
      isA: 'Parent',
    };
    useAppStore.getState().setProject(makeProject('test', [sf]));
    useAppStore.setState({ activeSchemaId: sf.id });

    render(<ClassPanel schemaId={sf.id} className="Child" />);

    // The slot_usage dropdown should exist (rendered only when there are candidates)
    const input = screen.getByPlaceholderText('add slot_usage override…');
    expect(input).toBeInTheDocument();

    // Open the dropdown and verify "name" appears as a candidate
    fireEvent.focus(input);
    const wrapper = input.closest('[tabindex="-1"]')!;
    expect(within(wrapper as HTMLElement).getByText('name')).toBeInTheDocument();
  });

  it("child's own attributes are NOT offered as slot_usage candidates", () => {
    const sf = makeSchemaFile('core');
    sf.schema.classes['Parent'] = {
      ...emptyClassDefinition('Parent'),
      attributes: { name: emptySlotDefinition('name') },
    };
    sf.schema.classes['Child'] = {
      ...emptyClassDefinition('Child'),
      isA: 'Parent',
      attributes: { age: emptySlotDefinition('age') },
    };
    useAppStore.getState().setProject(makeProject('test', [sf]));
    useAppStore.setState({ activeSchemaId: sf.id });

    render(<ClassPanel schemaId={sf.id} className="Child" />);

    // "name" is inherited → dropdown should exist
    const input = screen.getByPlaceholderText('add slot_usage override…');
    fireEvent.focus(input);
    const wrapper = input.closest('[tabindex="-1"]')!;

    // "name" (inherited from Parent) must be present
    expect(within(wrapper as HTMLElement).getByText('name')).toBeInTheDocument();
    // "age" (Child's own attribute) must NOT be in the dropdown
    expect(within(wrapper as HTMLElement).queryByText('age')).not.toBeInTheDocument();
  });
});

// ── DeleteButton confirmation flow ────────────────────────────────────────────

import { DeleteButton } from '../PropertiesPanel/internal.js';

describe('DeleteButton', () => {
  it('shows confirmation UI when clicked', () => {
    render(<DeleteButton label="thing" onConfirm={() => {}} />);
    fireEvent.click(screen.getByText('Delete thing'));
    expect(screen.getByText('Delete thing?')).toBeInTheDocument();
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('reverts to button when cancel clicked', () => {
    render(<DeleteButton label="item" onConfirm={() => {}} />);
    fireEvent.click(screen.getByText('Delete item'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Delete item')).toBeInTheDocument();
    expect(screen.queryByText('Delete item?')).not.toBeInTheDocument();
  });
});

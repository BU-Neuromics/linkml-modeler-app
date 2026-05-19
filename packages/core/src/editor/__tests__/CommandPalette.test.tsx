import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandPalette } from '../CommandPalette.js';
import { useAppStore } from '../../store/index.js';
import { PlatformContext, type PlatformAPI } from '../../platform/PlatformContext.js';
import type { Project, SchemaFile } from '../../model/index.js';
import { emptyCanvasLayout, emptySchema, emptyClassDefinition, emptyEnumDefinition } from '../../model/index.js';

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

const INITIAL_STATE = useAppStore.getState();

function makeSchemaFile(name: string): SchemaFile {
  const schema = emptySchema(name, `https://example.org/${name}`, name);
  schema.classes.Person = emptyClassDefinition('Person');
  schema.classes.Animal = emptyClassDefinition('Animal');
  schema.enums.Color = emptyEnumDefinition('Color');
  return {
    id: 'schema-1',
    filePath: `${name}.yaml`,
    schema,
    isDirty: false,
    canvasLayout: emptyCanvasLayout(),
  };
}

function makeProject(): Project {
  return {
    id: 'p1',
    name: 'test-project',
    rootPath: '/tmp/test-project',
    schemas: [makeSchemaFile('core')],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

beforeEach(() => {
  useAppStore.setState(INITIAL_STATE, true);
  vi.clearAllMocks();
});

function renderPalette() {
  return render(
    <PlatformContext.Provider value={mockPlatform}>
      <CommandPalette />
    </PlatformContext.Provider>
  );
}

describe('CommandPalette', () => {
  it('renders nothing when closed', () => {
    const { container } = renderPalette();
    expect(container.firstChild).toBeNull();
  });

  it('renders portal with search input when open', () => {
    useAppStore.getState().setCommandPaletteOpen(true);
    renderPalette();
    expect(screen.getByRole('dialog', { name: /command palette/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search classes, enums, slots, views, actions/i)).toBeInTheDocument();
  });

  it('lists entities (classes + enums) from the active project', () => {
    useAppStore.setState({ activeProject: makeProject(), activeSchemaId: 'schema-1' });
    useAppStore.getState().setCommandPaletteOpen(true);
    renderPalette();
    expect(screen.getByText('Person')).toBeInTheDocument();
    expect(screen.getByText('Animal')).toBeInTheDocument();
    expect(screen.getByText('Color')).toBeInTheDocument();
  });

  it('filters items by fuzzy subsequence on the query', () => {
    useAppStore.setState({ activeProject: makeProject(), activeSchemaId: 'schema-1' });
    useAppStore.getState().setCommandPaletteOpen(true);
    renderPalette();
    const input = screen.getByPlaceholderText(/Search/i);
    fireEvent.change(input, { target: { value: 'Per' } });
    expect(screen.getByText('Person')).toBeInTheDocument();
    expect(screen.queryByText('Animal')).not.toBeInTheDocument();
  });

  it('shows empty state when no items match', () => {
    useAppStore.setState({ activeProject: makeProject(), activeSchemaId: 'schema-1' });
    useAppStore.getState().setCommandPaletteOpen(true);
    renderPalette();
    const input = screen.getByPlaceholderText(/Search/i);
    fireEvent.change(input, { target: { value: 'zzzzz' } });
    expect(screen.getByText(/No results for/i)).toBeInTheDocument();
  });

  it('arrow down advances the active item, escape closes the palette', () => {
    useAppStore.setState({ activeProject: makeProject(), activeSchemaId: 'schema-1' });
    useAppStore.getState().setCommandPaletteOpen(true);
    renderPalette();
    const input = screen.getByPlaceholderText(/Search/i);
    const selectedAt = () =>
      screen.getAllByRole('option').findIndex((el) => el.getAttribute('aria-selected') === 'true');
    expect(selectedAt()).toBe(0);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(selectedAt()).toBe(1);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(useAppStore.getState().commandPaletteOpen).toBe(false);
  });

  it('clicking an entity activates it and closes the palette', () => {
    useAppStore.setState({ activeProject: makeProject(), activeSchemaId: 'schema-1' });
    useAppStore.getState().setCommandPaletteOpen(true);
    renderPalette();
    fireEvent.click(screen.getByText('Person'));
    expect(useAppStore.getState().commandPaletteOpen).toBe(false);
    expect(useAppStore.getState().activeEntity).toMatchObject({ type: 'class', className: 'Person' });
  });
});
